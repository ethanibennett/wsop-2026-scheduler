// ── grade7-brute — INDEPENDENT brute-force 3-way 7th-street enumerator ───────
// The ground-truth oracle for the gate. It shares NOTHING with grade7.js's
// resolver code path: it re-implements (a) the joint-support enumeration, (b)
// the whole-pot low showdown from bestLowRazz directly, and (c) a naive full
// game-tree recursion for both the hero's per-action EV and each seat's exact
// best response. If grade7.js and this agree to <=1e-6 on small instances, the
// resolver's range-form contraction is verified.
//
// It DOES reuse the razz3-game.js game OBJECT (legalActions/applyAction/utility
// /infosetKey) — that is deliberate: the game rules are the shared spec both the
// resolver and the brute force must honor. The GATE is on the AGGREGATION math
// (range-form reach propagation vs naive per-deal recursion), not on the rules.

const { makeGame, razzBoardValue } = require('./razz3-game');
const { cardFromStr } = require('../engine/cards');

function norm(c) { return typeof c === 'string' ? cardFromStr(c) : c; }

function buildBase(spec) {
  const game = makeGame({ cap: spec.cap != null ? spec.cap : 2, antes: spec.antes != null ? spec.antes : 8 });
  const up = spec.up.map(b => b.map(norm));
  const folded = spec.folded || [false, false, false];
  let first = -1, best = Infinity;
  for (let p = 0; p < 3; p++) { if (folded[p]) continue; const v = razzBoardValue(up[p]); if (v < best) { best = v; first = p; } }
  return { game, up, folded, first, contrib: spec.contrib.slice(), deadPot: spec.deadPot };
}

function stateFor(base, downs) {
  return {
    deck: [], down: [downs[0].slice(), downs[1].slice(), downs[2].slice()],
    up: [base.up[0].slice(), base.up[1].slice(), base.up[2].slice()],
    street: 4, phase: 'bet', toAct: base.first, bets: 0, base: base.contrib[base.first],
    contrib: base.contrib.slice(), acted: [false, false, false], folded: base.folded.slice(),
    bringIn: -1, lastAgg: -1, hist: '', curSeq: '', starter: base.first, deadPot: base.deadPot, log: [],
  };
}

// sigma lookup (independent copy)
function sig(sigma, game, s) {
  const acts = game.legalActions(s);
  const n = sigma[game.infosetKey(s)];
  if (!n || !n.a || n.a.length !== acts.length) return acts.map(() => 1 / acts.length);
  return n.p;
}

// all seats on sigma, but the FIRST time `hero` acts, force `forceA` (or, if
// forceA is null, hero plays sigma too). Naive full recursion; concrete deal.
function recVal(game, s, hero, sigma, forceA, forced) {
  if (game.isTerminal(s)) return game.utility(s)[hero];
  const p = game.currentPlayer(s);
  const acts = game.legalActions(s);
  if (p === hero && forceA != null && !forced.done) {
    forced.done = true;
    const a = acts.includes(forceA) ? forceA : acts[0];
    return recVal(game, game.applyAction(s, a), hero, sigma, forceA, forced);
  }
  const probs = sig(sigma, game, s);
  let ev = 0;
  for (let i = 0; i < acts.length; i++) { if (probs[i] <= 0) continue; ev += probs[i] * recVal(game, game.applyAction(s, acts[i]), hero, sigma, forceA, forced); }
  return ev;
}

// enumerate joint removal-consistent deals over three ranges
function* deals(base, ranges) {
  const used = new Set(); for (let p = 0; p < 3; p++) for (const c of base.up[p]) used.add(c);
  const R = ranges.map(r => r.map(h => ({ down: h.down.map(norm), w: h.w })));
  for (const h0 of R[0]) {
    if (h0.down.some(c => used.has(c))) continue;
    const s0 = new Set(h0.down);
    for (const h1 of R[1]) {
      if (h1.down.some(c => used.has(c) || s0.has(c))) continue;
      const s1 = new Set(s0); for (const c of h1.down) s1.add(c);
      for (const h2 of R[2]) {
        if (h2.down.some(c => used.has(c) || s1.has(c))) continue;
        const w = h0.w * h1.w * h2.w;
        if (w <= 0) continue;
        yield { downs: [h0.down, h1.down, h2.down], w };
      }
    }
  }
}

