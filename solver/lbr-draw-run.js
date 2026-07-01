// ── Parallel driver for the particle-filter draw LBR ─────────────────────────
// The σ/aggro rollouts make a single-thread headline run slow (~0.13 s/hand), so
// for a STABLE number we need thousands of hands. This driver fans the work out
// across worker processes — one per (seat × rolloutMode) cell — accumulates the
// per-cell LBR and σ values, and prints the same report as lbr-draw.js plus the
// COMBINED meter max(particle-filter, fixed-exploiter).
//
//   node solver/lbr-draw-run.js --game td27   --particles 150 --hands 4000
//   node solver/lbr-draw-run.js --game badugi --particles 150 --hands 4000 --sanity
//
// Each worker is deterministic (seeded), so the run is reproducible. CRN holds
// WITHIN a worker (its LBR and σ share the deal stream); across workers the seeds
// differ by cell, which is fine — we only difference LBR−σ inside a cell.

const { fork } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── worker mode ──────────────────────────────────────────────────────────────
// Invoked as: node lbr-draw-run.js --worker <gameId> <seat> <mode> <N> <hands> <ev> <seed>
if (process.argv[2] === '--worker') {
  const { GAMES } = require('./games');
  const lib = require('./lbr-draw');
  const [, , , gameId, seatS, mode, NS, handsS, evS, seedS, marginS] = process.argv;
  const game = GAMES[gameId];
  const seat = parseInt(seatS, 10), N = parseInt(NS, 10), hands = parseInt(handsS, 10);
  const ev = parseInt(evS, 10), seed = parseInt(seedS, 10), margin = parseFloat(marginS);
  // Compute the single (seat, mode) cell: LBR value and σ value over `hands`
  // CRN-paired deals. We call the library's internals via a thin one-cell entry.
  const r = lib._cell(game, require(resolveStrategy(gameId)).strategy, seat, mode, N, hands, ev, seed, margin);
  process.send(r);
  process.exit(0);
}

function resolveStrategy(gameId) {
  return path.join(__dirname, 'strategies', gameId + '.json');
}

// ── orchestrator (only when run as the main module) ──────────────────────────
if (require.main === module && process.argv[2] !== '--worker') {
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const gameId = arg('game', 'td27');
const particles = parseInt(arg('particles', '150'), 10);
const hands = parseInt(arg('hands', '4000'), 10);
const evParticles = parseInt(arg('ev', '30'), 10);
const modes = (arg('modes', 'sigma,aggro')).split(',');
const seed = parseInt(arg('seed', '12345'), 10);
const margin = parseFloat(arg('margin', '0.2'));

const file = resolveStrategy(gameId);
if (!fs.existsSync(file)) { console.error('no strategy file', file); process.exit(1); }
const meta = JSON.parse(fs.readFileSync(file, 'utf8'));

function runCell(seat, mode, cellSeed) {
  return new Promise((resolve, reject) => {
    const w = fork(__filename, ['--worker', gameId, String(seat), mode,
      String(particles), String(hands), String(evParticles), String(cellSeed), String(margin)]);
    w.on('message', resolve);
    w.on('error', reject);
    w.on('exit', code => { if (code !== 0) reject(new Error('worker exit ' + code)); });
  });
}

(async () => {
  console.log(`\n=== Particle-filter LBR (parallel) — ${meta.name} ===`);
  console.log(`blueprint: ${meta.iterations.toLocaleString()} iters, ${meta.infosets.toLocaleString()} infosets`);
  console.log(`settings: ${particles} particles (${evParticles} rolled/EV), ${hands} hands/seat, modes [${modes.join(', ')}], deviate-margin ${margin}`);
  const t0 = Date.now();

  // Fan out: one worker per (seat × mode). σ baseline per seat is computed inside
  // each cell (CRN), so the σ value is shared by construction within a seat's
  // cells (same deal seed) — we read it from any cell of that seat.
  const jobs = [];
  for (const seat of [0, 1]) {
    for (const mode of modes) {
      jobs.push(runCell(seat, mode, seed + seat * 1000 + modes.indexOf(mode)));
    }
  }
  const results = await Promise.all(jobs);

  // index results
  let k = 0;
  const cell = {}; // cell[seat][mode] = { lbr, sig, dev }
  for (const seat of [0, 1]) {
    cell[seat] = {};
    for (const mode of modes) { cell[seat][mode] = results[k++]; }
  }

  const perMode = {};
  for (const mode of modes) {
    perMode[mode] = {
      dev0: cell[0][mode].dev, dev1: cell[1][mode].dev,
      se0: cell[0][mode].se, se1: cell[1][mode].se,
    };
  }
  // best (max) per seat across modes
  let dev0 = -Infinity, dev1 = -Infinity, bm0 = null, bm1 = null, se0 = 0, se1 = 0;
  for (const mode of modes) {
    if (cell[0][mode].dev > dev0) { dev0 = cell[0][mode].dev; bm0 = mode; se0 = cell[0][mode].se; }
    if (cell[1][mode].dev > dev1) { dev1 = cell[1][mode].dev; bm1 = mode; se1 = cell[1][mode].se; }
  }
  const pf = Math.max(0, (dev0 + dev1) / 2);
  const pfSE = Math.sqrt(se0 * se0 + se1 * se1) / 2; // SE of the seat-averaged dev
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\nTRAINED BLUEPRINT`);
  for (const mode of modes) {
    const m = perMode[mode];
    console.log(`  [${mode.padEnd(7)}] dev seat0 ${m.dev0.toFixed(3)} ±${m.se0.toFixed(3)}, seat1 ${m.dev1.toFixed(3)} ±${m.se1.toFixed(3)}`);
  }
  console.log(`  σ self-value (seat0,seat1): ${cell[0][modes[0]].sig.toFixed(3)}, ${cell[1][modes[0]].sig.toFixed(3)}`);
  console.log(`  best deviation (seat0,seat1): ${dev0.toFixed(3)} [${bm0}], ${dev1.toFixed(3)} [${bm1}]`);
  console.log(`  PARTICLE-FILTER LBR: ${pf.toFixed(3)} ± ${pfSE.toFixed(3)} chips/hand (1 s.e.)  [${secs}s wall]`);

  // combined meter with the existing fixed-exploiter bound
  const { referenceLowerBound } = require('./exploitability');
  const ref = referenceLowerBound(require('./games').GAMES[gameId], meta.strategy, { hands: 40000 }).lowerBound;
  const combined = Math.max(pf, ref);
  console.log(`  fixed-exploiter LB:  ${ref.toFixed(3)} chips/hand`);
  console.log(`  COMBINED (shipped):  ${combined.toFixed(3)} chips/hand = max(PF, fixed)`);

  if (process.argv.includes('--sanity')) {
    console.log(`\n(For the broken-strategy and particle-count-stability gates, run`);
    console.log(` node solver/lbr-draw.js --game ${gameId} --particles ${particles} --hands 800 --sanity)`);
  }
})();
} // end orchestrator guard
