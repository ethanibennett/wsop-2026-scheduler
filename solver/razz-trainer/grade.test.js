// ── Stud-trainer grading: convergence-INDEPENDENT correctness gates ─────
// Run:  node solver/razz-trainer/grade.test.js              (razz gates)
//   or: node solver/razz-trainer/grade.js --selftest        (razz gates)
//   or: node solver/razz-trainer/grade.js --selftest --game stud8  (stud8 gates)
//
// These gates validate the GRADING ENGINE's correctness independent of whether
// the blueprint has converged. They do NOT assume the blueprint is good — they
// assume only that (a) the engine's EV/utility math is internally consistent and
// (b) obviously-bad / obviously-good actions get large / ~zero evLoss.
//
// The gates are PARAMETERIZED by game (razz or stud8). Gates 1,2,4,5 (zero-sum,
// bounded, MC-convergence, CRN) are game-agnostic and just thread the game
// through. The two monotone gates (3, 3b) use game-specific adversarial 7th-
// street spots — for razz a made wheel (whole-pot low), for stud8 a made
// straight-flush that SCOOPS the opponent's whole range (hi/lo split). The
// hi/lo "drawing dead" gate asserts the blueprint-INDEPENDENT showdown fact
// (folding a dead hand BEATS calling it off into the lock) rather than the
// razz "fold ≈ best" form, because a σ-bluff-raise of a scary board can be a
// legitimate exploit of the opponent's σ-fold (surfaced as a note, not failed).

const fs = require('fs');
const path = require('path');
const { makeRng, cardFromStr, cardStr } = require('../engine/cards');
const grade = require('./grade');
const play = require('./play');

// max possible chip swing in HU fixed-limit stud: ante 1 + bring/complete + caps.
// Streets: 3rd/4th cap 4 small bets (4 chips) each, 5th/6th/7th cap 4 big (8) each.
function maxStackSwing() {
  return 1 + 4 * 4 * 2 + 4 * 8 * 3; // = 1 + 32 + 96 = 129 (pot/2 ceiling, very loose)
}

