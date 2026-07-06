// ── Data-parallel 3-player MCCFR coordinator ────────────────────
// The N=3 analogue of solver/engine/parallel.js. Drives W mccfr3-worker
// threads to share one razz3 game's work across cores.
//
// Each round:
//   1. snapshot the authoritative table (checkpoint blob),
//   2. broadcast it to every worker; each runs `iters` iterations on an
//      independent RNG stream (each a valid DCFR step from the SAME snapshot),
//   3. merge: authoritative = mean_w(worker_w)  (see mergeAverage),
//   4. advance the iteration count by `iters` (NOT iters*W).
//
// WHY AVERAGE, NOT ADDITIVE-DELTA (the bug this whole file guards against):
// mccfr3's regret update is DCFR — `regret = (prev>0 ? prev*posDiscount :
// prev*0.5) + (u-ev)` with posDiscount = t^1.5/(t^1.5+1) keyed on the
// trainer's GLOBAL iteration counter (mccfr3.js line ~82). That is
// multiplicative-then-additive. The HU engine once merged workers with
// `base += Σ_w (worker − snapshot)`, which is valid ONLY for purely-additive
// accumulators; against DCFR's discount it applied the decay W times and
// flipped negative regrets, making strategies MORE exploitable as workers
// grew (proven on Kuhn: W=4 = 0.142 vs 0.002 single-thread — CLAUDE.md
// 2026-06-18 'solver hardening'). The FIX, applied identically here:
// AVERAGE the per-round worker tables. Each worker applies the DCFR discount
// ONCE from the shared snapshot; the mean keeps it once (DCFR-correct) and the
// extra cores buy variance reduction — NOT W× more iterations.
//
// The average-strategy accumulator (`strat[i] += w*strat[i]`, w = iterations,
// mccfr3.js) is linear-in-iteration averaging; every worker used the SAME
// snapshot iteration base, so averaging their strat tables is likewise the
// correct one-shot merge.
//
// A node a worker never visited implicitly holds the snapshot's value there,
// so absent workers contribute the snapshot (newly-discovered nodes: 0) —
// exactly as engine/parallel.js does. Peak RAM ≈ (W+2)× one table.

const path = require('path');
const { Worker } = require('worker_threads');
const { MCCFR3Trainer } = require('./mccfr3');

// A game descriptor names the module + factory + opts so a worker thread can
// rebuild the IDENTICAL game. { module: require-path, factory: export name,
// opts }. The full grind uses {'./razz3-game','makeGame',{cap,antes,coarseOpp}};
// the exact-BR gate uses {'./razz3-reduced','makeReduced',{ranks,cap,dead}}.
function requireGame(desc) {
  const mod = require(desc.module);
  return mod[desc.factory](desc.opts || {});
}

// authoritative = mean of the W worker tables (DCFR-correct: discount applied
// ONCE). For a node some worker never touched, that worker contributes the
// snapshot's value at that node (snap), or 0 if the node is brand-new (not in
// the snapshot). Iterations then advance by `iters` per round, NOT iters*W.
function mergeAverage(base, snapNodes, workerCkpts) {
  const W = workerCkpts.length;
  const keys = new Set();
  for (const ck of workerCkpts) for (const key in ck.nodes) keys.add(key);
  for (const key of keys) {
    let tmpl = null;
    for (const ck of workerCkpts) if (ck.nodes[key]) { tmpl = ck.nodes[key]; break; }
    const len = tmpl.a.length;
    const snap = snapNodes[key];
    let node = base.nodes.get(key);
    if (!node) {
      node = { acts: tmpl.a, regret: new Float64Array(len), strat: new Float64Array(len) };
      base.nodes.set(key, node);
    }
    for (let i = 0; i < len; i++) {
      let sr = 0, ss = 0;
      for (const ck of workerCkpts) {
        const wn = ck.nodes[key];
        sr += wn ? wn.r[i] : (snap ? snap.r[i] : 0);
        ss += wn ? wn.s[i] : (snap ? snap.s[i] : 0);
      }
      node.regret[i] = sr / W;
      node.strat[i] = ss / W;
    }
  }
}

