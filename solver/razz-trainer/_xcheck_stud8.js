// ── TEST-ONLY abstraction-error cross-check harness for STUD 8 (NOT production) ──
//
// Stud-8 analog of _xcheck.js. Quantifies how much the blueprint's ABSTRACTION
// ERROR moves the trainer's 7th-street grade MAGNITUDES, by cross-checking the
// trainer's game-parameterized EV engine (grade.js with game=stud8) against the
// EXACT neural re-solver (resolve.py with game=STUD8 — hi/lo split showdown) on
// the SAME explicit opponent range.
//
// The hi/lo SPLIT is the new surface vs razz: in razz the showdown share is
// {0, 0.5, 1}; in Stud 8 it is {0, 0.25, 0.5, 0.75, 1} because the pot splits
// between the best high and the best 8-or-better low. So this harness focuses on
// spots that exercise quarters and split pots, and reports whether the trainer's
// chip math reproduces the exact split EVs.
//
// For each controlled 7th-street spot we compute the hero's per-action EV (chips)
// and GTO strategy THREE ways (identical decomposition to the razz harness):
//
//   (A)  EXACT neural solver  — _xcheck_stud8_solve.py (resolve.py _Resolver,
//        STUD8, 7th, node-locked to the opp range). Per-action hero EV under the
//        EXACT equilibrium continuation; aggregate GTO mix.
//
//   (B1) trainer EV engine, EQUILIBRIUM continuation — grade.js's exact rollout
//        over the SAME explicit opp range, with BOTH seats playing the NEURAL
//        equilibrium per-holding sigma as the post-action continuation. ISOLATES
//        the EV-engine rollout + hi/lo split math: under an identical
//        continuation (B1) must reproduce (A) to solver precision if the
//        trainer's chip/split math is correct.
//
//   (B2) trainer EV engine, BLUEPRINT continuation — the SAME exact rollout but
//        both seats play the trainer's stud8 blueprint sigma after the graded
//        action (what grade.js actually does). The (B2) vs (A) gap = EV-engine
//        error (≈0 from B1) PLUS the blueprint-vs-equilibrium continuation error
//        — the realistic grade magnitude.
//
// The opponent range is fed EXPLICITLY into the per-action EV rollout via this
// standalone harness — the production reach-weighting in grade.js is untouched.
// The trainer's hi/lo showdown lives in game.utility (stud8-game.js); the neural
// solver's lives in eval_stud8.split_share. (B1) vs (A) is the head-to-head check
// that those two split implementations agree at the chip level.
//
// Run: node solver/razz-trainer/_xcheck_stud8.js

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const game = require(path.join(ROOT, 'solver', 'games', 'stud8-game.js'));
const { cardFromStr, cardStr, makeDeck } = require(path.join(ROOT, 'solver', 'engine', 'cards.js'));
const { suitOf, rankOf } = require(path.join(ROOT, 'solver', 'engine', 'cards.js'));
const grade = require('./grade.js');
const play = require('./play.js');

const VENV = path.join(ROOT, 'solver', 'neural', '.venv', 'bin', 'python');
const SOLVE_PY = path.join(__dirname, '_xcheck_stud8_solve.py');