let results = [];
function gate(name, pass, detail) {
  results.push({ name, pass, detail });
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}\n       ${detail}`);
}

// ── per-game fixtures ──────────────────────────────────────────────────
// Each game supplies: the game module, its blueprint, and the two monotone
// 7th-street adversarial spots (scoop + drawing-dead), with assertions.
function fixtures(gameId) {
  const gameMod = require(`../games/${gameId}-game`);
  const bpPath = path.join(__dirname, '..', 'strategies', `${gameId}.json`);
  const blueprint = JSON.parse(fs.readFileSync(bpPath, 'utf8'));
  if (gameId === 'stud8') return { gameMod, blueprint, ...stud8Spots() };
  return { gameMod, blueprint, ...razzSpots() };
}

// Razz monotone spots (unchanged from the original razz gates).
function razzSpots() {
  // Hero (seat 0) holds the WHEEL (nut low): down 2h Ah, board 5s 4d 3c 6s,
  // river 7d. Best 5 = A-2-3-4-5 = wheel. Opp (seat 1) shows a busted high
  // board K Q J T 9 8 — a terrible razz hand. Hero's wheel is a LOCK.
  const cards = {
    down: [['2h', 'Ah'], ['Kc', 'Qd']],
    up: [['5s'], ['Js']],
    future: ['4d', 'Tc', '3c', '9d', '6s', '8h', '7d', '2c'],
  };
  return {
    // Gate 3: hero (seat 0) folds the nut on 7th -> big leak.
    scoop: {
      heroSeat: 0, cards,
      // opp brings in (highest board), hero completes, opp calls; then check
      // down to 7th; on 7th hero (lowest board) acts first, checks, opp bets,
      // hero faces it (graded fold).
      line: [
        { actor: 1, action: 'br' }, { actor: 0, action: 'r' }, { actor: 1, action: 'c' },
        { actor: 0, action: 'k' }, { actor: 1, action: 'k' },
        { actor: 0, action: 'k' }, { actor: 1, action: 'k' },
        { actor: 0, action: 'k' }, { actor: 1, action: 'k' },
        { actor: 0, action: 'k' }, { actor: 1, action: 'b' },
        { actor: 0, action: 'f' },
      ],
    },
    // Gate 3b: opp (seat 1, junk high board) calls off vs hero's lock on 7th.
    dead: {
      heroSeat: 1, cards,
      line: [
        { actor: 1, action: 'br' }, { actor: 0, action: 'r' }, { actor: 1, action: 'c' },
        { actor: 0, action: 'k' }, { actor: 1, action: 'k' },
        { actor: 0, action: 'k' }, { actor: 1, action: 'k' },
        { actor: 0, action: 'k' }, { actor: 1, action: 'k' },
        { actor: 0, action: 'b' }, { actor: 1, action: 'c' },
      ],
      // razz form: fold is ~best (the junk seat should fold; calling is a leak).
      deadAssert: (evF, evC, evB, gr) => ({
        pass: (evB - evF) < 0.25 && (evB - evC) > 1.0,
        detail: `EV[fold]=${evF.toFixed(2)} EV[call]=${evC.toFixed(2)} EV[best=${gr.bestAction}]=${evB.toFixed(2)}; ` +
          `evLoss(fold)=${(evB - evF).toFixed(3)} (~0 expected), evLoss(call)=${(evB - evC).toFixed(2)} (>1 expected)`,
        note: null,
      }),
    },
  };
}

// Stud 8 monotone spots (hi/lo split).
function stud8Spots() {
  // SCOOP spot (gate 3): hero (seat 0) makes the A-2-3-4-5 STRAIGHT FLUSH in
  // hearts (down Ah 2h; board 3h 4h 5h Kd; river 6c) — the nut hi AND the wheel
  // low. Opp (seat 1) shows a high, rainbow, disconnected board K Q J 9 — they
  // make a qualifying low ~never and a hand beating the straight flush ~never.
  // Verified by enumeration: hero scoops 10659/10660 of the opp's down-card
  // range. Folding this on 7th forfeits the whole pot -> a huge leak.
  const scoopCards = {
    down: [['Ah', '2h'], ['Tc', '8d']],
    up: [['3h'], ['Kc']],
    // deal order: p0_4th,p1_4th,p0_5th,p1_5th,p0_6th,p1_6th,p0_7th(down),p1_7th(down)
    future: ['4h', 'Qd', '5h', 'Js', 'Kd', '9c', '6c', '7s'],
  };
  // DRAWING-DEAD spot (gate 3b): seat 0 shows 3h 4h 5h 6h (four to a straight
  // flush) and completes A-2-3-4-5-6 — a readable monster. Opp (seat 1) holds
  // the K-high junk and is drawing dead (gets a share in 1/10660 of seat-0's
  // range). We grade seat 1 facing seat 0's 7th-street bet.
  const deadCards = {
    down: [['Ah', '2h'], ['Tc', '8d']],
    up: [['3h'], ['Kc']],
    future: ['4h', 'Qd', '5h', 'Js', '6h', '9c', '7c', '7s'],
  };
  return {
    scoop: {
      heroSeat: 0, cards: scoopCards,
      // bring-in is the lowest door = hero (3h) seat 0. Get to 7th cheaply; on
      // 4th+ the best-high board (opp) acts first, so on 7th opp bets and hero
      // (seat 0) faces it (graded fold).
      line: [
        { actor: 0, action: 'br' }, { actor: 1, action: 'c' }, { actor: 0, action: 'k' },
        { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
        { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
        { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
        { actor: 1, action: 'b' }, { actor: 0, action: 'f' },
      ],
    },
    dead: {
      heroSeat: 1, cards: deadCards,
      // 7th: opp (best-high board = seat 0) acts first... actually seat 1's
      // K-high vs seat 0's straight-flush board: seat 0 acts first on 7th.
      // seat 1 checks, seat 0 bets, seat 1 faces it (graded call).
      line: [
        { actor: 0, action: 'br' }, { actor: 1, action: 'c' }, { actor: 0, action: 'k' },
        { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
        { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
        { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
        { actor: 1, action: 'k' }, { actor: 0, action: 'b' }, { actor: 1, action: 'c' },
      ],
      // hi/lo form: the blueprint-INDEPENDENT showdown fact is that FOLDING the
      // dead hand BEATS CALLING it off into the lock (you call an extra bet to
      // lose a guaranteed showdown). raise CAN be +EV here (a σ-bluff exploiting
      // the opponent's σ-fold of a scary board) — that is a legitimate exploit,
      // not an engine bug, so we surface it as a note rather than asserting on it.
      deadAssert: (evF, evC, evB, gr) => ({
        pass: (evF - evC) > 0.25,
        detail: `EV[fold]=${evF.toFixed(2)} EV[call]=${evC.toFixed(2)} EV[best=${gr.bestAction}]=${evB.toFixed(2)}; ` +
          `fold beats call by ${(evF - evC).toFixed(2)} (calling the dead hand off is the leak)`,
        note: gr.perActionEV['r'] != null && gr.perActionEV['r'] > evF
          ? `note: EV[raise]=${gr.perActionEV['r'].toFixed(2)} > EV[fold] — a σ-bluff exploiting the opponent's σ-fold of the straight-flush board (legitimate exploit, not asserted)`
          : null,
      }),
    },
  };
}

