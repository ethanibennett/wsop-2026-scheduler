// ── Data-parallel 3-player MCCFR worker ─────────────────────────
// One of W worker threads spawned by solver/multiway/parallel3.js. The
// N=3 analogue of solver/engine/cfr-worker.js. Each round the coordinator
// broadcasts the current authoritative table (a checkpoint blob); this
// worker rebuilds an MCCFR3Trainer from it, runs `iters` INDEPENDENT
// external-sampling iterations with its own RNG stream, and ships the
// resulting table back. The coordinator then AVERAGES the W worker tables
// (parallel3.mergeAverage) — NOT an additive delta-sum.
//
// Why averaging (not diff-and-sum): mccfr3's regret update is DCFR —
// `regret = (prev>0 ? prev*posDiscount : prev*0.5) + (u-ev)` with the
// discount keyed on the trainer's global iteration counter (mccfr3.js
// line ~82). That is multiplicative-then-additive, exactly the structure
// that made the additive delta-merge WRONG in the HU engine
// (engine/parallel.js history: additive applied the decay W times and
// flipped negative regrets → MORE exploitable). Each worker here applies
// the DCFR discount ONCE from the shared snapshot; the coordinator's mean
// keeps it once (DCFR-correct) and buys variance reduction. See
// parallel3.js mergeAverage + CLAUDE.md 2026-06-18 'solver hardening'.
//
// The worker builds the SAME game the coordinator built by requiring the
// same module and calling the same factory with the same opts (passed via
// workerData) so infoset keys and the deal distribution match exactly. This
// generality lets the parallel-vs-single-thread GATE run over the tiny
// exactly-enumerable razz3-reduced game as well as the full razz3 game.

const { parentPort, workerData } = require('worker_threads');
const { MCCFR3Trainer } = require('./mccfr3');
const { makeRng } = require('../engine/cards');

// { gameModule, gameFactory, gameOpts } — require the module and call
// module[gameFactory](gameOpts) to rebuild the identical game.
const mod = require(workerData.gameModule);
const game = mod[workerData.gameFactory](workerData.gameOpts || {});

parentPort.on('message', (msg) => {
  if (msg.type === 'run') {
    const trainer = MCCFR3Trainer.fromCheckpoint(game, msg.base);
    const rng = makeRng((msg.seed >>> 0) || 1);
    trainer.train(msg.iters, rng);
    parentPort.postMessage({ type: 'done', ckpt: trainer.toCheckpoint(), did: msg.iters });
  } else if (msg.type === 'stop') {
    process.exit(0);
  }
});
