#!/usr/bin/env node
// ── train3 — train + measure the FULL 3-player razz3 blueprint ─────────────
// Wires the spike's 3-player external-sampling MCCFR (mccfr3.js) to the full
// 13-rank razz3 game (razz3-game.js) and reports, at checkpoints:
//   • per-seat mean positive regret (the multiway no-regret signal)
//   • average-strategy L1 drift between checkpoints
//   • per-seat SAMPLED best-response exploitability (measure3.sampledExploit) —
//     a genuine LOWER bound (fix 2 seats at avg, hero best-responds via CRN)
//     reported in chips and as a % of the (dead + live) pot.
//
// Usage:
//   node --max-old-space-size=6144 solver/multiway/train3.js \
//        [--iters N] [--cap 2] [--antes 8] [--coarse-opp] [--seed S] \
//        [--measure-hands H] [--out FILE] [--smoke]
//
// --smoke runs a few hundred iters + a tiny measure pass (CI-friendly).
// Writes the average strategy to --out (JSON: {meta, strategy}) if given.

const fs = require('fs');
const path = require('path');
const { makeRng } = require('../engine/cards');
const { MCCFR3Trainer } = require('./mccfr3');
const { stratDrift, sampledExploit } = require('./measure3');
const { makePool } = require('./parallel3');

// ── game registry (parameterizes the trainer over the multiway games) ──
// Each entry names the module a worker rebuilds the game from; every module
// exposes the SAME { makeGame, DEFAULT_CAP, DEFAULT_ANTES, UNIFORM_PRIORS }
// surface, so ALL of the train/measure/checkpoint/blueprint code below is
// game-agnostic. Default is razz3 (unchanged); `--game stud8` loads the hi/lo
// sibling. The written blueprint's meta.game is the constructed game's id.
const GAME_MODULES = { razz3: './razz3-game', stud8: './stud8-3way-game', td27: './td27-3way-game' };

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}
function fmt(x, d = 3) { return (x >= 0 ? ' ' : '') + Number(x).toFixed(d); }

// Write the average strategy blueprint to --out (the product artifact).
function writeBlueprint(trainer, out, meta) {
  const strategy = {};
  const avg = trainer.averageStrategy();
  // Persist per-node avg-strategy mass (m) alongside probs (p): it's the
  // linear-averaging weight, so keeping it makes the blueprint a valid warm-
  // start prior if the full-state checkpoint is ever lost (avoids the stud8
  // "average-only, state unrecoverable" trap).
  for (const [k, n] of Object.entries(avg)) strategy[k] = { a: n.a, p: n.p, m: n.m };
  const full = { ...meta, infosets: trainer.nodes.size };
  const tmp = path.resolve(out) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ meta: full, strategy }));
  fs.renameSync(tmp, path.resolve(out)); // atomic: a kill mid-write can't corrupt it
  return Object.keys(strategy).length;
}

// Atomic full-state checkpoint write (temp + rename) mirroring solver/train.js,
// so a kill mid-write can never corrupt the resume file.
function writeCheckpoint(trainer, ckptFile) {
  fs.mkdirSync(path.dirname(ckptFile), { recursive: true });
  const tmp = ckptFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(trainer.toCheckpoint()));
  fs.renameSync(tmp, ckptFile);
  return fs.statSync(ckptFile).size / 1024 / 1024;
}