function runRound(worker, message) {
  return new Promise((resolve, reject) => {
    const onMsg = (m) => { if (m && m.type === 'done') { cleanup(); resolve(m); } };
    const onErr = (e) => { cleanup(); reject(e); };
    const onExit = (code) => { if (code !== 0) { cleanup(); reject(new Error(`worker exited ${code}`)); } };
    function cleanup() { worker.off('message', onMsg); worker.off('error', onErr); worker.off('exit', onExit); }
    worker.on('message', onMsg);
    worker.on('error', onErr);
    worker.on('exit', onExit);
    worker.postMessage(message);
  });
}

// Spawn a W-worker pool over one razz3 game. Returns { trainer, step, close }:
//   step(iters, seed) — one parallel round: broadcast the trainer's current
//     table, run `iters` per worker, mergeAverage back, advance iterations by
//     `iters`. Resolves to the trainer (so train3.js's checkpoint/blueprint/
//     measure code is unchanged — it holds a real MCCFR3Trainer throughout).
//   close() — stop + terminate all workers.
//
// train3.js owns the resume/ckpt-every/SIGTERM/measure loop; this only
// supplies the parallel STEP so all that kill-safe machinery is preserved.
// gameDesc: { module, factory, opts } — how a worker rebuilds the game.
function makePool(trainer, gameDesc, { workers = 2, workerHeapMB = 0 } = {}) {
  const opts = { workerData: { gameModule: gameDesc.module, gameFactory: gameDesc.factory, gameOpts: gameDesc.opts || {} } };
  if (workerHeapMB > 0) opts.resourceLimits = { maxOldGenerationSizeMb: workerHeapMB };
  const pool = [];
  for (let w = 0; w < workers; w++) {
    pool.push(new Worker(path.join(__dirname, 'mccfr3-worker.js'), opts));
  }
  let round = 0;

  async function step(iters, seedBase) {
    const snapshot = trainer.toCheckpoint(); // broadcast + per-node base for absent workers
    const results = await Promise.all(pool.map((wk, i) =>
      runRound(wk, { type: 'run', base: snapshot, iters, seed: (seedBase + round * 100003 + i * 7919) >>> 0 })
    ));
    mergeAverage(trainer, snapshot.nodes, results.map(r => r.ckpt));
    trainer.iterations = snapshot.iterations + iters; // averaging => same iteration rate, not iters*W
    round++;
    return trainer;
  }

  async function close() {
    await Promise.all(pool.map(async (wk) => {
      try { wk.postMessage({ type: 'stop' }); } catch (_) { /* already gone */ }
      await wk.terminate();
    }));
  }

  return { trainer, step, close, workers };
}

// Standalone driver (used by the parallel-vs-single-thread GATE): train the
// game described by `gameDesc` from `base` (a checkpoint blob or null) to
// targetIters with W workers, mergeEvery iters per round. Returns the trainer.
async function trainParallel3(gameDesc, {
  workers = 2, targetIters, mergeEvery = 2000, seed = 12345, base = null, workerHeapMB = 0, onRound = null,
} = {}) {
  const game = requireGame(gameDesc);
  const trainer = base ? MCCFR3Trainer.fromCheckpoint(game, base) : new MCCFR3Trainer(game);
  const pool = makePool(trainer, gameDesc, { workers, workerHeapMB });
  try {
    while (trainer.iterations < targetIters) {
      const iters = Math.max(1, Math.min(mergeEvery, targetIters - trainer.iterations));
      await pool.step(iters, seed);
      if (onRound) onRound(trainer);
    }
  } finally {
    await pool.close();
  }
  return trainer;
}

module.exports = { mergeAverage, makePool, trainParallel3 };
