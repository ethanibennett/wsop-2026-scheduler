// ── grade7 — 3-SEAT EXACT FINAL-STREET (7th razz) GRADE ─────────────────────
// The multiway analogue of the HU exact 7th-street oracle. 7th street in razz3
// has NO chance left (all 7 cards are dealt), so the whole grade is EXACT in
// range form: no Monte-Carlo, no sampling, no equilibrium assumption.
//
// WHAT IT COMPUTES. Given a 7th-street spot —
//   * three public upboards (4 upcards each) + entering pot/dead-money,
//   * each seat's RANGE = a set of hidden 3-downcard holdings with reach
//     weights (support-restricted for tractability; the 3-way showdown is
//     O(H^3) in the per-seat holding count),
//   * a STATED PROFILE for the two opponents (the razz3 blueprint sigma, or any
//     supplied per-infoset mixed strategy),
// — it returns the HERO's EXACT per-action EV at the root, holding the two
// opponents at the profile, marginalized over the removal-consistent joint
// opponent support. The graded action's EV-LOSS is (best action EV − chosen).
//
// WHY THIS IS THE HONEST GRADE (NOT "vs GTO"). 3-player razz is GENERAL-SUM;
// there is no equilibrium / GTO to grade against (ROADMAP.md M9). The number we
// certify is EV-LOSS-VS-STATED-PROFILE: exactly how many chips the hero's action
// concedes *against those specific opponents*. To bound how good the profile
// itself is, we attach each seat's EXACT best-response gap (its exploitability
// vs the profile) as a published error bar (reuse of the br3/measure3 exact-BR
// two-pass, over this subgame's enumerated deals). The "GTO" label is therefore
// impossible to emit here (gradeLabel() below hard-codes the certified-EV-loss
// framing and throws if asked for "gto").
//
// TRACTABILITY. Everything is enumerated over the joint support S0×S1×S2 of the
// three ranges (card-removal-consistent triples). Betting mechanics are the REAL
// razz3-game.js game object (same legalActions/applyAction/utility/infosetKey/
// act-order as the trained blueprint) — we do NOT re-implement the rules. Cost
// is dominated by the |S0|·|S1|·|S2| showdown enumeration; see the tractability
// probe in the CLI (`node grade7.js --tract`).

const { makeGame, SMALL, BIG } = require('./razz3-game');
const { bestLowRazz } = require('../eval/razz');
const { cardFromStr, cardStr } = require('../engine/cards');
const { exactExploit } = require('./measure3');

// ── helpers ────────────────────────────────────────────────────────────────
function parseCards(str) {
  // "Ah2c3d" -> [card ids]. Accepts spaces.
  const clean = str.replace(/\s+/g, '');
  const out = [];
  for (let i = 0; i < clean.length; i += 2) out.push(cardFromStr(clean.slice(i, i + 2)));
  return out;
}
function cardsToStr(cards) { return cards.map(cardStr).join(''); }

// A "holding" for a seat on 7th street is its 3 hidden downcards. The upboard
// (4 cards) is public. Full 7-card hand = down.concat(up).

// ── build a concrete 7th-street state from a spec ───────────────────────────
// spec = {
//   cap, antes,                       // game params (default 2 / 8)
//   up: [ [c,c,c,c], [..], [..] ],    // 4 public upcards per seat (card ids or strings)
//   down: [ [c,c,c], [..], [..] ],    // the ACTUAL 3 downcards per seat (used only to
//                                     //   place a concrete deal into the state object; the
//                                     //   resolver overrides these per range holding)
//   contrib: [n,n,n],                 // chips each seat has put in ENTERING 7th
//   deadPot,                          // owner-less overlay already in the pot
//   folded: [b,b,b],                  // usually [false,false,false] for a 3-way 7th spot
// }
// The betting-round bookkeeping (starter/toAct/acted/bets) is initialized the
// SAME way razz3-game.sampleChance does when it deals 7th street: lowest live
// board acts first.
function build7thState(spec) {
  const game = makeGame({ cap: spec.cap != null ? spec.cap : 2, antes: spec.antes != null ? spec.antes : 8 });
  const up = spec.up.map(b => b.map(c => (typeof c === 'string' ? cardFromStr(c) : c)));
  const down = spec.down.map(b => b.map(c => (typeof c === 'string' ? cardFromStr(c) : c)));
  const folded = spec.folded || [false, false, false];
  // Determine first actor exactly as the game does on a dealt street: lowest
  // (best) razz board among live seats, lower index breaks ties.
  const { razzBoardValue } = require('./razz3-game');
  let first = -1, best = Infinity;
  for (let p = 0; p < 3; p++) {
    if (folded[p]) continue;
    const v = razzBoardValue(up[p]);
    if (v < best) { best = v; first = p; }
  }
  const contrib = spec.contrib.slice();
  const s = {
    deck: [],                    // no chance left on 7th
    down: [down[0].slice(), down[1].slice(), down[2].slice()],
    up: [up[0].slice(), up[1].slice(), up[2].slice()],
    street: 4,
    phase: 'bet',
    toAct: first,
    bets: 0,
    base: contrib[first],
    contrib,
    acted: [false, false, false],
    folded: folded.slice(),
    bringIn: -1,                 // no bring-in on 7th
    lastAgg: -1,
    hist: '',
    curSeq: '',
    starter: first,
    deadPot: spec.deadPot,
    log: [],
  };
  return { game, state: s, up, down, folded };
}