async function main() {
  const smoke = !!arg('smoke', false);
  // Select the game module (default razz3; --game stud8 → the hi/lo sibling).
  const gameName = arg('game', 'razz3');
  const gameModulePath = GAME_MODULES[gameName];
  if (!gameModulePath) {
    console.error(`unknown --game '${gameName}' (choices: ${Object.keys(GAME_MODULES).join(', ')})`);
    process.exit(1);
  }
  const { makeGame, DEFAULT_CAP, DEFAULT_ANTES, UNIFORM_PRIORS } = require(gameModulePath);
  // --iters is an ABSOLUTE target (total lifetime iterations), matching
  // solver/train.js's targetIters — this is what makes the grind cumulative:
  // an escalating ladder just raises the target and the trainer resumes.
  const iters = parseInt(arg('iters', smoke ? 400 : 200000), 10);
  const cap = parseInt(arg('cap', DEFAULT_CAP), 10);
  const antes = parseInt(arg('antes', DEFAULT_ANTES), 10);
  const coarseOpp = !!arg('coarse-opp', false);
  // --uniform: deal 3rd-street hands UNIFORMLY (no biased door-rank prior) so the
  // 3rd-street fold/enter equilibrium frequencies EMERGE as the derived entry range
  // (solver/entry, DERIVATION_SPEC.md). Default = biased DEFAULT_PRIORS (unchanged;
  // the running grinds are untouched). Use a DISTINCT --out so it never clobbers the
  // biased blueprint.
  const uniform = !!arg('uniform', false);
  const priors = uniform ? UNIFORM_PRIORS : undefined;
  const seed = parseInt(arg('seed', 999), 10);
  const measureHands = parseInt(arg('measure-hands', smoke ? 300 : 6000), 10);
  // Data-parallel MCCFR: W>=2 spreads each round's iterations across W worker
  // threads and AVERAGES their tables (parallel3.mergeAverage — DCFR-correct,
  // gate3-verified <= single-thread). W<=1 uses the in-process single-thread
  // loop below, byte-identical to before (the parallel path is never taken).
  // --merge-every is the per-round iteration budget (snapshot->W workers->merge);
  // averaging means iterations advance by this per round, NOT ×W.
  const workers = parseInt(arg('workers', 1), 10);
  const mergeEvery = parseInt(arg('merge-every', 5000), 10);
  const workerHeapMB = parseInt(arg('worker-heap', 0), 10);
  const out = arg('out', null);
  // Full-state checkpoint (resume file) next to --out, gitignored like the
  // stud/draw *.ckpt.json. Periodic write every --ckpt-every seconds so a
  // kill (SIGTERM/OOM/lid) mid-rung loses at most that many seconds.
  const ckptFile = arg('ckpt', out ? out.replace(/\.json$/, '.ckpt.json') : null);
  const saveCheckpoint = !!ckptFile && arg('checkpoint', '1') !== '0';
  const ckptEverySec = parseInt(arg('ckpt-every', smoke ? '0' : '180'), 10);

  const game = makeGame({ cap, antes, coarseOpp, priors });
  // Resume from the checkpoint if one exists (warm-start the regret + avg-strat
  // tables), else start fresh. This is the accumulation seam.
  let trainer;
  if (saveCheckpoint && fs.existsSync(ckptFile)) {
    console.log(`Resuming from ${ckptFile}`);
    trainer = MCCFR3Trainer.fromCheckpoint(game, JSON.parse(fs.readFileSync(ckptFile, 'utf8')));
    console.log(`  ${trainer.iterations} iterations done, ${trainer.nodes.size} infosets`);
  } else {
    trainer = new MCCFR3Trainer(game);
  }
  // Distinct RNG stream per resume so a continued run doesn't replay deals
  // (same trick as solver/train.js's seed-mix on trainer.iterations).
  const rng = makeRng((seed + trainer.iterations * 2654435761) >>> 0 || seed);
  const potScale = game.deadPot + 3 * 8; // rough pot scale for % readout
  const meta = { game: game.id, cap, antes, deadPot: game.deadPot, coarseOpp, uniform, seed, iters };

  // Data-parallel pool (W>=2 only). Each worker rebuilds the IDENTICAL game via
  // this descriptor {module,factory,opts}. The pool wraps THIS SAME trainer, so
  // all the resume/checkpoint/blueprint/measure code below is unchanged — the
  // only difference is the training chunk goes through pool.step() (broadcast ->
  // W workers -> DCFR-safe averaging merge) instead of trainer.train(). W<=1
  // leaves pool null and the in-process single-thread loop runs, byte-identical.
  const parallel = workers >= 2;
  const gameDesc = { module: gameModulePath, factory: 'makeGame', opts: { cap, antes, coarseOpp, ...(priors ? { priors } : {}) } };
  const pool = parallel ? makePool(trainer, gameDesc, { workers, workerHeapMB }) : null;
  if (parallel) console.log(`  data-parallel: ${workers} workers, merge-every=${mergeEvery} (averaging merge; iters advance by merge-every/round, NOT ×W)`);

  // Checkpoint-on-signal: on a supervised/perpetual box the process is
  // SIGTERM'd to rotate; checkpoint the live table + refresh the blueprint
  // first so no work is lost (idiom from solver/train.js).
  let shuttingDown = false;
  function onSignal(sig) {
    if (shuttingDown) return; shuttingDown = true;
    try {
      if (saveCheckpoint) {
        process.stdout.write(`\n[${sig}] checkpointing before exit... `);
        const mb = writeCheckpoint(trainer, ckptFile);
        if (out) writeBlueprint(trainer, out, meta);
        console.log(`${mb.toFixed(0)} MB at ${trainer.iterations} iters`);
      }
    } catch (e) { console.error('checkpoint-on-exit failed:', e.message); }
    // Tear down the worker pool so the process can exit promptly. The signal
    // fires between merges (the loop yields to the event loop each chunk), so
    // the just-checkpointed trainer table already reflects the last merge — no
    // in-flight worker round is lost. Fire-and-forget terminate; process.exit
    // below drops any stragglers.
    if (pool) { pool.close().catch(() => {}); }
    process.exit(0);
  }
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));

  console.log(`${game.id}  cap=${cap}  antes=${antes} (deadPot=${game.deadPot})  coarseOpp=${coarseOpp}  seed=${seed}  target=${iters}`);
  console.log('  iters   infosets   meanPosReg   drift    exploit[s0,s1,s2] (chips)   tot   %pot');

  if (trainer.iterations >= iters) {
    console.log(`Target of ${iters} iterations already reached (${trainer.iterations} done) — nothing to do.`);
  } else {
    // Report/measure schedule: absolute stops from the CURRENT position up to
    // the target, so a resumed run reports incremental progress (not stops it
    // has already blown past).
    const cps = smoke ? [iters] : (() => {
      const a = []; let x = Math.max(trainer.iterations, 1);
      x = Math.min(Math.max(2000, trainer.iterations + 2000), iters);
      while (x < iters) { a.push(x); x = Math.min(iters, Math.round(x * 2.2)); }
      a.push(iters); return [...new Set(a)].filter(s => s > trainer.iterations);
    })();

    let prev = trainer.iterations > 0 ? trainer.averageStrategy() : null;
    let lastCkpt = Date.now();
    for (const stop of cps) {
      const t0 = Date.now();
      // Train toward `stop` in bounded chunks, yielding to the event loop
      // between them so the SIGTERM/SIGINT handler can run (a single huge
      // synchronous train() call would starve it and ignore shutdown) and so
      // the incremental checkpoint below can fire mid-rung, not just at each
      // measure stop (idiom from solver/train.js).
      while (trainer.iterations < stop && !shuttingDown) {
        if (parallel) {
          // Parallel round: broadcast the current table to W workers, each runs
          // up to `mergeEvery` iters on its own RNG stream, then the DCFR-safe
          // averaging merge folds them back into THIS trainer (iterations advance
          // by the round size, not ×W). `await` yields to the event loop, so the
          // SIGTERM/SIGINT handler + the incremental checkpoint below are honored
          // between rounds — a kill loses at most one un-checkpointed round.
          const round = Math.min(mergeEvery, stop - trainer.iterations);
          await pool.step(round, seed);
        } else {
          // Small chunks (~1-2s each at this abstraction — a cold cap-2 iter
          // touches a huge game tree, ~35ms/iter) so the SIGTERM/SIGINT handler
          // and the incremental checkpoint timer are honored within a couple
          // seconds, not stalled behind a multi-minute synchronous span.
          const chunk = Math.min(50, stop - trainer.iterations);
          trainer.train(chunk, rng);
          await new Promise(r => setImmediate(r));
        }
        if (saveCheckpoint && ckptEverySec > 0 && (Date.now() - lastCkpt) > ckptEverySec * 1000) {
          const mb = writeCheckpoint(trainer, ckptFile);
          if (out) writeBlueprint(trainer, out, meta);
          lastCkpt = Date.now();
          console.log(`  [checkpoint ${mb.toFixed(0)} MB at ${trainer.iterations} iters]`);
        }
      }
      if (shuttingDown) break;
      const avg = trainer.averageStrategy();
      const drift = prev ? stratDrift(prev, avg) : NaN;
      const ex = sampledExploit(game, avg, { hands: measureHands, seed: seed + 17 });
      const tot = ex.reduce((a, e) => a + e.exploit, 0);
      console.log('  ' + String(trainer.iterations).padStart(6) + '   ' +
        String(trainer.nodes.size).padStart(8) + '   ' +
        fmt(trainer.meanPositiveRegret(), 4).padStart(9) + '  ' +
        (isNaN(drift) ? '   —' : fmt(drift, 4)).padStart(7) + '   [' +
        ex.map(e => fmt(e.exploit, 2)).join(',') + ']   ' +
        fmt(tot, 2).padStart(6) + '  ' + fmt(100 * tot / potScale, 1).padStart(5) +
        '   (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
      prev = avg;
    }
    if (shuttingDown) return; // signal handler already checkpointed + exited
  }

  // Final checkpoint + blueprint at clean exit.
  if (saveCheckpoint) {
    const mb = writeCheckpoint(trainer, ckptFile);
    console.log(`checkpoint ${mb.toFixed(0)} MB at ${trainer.iterations} iters → ${ckptFile}`);
  }
  if (out) {
    const n = writeBlueprint(trainer, out, meta);
    console.log(`saved ${n} infosets → ${out}`);
  }
  // Terminate the worker pool so the process exits (worker threads keep the
  // event loop alive). No-op when single-threaded (pool is null).
  if (pool) await pool.close();
  console.log('\nDONE.');
}

if (require.main === module) main().catch((e) => { console.error('\nTraining failed:', e); process.exit(1); });
module.exports = { main };
