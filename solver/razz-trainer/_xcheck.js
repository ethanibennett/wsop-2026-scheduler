// ── TEST-ONLY abstraction-error cross-check harness (NOT production) ──────
//
// Quantifies how much the blueprint's ABSTRACTION ERROR moves the trainer's
// 7th-street grade MAGNITUDES, by cross-checking the trainer's EV engine against
// the EXACT neural re-solver on the SAME explicit opponent range.
//
// For each controlled 7th-street spot (hero up+down, opp up, a small EXPLICIT
// opp down-card range, a pot) we compute the hero's per-action EV (chips) and
// GTO strategy THREE ways:
//
//   (A) EXACT neural solver  — _xcheck_solve.py (resolve.py _Resolver, razz, 7th,
//       node-locked to the opp range). Per-action hero EV under the EXACT
//       equilibrium continuation; aggregate GTO mix.
//
//   (B1) trainer EV engine, EQUILIBRIUM continuation — reuses grade.js's exact
//       rollout (rolloutAfterAction's structure) over the SAME explicit opp
//       range, but with both seats playing the NEURAL equilibrium per-holding
//       sigma as the post-action continuation. This ISOLATES the EV-engine
//       rollout math: under an identical continuation, (B1) must reproduce (A)
//       to solver precision if the trainer's chip math is correct.
//
//   (B2) trainer EV engine, BLUEPRINT continuation — the SAME exact rollout but
//       both seats play the trainer's blueprint sigma after the graded action
//       (what grade.js actually does). The (B2) vs (A) gap = EV-engine error
//       (≈0 from B1) PLUS the blueprint-vs-equilibrium continuation error. This
//       is the realistic grade magnitude.
//
// The opponent range is fed EXPLICITLY into the per-action EV rollout via this
// standalone harness — the production reach-weighting in grade.js is untouched.
//
// Run: node solver/razz-trainer/_xcheck.js   (solves all spots, prints a table)

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const game = require(path.join(ROOT, 'solver', 'games', 'razz-game.js'));
const { cardFromStr, cardStr, makeDeck } = require(path.join(ROOT, 'solver', 'engine', 'cards.js'));
const grade = require('./grade.js');
const play = require('./play.js');

const VENV = path.join(ROOT, 'solver', 'neural', '.venv', 'bin', 'python');
const SOLVE_PY = path.join(__dirname, '_xcheck_solve.py');