// ── the stated profile ──────────────────────────────────────────────────────
// A profile is sigma: infosetKey -> { a:[acts], p:[probs] }. sigmaProbs falls
// back to uniform over legal actions on a missing/misaligned key (the same
// contract measure3/br3 use). This is what holds the two opponents fixed.
function sigmaProbs(sigma, game, state) {
  const key = game.infosetKey(state);
  const acts = game.legalActions(state);
  const node = sigma[key];
  if (!node || !node.a || node.a.length !== acts.length) {
    const u = 1 / acts.length; return acts.map(() => u);
  }
  return node.p;
}

// ── set a concrete deal into the state (override the hidden downcards) ───────
function withDeal(base, h0, h1, h2) {
  const s = base.state;
  const ns = {
    deck: [], down: [h0.slice(), h1.slice(), h2.slice()],
    up: [s.up[0].slice(), s.up[1].slice(), s.up[2].slice()],
    street: 4, phase: 'bet', toAct: s.toAct, bets: 0, base: s.base,
    contrib: s.contrib.slice(), acted: s.acted.slice(), folded: s.folded.slice(),
    bringIn: -1, lastAgg: -1, hist: '', curSeq: '', starter: s.starter,
    deadPot: s.deadPot, log: [],
  };
  return ns;
}

// ── exact sigma-value of a fully-dealt 7th-street state ─────────────────────
// All hidden cards are concrete here, so this walks the deal-free betting tree
// with the two opponents on sigma and the hero also on sigma (used for the
// on-policy leg); for the per-action grade we branch the hero's root action
// then fall to sigma below. Returns hero's exact chips. `heroPolicy` optionally
// forces the hero's action at the FIRST hero node (the graded root action).
function dealtValue(game, state, hero, sigma, rootAction, seenHero) {
  if (game.isTerminal(state)) return game.utility(state)[hero];
  const p = game.currentPlayer(state);
  const acts = game.legalActions(state);
  if (p === hero && rootAction != null && !seenHero.v) {
    seenHero.v = true;
    const a = acts.includes(rootAction) ? rootAction : acts[0];
    return dealtValue(game, game.applyAction(state, a), hero, sigma, rootAction, seenHero);
  }
  // everyone (including hero after its root action) plays sigma
  const probs = sigmaProbs(sigma, game, state);
  let ev = 0;
  for (let i = 0; i < acts.length; i++) {
    if (probs[i] <= 0) continue;
    ev += probs[i] * dealtValue(game, game.applyAction(state, acts[i]), hero, sigma, rootAction, seenHero);
  }
  return ev;
}

