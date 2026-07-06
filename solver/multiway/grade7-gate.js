// ── grade7-gate — EXACT GATE for the 3-seat 7th-street grade ────────────────
// On SMALL instances (tiny support-restricted ranges), the resolver's per-action
// EV + per-seat BR must match a from-scratch BRUTE-FORCE enumeration of the
// 3-way game to <= 1e-6. Reports the worst deviation. Also exercises the honest
// framing (gradeLabel bans "GTO").
//
// Run: node solver/multiway/grade7-gate.js

const { grade7th, perSeatBR, gradeLabel, cardsToStr } = require('./grade7');
const { bruteHeroEV, bruteBR } = require('./grade7-brute');
const { cardFromStr } = require('../engine/cards');

const C = s => cardFromStr(s); // sugar

// Build a few small 7th-street spots with support-restricted ranges. Cards are
// chosen so upboards + range downcards are all distinct (removal-consistent).
// Each seat's range is a handful of concrete 3-downcard holdings.

// A profile can be ANY sigma; for the gate we use a NON-TRIVIAL mixed profile
// so the betting tree actually branches (uniform would too, but we want a
// profile with skew to stress the reach weighting). We synthesize a sigma that
// mixes each infoset it is asked about — but since the resolver/brute both fall
// back to uniform on missing keys, the cleanest EXACT test is to leave sigma
// EMPTY (→ uniform everywhere). We ALSO test a hand-built skewed sigma.

function emptyProfile() { return {}; }

// A skewed profile: for every infoset the game asks about, bias toward the first
// listed action with prob 0.7 (rest uniform). We can't know keys a priori, so we
// build it lazily by walking — instead we just provide a Proxy-like object that
// the grader reads by key. But sigmaProbs indexes a plain object by key, so we
// precompute keys by enumerating the tree once with a probe. Simpler: use a
// profile object whose values we fill by scanning all infosets both paths touch.
function skewedProfile(spec, ranges) {
  // Enumerate all infosets reachable under uniform play over the joint support,
  // then assign a fixed skew. Both resolver and brute read the SAME object, so
  // whatever it contains is the identical held profile for both — the gate only
  // checks they AGREE given a fixed profile.
  const { build7thState, withDeal } = require('./grade7');
  const { cardFromStr: cf } = require('../engine/cards');
  const base = build7thState(spec);
  const game = base.game;
  const used = new Set(); for (let p = 0; p < 3; p++) for (const c of base.up[p]) used.add(c);
  const R = ranges.map(r => r.map(h => ({ down: h.down.map(c => (typeof c === 'string' ? cf(c) : c)), w: h.w })));
  const sigma = {};
  function visit(s) {
    if (game.isTerminal(s)) return;
    const acts = game.legalActions(s);
    const key = game.infosetKey(s);
    if (!sigma[key]) {
      const p = acts.map((_, i) => (i === 0 ? 0.7 : 0.3 / (acts.length - 1)));
      if (acts.length === 1) p[0] = 1;
      sigma[key] = { a: acts, p };
    }
    for (const a of acts) visit(game.applyAction(s, a));
  }
  for (const h0 of R[0]) { if (h0.down.some(c => used.has(c))) continue; const s0 = new Set(h0.down);
    for (const h1 of R[1]) { if (h1.down.some(c => used.has(c) || s0.has(c))) continue; const s1 = new Set(s0); for (const c of h1.down) s1.add(c);
      for (const h2 of R[2]) { if (h2.down.some(c => used.has(c) || s1.has(c))) continue;
        visit(withDeal(base, h0.down, h1.down, h2.down)); } } }
  return sigma;
}

