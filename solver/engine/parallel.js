// ── Data-parallel MCCFR coordinator ─────────────────────────
// Drives W cfr-worker threads to share a single game's work across cores.
// Each round:
//   1. snapshot the authoritative table (checkpoint blob),
//   2. broadcast it to every worker and have each run `iters` iterations on an
//      independent RNG stream (each a valid DCFR step from the same snapshot),
//   3. merge: authoritative = mean_w(worker_w)  (see mergeAverage),
//   4. advance the iteration count by `iters` (NOT iters*W).
//
// History: the original merge was `authoritative += Σ_w (worker − snapshot)`,
// which is only valid for purely-additive accumulators. DCFR's regret update is
// multiplicative-then-additive (decays existing regret each iteration), so the
// additive merge applied that decay W times and flipped negative regrets,
// making strategies MORE exploitable with training (proven on Kuhn: W=4 = 0.142
// vs 0.002 single-thread). Averaging fixes it — each worker applies the discount
// once, the mean keeps it once, and the extra cores buy variance reduction.
// Re-verified on Kuhn: W=4 -> 0.0012, W=8 -> 0.0008 (≤ single-thread).
//
// Memory: each round transiently holds the snapshot plus W worker tables.
//
// Returns a real MCCFRTrainer so train.js's export/checkpoint code is
// unchanged. workers=1 should use the in-process trainer instead (see
// train.js) — this path only pays its serialization cost when W>1.
//
// Memory note: each round transiently holds the snapshot plus W worker
// tables, so peak RAM ≈ (W+2)× one table. That is why memory-bound games
// (Stud 8) run with workers=1; the memory-light draw games parallelize
// freely. See solver/PARALLEL.md.

const path = require('path');
const { Worker } = require('worker_threads');
const { MCCFRTrainer } = require('./mccfr');
const { GAMES } = require('../games');

// authoritative = mean of the W worker tables. Each worker is a valid DCFR
// step from the broadcast snapshot, so averaging applies DCFR's regret discount
// exactly ONCE and reduces variance — the fix for the old additive delta-merge,
// which applied the discount W times (and flipped negative regrets). A node a
// worker never visited implicitly holds the snapshot's value there, so absent
// workers contribute the snapshot (newly-discovered nodes: 0). Iterations then
// advance by `iters` per round (not iters*W): the parallelism buys variance
// reduction at the same iteration rate, not W× more iterations. Verified on
// Kuhn (exact BR): W=4/8 converge to ~0, matching single-thread.
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
    const onMsg = (m) => {
      if (m && m.type === 'done') { cleanup(); resolve(m); }
    };
    const onErr = (e) => { cleanup(); reject(e); };
    const onExit = (code) => { if (code !== 0) { cleanup(); reject(new Error(`worker exited ${code}`)); } };
    function cleanup() {
      worker.off('message', onMsg); worker.off('error', onErr); worker.off('exit', onExit);
    }
    worker.on('message', onMsg);
    worker.on('error', onErr);
    worker.on('exit', onExit);
    worker.postMessage(message);
  });
}

// Train `gameId` with W workers until targetIters or the deadline.
// base: a checkpoint blob ({iterations, nodes}) to resume from, or null.
// onMerge(trainer): called after each merge (progress / periodic saves).
async function trainParallel(gameId, {
  workers = 4,
  targetIters,
  mergeEvery = 50000,
  seed = 12345,
  deadline = Infinity,
  base = null,
  onMerge = null,
  workerHeapMB = 0, // raise each worker thread's V8 old-space cap (0 = Node default)
} = {}) {
  const game = GAMES[gameId];
  if (!game) throw new Error(`trainParallel: unknown game '${gameId}'`);

  const trainer = base ? MCCFRTrainer.fromCheckpoint(game, base) : new MCCFRTrainer(game);

  // Worker threads each hold a full copy of the table in their OWN heap, so
  // the coordinator's --max-old-space-size does NOT apply to them. Raise their
  // cap explicitly or a long, table-growing run OOM-kills a worker (~2 GB
  // default) even on a big-RAM box.
  const opts = { workerData: { gameId } };
  if (workerHeapMB > 0) opts.resourceLimits = { maxOldGenerationSizeMb: workerHeapMB };
  const pool = [];
  for (let w = 0; w < workers; w++) {
    pool.push(new Worker(path.join(__dirname, 'cfr-worker.js'), opts));
  }

  let round = 0;
  try {
    while (trainer.iterations < targetIters && Date.now() < deadline) {
      const remaining = targetIters - trainer.iterations;
      const iters = Math.max(1, Math.min(mergeEvery, remaining));
      const snapshot = trainer.toCheckpoint(); // broadcast payload + per-node base for absent workers
      const results = await Promise.all(pool.map((wk, i) =>
        runRound(wk, { type: 'run', base: snapshot, iters, seed: (seed + round * 100003 + i * 7919) >>> 0 })
      ));
      mergeAverage(trainer, snapshot.nodes, results.map(r => r.ckpt));
      trainer.iterations = snapshot.iterations + iters; // averaging => same iteration rate, not iters*W
      round++;
      if (onMerge) onMerge(trainer);
    }
  } finally {
    await Promise.all(pool.map(async (wk) => {
      try { wk.postMessage({ type: 'stop' }); } catch (_) { /* already gone */ }
      await wk.terminate();
    }));
  }
  return trainer;
}

module.exports = { trainParallel };