// ── Gate 1: ZERO-SUM consistency ───────────────────────────────────────
function gateZeroSum(F) {
  const { gameMod, blueprint } = F;
  const rng = makeRng(12345);
  let maxAbsErr = 0, checked = 0;
  for (let h = 0; h < 40; h++) {
    const rec = play.dealHand(blueprint, { rng, heroSeat: 0, game: gameMod });
    for (const d of rec.decisions) {
      const snap = d.state;
      const oppSeat = 1 - d.actor;
      const oppDown = snap.down[oppSeat];
      const pool = grade.unseenForOpp(snap, d.actor).concat(oppDown);
      const u = grade.rolloutAfterAction(gameMod, blueprint.strategy, snap, d.actor,
        d.acts[0], oppDown, shuffle(pool, rng), makeRng(777 + h));
      const err = Math.abs(u[0] + u[1]);
      if (err > maxAbsErr) maxAbsErr = err;
      checked++;
    }
  }
  gate('zero-sum (u0 == -u1 at every rolled terminal)', maxAbsErr < 1e-9,
    `checked ${checked} rollouts; max |u0+u1| = ${maxAbsErr.toExponential(2)}`);
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// ── Gate 2: BOUNDED ───────────────────────────────────────────────────
function gateBounded(F) {
  const { gameMod, blueprint } = F;
  const bound = maxStackSwing();
  const rng = makeRng(999);
  let worst = 0, checked = 0, viol = 0;
  for (let h = 0; h < 25; h++) {
    const rec = play.dealHand(blueprint, { rng, heroSeat: h % 2, game: gameMod });
    const g = grade.gradeHand(rec, blueprint, { samples: 300, seed: 1000 + h, game: gameMod });
    for (const gr of g.grades) {
      for (const a of gr.gtoMix.actions) {
        const ev = gr.perActionEV[a];
        if (Math.abs(ev) > Math.abs(worst)) worst = ev;
        if (Math.abs(ev) > bound) viol++;
        checked++;
      }
    }
  }
  gate('bounded (|perActionEV| <= max stack swing)', viol === 0,
    `bound=±${bound}; checked ${checked} action-EVs; worst |EV|=${Math.abs(worst).toFixed(2)}; violations=${viol}`);
}

// ── Gate 3: MONOTONE SANITY (scoop/nut fold is a big leak) ──────────────
function gateMonotone(F) {
  const { gameMod, blueprint, scoop } = F;
  const rec = play.buildHandRecord(scoop.cards, scoop.line, { heroSeat: scoop.heroSeat, blueprint, game: gameMod });
  const heroNodes = rec.decisions.filter(d => d.isHero);
  const node = heroNodes[heroNodes.length - 1];
  const okNode = node && node.street === 4 && node.acts.includes('f') && node.acts.includes('c');

  const g = grade.gradeHand(rec, blueprint, { samples: 400, seed: 42, exactRangeBudget: 200000, game: gameMod });
  const gr = g.grades[g.grades.length - 1];
  const evFold = gr.perActionEV['f'];
  const evCall = gr.perActionEV['c'];
  const evBest = Math.max(...gr.gtoMix.actions.map(a => gr.perActionEV[a]));
  const evLossFold = evBest - evFold;

  const foldIsTerrible = evLossFold > 2.0;
  const foldIsWorst = evFold <= evCall + 1e-9 && evFold <= evBest + 1e-9;
  const bestIsValue = gr.bestAction === 'c' || gr.bestAction === 'r';
  const callBeatsFold = evCall - evFold > 2.0;

  const label = gameMod.id === 'stud8'
    ? 'monotone: folding a hand that SCOOPS the opp range on 7th is a big leak'
    : 'monotone: folding the nut on 7th is a big leak';
  gate(label,
    okNode && foldIsTerrible && foldIsWorst && bestIsValue && callBeatsFold,
    `7th node, forward=${gr.forwardMode}, range=${gr.rangeMode} (${gr.rangeCombos} combos); ` +
    `EV[fold]=${evFold.toFixed(2)} EV[call]=${evCall.toFixed(2)} EV[best=${gr.bestAction}]=${evBest.toFixed(2)}; ` +
    `evLoss(fold)=${evLossFold.toFixed(2)} (>2 expected); fold is worst & best is a value action`);
  return { gr, evFold, evCall, evBest };
}

// ── Gate 3b: drawing-dead hand — calling off is the leak ────────────────
function gateMonotoneWorst(F) {
  const { gameMod, blueprint, dead } = F;
  const rec = play.buildHandRecord(dead.cards, dead.line, { heroSeat: dead.heroSeat, blueprint, game: gameMod });
  const heroNodes = rec.decisions.filter(d => d.isHero);
  const node = heroNodes[heroNodes.length - 1];
  const okNode = node && node.street === 4 && node.acts.includes('f') && node.acts.includes('c');
  const g = grade.gradeHand(rec, blueprint, { samples: 400, seed: 43, exactRangeBudget: 200000, game: gameMod });
  const gr = g.grades[g.grades.length - 1];
  const evFold = gr.perActionEV['f'];
  const evCall = gr.perActionEV['c'];
  const evBest = Math.max(...gr.gtoMix.actions.map(a => gr.perActionEV[a]));
  const a = dead.deadAssert(evFold, evCall, evBest, gr);
  const label = gameMod.id === 'stud8'
    ? 'monotone: calling off a hand drawing DEAD on 7th is a leak (folding beats calling)'
    : 'monotone: calling off the worst hand vs a lock is a leak; folding is ~best';
  gate(label, okNode && a.pass, a.detail + (a.note ? `\n       ${a.note}` : ''));
}

// ── Gate 4: MC CONVERGENCE ─────────────────────────────────────────────
function gateMCConvergence(F) {
  const { gameMod, blueprint } = F;
  const rng = makeRng(2024);
  let chosen = null, rec = null;
  for (let h = 0; h < 200 && chosen == null; h++) {
    rec = play.dealHand(blueprint, { rng, heroSeat: h % 2, game: gameMod });
    for (let i = 0; i < rec.decisions.length; i++) {
      const d = rec.decisions[i];
      if (d.isHero && d.street <= 2 && d.acts.length >= 2) { chosen = i; break; }
    }
  }
  if (chosen == null) { gate('MC convergence', false, 'could not find an early-street hero node'); return; }

  const N = 800;
  const gN = grade.gradeHand(sliceTo(rec, chosen), blueprint, { samples: N, seed: 55, game: gameMod });
  const g2N = grade.gradeHand(sliceTo(rec, chosen), blueprint, { samples: 2 * N, seed: 55, game: gameMod });
  const eN = gN.grades[gN.grades.length - 1];
  const e2N = g2N.grades[g2N.grades.length - 1];
  const drift = Math.abs(eN.evLoss - e2N.evLoss);
  const se = Math.max(eN.evLossSE, e2N.evLossSE);
  const tol = 2 * se + 0.05;
  gate('MC convergence (doubling samples moves evLoss < ~2*stderr)',
    drift <= tol,
    `node street=${eN.street} forward=${eN.forwardMode}; evLoss@${N}=${eN.evLoss.toFixed(3)} (SE ${eN.evLossSE.toFixed(3)}), ` +
    `evLoss@${2 * N}=${e2N.evLoss.toFixed(3)} (SE ${e2N.evLossSE.toFixed(3)}); drift=${drift.toFixed(3)} <= tol=${tol.toFixed(3)}`);
  return { eN, e2N };
}

function sliceTo(rec, idx) {
  const r = Object.assign({}, rec);
  r.decisions = rec.decisions.slice(0, idx + 1).map((d, i) =>
    Object.assign({}, d, { isHero: i === idx }));
  return r;
}

// ── Gate 5: CRN VARIANCE REDUCTION ─────────────────────────────────────
function gateCRN(F) {
  const { gameMod, blueprint } = F;
  const rng = makeRng(31415);
  const N = 700;
  const byStreet = {};
  let nodes = 0;
  for (let h = 0; h < 800 && nodes < 40; h++) {
    const rec = play.dealHand(blueprint, { rng, heroSeat: h % 2, game: gameMod });
    for (let i = 0; i < rec.decisions.length && nodes < 40; i++) {
      const d = rec.decisions[i];
      if (!d.isHero || d.street >= 4 || d.acts.length < 2) continue;
      const sl = sliceTo(rec, i);
      const c = grade.gradeHand(sl, blueprint, { samples: N, seed: 77, crn: true, game: gameMod }).grades[0];
      const nc = grade.gradeHand(sl, blueprint, { samples: N, seed: 77, crn: false, game: gameMod }).grades[0];
      if (c.maxPairSE < 1e-9) continue;
      (byStreet[d.street] = byStreet[d.street] || []).push(nc.maxPairSE / c.maxPairSE);
      nodes++;
    }
  }
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const streetMeans = {};
  for (const s of Object.keys(byStreet)) streetMeans[s] = mean(byStreet[s]);
  const applies = [].concat(byStreet[1] || [], byStreet[2] || [], byStreet[3] || []);
  const appliesRatio = applies.length ? mean(applies) : 0;
  const allRatio = mean([].concat(...Object.values(byStreet)));
  const detail = Object.keys(byStreet).sort().map(s =>
    `st${s}:${streetMeans[s].toFixed(2)}x(n=${byStreet[s].length})`).join(' ');
  gate('CRN variance reduction (SE_noCRN / SE_CRN > 1, strongest on 4th–6th)',
    appliesRatio > 1.4,
    `${nodes} MC nodes, N=${N}; per-street mean diff-SE ratio: ${detail}; ` +
    `4th–6th pooled=${appliesRatio.toFixed(2)}x, all-streets=${allRatio.toFixed(2)}x`);
  return { appliesRatio, allRatio, streetMeans };
}

// ── DEAD CARDS: per-game equity-sanity fixture ─────────────────────────
// A 7th-street (deal-free, EXACT) spot where the hero faces a bet and the dead
// cards remove the OPPONENT's key low cards. Removing the opponent's outs makes
// the opponent's range worse, so the hero's EV(call) must MOVE UP vs the same
// spot with no dead cards. We assert the SIGN of the move (engine-independent of
// the blueprint), at an exact-forward node so there is zero MC noise.
function deadEquityFixture(gameId) {
  if (gameId === 'stud8') {
    // Hero (seat 0) holds a MEDIOCRE 8-low + junk high: down Ad Kc, board
    // 8s 4d 3d 2c, river 9c -> 8-4-3-2-A low, high-card high. Opp (seat 1) shows
    // an ACE-high board Ah 6h 7h 5c that is ALSO four-to-a-low — so it acts first
    // (best high) AND contests the low with its 1 hidden card. Hero's high-door
    // 8s brings in (lowest door); from 4th the ace-high board (opp) acts first,
    // so on 7th opp bets and hero faces it (graded call). DEAD = the opponent's
    // strongest LOW completers (low aces/deuces/treys in unused suits) -> the
    // opponent makes a better low / splits the low FAR less often, so hero takes
    // the low half more -> hero EV(call) rises.
    const cards = {
      down: [['Ad', 'Kc'], ['Th', '8h']],
      up: [['8s'], ['Ah']],
      // deal order: p0_4th,p1_4th,p0_5th,p1_5th,p0_6th,p1_6th,p0_7th,p1_7th
      future: ['4d', '6h', '3d', '7h', '2c', '5c', '9c', '7s'],
    };
    const line = [
      { actor: 0, action: 'br' }, { actor: 1, action: 'r' }, { actor: 0, action: 'c' },
      { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
      { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
      { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
      { actor: 1, action: 'b' }, { actor: 0, action: 'c' },
    ];
    // dead = strong low cards in suits not on the board (opponent's key low outs)
    const dead = ['Ac', 'As', '2d', '2s', '3c', '3s'];
    return { heroSeat: 0, cards, line, dead, gradeAction: 'c' };
  }
  // razz: hero (seat 0) makes a MEDIOCRE 7-low. down 2h Ah; board 7s 8s 4c Td;
  // river 3h -> cards A-2-3-4-7-8-T -> best5 = A-2-3-4-7 (a 7-low). Opp (seat 1)
  // shows a live low board 4d 6d 5d 9s and has 1 hidden card on 7th. Hero's high
  // door (7s) brings in; from 4th the lower board (opp) acts first, so on 7th opp
  // bets and hero faces it (graded call). DEAD = the opponent's best low
  // completers (A/2/3 in unused suits) so the opponent makes a better-than-7 low
  // far less often -> hero EV(call) rises.
  const cards = {
    down: [['2h', 'Ah'], ['Th', '8h']],
    up: [['7s'], ['4d']],
    future: ['8s', '6d', '4c', '5d', 'Td', '9s', '3h', 'Js'],
  };
  const line = [
    { actor: 0, action: 'br' }, { actor: 1, action: 'r' }, { actor: 0, action: 'c' },
    { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
    { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
    { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
    { actor: 1, action: 'b' }, { actor: 0, action: 'c' },
  ];
  const dead = ['Ac', 'As', '2c', '2s', '3c', '3s'];
  return { heroSeat: 0, cards, line, dead, gradeAction: 'c' };
}

// ── Gate: DEAD-CARD removal correctness ─────────────────────────────────
// With dead cards present, assert (a) the opponent range NEVER contains a dead
// card, and (b) no rolled future/showdown card is ever a dead card. We probe the
// engine internals: unseenForOpp must exclude the dead cards, and a battery of
// rollouts must never deal one.
function gateDeadRemoval(F) {
  const { gameMod, blueprint } = F;
  const rng = makeRng(20260630);
  let oppPoolChecks = 0, oppPoolViol = 0;
  let rollouts = 0, rollViol = 0, deadHandsSeen = 0;
  for (let h = 0; h < 60; h++) {
    const rec = play.dealHand(blueprint, { rng, heroSeat: h % 2, game: gameMod, dead: true });
    const dead = rec.deadCards;
    if (!dead || dead.length === 0) continue;
    deadHandsSeen++;
    const deadSet = new Set(dead);
    for (const d of rec.decisions) {
      const snap = d.state;
      // (a) opponent candidate universe excludes every dead card
      const pool = grade.unseenForOpp(snap, d.actor, dead);
      for (const c of pool) { oppPoolChecks++; if (deadSet.has(c)) oppPoolViol++; }
      // also assert dead cards are NOT any live card (hero/opp up or hero down)
      for (const c of dead) {
        if (snap.up[0].includes(c) || snap.up[1].includes(c) ||
            snap.down[d.actor].includes(c)) rollViol++;
      }
      // (b) roll the hand forward many times; no dealt card is ever dead. We use
      // the SAME pool (dead-free) the grader uses, so every future card off the
      // deck is in pool — assert the terminal's full card set is dead-free.
      const oppDown = snap.down[1 - d.actor];
      for (let t = 0; t < 4; t++) {
        const sp = shuffle(pool.concat(oppDown), rng);
        const term = rolloutTerminalCards(gameMod, blueprint.strategy, snap, d.actor,
          d.acts[0], oppDown, sp, makeRng(1000 + h * 13 + t));
        rollouts++;
        for (const c of term) if (deadSet.has(c)) { rollViol++; break; }
      }
    }
  }
  gate('dead-card removal (opp range + rolled cards never contain a dead card)',
    oppPoolViol === 0 && rollViol === 0 && deadHandsSeen > 0,
    `${deadHandsSeen} hands had dead cards; opp-pool: ${oppPoolChecks} cards checked, ${oppPoolViol} dead leaks; ` +
    `rollouts: ${rollouts} rolled to terminal, ${rollViol} dead-card appearances`);
}

// Roll a hand to terminal and return the FULL set of cards in play at showdown
// (both seats' down+up) — used to assert no dead card ever got dealt.
function rolloutTerminalCards(game, strategyMap, snap, heroSeat, a, oppDown, shuffledPool, rng) {
  const oppSeat = 1 - heroSeat;
  const deck = shuffledPool.filter(c => oppDown.indexOf(c) < 0);
  let st = grade.cloneState(snap);
  st.down[oppSeat] = oppDown.slice();
  st.deck = deck;
  st = game.applyAction(st, a);
  let guard = 0;
  while (!game.isTerminal(st)) {
    if (++guard > 200) break;
    if (game.isChance(st)) { st = game.sampleChance(st, rng); continue; }
    const acts = game.legalActions(st);
    if (acts.length === 1) { st = game.applyAction(st, acts[0]); continue; }
    st = game.applyAction(st, grade.sigmaAction(game, strategyMap, st, rng));
  }
  return [].concat(st.down[0], st.up[0], st.down[1], st.up[1]);
}

// ── Gate: DEAD-CARD equity sanity (removing opp outs moves hero EV up) ───
function gateDeadEquity(F) {
  const { gameMod, blueprint } = F;
  const fx = deadEquityFixture(gameMod.id);
  // baseline: no dead cards
  const recBase = play.buildHandRecord(fx.cards, fx.line, { heroSeat: fx.heroSeat, blueprint, game: gameMod });
  // dead: the opponent's key low completers are removed
  const recDead = play.buildHandRecord(fx.cards, fx.line, { heroSeat: fx.heroSeat, blueprint, game: gameMod, deadCards: fx.dead });
  const o = { samples: 400, seed: 9, exactRangeBudget: 200000, game: gameMod };
  const grBase = grade.gradeHand(recBase, blueprint, o).grades.slice(-1)[0];
  const grDead = grade.gradeHand(recDead, blueprint, o).grades.slice(-1)[0];
  const evBase = grBase.perActionEV[fx.gradeAction];
  const evDead = grDead.perActionEV[fx.gradeAction];
  const okNode = grBase.street === 4 && grBase.forwardMode === 'exact-forward';
  const moved = evDead - evBase;
  // removing the opponent's key LOW outs strictly improves the hero's showdown
  // equity, so EV(call) must rise (and the range must actually shrink).
  const shrank = grDead.rangeCombos < grBase.rangeCombos;
  gate('dead-card equity sanity (removing opp key outs moves hero EV up)',
    okNode && moved > 0.05 && shrank,
    `exact 7th node; opp combos ${grBase.rangeCombos} -> ${grDead.rangeCombos} (dead removes ${fx.dead.length} cards); ` +
    `EV[${fx.gradeAction}] no-dead=${evBase.toFixed(3)} -> dead=${evDead.toFixed(3)} (Δ=${moved >= 0 ? '+' : ''}${moved.toFixed(3)}, expected > 0)`);
}

// ── Gate: NO REGRESSION (deadCards=[] is byte-identical to no field) ─────
function gateDeadNoRegression(F) {
  const { gameMod, blueprint } = F;
  const rng1 = makeRng(424242);
  const rng2 = makeRng(424242);
  let maxDelta = 0, checked = 0;
  for (let h = 0; h < 20; h++) {
    // identical deal stream (dead OFF) -> records must match; grading either with
    // an absent deadCards field or an explicit [] must give byte-identical EVs.
    const recA = play.dealHand(blueprint, { rng: rng1, heroSeat: h % 2, game: gameMod });
    const recB = play.dealHand(blueprint, { rng: rng2, heroSeat: h % 2, game: gameMod });
    recB.deadCards = []; // explicit empty must equal the no-dead path
    const o = { samples: 300, seed: 100 + h, game: gameMod };
    const gA = grade.gradeHand(recA, blueprint, o).grades;
    const gB = grade.gradeHand(recB, blueprint, o).grades;
    if (gA.length !== gB.length) { maxDelta = Infinity; break; }
    for (let i = 0; i < gA.length; i++) {
      for (const a of gA[i].gtoMix.actions) {
        const dd = Math.abs(gA[i].perActionEV[a] - gB[i].perActionEV[a]);
        if (dd > maxDelta) maxDelta = dd;
        checked++;
      }
    }
  }
  gate('dead-card no-regression (deadCards=[] grades byte-identical to baseline)',
    maxDelta === 0,
    `compared ${checked} per-action EVs across 20 hands; max |Δ EV| = ${maxDelta === Infinity ? 'MISMATCH' : maxDelta.toExponential(2)}`);
}

// ── typical stderr report ──────────────────────────────────────────────
function reportTypicalStderr(F) {
  const { gameMod, blueprint } = F;
  const rng = makeRng(8675309);
  const seList = [];
  let mcCount = 0, exactCount = 0;
  const N = 1200;
  for (let h = 0; h < 30; h++) {
    const rec = play.dealHand(blueprint, { rng, heroSeat: h % 2, game: gameMod });
    const g = grade.gradeHand(rec, blueprint, { samples: N, seed: 3000 + h, game: gameMod });
    for (const gr of g.grades) {
      seList.push(gr.evLossSE);
      if (gr.forwardMode === 'exact-forward') exactCount++; else mcCount++;
    }
  }
  seList.sort((a, b) => a - b);
  const median = seList[Math.floor(seList.length / 2)] || 0;
  const mean = seList.reduce((a, b) => a + b, 0) / Math.max(1, seList.length);
  const p90 = seList[Math.floor(seList.length * 0.9)] || 0;
  console.log(`\n[stderr report] graded ${seList.length} hero decisions at N=${N} MC samples`);
  console.log(`       evLoss SE: median=${median.toFixed(3)} mean=${mean.toFixed(3)} p90=${p90.toFixed(3)} chips`);
  console.log(`       forward mode: ${exactCount} exact (7th) / ${mcCount} MC (earlier streets)`);
  return { median, mean, p90, exactCount, mcCount, N };
}

function run(gameId = 'razz') {
  results = [];
  const F = fixtures(gameId);
  console.log(`=== ${F.gameMod.name} grading engine — correctness gates ===\n`);
  gateZeroSum(F);
  gateBounded(F);
  const mono = gateMonotone(F);
  gateMonotoneWorst(F);
  gateMCConvergence(F);
  gateCRN(F);
  gateDeadRemoval(F);
  gateDeadEquity(F);
  gateDeadNoRegression(F);
  const se = reportTypicalStderr(F);
  const allPass = results.every(r => r.pass);
  console.log(`\n=== ${results.filter(r => r.pass).length}/${results.length} gates PASS (${F.gameMod.name}) ===`);
  console.log(`typical evLoss stderr (MC nodes): median ${se.median.toFixed(3)} chips at N=${se.N}`);
  if (!allPass) process.exitCode = 1;
  return { results, se, mono };
}

module.exports = { run };

if (require.main === module) {
  const gameArg = process.argv.find(a => a.startsWith('--game='));
  const gameId = gameArg ? gameArg.split('=')[1]
    : (process.argv.includes('--game') ? process.argv[process.argv.indexOf('--game') + 1] : 'razz');
  run(gameId);
}
