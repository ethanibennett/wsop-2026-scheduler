// ── Parallel driver for the stud best-response LBR meter ─────────────────────
// The reach-weighted belief + MC/exact rollouts make a single-thread headline run
// slow (~0.3 s/hand), so a stable number needs thousands of hands. This driver
// fans the work out across worker processes — one per (seat × continuation) cell —
// accumulates the per-cell LBR and σ values, and prints the same report as
// lbr-stud.js plus the COMBINED meter max(LBR, fixed-exploiter).
//
//   node solver/lbr-stud-run.js --game razz  --hands 3000
//   node solver/lbr-stud-run.js --game stud8 --hands 3000 --sanity
//
// Each worker is deterministic (seeded), so the run is reproducible. CRN holds
// WITHIN a worker (its LBR and σ share the per-hand deal seed). The per-seat cell
// seed MIRRORS studLBR exactly (seat 0 → seed, seat 1 → seed+5000, with NO
// per-continuation offset), so a seat's two continuations run on the SAME deals
// and this parallel driver agrees bit-for-bit with the single-process studLBR for
// the same --seed (the "reproducible" claim in this header is against studLBR too).

const { fork } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── worker mode ──────────────────────────────────────────────────────────────
// node lbr-stud-run.js --worker <gameId> <seat> <cont> <hands> <seed> <margin> <samples> <rangeSamples> <budget>
if (process.argv[2] === '--worker') {
  const lib = require('./lbr-stud');
  const [, , , gameId, seatS, cont, handsS, seedS, marginS, samplesS, rsS, budgetS] = process.argv;
  const seat = parseInt(seatS, 10), hands = parseInt(handsS, 10), seed = parseInt(seedS, 10);
  const cfg0 = {
    margin: parseFloat(marginS), samples: parseInt(samplesS, 10),
    rangeSamples: parseInt(rsS, 10), rangeSeed: 0xBEEF, crnSeed: 0xC0FFEE,
    exactRangeBudget: parseInt(budgetS, 10),
  };
  const meta = JSON.parse(fs.readFileSync(resolveStrategy(gameId), 'utf8'));
  const r = lib.cell(gameId, meta.strategy, seat, cont, hands, seed, cfg0);
  process.send(r);
  process.exit(0);
}

function resolveStrategy(gameId) {
  return path.join(__dirname, 'strategies', gameId + '.json');
}

if (require.main === module && process.argv[2] !== '--worker') {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
  const gameId = arg('game', 'razz');
  const hands = parseInt(arg('hands', '3000'), 10);
  const margin = parseFloat(arg('margin', '0.25'));
  const samples = parseInt(arg('samples', '300'), 10);
  const rangeSamples = parseInt(arg('rangeSamples', '600'), 10);
  const budget = parseInt(arg('budget', '1200'), 10);
  const conts = (arg('conts', 'sigma,aggro')).split(',');
  const seed = parseInt(arg('seed', '12345'), 10);

  const file = resolveStrategy(gameId);
  if (!fs.existsSync(file)) { console.error('no strategy file', file); process.exit(1); }
  const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { STUD_GAMES } = require('./lbr-stud');
  if (!STUD_GAMES[gameId]) { console.error('unknown stud game', gameId, '(use razz | stud8)'); process.exit(1); }

  function runCell(seat, cont, cellSeed) {
    return new Promise((resolve, reject) => {
      const w = fork(__filename, ['--worker', gameId, String(seat), cont, String(hands),
        String(cellSeed), String(margin), String(samples), String(rangeSamples), String(budget)]);
      w.on('message', resolve);
      w.on('error', reject);
      w.on('exit', code => { if (code !== 0) reject(new Error('worker exit ' + code)); });
    });
  }

  (async () => {
    console.log(`\n=== Best-response LBR meter (parallel) — ${STUD_GAMES[gameId].name} ===`);
    console.log(`blueprint: ${(meta.iterations || 0).toLocaleString()} iters, ${(meta.infosets || 0).toLocaleString()} infosets`);
    console.log(`settings: ${hands} hands/seat, margin ${margin}, ${samples} MC samples, ${rangeSamples} range samples, budget ${budget}, conts [${conts.join(', ')}]`);
    const t0 = Date.now();

    const jobs = [];
    for (const seat of [0, 1]) {
      for (const cont of conts) {
        // Mirror studLBR EXACTLY: seat 0 → seed, seat 1 → seed+5000, and NO
        // per-continuation offset, so a seat's two continuations run on the SAME
        // deals (studLBR's cell() applies its own +seat*777 internally). This makes
        // the parallel headline reproduce the single-process one bit-for-bit.
        jobs.push(runCell(seat, cont, seed + (seat === 0 ? 0 : 5000)));
      }
    }
    const results = await Promise.all(jobs);

    let k = 0;
    const cell = {};
    for (const seat of [0, 1]) { cell[seat] = {}; for (const cont of conts) cell[seat][cont] = results[k++]; }

    const perCont = {};
    for (const cont of conts) {
      perCont[cont] = { dev0: cell[0][cont].dev, dev1: cell[1][cont].dev, se0: cell[0][cont].se, se1: cell[1][cont].se };
    }
    let dev0 = -Infinity, dev1 = -Infinity, bm0 = null, bm1 = null, se0 = 0, se1 = 0;
    for (const cont of conts) {
      if (cell[0][cont].dev > dev0) { dev0 = cell[0][cont].dev; bm0 = cont; se0 = cell[0][cont].se; }
      if (cell[1][cont].dev > dev1) { dev1 = cell[1][cont].dev; bm1 = cont; se1 = cell[1][cont].se; }
    }
    const meter = Math.max(0, (dev0 + dev1) / 2);
    const meterSE = Math.sqrt(se0 * se0 + se1 * se1) / 2;
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    console.log(`\nTRAINED BLUEPRINT`);
    for (const cont of conts) {
      const m = perCont[cont];
      console.log(`  [${cont.padEnd(6)}] dev seat0 ${m.dev0.toFixed(3)} ±${m.se0.toFixed(3)}, seat1 ${m.dev1.toFixed(3)} ±${m.se1.toFixed(3)}`);
    }
    console.log(`  σ self-value (seat0,seat1): ${cell[0][conts[0]].sig.toFixed(3)}, ${cell[1][conts[0]].sig.toFixed(3)}`);
    console.log(`  best deviation (seat0,seat1): ${dev0.toFixed(3)} [${bm0}], ${dev1.toFixed(3)} [${bm1}]`);
    console.log(`  BEST-RESPONSE LBR: ${meter.toFixed(3)} ± ${meterSE.toFixed(3)} chips/hand (1 s.e.)  [${secs}s wall]`);

    const { referenceLowerBound } = require('./exploitability');
    const ref = referenceLowerBound(STUD_GAMES[gameId], meta.strategy, { hands: 40000 }).lowerBound;
    const combined = Math.max(meter, ref);
    console.log(`  fixed-exploiter LB:  ${ref.toFixed(3)} chips/hand`);
    console.log(`  COMBINED (shipped):  ${combined.toFixed(3)} chips/hand = max(LBR, fixed)`);
    console.log(`  gate(3) meter ≥ fixed: ${meter >= ref - 0.15 ? 'PASS' : 'BELOW (fixed tighter)'}`);

    if (process.argv.includes('--sanity')) {
      console.log(`\n(For the uniform-blueprint gate (1) run:`);
      console.log(` node solver/lbr-stud.js --game ${gameId} --hands 600 --sanity)`);
    }
  })();
}
