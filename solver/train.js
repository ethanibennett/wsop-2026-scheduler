#!/usr/bin/env node
// ── CFR training CLI ────────────────────────────────────────
// Usage:
//   node --max-old-space-size=4096 solver/train.js --game td27 \
//        --iters 200000 [--minutes 8] [--seed 1] \
//        [--out solver/strategies/td27.json] [--min-mass 0.00001]
//
// Trains external-sampling MCCFR on the chosen game and writes the
// average strategy as JSON. A full-state checkpoint is saved next to
// the strategy (<id>.ckpt.json, gitignored) and picked up on the next
// run, so long trainings can be done in time-boxed chunks: pass
// --minutes to stop early and re-run the same command to continue
// until the --iters target is reached.

const fs = require('fs');
const path = require('path');
const { MCCFRTrainer } = require('./engine/mccfr');
const { makeRng } = require('./engine/cards');
const { GAMES } = require('./games');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const gameId = arg('game');
const targetIters = parseInt(arg('iters', '100000'), 10);
const minutes = parseFloat(arg('minutes', '0')); // 0 = no time box
const seed = parseInt(arg('seed', '12345'), 10);
const minMass = parseFloat(arg('min-mass', '0.00001'));
const out = arg('out', path.join(__dirname, 'strategies', `${gameId}.json`));
const metaOut = out.replace(/\.json$/, '.meta.json');
const ckptFile = arg('ckpt', out.replace(/\.json$/, '.ckpt.json'));
const saveCheckpoint = arg('checkpoint', '1') !== '0'; // --checkpoint 0 skips the big ckpt write
const saveEverySec = parseInt(arg('save-every', '1200'), 10); // periodic strategy save (crash safety)
const ckptEverySec = parseInt(arg('ckpt-every', '0'), 10); // periodic full-state checkpoint (0 = only at end)
const workers = parseInt(arg('workers', '1'), 10); // >1 => data-parallel across cores
const mergeEvery = parseInt(arg('merge-every', '50000'), 10); // iters/worker between parallel merges

const game = GAMES[gameId];
if (!game) {
  console.error(`Unknown game '${gameId}'. Available: ${Object.keys(GAMES).join(', ')}`);
  process.exit(1);
}

// Write the pruned average strategy + a tiny metadata sidecar. Called
// periodically during long runs so a crash/OOM never loses progress.
function exportStrategy(trainer) {
  const strategy = trainer.averageStrategy({ minMassRatio: minMass });
  const payload = {
    game: gameId,
    name: game.name,
    iterations: trainer.iterations,
    trainedAt: new Date().toISOString(),
    infosets: Object.keys(strategy).length,
    strategy,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload));
  fs.writeFileSync(metaOut, JSON.stringify({
    game: gameId, name: game.name, iterations: trainer.iterations, infosets: payload.infosets,
  }));
  return payload.infosets;
}

// Atomic full-state checkpoint write (temp + rename) so a kill mid-write
// can never corrupt the resume file.
function writeCheckpoint(trainer) {
  fs.mkdirSync(path.dirname(ckptFile), { recursive: true });
  const tmp = ckptFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(trainer.toCheckpoint()));
  fs.renameSync(tmp, ckptFile);
  return fs.statSync(ckptFile).size / 1024 / 1024;
}

// On a supervised always-on box the process is restarted (SIGTERM) to
// rotate/rebalance; checkpoint the live table first so no work is lost.
let currentTrainer = null;
let shuttingDown = false;
function onSignal(sig) {
  if (shuttingDown) return; shuttingDown = true;
  try {
    if (currentTrainer && saveCheckpoint) {
      process.stdout.write(`\n[${sig}] checkpointing before exit... `);
      const mb = writeCheckpoint(currentTrainer);
      console.log(`${mb.toFixed(0)} MB at ${currentTrainer.iterations} iters`);
    }
  } catch (e) { console.error('checkpoint-on-exit failed:', e.message); }
  process.exit(0);
}
process.on('SIGTERM', () => onSignal('SIGTERM'));
process.on('SIGINT', () => onSignal('SIGINT'));

