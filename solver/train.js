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
const ckptFile = arg('ckpt', out.replace(/\.json$/, '.ckpt.json'));

const game = GAMES[gameId];
if (!game) {
  console.error(`Unknown game '${gameId}'. Available: ${Object.keys(GAMES).join(', ')}`);
  process.exit(1);
}

let trainer;
if (fs.existsSync(ckptFile)) {
  console.log(`Resuming from ${ckptFile}`);
  trainer = MCCFRTrainer.fromCheckpoint(game, JSON.parse(fs.readFileSync(ckptFile, 'utf8')));
  console.log(`  ${trainer.iterations} iterations done, ${trainer.nodes.size} infosets`);
} else {
  trainer = new MCCFRTrainer(game);
}

if (trainer.iterations >= targetIters) {
  console.log(`Target of ${targetIters} iterations already reached.`);
} else {
  // distinct stream per chunk so resumed runs don't repeat deals
  const rng = makeRng((seed + trainer.iterations * 2654435761) >>> 0 || seed);
  const deadline = minutes > 0 ? Date.now() + minutes * 60000 : Infinity;
  console.log(`Training ${game.name} — target ${targetIters} iterations` +
    (minutes ? ` (time box ${minutes}m)` : '') + `, ${trainer.iterations} done`);
  const t0 = Date.now();
  const startIters = trainer.iterations;
  while (trainer.iterations < targetIters && Date.now() < deadline) {
    const chunk = Math.min(1000, targetIters - trainer.iterations);
    trainer.train(chunk, rng);
    const rate = Math.round((trainer.iterations - startIters) / ((Date.now() - t0) / 1000));
    process.stdout.write(`\r  ${trainer.iterations}/${targetIters} iters, ${trainer.nodes.size} infosets, ${rate} it/s   `);
  }
  console.log(`\nStopped at ${trainer.iterations} iterations (${((Date.now() - t0) / 1000).toFixed(0)}s this run)`);
  process.stdout.write('Saving checkpoint... ');
  fs.mkdirSync(path.dirname(ckptFile), { recursive: true });
  fs.writeFileSync(ckptFile, JSON.stringify(trainer.toCheckpoint()));
  console.log(`${(fs.statSync(ckptFile).size / 1024 / 1024).toFixed(0)} MB`);
}

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
const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
console.log(`Saved ${payload.infosets} infosets to ${out} (${mb} MB)`);
if (trainer.iterations < targetIters) {
  console.log(`Re-run the same command to continue toward ${targetIters} iterations.`);
  process.exitCode = 3; // signal "not finished" to wrapper scripts
}
