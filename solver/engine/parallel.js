// ── Data-parallel MCCFR coordinator ─────────────────────────
// Drives W cfr-worker threads to multiply single-game throughput on a
// multi-core box. Each round:
//   1. snapshot the authoritative table (checkpoint blob),
//   2. broadcast it to every worker and have each run `mergeEvery`
//      iterations on an independent RNG stream,
//   3. merge: authoritative += Σ_w (worker_w − snapshot)  (additive deltas),
//   4. advance the global iteration count by mergeEvery * W.
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

// authoritative += Σ_w (worker_w − snapshot), creating nodes workers
// discovered. `snapNodes` is the broadcast table (plain checkpoint object)
// used as the per-round zero reference; `base` is the live MCCFRTrainer.
function mergeDeltas(base, snapNodes, workerCkpts) {
  for (const ck of workerCkpts) {
    const nodes = ck.nodes;
    for (const key in nodes) {
      const wn = nodes[key];
      const snap = snapNodes[key];
      let node = base.nodes.get(key);
      if (!node) {
        node = { acts: wn.a, regret: new Float64Array(wn.a.length), strat: new Float64Array(wn.a.length) };
        base.nodes.set(key, node);
      }
      for (let i = 0; i < wn.a.length; i++) {
        node.regret[i] += wn.r[i] - (snap ? snap.r[i] : 0);
        node.strat[i] += wn.s[i] - (snap ? snap.s[i] : 0);
      }
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
} = {}) {
  const game = GAMES[gameId];
  if (!game) throw new Error(`trainParallel: unknown game '${gameId}'`);

  const trainer = base ? MCCFRTrainer.fromCheckpoint(game, base) : new MCCFRTrainer(game);

  const pool = [];
  for (let w = 0; w < workers; w++) {
    pool.push(new Worker(path.join(__dirname, 'cfr-worker.js'), { workerData: { gameId } }));
  }

  let round = 0;
  try {
    while (trainer.iterations < targetIters && Date.now() < deadline) {
      const remaining = targetIters - trainer.iterations;
      const iters = Math.max(1, Math.min(mergeEvery, Math.ceil(remaining / workers)));
      const snapshot = trainer.toCheckpoint(); // per-round zero reference + broadcast payload
      const results = await Promise.all(pool.map((wk, i) =>
        runRound(wk, { type: 'run', base: snapshot, iters, seed: (seed + round * 100003 + i * 7919) >>> 0 })
      ));
      mergeDeltas(trainer, snapshot.nodes, results.map(r => r.ckpt));
      trainer.iterations = snapshot.iterations + iters * workers;
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
