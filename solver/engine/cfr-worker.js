// ── Data-parallel MCCFR worker ──────────────────────────────
// One of W worker threads spawned by engine/parallel.js. Each round the
// coordinator broadcasts the current authoritative table (a checkpoint
// blob); this worker rebuilds a trainer from it, runs `iters` independent
// external-sampling iterations with its own RNG stream, and ships the
// resulting table back. The coordinator diffs each worker's table against
// the broadcast base to recover that worker's regret/strategy *delta* and
// sums the deltas in — the standard synchronous data-parallel CFR scheme.
//
// Why diff-and-sum is sound here: regret and average-strategy mass are
// additive accumulators, and DCFR's per-iteration discount is ~1 once t is
// large (the regime we train in), so summing W workers' deltas is the same
// work as W times more single-thread iterations, to a vanishing early-t
// approximation. See engine/parallel.js for the merge.

const { parentPort, workerData } = require('worker_threads');
const { MCCFRTrainer } = require('./mccfr');
const { makeRng } = require('./cards');
const { GAMES } = require('../games');

const game = GAMES[workerData.gameId];
if (!game) throw new Error(`cfr-worker: unknown game '${workerData.gameId}'`);

parentPort.on('message', (msg) => {
  if (msg.type === 'run') {
    const trainer = MCCFRTrainer.fromCheckpoint(game, msg.base);
    const rng = makeRng((msg.seed >>> 0) || 1);
    trainer.train(msg.iters, rng);
    parentPort.postMessage({ type: 'done', ckpt: trainer.toCheckpoint(), did: msg.iters });
  } else if (msg.type === 'stop') {
    process.exit(0);
  }
});