// Hero per-action EV by brute enumeration (opponents on sigma; hero forced at
// its first node). Also on-policy EV (hero on sigma). Marginalize hero's own
// range holdings by their weight; the hero holding is downs[hero].
function bruteHeroEV(spec, ranges, sigma, hero) {
  const base = buildBase(spec);
  const game = base.game;
  // discover hero action set by finding one deal that reaches a hero node
  let heroActs = null;
  for (const d of deals(base, ranges)) {
    let s = stateFor(base, d.downs), guard = 0;
    while (!game.isTerminal(s) && guard++ < 64) {
      if (game.currentPlayer(s) === hero) { heroActs = game.legalActions(s); break; }
      const probs = sig(sigma, game, s); let bi = 0; for (let i = 1; i < probs.length; i++) if (probs[i] > probs[bi]) bi = i;
      s = game.applyAction(s, game.legalActions(s)[bi]);
    }
    if (heroActs) break;
  }
  if (!heroActs) return null;
  const actEV = {}; for (const a of heroActs) actEV[a] = 0;
  let onPol = 0, mass = 0;
  for (const d of deals(base, ranges)) {
    mass += d.w;
    onPol += d.w * recVal(game, stateFor(base, d.downs), hero, sigma, null, { done: true });
    for (const a of heroActs) actEV[a] += d.w * recVal(game, stateFor(base, d.downs), hero, sigma, a, { done: false });
  }
  for (const a of heroActs) actEV[a] /= mass;
  onPol /= mass;
  return { heroActs, actEV, onPol, mass };
}

// Exact per-seat best response by INDEPENDENT reach-weighted two-pass over the
// enumerated deals. Mirrors the classic algorithm but written from scratch here.
function bruteBR(spec, ranges, sigma) {
  const base = buildBase(spec);
  const game = base.game;
  const D = [...deals(base, ranges)];
  let wsum = 0; for (const d of D) wsum += d.w;

  function heroValue(s, hero, brTable) {
    if (game.isTerminal(s)) return game.utility(s)[hero];
    const p = game.currentPlayer(s);
    const acts = game.legalActions(s);
    if (p === hero) {
      const choice = brTable[game.infosetKey(s)];
      if (choice != null && acts.includes(choice)) return heroValue(game.applyAction(s, choice), hero, brTable);
      let best = -Infinity;
      for (const a of acts) { const v = heroValue(game.applyAction(s, a), hero, brTable); if (v > best) best = v; }
      return best;
    }
    const probs = sig(sigma, game, s);
    let ev = 0; for (let i = 0; i < acts.length; i++) if (probs[i] > 0) ev += probs[i] * heroValue(game.applyAction(s, acts[i]), hero, brTable);
    return ev;
  }
  function sigmaValue(s, hero) {
    if (game.isTerminal(s)) return game.utility(s)[hero];
    const acts = game.legalActions(s); const probs = sig(sigma, game, s);
    let ev = 0; for (let i = 0; i < acts.length; i++) if (probs[i] > 0) ev += probs[i] * sigmaValue(game.applyAction(s, acts[i]), hero);
    return ev;
  }
  function accumulate(s, hero, brTable, reach, w, acc) {
    if (game.isTerminal(s)) return;
    const p = game.currentPlayer(s); const acts = game.legalActions(s);
    if (p === hero) {
      const key = game.infosetKey(s);
      if (!acc[key]) acc[key] = { acts, val: acts.map(() => 0) };
      for (let i = 0; i < acts.length; i++) acc[key].val[i] += w * reach * heroValue(game.applyAction(s, acts[i]), hero, brTable);
      const choice = brTable[key] && acts.includes(brTable[key]) ? brTable[key] : acts[0];
      return accumulate(game.applyAction(s, choice), hero, brTable, reach, w, acc);
    }
    const probs = sig(sigma, game, s);
    for (let i = 0; i < acts.length; i++) if (probs[i] > 0) accumulate(game.applyAction(s, acts[i]), hero, brTable, reach * probs[i], w, acc);
  }
  const out = [];
  for (let hero = 0; hero < 3; hero++) {
    let brTable = {};
    for (let sweep = 0; sweep < 8; sweep++) {
      const acc = {};
      for (const d of D) accumulate(stateFor(base, d.downs), hero, brTable, 1, d.w, acc);
      const next = {}; let changed = false;
      for (const key of Object.keys(acc)) {
        const a = acc[key]; let bi = 0, bv = -Infinity;
        for (let i = 0; i < a.acts.length; i++) if (a.val[i] > bv) { bv = a.val[i]; bi = i; }
        next[key] = a.acts[bi]; if (brTable[key] !== next[key]) changed = true;
      }
      brTable = next; if (!changed && sweep > 0) break;
    }
    let onPol = 0, br = 0;
    for (const d of D) { onPol += d.w * sigmaValue(stateFor(base, d.downs), hero); br += d.w * heroValue(stateFor(base, d.downs), hero, brTable); }
    out.push({ seat: hero, onPolicy: onPol / wsum, br: br / wsum, exploit: (br - onPol) / wsum });
  }
  return out;
}

module.exports = { bruteHeroEV, bruteBR, buildBase, stateFor, deals };