// A BET-LEADER profile: at every infoset, bias hard toward the AGGRESSIVE action
// (bet 'b' when unbet, raise 'r' when facing, else call 'c'). This makes the
// FIRST actor BET, so a graded hero != 0 faces a bet at its real node — the exact
// condition that exposed BUG 1 (a positionally-mis-seated probe would instead
// walk the hero to a CHECK node and discover the WRONG action set). The resolver
// and brute read the SAME object, so the gate only checks they AGREE.
function betLeaderProfile(spec, ranges) {
  const { build7thState, withDeal } = require('./grade7');
  const { cardFromStr: cf } = require('../engine/cards');
  const base = build7thState(spec);
  const game = base.game;
  const used = new Set(); for (let p = 0; p < 3; p++) for (const c of base.up[p]) used.add(c);
  const R = ranges.map(r => r.map(h => ({ down: h.down.map(c => (typeof c === 'string' ? cf(c) : c)), w: h.w })));
  const sigma = {};
  function visit(s) {
    if (game.isTerminal(s)) return;
    const acts = game.legalActions(s);
    const key = game.infosetKey(s);
    if (!sigma[key]) {
      // aggressive preference order
      let bi = acts.indexOf('b'); if (bi < 0) bi = acts.indexOf('r'); if (bi < 0) bi = acts.indexOf('c'); if (bi < 0) bi = acts.indexOf('k'); if (bi < 0) bi = 0;
      const p = acts.map((_, i) => (i === bi ? 0.85 : 0.15 / (acts.length - 1 || 1)));
      if (acts.length === 1) p[0] = 1;
      sigma[key] = { a: acts, p };
    }
    for (const a of acts) visit(game.applyAction(s, a));
  }
  for (const h0 of R[0]) { if (h0.down.some(c => used.has(c))) continue; const s0 = new Set(h0.down);
    for (const h1 of R[1]) { if (h1.down.some(c => used.has(c) || s0.has(c))) continue; const s1 = new Set(s0); for (const c of h1.down) s1.add(c);
      for (const h2 of R[2]) { if (h2.down.some(c => used.has(c) || s1.has(c))) continue;
        visit(withDeal(base, h0.down, h1.down, h2.down)); } } }
  return sigma;
}

// ── test spots ───────────────────────────────────────────────────────────────
function spotA() {
  // 3-way fresh 7th street. Boards chosen with distinct low ranks so act order
  // is clear. Small ranges: 2-3 holdings per seat.
  return {
    spec: {
      cap: 2, antes: 8,
      up: [
        ['2c', '4d', '6h', '8s'],   // seat 0 board
        ['3c', '5d', '7h', '9s'],   // seat 1 board
        ['Ac', 'Td', 'Jh', 'Qs'],   // seat 2 board (worst / highest → likely last)
      ],
      down: [['Ah', '3d', '5h'], ['2h', '4h', '6c'], ['Kc', 'Kd', 'Kh']],
      contrib: [5, 5, 5], deadPot: 5, folded: [false, false, false],
    },
    ranges: [
      [ { down: ['Ah', '3d', '5h'], w: 1 }, { down: ['7c', '9d', 'Th'], w: 1 } ],       // seat0: a wheel-ish + a rougher low
      [ { down: ['2h', '4h', '6c'], w: 1 }, { down: ['8c', 'Tc', 'Ks'], w: 1 } ],       // seat1
      [ { down: ['Kc', 'Kd', 'Kh'], w: 1 }, { down: ['2d', '5c', '7d'], w: 1 } ],       // seat2: pure trash + a hidden low
    ],
  };
}

function spotB() {
  // Slightly larger: 3 holdings each (27 raw triples before removal).
  return {
    spec: {
      cap: 2, antes: 8,
      up: [
        ['2c', '4d', '6h', '8s'],
        ['3c', '5d', '7h', '9s'],
        ['Ac', 'Td', 'Jh', 'Qs'],
      ],
      down: [['Ah', '3h', '5s'], ['2h', '4h', '6c'], ['2d', '5c', '7d']],
      contrib: [5, 5, 5], deadPot: 5, folded: [false, false, false],
    },
    ranges: [
      [ { down: ['Ah', '3h', '5s'], w: 2 }, { down: ['7c', '9d', 'Th'], w: 1 }, { down: ['Ts', 'Js', 'Qh'], w: 1 } ],
      [ { down: ['2h', '4h', '6c'], w: 1 }, { down: ['8c', 'Tc', 'Ks'], w: 2 }, { down: ['Ad', '5h', '9c'], w: 1 } ],
      [ { down: ['Kc', 'Kd', 'Kh'], w: 1 }, { down: ['2d', '5c', '7d'], w: 2 }, { down: ['3d', '6d', '8d'], w: 1 } ],
    ],
  };
}