// ── controlled 7th-street STUD 8 spots ──────────────────────────────────────
// Hero = seat 0, chosen so the hero board is the HIGHER (better-high) Stud 8
// board -> seat 0 acts first at the 7th-street root (Stud 8: best showing board
// acts first from 4th street on, the OPPOSITE of razz). Pot = both seats' equal
// contributions at the start of 7th (contrib = [pot/2, pot/2]); no 7th-street
// betting has happened yet, so the root state matches the neural re-solver's
// 7th-street subgame root exactly. Boards + ranges are chosen to span the hi/lo
// split outcomes: scoops (share 1/0), high-only and low-only halves (0.5), and
// quarters (0.25/0.75) where a tie in one half splits a contested pot.
const SPOTS = [
  {
    name: 'hero KK (high) vs opp low board (hi/lo split surface)',
    up0: ['Kc', 'Ks', '9d', '4h'],    // hero board: pair of kings showing (high)
    me:  ['Qh', 'Jc', '2d'],          // hero: KK no qualifying low
    up1: ['2c', '5d', '7h', '8s'],    // opp board: four low cards (live low)
    opp_range: [['Ad', '3c', '6h'], ['Th', 'Jd', 'Qc'], ['3d', '6s', '9h']],
    pot: 20,
  },
  {
    name: 'hero 88+wheel-low vs broadway no-low (hero scoops low half)',
    up0: ['8s', '8d', '4h', '2c'],    // hero board: pair of 8s + low cards
    me:  ['Ah', '3c', '5d'],          // hero: 5-4-3-2-A wheel low + a pair
    up1: ['Kc', 'Qh', 'Jd', 'Ts'],    // opp board: broadway, no low possible
    opp_range: [['Kh', 'Qd', '9s'], ['Ks', '9h', '7c'], ['Ad', 'Kd', '9c']],
    pot: 24,
  },
  {
    name: 'hero trips (lock high, no low) vs opp made low (clean hi/lo split)',
    up0: ['9s', '9d', 'Kc', 'Qh'],    // hero board: pair of 9s showing (high)
    me:  ['9h', 'Js', 'Tc'],          // hero: trip 9s, no qualifying low
    up1: ['2s', '4d', '6c', '7h'],    // opp board: four low cards
    opp_range: [['Ad', '3c', '5h'], ['8d', 'Th', 'Jc'], ['Ah', '3d', '5s']],
    pot: 16,
  },
  {
    name: 'hero pair-T high vs opp mixed range (hi-only + opp low live)',
    up0: ['Ts', 'Td', 'Kc', '3h'],    // hero board: pair of tens (high)
    me:  ['Qh', 'Jc', '9d'],          // hero: pair tens, no low
    up1: ['2c', '5d', '8h', 'Ks'],    // opp board: low/high mixed
    opp_range: [['Ad', '4c', '6s'], ['Kh', 'Qd', '9h'], ['7c', '8d', 'Th']],
    pot: 20,
  },
  {
    name: 'hero 7-low+pair vs opp competing low (quarter pots, tightest split)',
    up0: ['7s', '7d', '5h', '2c'],    // hero board: pair of 7s + low cards
    me:  ['Ah', '3c', '4d'],          // hero: 5-4-3-2-A wheel low + pair 7s
    up1: ['8c', '6d', '3s', 'Ad'],    // opp board: four low + ace (live low)
    opp_range: [['2h', '4s', '5c'], ['Td', 'Jh', 'Qc'], ['2s', '9h', 'Kd']],
    pot: 24,
  },
];