// ── the GRADE PRIMITIVE ─────────────────────────────────────────────────────
// grade7th(spec, ranges, profile, opts) → per-action EXACT EV for the hero,
// holding the two opponents at `profile`. This is the multiway analogue of
// root_action_ev.
//
//   ranges = [R0, R1, R2] where each Ri = [{ down:[c,c,c], w:reachWeight }, ...]
//            (support-restricted). ranges[opts.hero] is the hero's range.
//   profile = sigma for the OTHER TWO seats (and used as the hero's baseline
//             continuation below the graded root action).
//   opts.hero (default 0), opts.heroHolding (optional: grade a single concrete
//             hero holding instead of the whole hero range).
//
// For each hero root action a, EV(a) = Σ_h reach_h · Σ_{o1,o2 removal-ok}
//   reach_o1·reach_o2 · dealtValue(hero forced to a at root, opps on sigma).
// Normalized by total reach mass so EV is in chips.
function grade7th(spec, ranges, profile, opts = {}) {
  const hero = opts.hero != null ? opts.hero : 0;
  const base = build7thState(spec);
  const game = base.game;
  const seats = [0, 1, 2];
  const opps = seats.filter(s => s !== hero);

  // Card-removal set from the public boards (all upcards are dealt/visible).
  const publicUsed = new Set();
  for (let p = 0; p < 3; p++) for (const c of base.up[p]) publicUsed.add(c);

  // hero holdings to grade over (single holding or the whole hero range)
  let heroHoldings;
  if (opts.heroHolding) {
    const dh = opts.heroHolding.map(c => (typeof c === 'string' ? cardFromStr(c) : c));
    heroHoldings = [{ down: dh, w: 1 }];
  } else {
    heroHoldings = ranges[hero].map(h => ({ down: h.down.map(c => (typeof c === 'string' ? cardFromStr(c) : c)), w: h.w }));
  }
  const R = opps.map(o => ranges[o].map(h => ({ down: h.down.map(c => (typeof c === 'string' ? cardFromStr(c) : c)), w: h.w })));

  // legal root actions: determined by the FIRST-actor seat. If the hero is not
  // the first actor, we still grade the hero's action at ITS first decision
  // node — but for a clean grade we require the hero to be the root actor OR we
  // roll opponents-before-hero on sigma. Simplest exact contract: grade the
  // hero's action at the root of the subtree where it first acts; to keep the
  // per-action EV well-defined we evaluate over the FULL opponent support and
  // let sigma play any pre-hero opponent actions. We enumerate the hero's legal
  // actions at its first decision by probing one concrete deal (legal set is
  // deal-independent on a betting street).
  // Probe legal hero actions at hero's first turn:
  const probe = withDeal(base, heroHoldings[0].down, R[0][0].down, R[1][0].down);
  const heroActions = firstHeroActions(game, probe, hero, profile);

  // accumulate per-action EV
  const actEV = {}; for (const a of heroActions) actEV[a] = 0;
  let onPolicy = 0;    // hero on sigma at root too (the baseline EV)
  let massTot = 0;

  for (const hh of heroHoldings) {
    const heroSet = new Set(hh.down);
    for (const c of base.up[hero]) heroSet.add(c);
    for (const o0 of R[0]) {
      if (o0.down.some(c => heroSet.has(c) || publicUsedHas(publicUsed, c, base.up, opps[0]))) continue;
      const s0 = new Set(hh.down); for (const c of o0.down) s0.add(c);
      for (const o1 of R[1]) {
        // removal: hero downs, o0 downs, all upboards must be disjoint
        let bad = false;
        for (const c of o1.down) { if (s0.has(c) || heroSet.has(c)) { bad = true; break; } }
        if (bad) continue;
        // also opp downs must not collide with any public upcard
        if (collidesPublic(o0.down, publicUsed) || collidesPublic(o1.down, publicUsed) || collidesPublic(hh.down, publicUsed)) continue;
        const w = hh.w * o0.w * o1.w;
        if (w <= 0) continue;
        massTot += w;
        // place opp downs by seat index
        const downs = [null, null, null];
        downs[hero] = hh.down; downs[opps[0]] = o0.down; downs[opps[1]] = o1.down;
        const dealState = withDeal(base, downs[0], downs[1], downs[2]);
        // on-policy (hero on sigma)
        onPolicy += w * dealtValue(game, dealState, hero, profile, null, { v: true });
        // per hero root action
        for (const a of heroActions) {
          actEV[a] += w * dealtValue(game, withDeal(base, downs[0], downs[1], downs[2]), hero, profile, a, { v: false });
        }
      }
    }
  }
  if (massTot <= 0) throw new Error('grade7th: empty removal-consistent support (ranges collide with boards)');
  for (const a of heroActions) actEV[a] /= massTot;
  onPolicy /= massTot;

  // best action + per-action EV-loss
  let bestA = heroActions[0], bestV = -Infinity;
  for (const a of heroActions) if (actEV[a] > bestV) { bestV = actEV[a]; bestA = a; }
  const evLoss = {}; for (const a of heroActions) evLoss[a] = bestV - actEV[a];

  return {
    hero,
    actions: heroActions,
    actionEV: actEV,           // exact chips per action, opponents held at profile
    actionLabel: Object.fromEntries(heroActions.map(a => [a, game.actionLabel(a, probe)])),
    bestAction: bestA,
    bestEV: bestV,
    onPolicyEV: onPolicy,      // hero also on profile (the "play the profile" baseline)
    evLoss,                    // per-action certified EV-loss vs the stated profile
    supportSize: massTot,
    tripleCount: countTriples(heroHoldings, R, base.up, publicUsed, hero, opps),
  };
}