// ── controlled 7th-street spots ──────────────────────────────────────────
// Hero = seat 0, chosen so the hero board is the LOWER (better) razz board ->
// seat 0 acts first at the 7th-street root (matches the neural solver's
// first_actor). Pot = both seats' equal contributions at the start of 7th
// (contrib = [pot/2, pot/2]); no 7th-street betting has happened yet, so the
// root state matches the neural re-solver's 7th-street subgame root exactly.
const SPOTS = [
  {
    name: 'made 6-low vs broadway (opp drawing dead)',
    up0: ['2c', '3d', '4h', '5s'],     // hero board: 5-4-3-2 (low)
    up1: ['Kc', 'Qd', 'Jh', 'Ts'],     // opp board: broadway (no low)
    me:  ['Ah', '6c', '7d'],           // hero 6-4-3-2-A (a 6-low)
    opp_range: [['Kh', 'Qs', '9c'], ['Kh', 'Qs', '8c'], ['Kh', 'Js', '9h']],
    pot: 20,
  },
  {
    name: 'marginal 8-low vs live low board (close)',
    up0: ['2c', '4d', '6h', '8s'],     // hero board: 8-6-4-2
    up1: ['3c', '5d', '7h', '9s'],     // opp board: 9-7-5-3 (slightly worse top)
    me:  ['Ah', 'Tc', 'Jd'],           // hero best low = 8-6-4-2-A (an 8-low, T/J dead)
    opp_range: [['2h', '3d', '4c'], ['2h', '8h', 'Td'], ['Kc', 'Qh', '2s'], ['6c', '7d', '8d']],
    pot: 24,
  },
  {
    name: 'hero 7-low vs opp made low range (mixed strength)',
    up0: ['Ac', '2d', '3h', '7s'],     // hero board: 7-3-2-A
    up1: ['4c', '5d', '6h', '8s'],     // opp board: 8-6-5-4
    me:  ['Kh', 'Qc', '9d'],           // hero best low = 7-3-2-A + need 5th: 9? -> 9-7-3-2-A (a 9-low)
    opp_range: [['2h', '3c', '7d'], ['7h', '9c', 'Td'], ['Ah', '2s', '3d']],
    pot: 16,
  },
  {
    name: 'hero strong wheel-draw made vs paired opp range',
    up0: ['Ac', '3d', '4h', '5s'],     // hero board: 5-4-3-A
    up1: ['8c', '8d', '6h', '9s'],     // opp board: paired 8s (hurts) 9-8-8-6
    me:  ['2h', 'Tc', 'Jd'],           // hero = 5-4-3-2-A wheel!
    opp_range: [['7h', '2c', 'Kd'], ['8h', '7c', '2d'], ['Ah', '2s', '7d']],
    pot: 20,
  },
  {
    name: 'hero 7-low vs mixed opp range (tight EV, real mixing)',
    up0: ['Ac', '2d', '4h', '7s'],     // hero board 7-4-2-A (lower -> hero acts first)
    up1: ['2c', '5d', '6h', '8s'],     // opp board 8-6-5-2
    me:  ['Kh', 'Qc', '3d'],           // hero = 7-4-3-2-A (a 7-low)
    opp_range: [['3h', '4c', '7d'], ['Kd', 'Qh', '3s'], ['7h', '9c', 'Td']],
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
  const tmp = path.join('/private/tmp', `xcheck_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(tmp, JSON.stringify(spec));
  const out = cp.execFileSync(VENV, [SOLVE_PY, tmp], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  fs.unlinkSync(tmp);
  return JSON.parse(out);
}

// ── build the root-of-7th live state for the trainer engine ──────────────
// Hero (seat 0) acts first; both have contributed pot/2; no 7th-street betting.
function rootState(spot) {
  const toI = c => cardFromStr(c);
  const down = [spot.me.map(toI), [/* opp hidden — set per rollout */]];
  const up = [spot.up0.map(toI), spot.up1.map(toI)];
  const half = spot.pot / 2;
  // bring-in seat is only used for the infoset key's 'b' flag; recompute it the
  // same way the engine does at 3rd street (highest upcard brings in).
  const v0 = game.razzBoardValue([up[0][0]]);
  const v1 = game.razzBoardValue([up[1][0]]);
  let bringIn;
  if (v0 !== v1) bringIn = v0 > v1 ? 0 : 1;
  else bringIn = (up[0][0] % 4) > (up[1][0] % 4) ? 0 : 1;
  const starter = game.firstActor(up[0], up[1]);
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
// Build a lookup: (curSeq, actingSeatDownCards-sorted) -> sigma row, from the
// per-holding sigma dump. The acting seat's hidden hand identifies which row.
function neuralPolicy(sol) {
  // map a holding (array of int cards) -> index in sol.holdings
  const holdKey = arr => arr.slice().sort((a, b) => a - b).join(',');
  const holdIndex = {};
  sol.holdings.forEach((h, i) => { holdIndex[holdKey(h.map(cardFromStr))] = i; });
  // nodes keyed by curSeq -> { player, actions, sigma:[H][A] }
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
// Faithful re-implementation of grade.rolloutAfterAction's loop, but the σ
// continuation is supplied per acting hand (so we can plug in either the neural
// equilibrium per-holding sigma OR a fixed blueprint map). On 7th street there
// are NO chance deals, so given the opp hand the rollout is deterministic; we
// take the EXACT expectation over a probabilistic continuation by RECURSING over
// every action with prob>0 and weighting — no Monte-Carlo, no rng. This makes
// (B1) an exact expectation, directly comparable to (A).
function rolloutExpectation(st0, heroSeat, a, oppDown, policy) {
  const oppSeat = 1 - heroSeat;
  let st = grade.cloneState(st0);
  st.down[oppSeat] = oppDown.slice();
  st = game.applyAction(st, a);
  return expand(st, heroSeat, policy);
}

function expand(st, heroSeat, policy) {
  if (game.isTerminal(st)) return game.utility(st)[heroSeat];
  // 7th street: no chance nodes. Guard anyway.
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
// EXACT expectation: for each legal hero root action, average the rollout over
// the explicit opp range (weights), with the supplied continuation policy.
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
  const bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'solver', 'strategies', 'razz.json'), 'utf8'));
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
  const potMax = Math.max(...rows.map(r => r.spot.pot));
  for (const r of rows) {
    for (const a of r.acts) {
      maxB1 = Math.max(maxB1, Math.abs(r.b1.ev[a] - r.evA[a]));
      maxB2 = Math.max(maxB2, Math.abs(r.b2.ev[a] - r.evA[a]));
    }
  }
  console.log(`  max |B1 - A| (EV-engine isolated, equilibrium continuation): ${maxB1.toFixed(4)} chips`);
  console.log(`  max |B2 - A| (full grade path, blueprint continuation)     : ${maxB2.toFixed(4)} chips`);
}

main();
