#!/usr/bin/env node
// ── gate3 — parallel-vs-single-thread EXPLOITABILITY GATE ──────────────────
// The bug-catcher for the data-parallel multiway MCCFR merge. This is the
// mandatory gate before any parallel razz3 grind ships.
//
// It trains the TINY, EXACTLY-ENUMERABLE razz3-reduced game (razz3-reduced.js)
// TWO ways to the SAME effective iteration count and compares GROUND-TRUTH
// exact per-seat exploitability (measure3.exactExploit, which walks the full
// game tree over every deal — no sampling):
//
//   • single-thread:  MCCFR3Trainer.train(T)                (the trusted path)
//   • parallel W:      parallel3.trainParallel3(W, mergeEvery)  advances by
//                      `mergeEvery` per round, so it too reaches T iterations
//                      (averaging is SAME-iteration-rate, not W×).
//
// GATE (non-negotiable): total parallel exploitability must be <= single-thread
// at the same effective work (small tolerance for MC deal noise between the two
// independent RNG streams). If parallel is WORSE, the merge is wrong (the exact
// failure mode of the old HU additive delta-merge: DCFR discount applied W
// times, negative regrets flipped, MORE exploitable as W grows) — the caller
// must NOT ship the parallel path.
//
// Usage: node solver/multiway/gate3.js [--iters T] [--workers W] [--merge M]
//        [--ranks R] [--cap C]

const { MCCFR3Trainer } = require('./mccfr3');
const { makeReduced } = require('./razz3-reduced');
const { trainParallel3 } = require('./parallel3');
const { exactExploit } = require('./measure3');
const { makeRng } = require('../engine/cards');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}

function totalExploit(game, trainer) {
  const sigma = trainer.averageStrategy();
  const per = exactExploit(game, sigma);
  const tot = per.reduce((a, e) => a + Math.max(0, e.exploit), 0);
  return { per, tot };
}

async function main() {
  const T = parseInt(arg('iters', 40000), 10);
  const workers = parseInt(arg('workers', 2), 10);
  const merge = parseInt(arg('merge', 2000), 10);
  const ranks = parseInt(arg('ranks', 6), 10);
  const cap = parseInt(arg('cap', 2), 10);
  const seed = parseInt(arg('seed', 999), 10);
  const gameOpts = { ranks, cap };
  const gameDesc = { module: './razz3-reduced', factory: 'makeReduced', opts: gameOpts };

  console.log(`gate3  razz3-reduced ranks=${ranks} cap=${cap}  iters=${T}  workers=${workers}  merge=${merge}`);

  // ── single-thread reference ──────────────────────────────────────────────
  const gS = makeReduced(gameOpts);
  const trS = new MCCFR3Trainer(gS);
  const rngS = makeRng(seed >>> 0 || 1);
  const t0 = Date.now();
  trS.train(T, rngS);
  const single = totalExploit(gS, trS);
  const tS = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  single-thread : iters=${trS.iterations} infosets=${trS.nodes.size}  ` +
    `exploit[s0,s1,s2]=[${single.per.map(e => e.exploit.toFixed(4)).join(',')}]  total=${single.tot.toFixed(4)}  (${tS}s)`);

  // ── parallel W (same effective work) ─────────────────────────────────────
  const t1 = Date.now();
  const trP = await trainParallel3(gameDesc, { workers, targetIters: T, mergeEvery: merge, seed });
  const gP = makeReduced(gameOpts);
  const par = totalExploit(gP, trP);
  const tP = ((Date.now() - t1) / 1000).toFixed(1);
  console.log(`  parallel W=${workers}  : iters=${trP.iterations} infosets=${trP.nodes.size}  ` +
    `exploit[s0,s1,s2]=[${par.per.map(e => e.exploit.toFixed(4)).join(',')}]  total=${par.tot.toFixed(4)}  (${tP}s)`);

  // ── verdict ──────────────────────────────────────────────────────────────
  // Tolerance: the two runs use independent RNG streams, so a tiny +noise on
  // parallel is not a merge failure. A correct averaging merge should TIE or
  // BEAT single-thread (variance reduction). A BROKEN merge blows up (the HU
  // additive-delta signature: 0.002 -> 0.142). Tol = 8% of single OR 0.01 abs.
  const tol = Math.max(0.01, 0.08 * single.tot);
  const delta = par.tot - single.tot;
  const green = par.tot <= single.tot + tol;
  console.log(`\n  Δ(parallel - single) = ${delta >= 0 ? '+' : ''}${delta.toFixed(4)}   tol=${tol.toFixed(4)}`);
  if (green) {
    console.log(`  GATE: GREEN — parallel (${par.tot.toFixed(4)}) <= single (${single.tot.toFixed(4)}) + tol. Merge is DCFR-safe.`);
    process.exit(0);
  } else {
    console.log(`  GATE: RED — parallel (${par.tot.toFixed(4)}) > single (${single.tot.toFixed(4)}) + tol. DO NOT SHIP. Merge raises exploitability.`);
    process.exit(2);
  }
}

main().catch((e) => { console.error('gate3 failed:', e); process.exit(1); });