// Determine the hero's legal actions at ITS FIRST decision node in the subtree,
// with any pre-hero opponents playing sigma deterministically-enough to reach a
// hero node (we just walk sampling the sigma-argmax to find one). Legal action
// SETS are deal-independent given the history, so probing one path suffices for
// the root; for the common 3-way-fresh 7th street the first actor IS a fixed
// seat and if that's the hero the root actions are simply legalActions.
function firstHeroActions(game, state, hero, sigma) {
  // If hero is the immediate actor, return directly.
  let s = state, guard = 0;
  while (!game.isTerminal(s) && guard++ < 64) {
    if (game.currentPlayer(s) === hero) return game.legalActions(s);
    const acts = game.legalActions(s);
    const probs = sigmaProbs(sigma, game, s);
    // take argmax sigma action to advance to a hero node
    let bi = 0; for (let i = 1; i < probs.length; i++) if (probs[i] > probs[bi]) bi = i;
    s = game.applyAction(s, acts[bi]);
  }
  // hero never acts (e.g. folded to before hero) — no gradeable action
  return [];
}

function collidesPublic(downs, publicUsed) { for (const c of downs) if (publicUsed.has(c)) return true; return false; }
function publicUsedHas() { return false; } // handled by collidesPublic; kept for clarity

function countTriples(heroHoldings, R, up, publicUsed, hero, opps) {
  let n = 0;
  for (const hh of heroHoldings) {
    if (collidesPublic(hh.down, publicUsed)) continue;
    const hs = new Set(hh.down);
    for (const o0 of R[0]) {
      if (collidesPublic(o0.down, publicUsed) || o0.down.some(c => hs.has(c))) continue;
      const s0 = new Set(hs); for (const c of o0.down) s0.add(c);
      for (const o1 of R[1]) {
        if (collidesPublic(o1.down, publicUsed) || o1.down.some(c => s0.has(c))) continue;
        n++;
      }
    }
  }
  return n;
}

// ── the ERROR BAR: per-seat exact best-response gap vs the profile ──────────
// Reuse measure3.exactExploit over this 7th-street subgame. exactExploit needs
// game.enumerateDeals() → [{state, w}] over the joint removal-consistent support
// of the three ranges, and reads sigma via game.infosetKey. We wrap the built
// game to expose enumerateDeals for the given ranges and hand it the profile.
function perSeatBR(spec, ranges, profile) {
  const base = build7thState(spec);
  const game = base.game;
  const publicUsed = new Set();
  for (let p = 0; p < 3; p++) for (const c of base.up[p]) publicUsed.add(c);
  const norm = ranges.map(R => R.map(h => ({ down: h.down.map(c => (typeof c === 'string' ? cardFromStr(c) : c)), w: h.w })));
  function* enumerateDeals() {
    for (const h0 of norm[0]) {
      if (collidesPublic(h0.down, publicUsed)) continue;
      const s0 = new Set(h0.down);
      for (const h1 of norm[1]) {
        if (collidesPublic(h1.down, publicUsed)) continue;
        if (h1.down.some(c => s0.has(c))) continue;
        const s1 = new Set(s0); for (const c of h1.down) s1.add(c);
        for (const h2 of norm[2]) {
          if (collidesPublic(h2.down, publicUsed)) continue;
          if (h2.down.some(c => s1.has(c))) continue;
          const w = h0.w * h1.w * h2.w;
          if (w <= 0) continue;
          yield { state: withDeal(base, h0.down, h1.down, h2.down), w };
        }
      }
    }
  }
  game.enumerateDeals = enumerateDeals;
  const res = exactExploit(game, profile);   // [{seat,onPolicy,br,exploit}]
  return res;
}

// ── the HONEST LABEL (GTO is impossible) ────────────────────────────────────
function gradeLabel(kind) {
  if (kind && String(kind).toLowerCase().includes('gto')) {
    throw new Error('gradeLabel: "GTO" is not a valid multiway label — 3-player razz is general-sum, no equilibrium exists. Use "certified-EV-loss-vs-profile".');
  }
  return 'certified-EV-loss-vs-stated-profile';
}

module.exports = {
  build7thState, grade7th, perSeatBR, gradeLabel,
  sigmaProbs, withDeal, dealtValue, parseCards, cardsToStr, firstHeroActions,
};

// ── CLI ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--tract') {
    require('./grade7-tract').run();
  } else {
    console.log('grade7 — 3-seat exact 7th-street razz grade. Run the gate: node solver/multiway/grade7-gate.js');
  }
}