function spotC_2way() {
  // A 7th-street spot where one seat is already folded (fold-to-2-way subtree).
  return {
    spec: {
      cap: 2, antes: 8,
      up: [
        ['2c', '4d', '6h', '8s'],
        ['3c', '5d', '7h', '9s'],
        ['Ac', 'Td', 'Jh', 'Qs'],
      ],
      down: [['Ah', '3d', '5h'], ['2h', '4h', '6c'], ['Kc', 'Kd', 'Kh']],
      contrib: [5, 5, 3], deadPot: 5, folded: [false, false, true],
    },
    ranges: [
      [ { down: ['Ah', '3d', '5h'], w: 1 }, { down: ['7c', '9d', 'Th'], w: 1 } ],
      [ { down: ['2h', '4h', '6c'], w: 1 }, { down: ['8c', 'Tc', 'Ks'], w: 1 } ],
      [ { down: ['Kc', 'Kd', 'Kh'], w: 1 } ],  // folded seat: dummy holding (ignored)
    ],
  };
}

function maxAbsDiffActEV(res, brute) {
  let worst = 0, detail = [];
  // ACTION-SET MISMATCH is the BUG-1 signature: the resolver's discovered hero
  // action set differs from the brute's (e.g. resolver says ['k','b'] because a
  // mis-seated probe walked to a check node, while brute correctly says
  // ['f','c','r'] facing a bet). Treat it as a hard FAIL, not a crash on undefined.
  const resActs = res.actions.slice().sort().join(',');
  const bruteActs = brute.heroActs.slice().sort().join(',');
  if (resActs !== bruteActs) {
    return { worst: Infinity, detail: [['ACTION-SET-MISMATCH', resActs, bruteActs, Infinity]], dOn: Infinity, actionSetMismatch: true };
  }
  for (const a of res.actions) {
    const d = Math.abs(res.actionEV[a] - brute.actEV[a]);
    detail.push([a, res.actionEV[a], brute.actEV[a], d]);
    if (d > worst) worst = d;
  }
  const dOn = Math.abs(res.onPolicyEV - brute.onPol);
  if (dOn > worst) worst = dOn;
  return { worst, detail, dOn };
}
function maxAbsDiffBR(resBR, bruteBRr) {
  let worst = 0, detail = [];
  for (let i = 0; i < 3; i++) {
    const dOn = Math.abs(resBR[i].onPolicy - bruteBRr[i].onPolicy);
    const dBr = Math.abs(resBR[i].br - bruteBRr[i].br);
    const dEx = Math.abs(resBR[i].exploit - bruteBRr[i].exploit);
    detail.push([i, dOn, dBr, dEx]);
    worst = Math.max(worst, dOn, dBr, dEx);
  }
  return { worst, detail };
}

function pickProfile(kind, S) {
  if (kind === 'skew') return skewedProfile(S.spec, S.ranges);
  if (kind === 'betlead') return betLeaderProfile(S.spec, S.ranges);
  return emptyProfile();
}

function runSpot(name, S, hero, profileKind) {
  const profile = pickProfile(profileKind, S);
  const res = grade7th(S.spec, S.ranges, profile, { hero });
  const brute = bruteHeroEV(S.spec, S.ranges, profile, hero);
  const resBR = perSeatBR(S.spec, S.ranges, profile);
  const bruteBRr = bruteBR(S.spec, S.ranges, profile);
  const dEV = maxAbsDiffActEV(res, brute);
  const dBR = maxAbsDiffBR(resBR, bruteBRr);
  const worst = Math.max(dEV.worst, dBR.worst);
  // BUG-1 GUARD: for hero != 0 under a bet-leader profile, assert the hero's real
  // node is a FACING-A-BET decision (action set includes 'f'/'c'/'r'), i.e. the
  // first actor actually bet. This is the condition a positionally-mis-seated
  // probe would mis-discover as a check node ['k','b'].
  const facesBet = res.actions.includes('f') && res.actions.includes('c');
  return { name, hero, profileKind, res, brute, resBR, bruteBRr, dEV, dBR, worst, facesBet };
}

