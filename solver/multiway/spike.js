// ── 3-player multiway CFR feasibility spike — driver ───────────
// Answers the two make-or-break questions with EVIDENCE:
//   (a) Does 3-player external-sampling CFR CONVERGE on a reduced razz
//       game? -> train mccfr3 on micro-razz-3, show per-seat regret falls
//       and the average strategy stabilizes.
//   (b) Can we MEASURE it? -> exact per-seat best-response exploitability
//       against the other two seats fixed at the average (ground-truth
//       enumeration in br3.js), tracked across training.
// Plus: engine sanity on 3-player Kuhn, and the dead-money economic
// sanity check (dead antes -> looser continuation than a no-dead control).
//
// Run: node solver/multiway/spike.js

const { makeRng } = require('../engine/cards');
const { MCCFR3Trainer } = require('./mccfr3');
const kuhn3 = require('./kuhn3');
const { makeGame, UNIFORM_RANGE, TIGHT_RANGE } = require('./microrazz3');
const { exploitability } = require('./br3');

function fmt(x, d = 4) { return (x >= 0 ? ' ' : '') + x.toFixed(d); }

// L1 distance between two average-strategy maps over shared keys.
function stratDrift(prev, cur) {
  let tot = 0, n = 0;
  for (const key of Object.keys(cur)) {
    if (!prev[key]) continue;
    const a = prev[key].p, b = cur[key].p;
    if (a.length !== b.length) continue;
    let d = 0;
    for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
    tot += d; n++;
  }
  return n ? tot / n : NaN;
}

// ── (0) Engine sanity: 3-player Kuhn ──────────────────────────
function runKuhn3() {
  console.log('\n=== (0) ENGINE SANITY — 3-player Kuhn ===');
  const t = new MCCFR3Trainer(kuhn3);
  const rng = makeRng(12345);
  let prev = null;
  console.log('  iter     meanPosRegret   avgStratDrift');
  for (const stop of [2000, 10000, 30000, 80000]) {
    t.train(stop - t.iterations, rng);
    const avg = t.averageStrategy();
    const drift = prev ? stratDrift(prev, avg) : NaN;
    console.log('  ' + String(t.iterations).padStart(6) + '   ' +
      fmt(t.meanPositiveRegret(), 5).padStart(12) + '   ' +
      (isNaN(drift) ? '   —' : fmt(drift, 5)).padStart(12));
    prev = avg;
  }
  // zero-sum overall check on Kuhn: sum of on-policy EV over seats ~ 0.
  console.log('  -> regret should fall and drift shrink (engine converges to a low-regret profile).');
}

// ── (a)+(b) micro-razz-3 convergence + exact BR exploitability ─
function runMicroRazz(label, gameOpts) {
  console.log(`\n=== micro-razz-3 [${label}] cap=${gameOpts.cap ?? 2} dead=${gameOpts.dead ?? 6} ===`);
  const game = makeGame(gameOpts);
  const t = new MCCFR3Trainer(game);
  const rng = makeRng(999);
  let prev = null;
  console.log('   iter    meanPosReg  drift    exploit[s0,s1,s2]        totExploit  potFrac%');
  const pot = game.deadPot + 3; // rough scale for % (dead + 3 antes)
  const checkpoints = [3000, 10000, 30000, 80000, 150000];
  let lastExploit = null;
  for (const stop of checkpoints) {
    t.train(stop - t.iterations, rng);
    const avg = t.averageStrategy();
    const drift = prev ? stratDrift(prev, avg) : NaN;
    const ex = exploitability(game, avg);
    const tot = ex.reduce((a, e) => a + e.exploit, 0);
    lastExploit = ex;
    console.log('  ' + String(t.iterations).padStart(6) + '   ' +
      fmt(t.meanPositiveRegret(), 4).padStart(9) + '  ' +
      (isNaN(drift) ? '  —' : fmt(drift, 4)).padStart(7) + '   [' +
      ex.map(e => fmt(e.exploit, 3)).join(',') + ']   ' +
      fmt(tot, 3).padStart(7) + '   ' + fmt(100 * tot / pot, 2).padStart(6));
    prev = avg;
  }
  return { game, trainer: t, avg: prev, exploit: lastExploit };
}

// ── economic sanity: dead money -> wider VALUE betting ─────────
// Return seat-0's opening bet frequency BY RANK (r1..r8). The right
// economic read is not a single averaged number (that washes out under a
// uniform deal) but the SHAPE: a fat dead pot should widen the value-bet
// range (marginal made hands — the middling ranks — bet more, because
// there is more dead money to win uncontested / thin-value).
function openBetByRank(avg) {
  const out = [];
  for (let r = 1; r <= 8; r++) {
    const n = avg['P0:r' + r + ':'];
    if (!n) { out.push(NaN); continue; }
    const bi = n.a.indexOf('b');
    out.push(bi >= 0 ? n.p[bi] : 0);
  }
  return out;
}

function main() {
  runKuhn3();

  console.log('\n=== (a) CONVERGENCE + (b) EXACT-BR MEASURABILITY — micro-razz-3 ===');
  console.log('   uniform entering ranges, 6-ante dead pot, cap 2 (the spike GO target)');
  const withDead = runMicroRazz('uniform, dead=6', { cap: 2, dead: 6, ranges: [UNIFORM_RANGE, UNIFORM_RANGE, UNIFORM_RANGE] });

  console.log('\n=== ECONOMIC SANITY — dead money should WIDEN value-betting ===');
  const noDead = runMicroRazz('uniform, dead=0 (control)', { cap: 2, dead: 0, ranges: [UNIFORM_RANGE, UNIFORM_RANGE, UNIFORM_RANGE] });
  const bDead = openBetByRank(withDead.avg);
  const bNo = openBetByRank(noDead.avg);
  console.log('\n  seat-0 opening bet% by rank (1=nut low .. 8=worst):');
  console.log('   rank :  ' + [1,2,3,4,5,6,7,8].map(r => String(r).padStart(6)).join(''));
  console.log('   dead6:  ' + bDead.map(x => (100*x).toFixed(1).padStart(6)).join(''));
  console.log('   dead0:  ' + bNo.map(x => (100*x).toFixed(1).padStart(6)).join(''));
  // Widening test: sum bet% over the MARGINAL made hands (ranks 2..4) —
  // the thin-value region a dead pot should activate.
  const marginDead = bDead[1] + bDead[2] + bDead[3];
  const marginNo = bNo[1] + bNo[2] + bNo[3];
  console.log(`\n  marginal made-hand (r2-4) value-bet mass:  dead=6 -> ${(100*marginDead).toFixed(1)}%   dead=0 -> ${(100*marginNo).toFixed(1)}%`);
  console.log(`  -> EXPECT dead=6 > dead=0 (fat pot rewards thin value).  ${marginDead > marginNo ? 'PASS' : 'CHECK'}`);

  console.log('\n=== tight entering ranges (realism knob) ===');
  runMicroRazz('tight ranges, dead=6', { cap: 2, dead: 6, ranges: [TIGHT_RANGE, TIGHT_RANGE, TIGHT_RANGE] });

  console.log('\nDONE.');
}

if (require.main === module) main();
module.exports = { runMicroRazz, runKuhn3, stratDrift };