// ── neural solve (subprocess) ────────────────────────────────────────────
function neuralSolve(spot) {
  const spec = {
    up0: spot.up0, up1: spot.up1, me: spot.me,
    opp_range: spot.opp_range.map(h => [h, 1.0]),
    pot: spot.pot, iters: 4000,
  };
  const tmp = path.join('/private/tmp', `xcheck_s8_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(tmp, JSON.stringify(spec));
  const out = cp.execFileSync(VENV, [SOLVE_PY, tmp], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  fs.unlinkSync(tmp);
  return JSON.parse(out);
}

// ── build the root-of-7th live state for the trainer engine ──────────────
// Hero (seat 0) acts first; both have contributed pot/2; no 7th-street betting.
// STUD 8 seat-order rules (stud8-game.js): the LOWEST upcard brings in (ace
// high; lower suit breaks an exact-rank tie); the BEST SHOWING board acts first
// from 4th street on. boardValue() is exported from stud8-game.js.
function rootState(spot) {
  const toI = c => cardFromStr(c);
  const down = [spot.me.map(toI), [/* opp hidden — set per rollout */]];
  const up = [spot.up0.map(toI), spot.up1.map(toI)];
  const half = spot.pot / 2;
  // bring-in seat is only used for the infoset key's 'b' flag; recompute it the
  // same way stud8-game.js's newHand does at 3rd street (lowest door upcard
  // brings in; lower suit breaks an exact-rank tie).
  const d0 = up[0][0], d1 = up[1][0];
  const r0 = rankOf(d0), r1 = rankOf(d1);
  const bringIn = (r0 < r1 || (r0 === r1 && suitOf(d0) < suitOf(d1))) ? 0 : 1;
  // first-to-act on 4th+ : best showing board (highest boardValue), seat 0 ties.
  const starter = game.boardValue(up[0]) >= game.boardValue(up[1]) ? 0 : 1;
  return {
    deck: [],                              // 7th: no cards left to deal
    down, up,
    street: 4, phase: 'bet', toAct: starter,
    bets: 0, base: half, contrib: [half, half],
    acted: [false, false], folded: null, bringIn,
    hist: '', curSeq: '', starter, log: [],
  };
}

// ── neural-equilibrium continuation policy ───────────────────────────────
function neuralPolicy(sol) {
  const holdKey = arr => arr.slice().sort((a, b) => a - b).join(',');
  const holdIndex = {};
  sol.holdings.forEach((h, i) => { holdIndex[holdKey(h.map(cardFromStr))] = i; });
  return function chooseProbs(st) {
    const acts = game.legalActions(st);
    if (acts.length === 1) return null; // forced
    const nd = sol.nodes[st.curSeq];
    const seat = st.toAct;
    const hk = holdKey(st.down[seat]);
    let row;
    if (nd && nd.actions.length === acts.length && holdIndex[hk] != null) {
      row = nd.sigma[holdIndex[hk]];
    }
    if (!row) row = acts.map(() => 1 / acts.length); // node/hand off-tree -> uniform
    return { acts, probs: row };
  };
}

// ── exact deterministic rollout under a per-hand continuation policy ──────
// On 7th street there are NO chance deals; we take the EXACT expectation over a
// probabilistic continuation by RECURSING over every action with prob>0 and
// weighting — no Monte-Carlo, no rng. This makes (B1) an exact expectation,
// directly comparable to (A). The terminal value uses game.utility (stud8's
// hi/lo split), so this is also the head-to-head check of the trainer's split
// math against the solver's eval_stud8.split_share.
function rolloutExpectation(st0, heroSeat, a, oppDown, policy) {
  const oppSeat = 1 - heroSeat;
  let st = grade.cloneState(st0);
  st.down[oppSeat] = oppDown.slice();
  st = game.applyAction(st, a);
  return expand(st, heroSeat, policy);
}

function expand(st, heroSeat, policy) {
  if (game.isTerminal(st)) return game.utility(st)[heroSeat];
  if (game.isChance(st)) throw new Error('unexpected chance node on 7th street');
  const acts = game.legalActions(st);
  if (acts.length === 1) return expand(game.applyAction(st, acts[0]), heroSeat, policy);
  const pol = policy(st);
  const probs = pol.probs;
  let ev = 0;
  for (let i = 0; i < acts.length; i++) {
    const p = probs[i];
    if (p <= 0) continue;
    ev += p * expand(game.applyAction(st, acts[i]), heroSeat, policy);
  }
  return ev;
}

// ── trainer per-action EV over the EXPLICIT opp range ─────────────────────
function trainerPerActionEV(spot, sol, policy) {
  const st0 = rootState(spot);
  const heroSeat = 0;
  const acts = game.legalActions(st0);
  // Collision guard — mirror grade.js's unseenForOpp: an opp hand cannot share a
  // card with the hero's cards or the board (the neural solver drops such (i,j)
  // pairs at the showdown). Filter so the explicit range matches what the solver
  // actually scores; weights renormalise over the surviving hands.
  const heroSeen = new Set([...st0.down[0], ...st0.up[0], ...st0.up[1]]);
  const oppHands = spot.opp_range
    .map(h => h.map(cardFromStr))
    .filter(h => h.every(c => !heroSeen.has(c)) && new Set(h).size === h.length);
  const w = oppHands.map(() => 1 / oppHands.length); // uniform explicit range
  const ev = {};
  for (const a of acts) {
    let acc = 0;
    for (let i = 0; i < oppHands.length; i++) {
      acc += w[i] * rolloutExpectation(st0, heroSeat, a, oppHands[i], policy);
    }
    ev[a] = acc;
  }
  return { acts, ev };
}

// blueprint-continuation policy: look up the trainer's blueprint sigma by the
// engine's real infosetKey (this is exactly what grade.js's rollout does).
function blueprintPolicy(strategyMap) {
  return function (st) {
    const acts = game.legalActions(st);
    const key = game.infosetKey(st);
    const node = strategyMap[key];
    if (node && node.a.length === acts.length && node.a.every((x, i) => x === acts[i])) {
      return { acts, probs: node.p.slice() };
    }
    return { acts, probs: acts.map(() => 1 / acts.length) };
  };
}

// ── GTO mix from the blueprint at the hero's root infoset (what grade reports) ─
function blueprintRootMix(spot, strategyMap) {
  const st0 = rootState(spot);
  const acts = game.legalActions(st0);
  const key = game.infosetKey(st0);
  const node = strategyMap[key];
  if (node && node.a.length === acts.length && node.a.every((x, i) => x === acts[i])) {
    return { acts, probs: node.p.slice(), trained: true };
  }
  return { acts, probs: acts.map(() => 1 / acts.length), trained: false };
}

function fmtEV(ev, acts) {
  return acts.map(a => `${a}=${ev[a].toFixed(3)}`).join('  ');
}
function evLoss(ev, acts) {
  let best = -Infinity;
  for (const a of acts) best = Math.max(best, ev[a]);
  const loss = {};
  for (const a of acts) loss[a] = best - ev[a];
  return loss;
}

function main() {
  const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'solver', 'strategies', 'stud8.json'), 'utf8'));
  const strategyMap = play.strategyMapOf(bp);

  // Validate spots are collision-free (the production grade path guarantees this
  // via unseenForOpp; a colliding spot would make A vs B a non-comparison).
  for (const spot of SPOTS) {
    const seen = new Set([...spot.up0, ...spot.up1, ...spot.me]);
    for (const h of spot.opp_range) {
      const hit = h.filter(c => seen.has(c));
      if (hit.length || new Set(h).size !== h.length) {
        throw new Error(`spot "${spot.name}": opp hand ${h.join('')} collides (${hit.join(',')}) — fix the spot`);
      }
    }
    // sanity: hero (seat 0) must act first at the 7th-street root (best board)
    const v0 = game.boardValue(spot.up0.map(cardFromStr));
    const v1 = game.boardValue(spot.up1.map(cardFromStr));
    if (!(v0 >= v1)) {
      throw new Error(`spot "${spot.name}": hero board does not act first (bv0=${v0} < bv1=${v1}) — swap boards`);
    }
  }

  const rows = [];
  for (const spot of SPOTS) {
    const sol = neuralSolve(spot);
    const acts = sol.root_actions;

    // (A) neural exact per-action EV (already under equilibrium continuation)
    const evA = {};
    for (const a of acts) evA[a] = sol.per_action_ev[a];

    // (B1) trainer engine, NEURAL equilibrium continuation
    const polEq = neuralPolicy(sol);
    const b1 = trainerPerActionEV(spot, sol, polEq);

    // (B2) trainer engine, BLUEPRINT continuation
    const polBp = blueprintPolicy(strategyMap);
    const b2 = trainerPerActionEV(spot, sol, polBp);

    // GTO mixes: neural aggregate root + blueprint root lookup
    const aggRoot = sol.agg[''];
    const bpMix = blueprintRootMix(spot, strategyMap);

    rows.push({ spot, sol, acts, evA, b1, b2, aggRoot, bpMix });
  }

  // ── report ──
  for (const r of rows) {
    const { spot, sol, acts, evA, b1, b2, aggRoot, bpMix } = r;
    console.log('\n' + '═'.repeat(78));
    console.log(`SPOT: ${spot.name}`);
    console.log(`  hero ${spot.me.join('')} up(${spot.up0.join(' ')})  vs  opp up(${spot.up1.join(' ')})`);
    console.log(`  opp explicit range: ${spot.opp_range.map(h => h.join('')).join(', ')}   pot ${spot.pot}`);
    console.log(`  neural equilibrium hero EV = ${sol.value.me.toFixed(4)} chips   exploitability ${sol.exploitability}`);
    console.log('');
    console.log('  PER-ACTION EV (chips), hero=seat0, opp on the SAME explicit range:');
    console.log(`    (A)  neural exact     :  ${fmtEV(evA, acts)}`);
    console.log(`    (B1) trainer, eq cont :  ${fmtEV(b1.ev, acts)}`);
    console.log(`    (B2) trainer, bp cont :  ${fmtEV(b2.ev, acts)}`);
    const dB1 = acts.map(a => Math.abs(b1.ev[a] - evA[a]));
    const dB2 = acts.map(a => Math.abs(b2.ev[a] - evA[a]));
    console.log(`    |B1 - A| per action   :  ${acts.map((a, i) => `${a}=${dB1[i].toFixed(4)}`).join('  ')}   max ${Math.max(...dB1).toFixed(4)}`);
    console.log(`    |B2 - A| per action   :  ${acts.map((a, i) => `${a}=${dB2[i].toFixed(4)}`).join('  ')}   max ${Math.max(...dB2).toFixed(4)}`);

    const lossA = evLoss(evA, acts), lossB1 = evLoss(b1.ev, acts), lossB2 = evLoss(b2.ev, acts);
    console.log('');
    console.log('  IMPLIED EV-LOSS per action (best - action):');
    console.log(`    (A)  : ${acts.map(a => `${a}=${lossA[a].toFixed(3)}`).join('  ')}`);
    console.log(`    (B1) : ${acts.map(a => `${a}=${lossB1[a].toFixed(3)}`).join('  ')}`);
    console.log(`    (B2) : ${acts.map(a => `${a}=${lossB2[a].toFixed(3)}`).join('  ')}`);

    console.log('');
    console.log('  GTO STRATEGY (hero root mix):');
    console.log(`    (A) neural aggregate  : ${aggRoot.actions.map((a, i) => `${a}=${(aggRoot.freq[i] * 100).toFixed(1)}%`).join('  ')}`);
    console.log(`    (B) blueprint lookup  : ${bpMix.acts.map((a, i) => `${a}=${(bpMix.probs[i] * 100).toFixed(1)}%`).join('  ')}${bpMix.trained ? '' : '  (UNTRAINED->uniform)'}`);
  }

  // ── summary verdict numbers ──
  console.log('\n' + '═'.repeat(78));
  console.log('SUMMARY (across all spots):');
  let maxB1 = 0, maxB2 = 0;
  let maxB1Loss = 0, maxB2Loss = 0;
  for (const r of rows) {
    const lossA = evLoss(r.evA, r.acts), lossB1 = evLoss(r.b1.ev, r.acts), lossB2 = evLoss(r.b2.ev, r.acts);
    for (const a of r.acts) {
      maxB1 = Math.max(maxB1, Math.abs(r.b1.ev[a] - r.evA[a]));
      maxB2 = Math.max(maxB2, Math.abs(r.b2.ev[a] - r.evA[a]));
      maxB1Loss = Math.max(maxB1Loss, Math.abs(lossB1[a] - lossA[a]));
      maxB2Loss = Math.max(maxB2Loss, Math.abs(lossB2[a] - lossA[a]));
    }
  }
  console.log(`  max |B1 - A|  per-action EV   (EV-engine + hi/lo split isolated)   : ${maxB1.toFixed(4)} chips`);
  console.log(`  max |B1 - A|  EV-LOSS                                              : ${maxB1Loss.toFixed(4)} chips`);
  console.log(`  max |B2 - A|  per-action EV   (full grade path, blueprint cont.)   : ${maxB2.toFixed(4)} chips`);
  console.log(`  max |B2 - A|  EV-LOSS                                              : ${maxB2Loss.toFixed(4)} chips`);
}

main();