function run() {
  const spots = [
    ['spotA/uniform', spotA(), 0, 'uniform'],
    ['spotA/skew', spotA(), 0, 'skew'],
    ['spotA/uniform hero1', spotA(), 1, 'uniform'],
    ['spotB/uniform', spotB(), 0, 'uniform'],
    ['spotB/skew', spotB(), 0, 'skew'],
    ['spotB/skew hero2', spotB(), 2, 'skew'],
    ['spotC_2way/uniform', spotC_2way(), 0, 'uniform'],
    ['spotC_2way/skew', spotC_2way(), 1, 'skew'],
    // BUG-1 REGRESSION SPOTS: hero != 0 AND the first actor BETS (bet-leader
    // profile). These are the spots the old gate lacked — the ones that expose a
    // positionally-mis-seated action-set probe. All 3 heroes must match brute.
    ['spotA/betlead hero1', spotA(), 1, 'betlead'],
    ['spotA/betlead hero2', spotA(), 2, 'betlead'],
    ['spotB/betlead hero1', spotB(), 1, 'betlead'],
    ['spotB/betlead hero2', spotB(), 2, 'betlead'],
  ];
  let globalWorst = 0;
  const rows = [];
  let betLeadFacesBetCount = 0;   // # of hero!=0 bet-leader spots that truly faced a bet
  for (const [nm, S, hero, kind] of spots) {
    const r = runSpot(nm, S, hero, kind);
    globalWorst = Math.max(globalWorst, r.worst);
    rows.push(r);
    if (kind === 'betlead' && hero !== 0 && r.facesBet) betLeadFacesBetCount++;
    console.log(`\n=== ${nm} (hero ${hero}) triples=${r.res.tripleCount} ${kind === 'betlead' ? `facesBet=${r.facesBet} actions=${JSON.stringify(r.res.actions)}` : ''} ===`);
    console.log('  per-action EV (resolver vs brute):');
    if (r.dEV.actionSetMismatch) {
      const [, resActs, bruteActs] = r.dEV.detail[0];
      console.log(`    ❌ ACTION-SET MISMATCH (BUG-1 signature): resolver=[${resActs}]  brute=[${bruteActs}]`);
    } else {
      for (const [a, rv, bv, d] of r.dEV.detail) console.log(`    ${a}: ${rv.toFixed(9)}  vs  ${bv.toFixed(9)}   |Δ|=${d.toExponential(2)}`);
      console.log(`    onPolicy: Δ=${r.dEV.dOn.toExponential(2)}`);
    }
    console.log('  per-seat BR (resolver exploit vs brute exploit):');
    for (let i = 0; i < 3; i++) console.log(`    seat${i}: resolver exploit=${r.resBR[i].exploit.toFixed(9)}  brute=${r.bruteBRr[i].exploit.toFixed(9)}   |Δ|=${Math.abs(r.resBR[i].exploit - r.bruteBRr[i].exploit).toExponential(2)}`);
    console.log(`  worst |Δ| this spot: ${r.worst.toExponential(3)}`);
  }

  // honest framing check
  let banOk = false;
  try { gradeLabel('gto'); } catch (e) { banOk = true; }
  const label = gradeLabel('ev-loss');

  // BUG-1 REGRESSION ASSERTION: we must have exercised >=2 spots where hero != 0
  // AND the first actor bets (hero faces a bet at its real node) — the exact
  // condition the old gate missed — and all of them must still match to <=1e-6.
  const bug1Ok = betLeadFacesBetCount >= 2 && globalWorst <= 1e-6;

  console.log('\n──────────────────────────────────────────────────────────────');
  console.log(`GATE THRESHOLD: 1e-6`);
  console.log(`WORST DEVIATION across all spots (per-action EV + per-seat BR): ${globalWorst.toExponential(4)}`);
  console.log(`GATE ${globalWorst <= 1e-6 ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`BUG-1 GUARD: ${betLeadFacesBetCount} hero!=0 bet-leader spot(s) truly faced a bet (need >=2) → ${bug1Ok ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`HONEST FRAMING: label="${label}"; GTO-label-banned=${banOk ? 'YES ✅' : 'NO ❌'}`);
  console.log('──────────────────────────────────────────────────────────────');

  const pass = globalWorst <= 1e-6 && bug1Ok && banOk;
  // machine-readable tail
  console.log(JSON.stringify({ worstDeviation: globalWorst, threshold: 1e-6, pass, gtoBanned: banOk, label, bug1FacesBet: betLeadFacesBetCount, bug1Ok }));
  return { globalWorst, pass, banOk, label, bug1FacesBet: betLeadFacesBetCount, bug1Ok };
}

module.exports = { run, spotA, spotB, spotC_2way, skewedProfile, betLeaderProfile };

if (require.main === module) run();