async function main() {
  let trainer;
  if (fs.existsSync(ckptFile)) {
    console.log(`Resuming from ${ckptFile}`);
    trainer = MCCFRTrainer.fromCheckpoint(game, JSON.parse(fs.readFileSync(ckptFile, 'utf8')));
    console.log(`  ${trainer.iterations} iterations done, ${trainer.nodes.size} infosets`);
  } else {
    trainer = new MCCFRTrainer(game);
  }
  currentTrainer = trainer; // for checkpoint-on-signal

  const deadline = minutes > 0 ? Date.now() + minutes * 60000 : Infinity;

  if (trainer.iterations >= targetIters) {
    console.log(`Target of ${targetIters} iterations already reached.`);
  } else if (workers > 1) {
    // ── Data-parallel path (multi-core) ──
    const { trainParallel } = require('./engine/parallel');
    console.log(`Training ${game.name} — target ${targetIters} iterations, ` +
      `${workers} workers (merge every ${mergeEvery}/worker)` +
      (minutes ? `, time box ${minutes}m` : '') + `, ${trainer.iterations} done`);
    const t0 = Date.now();
    const startIters = trainer.iterations;
    let lastSave = Date.now();
    let lastCkpt = Date.now();
    trainer = await trainParallel(gameId, {
      workers, targetIters, mergeEvery, seed, deadline,
      base: trainer.iterations > 0 || trainer.nodes.size > 0 ? trainer.toCheckpoint() : null,
      onMerge: (tr) => {
        currentTrainer = tr; // coordinator's live table, for checkpoint-on-signal
        const rate = Math.round((tr.iterations - startIters) / ((Date.now() - t0) / 1000));
        process.stdout.write(`\r  ${tr.iterations}/${targetIters} iters, ${tr.nodes.size} infosets, ${rate} it/s   `);
        if (saveEverySec > 0 && (Date.now() - lastSave) > saveEverySec * 1000) {
          const n = exportStrategy(tr); lastSave = Date.now();
          process.stdout.write(`\n  [saved ${n} infosets at ${tr.iterations} iters]\n`);
        }
        if (saveCheckpoint && ckptEverySec > 0 && (Date.now() - lastCkpt) > ckptEverySec * 1000) {
          const mb = writeCheckpoint(tr); lastCkpt = Date.now();
          process.stdout.write(`\n  [checkpoint ${mb.toFixed(0)} MB at ${tr.iterations} iters]\n`);
        }
      },
    });
    currentTrainer = trainer;
    console.log(`\nStopped at ${trainer.iterations} iterations (${((Date.now() - t0) / 1000).toFixed(0)}s this run)`);
    if (saveCheckpoint) { process.stdout.write('Saving checkpoint... '); console.log(`${writeCheckpoint(trainer).toFixed(0)} MB`); }
  } else {
    // ── Single-thread path ──
    // distinct stream per chunk so resumed runs don't repeat deals
    const rng = makeRng((seed + trainer.iterations * 2654435761) >>> 0 || seed);
    console.log(`Training ${game.name} — target ${targetIters} iterations` +
      (minutes ? ` (time box ${minutes}m)` : '') + `, ${trainer.iterations} done`);
    const t0 = Date.now();
    const startIters = trainer.iterations;
    let lastSave = Date.now();
    let lastCkpt = Date.now();
    while (trainer.iterations < targetIters && Date.now() < deadline) {
      const chunk = Math.min(250, targetIters - trainer.iterations);
      trainer.train(chunk, rng);
      // Yield to the event loop so SIGTERM/SIGINT handlers can run — a
      // tight synchronous loop would starve them and ignore shutdown.
      await new Promise(r => setImmediate(r));
      const rate = Math.round((trainer.iterations - startIters) / ((Date.now() - t0) / 1000));
      process.stdout.write(`\r  ${trainer.iterations}/${targetIters} iters, ${trainer.nodes.size} infosets, ${rate} it/s   `);
      // Periodic crash-safe export so an OOM/kill never loses the run.
      if (saveEverySec > 0 && (Date.now() - lastSave) > saveEverySec * 1000) {
        const n = exportStrategy(trainer);
        lastSave = Date.now();
        process.stdout.write(`\n  [saved ${n} infosets at ${trainer.iterations} iters]\n`);
      }
      // Periodic full-state checkpoint so an always-on run is resumable
      // even if it's killed before reaching the (effectively unbounded) target.
      if (saveCheckpoint && ckptEverySec > 0 && (Date.now() - lastCkpt) > ckptEverySec * 1000) {
        const mb = writeCheckpoint(trainer);
        lastCkpt = Date.now();
        process.stdout.write(`\n  [checkpoint ${mb.toFixed(0)} MB at ${trainer.iterations} iters]\n`);
      }
    }
    console.log(`\nStopped at ${trainer.iterations} iterations (${((Date.now() - t0) / 1000).toFixed(0)}s this run)`);
    if (saveCheckpoint) {
      process.stdout.write('Saving checkpoint... ');
      console.log(`${writeCheckpoint(trainer).toFixed(0)} MB`);
    }
  }

  const infosets = exportStrategy(trainer);
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
  console.log(`Saved ${infosets} infosets to ${out} (${mb} MB)`);
  if (trainer.iterations < targetIters) {
    console.log(`Re-run the same command to continue toward ${targetIters} iterations.`);
    process.exitCode = 3; // signal "not finished" to wrapper scripts
  }
}

main().catch((e) => { console.error('\nTraining failed:', e); process.exit(1); });
