// ── grade7-blueprint — gate the grade against the REAL razz3 blueprint profile ─
// The gate (grade7-gate.js) uses synthetic profiles. This confirms the SAME
// exact agreement when the two opponents are held at the actual razz3 blueprint
// (solver/strategies/razz3.json) — i.e. the profile that ships. The blueprint is
// just another sigma object keyed by game.infosetKey; both the resolver and the
// brute force read it identically, so resolver-vs-brute must still match to
// machine epsilon, AND we get a REAL certified EV-loss + per-seat error bar.
//
// Run: node solver/multiway/grade7-blueprint.js [path-to-razz3.json]

const fs = require('fs');
const { grade7th, perSeatBR, gradeLabel } = require('./grade7');
const { bruteHeroEV, bruteBR } = require('./grade7-brute');

function loadProfile(p) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return j.strategy || j.nodes || j.avg || j;
}

// A realistic 3-way 7th-street spot. Hero (seat 0) has a made 7-low; the two
// opponents have support-restricted ranges consistent with their boards. All
// cards distinct.
function realSpot() {
  return {
    spec: {
      cap: 2, antes: 8,
      up: [
        ['2c', '4d', '5h', '7s'],   // seat0 board: strong low draw board
        ['3c', '6d', '8h', '9s'],   // seat1 board: middling
        ['Ac', 'Td', 'Jh', 'Qs'],   // seat2 board: paint-heavy (weak)
      ],
      // hero's actual river hole is the first holding in its range
      down: [['Ah', '3d', '6h'], ['2h', '4h', '7c'], ['Kc', 'Kd', 'Kh']],
      contrib: [8, 8, 8], deadPot: 5, folded: [false, false, false],
    },
    ranges: [
      // seat0: a few made lows behind a 2-4-5-7 board
      [ { down: ['Ah', '3d', '6h'], w: 1 }, { down: ['8c', 'Td', 'Qh'], w: 1 }, { down: ['3h', '6c', '9d'], w: 1 } ],
      // seat1: consistent with 3-6-8-9 board
      [ { down: ['2h', '4h', '7c'], w: 1 }, { down: ['Ad', '5c', 'Ts'], w: 1 }, { down: ['Jc', 'Qd', 'Ks'], w: 1 } ],
      // seat2: mostly weak behind A-T-J-Q board, one sneaky low
      [ { down: ['Kc', 'Kd', 'Kh'], w: 1 }, { down: ['2d', '5d', '8d'], w: 1 } ],
    ],
  };
}

function run(profilePath) {
  const P = profilePath || 'solver/strategies/razz3.json';
  let profile;
  try { profile = loadProfile(P); }
  catch (e) { console.log(`(blueprint not loadable at ${P}: ${e.message}) — skipping real-profile gate`); return; }

  const S = realSpot();
  const hero = 0;
  const t0 = Date.now();
  const res = grade7th(S.spec, S.ranges, profile, { hero });
  const tRes = Date.now() - t0;
  const brute = bruteHeroEV(S.spec, S.ranges, profile, hero);
  const resBR = perSeatBR(S.spec, S.ranges, profile);
  const bruteBRr = bruteBR(S.spec, S.ranges, profile);

  let worst = 0;
  for (const a of res.actions) worst = Math.max(worst, Math.abs(res.actionEV[a] - brute.actEV[a]));
  worst = Math.max(worst, Math.abs(res.onPolicyEV - brute.onPol));
  for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(resBR[i].exploit - bruteBRr[i].exploit));

  console.log(`\n=== REAL BLUEPRINT PROFILE spot (hero ${hero}), triples=${res.tripleCount} ===`);
  console.log(`profile: ${P} (${Object.keys(profile).length} infosets)`);
  console.log('per-action EXACT EV (opponents held at blueprint):');
  for (const a of res.actions) {
    console.log(`  ${res.actionLabel[a].padEnd(14)} EV=${res.actionEV[a].toFixed(6)}  EV-loss=${res.evLoss[a].toFixed(6)}   (brute ${brute.actEV[a].toFixed(6)})`);
  }
  console.log(`best action: ${res.actionLabel[res.bestAction]}  (bestEV=${res.bestEV.toFixed(6)}); on-profile baseline EV=${res.onPolicyEV.toFixed(6)}`);
  console.log('per-seat exact BR gap (error bar on the profile):');
  for (let i = 0; i < 3; i++) console.log(`  seat${i}: exploit=${resBR[i].exploit.toFixed(6)} chips  (brute ${bruteBRr[i].exploit.toFixed(6)})`);
  console.log(`resolver time: ${tRes}ms`);
  console.log(`worst resolver-vs-brute |Δ|: ${worst.toExponential(4)}  → ${worst <= 1e-6 ? 'MATCH ✅' : 'MISMATCH ❌'}`);
  console.log(`label: "${gradeLabel('ev-loss')}"  (GTO impossible)`);
  return { worst, pass: worst <= 1e-6, res, resBR };
}

module.exports = { run, realSpot };
if (require.main === module) run(process.argv[2]);
