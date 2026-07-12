// ── Razz trainer: GRADING engine ───────────────────────────────────────
// gradeHand(handRecord, blueprint) -> per-hero-decision grades.
//
// For each node where the HERO acted we compute, RANGE-AWARE and
// CLAIRVOYANT-FREE:
//   - gtoMix     : the blueprint's mixed strategy at the hero's infoset
//                  (a direct lookup; uniform fallback if untrained).
//   - perActionEV: chips-EV of EACH legal action for the hero's ACTUAL hand,
//                  where the opponent is the DISTRIBUTION of hidden-hand combos
//                  consistent with the public state, weighted by the blueprint
//                  REACH (product of the opponent's σ action-probabilities along
//                  the observed betting line, using the opponent's bucket-infoset
//                  each street). The opponent's revealed cards are NEVER used to
//                  pick the action — that would be results-oriented/clairvoyant.
//                  After the graded action BOTH players follow σ; future chance
//                  cards are dealt from the remaining deck.
//   - evLoss     : max_a perActionEV[a] - perActionEV[heroChosen]  (>= 0).
//   - stderr     : standard error of evLoss (CRN-paired across actions).
//
// VARIANCE REDUCTION (common random numbers): every candidate action is
// evaluated against the SAME sampled opponent-hand particle set AND the SAME
// future-card rng stream (the rng is re-seeded per action). So the per-action
// EV *differences* — i.e. evLoss — are paired and low-variance.
//
// EXACT vs MC: when the reconstructed opponent range AND the forward tree are
// both small (typically 7th street, often 6th), we ENUMERATE the full opponent
// range and roll each combo deterministically (no card draws remain on 7th, so
// the rollout is noise-free). Otherwise we Monte-Carlo sample the range with CRN.

// The game module is a PARAMETER (threaded through every function that touches
// it), defaulting to razz so all existing callers are byte-identical. The two
// stud games (razz, stud8) share the same state shape, betting tree, deal
// schedule, street indices and method surface; only the showdown math differs,
// and that lives entirely behind game.utility/result/infosetKey. So the same
// reach-weighting / 7th-street decomposition / oppDownCount / deal-structure
// logic below is stud-GENERIC — it just reads the passed game.
const DEFAULT_GAME = require('../games/razz-game');
const { makeDeck, makeRng, cardStr, rankOf, suitOf, lowRankOf } = require('../engine/cards');
const { strategyMapOf } = require('./play');
// Shared, game-agnostic RANGE-SENSITIVE honesty flag (also used by the draw
// grader draw-trainer/grade.js — the two share the "re-solve vs an assumed
// opponent range" pattern).
const { computeRangeSensitivity } = require('./range-sensitivity');
const { bestLowRazz } = require('../eval/razz');
const { bestLo8, bestHi7 } = require('../eval/stud8');

// STUD ACTIVATION GATE (parent's deploy decision). The range-sensitive flag is
// COMPUTED + SURFACED for stud too (game-agnostic), but whether a flagged stud
// grade gets its charge ZEROED changes SHIPPED stud grading — so it is gated
// here on a one-line toggle. Defaults ON LOCALLY (env STUD_RANGE_FLAG=0 to force
// off). The draw path is unconditionally charge-zeroed (its ship prerequisite).
const STUD_RANGE_FLAG = process.env.STUD_RANGE_FLAG !== '0';

// ── blueprint lookup (canonical contract) ──────────────────────────────
function lookup(strategyMap, key, acts) {
  const node = strategyMap[key];
  if (node && node.a.length === acts.length && node.a.every((a, i) => a === acts[i])) {
    return { probs: node.p.slice(), trained: true };
  }
  return { probs: acts.map(() => 1 / acts.length), trained: false };
}

function sampleIndex(probs, rng) {
  let r = rng();
  for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r <= 0) return i; }
  return probs.length - 1;
}

// Clone a snapshot/live state into a fresh mutable engine state.
function cloneState(s) {
  return {
    deck: s.deck.slice(),
    down: [s.down[0].slice(), s.down[1].slice()],
    up: [s.up[0].slice(), s.up[1].slice()],
    street: s.street, phase: s.phase, toAct: s.toAct,
    bets: s.bets, base: s.base, contrib: s.contrib.slice(),
    acted: s.acted.slice(), folded: s.folded, bringIn: s.bringIn,
    hist: s.hist, curSeq: s.curSeq, starter: s.starter, log: [],
  };
}

// σ action sample at a live state, from seat `s.toAct`'s view.
function sigmaAction(game, strategyMap, st, rng) {
  const acts = game.legalActions(st);
  if (acts.length === 1) return acts[0];
  const key = game.infosetKey(st);
  const { probs } = lookup(strategyMap, key, acts);
  return acts[sampleIndex(probs, rng)];
}

// ── opponent-range reconstruction (reach-weighted) ─────────────────────
//
// At the graded node we know: the public board (both seats' UPcards through
// this street), the hero's full hand, and the full betting line so far. The
// opponent's hidden cards = their DOWN cards (2 on 3rd..6th street decisions; on
// a 7th-street decision the opponent also has a 3rd down card). We enumerate (or
// sample) every assignment of unseen cards to the opponent's down slots and
// weight each by the blueprint REACH: the product, over every PAST opponent
// decision node, of σ(opp's actual action | opp's bucket-infoset at that node).
//
// To compute that reach we REPLAY the betting line from a fresh 3rd-street
// state, with the opponent's down cards set to the candidate combo and the
// hero's down cards set to their real values, applying the recorded actions in
// order. At each opponent decision we multiply in σ(action). Hero decisions and
// chance deals are applied without weighting. The candidate's reach weight is
// that product (0 if any opponent action had σ-prob ~0, i.e. the line is
// inconsistent with the candidate under σ).

// Build the list of (actor, action) pairs that occurred BEFORE the graded node,
// plus the per-street upcards, by walking the handRecord's decision list and the
// terminal/intermediate snapshots. We reconstruct from decisions[] which carry a
// pre-action snapshot each.
function publicLineUpTo(handRecord, gradeIdx) {
  // returns the sequence of decisions [0..gradeIdx) — each has actor/chosen/street
  return handRecord.decisions.slice(0, gradeIdx);
}

// Reconstruct a fresh root state matching this hand's deal (bring-in, antes),
// with hero down cards real and opponent down cards = `oppDown`. Upcards are
// taken from the graded snapshot's per-street history — but since upcards only
// grow by deals we can seed the root with each seat's FIRST upcard and let the
// replayed deals add the rest. We instead reconstruct directly: we know every
// seat's upcards at the graded node, and deals are deterministic given the deck
// order, so we replay using a SYNTHETIC deck whose deal sequence reproduces the
// observed upcards (and the candidate opp down cards on 7th).

// Simpler + robust: we don't need to re-derive deals. We rebuild the root from
// the graded snapshot by stripping back to 3rd street is hard; instead we
// compute reach by re-simulating ONLY the decisions, reconstructing each
// decision's state from its stored snapshot but swapping the opponent's hidden
// cards. The stored snapshot already has the correct contrib/curSeq/upcards for
// THAT node, so σ(opp action) only needs the opponent's bucket — which depends on
// the opponent's own cards (down+up) visible at that node. We therefore rebuild,
// for each PAST opponent decision, that decision's state with the candidate
// opp-down cards substituted, and read σ(chosen).

// The opponent's down cards are the same across all their decisions in a hand
// (down cards are dealt 3rd & 7th; they never change mid-street). On streets
// 0..3 the opponent has exactly 2 down cards; on street 4 (7th) they have 3.
// For reach we only need their state at each PAST decision, which used however
// many down cards existed THEN. Candidate combos are full (street-appropriate)
// down-card assignments; for earlier-street decisions we use the prefix.

// Reach product for ONE fixed decomposition of the opponent's hidden cards:
// `holePair` (the 2 cards dealt 3rd, used at every decision on streets 0..3) and
// `full` (all down cards, used on 7th street where the face-down river is also in
// hand). Streets 0..3 key the opponent's bucket on the 2 hole cards; street 4 on
// the full triple.
function reachProductForDecomp(game, strategyMap, past, oppSeat, holePair, full) {
  let w = 1;
  for (const d of past) {
    if (d.actor !== oppSeat) continue;
    const st = cloneState(d.state);
    st.down[oppSeat] = d.street <= 3 ? holePair : full;
    const acts = game.legalActions(st);
    // chosen must be legal & match the recorded action's id position
    const idx = acts.indexOf(d.chosen);
    if (idx < 0) return 0; // candidate makes this node's action-set inconsistent
    const key = game.infosetKey(st);
    const { probs } = lookup(strategyMap, key, acts);
    w *= probs[idx];
    if (w === 0) return 0;
  }
  return w;
}

// Reach weight of a candidate opponent down-card combo, given the line.
// On 7th street the combo has 3 cards (2 hole dealt 3rd + 1 face-down river dealt
// 7th), but which card is the river is UNOBSERVED — and the opponent's bucket on
// streets 3rd–6th depends on which 2 were the hole pair. The three (hole-pair,
// river) decompositions are distinct opponent histories with the SAME showdown,
// so the posterior weight of the 3-card SET is the SUM of reach over its 3
// decompositions (the uniform deal prior over which card is the river is constant
// across sets and cancels in normalisation). Streets 3rd–6th (k=2) have an
// unambiguous hole pair and reduce to a single decomposition.
function reachWeight(game, strategyMap, handRecord, gradeIdx, oppSeat, oppDownFull) {
  const past = publicLineUpTo(handRecord, gradeIdx);
  if (oppDownFull.length <= 2) {
    return reachProductForDecomp(game, strategyMap, past, oppSeat, oppDownFull, oppDownFull);
  }
  let w = 0;
  for (let r = 0; r < oppDownFull.length; r++) {
    const holePair = oppDownFull.filter((_, i) => i !== r);
    w += reachProductForDecomp(game, strategyMap, past, oppSeat, holePair, oppDownFull);
  }
  return w;
}

// ── unseen universe for the opponent's hidden cards ────────────────────
// Everything not visible to the hero at the graded node: full deck minus hero's
// down+up, minus both seats' upcards, minus... the opponent's down cards are
// exactly what we're enumerating. Also exclude any cards already dealt as the
// opponent's later upcards (already in up[opp]).
function unseenForOpp(snap, heroSeat, deadCards) {
  const oppSeat = 1 - heroSeat;
  const seen = new Set();
  for (const c of snap.down[heroSeat]) seen.add(c);
  for (const c of snap.up[0]) seen.add(c);
  for (const c of snap.up[1]) seen.add(c);
  // opp down cards are hidden (to enumerate) — but any cards already in
  // snap.down[opp] are the REAL ones; we must NOT leak them into the pool,
  // and we must NOT use them as the "truth" for grading. They stay hidden.
  for (const c of snap.down[oppSeat]) seen.add(c); // exclude real opp hidden cards from the candidate pool
  // DEAD CARDS: folded opponents' exposed door cards. The hero SEES them, so
  // they are not part of the opponent's hidden range NOR of any future deal.
  // Excluding them here conditions BOTH the opponent range (this pool is the
  // candidate universe) AND the rollout deck (the rollout deck is built from
  // this pool) on the dead cards — true card removal. [] => unchanged.
  if (deadCards) for (const c of deadCards) seen.add(c);
  const pool = [];
  for (const c of makeDeck()) if (!seen.has(c)) pool.push(c);
  return pool;
}

// How many down cards does the opponent hold at the graded node?
function oppDownCount(snap) {
  return snap.street <= 3 ? 2 : 3;
}

// Enumerate all combos of `k` distinct cards from pool (k in {2,3}); returns
// array of arrays. Cheap for k<=3 over ~40-card pools at 6th/7th.
function* combos(pool, k, start, pre) {
  if (pre.length === k) { yield pre.slice(); return; }
  for (let i = start; i <= pool.length - (k - pre.length); i++) {
    pre.push(pool[i]); yield* combos(pool, k, i + 1, pre); pre.pop();
  }
}

// ── per-action EV rollout ──────────────────────────────────────────────
// Roll one hand to terminal from `st0` (the live graded state) after applying
// hero action `a`, with the opponent holding `oppDown` and a private deck =
// remaining unseen cards (excluding oppDown), in `shuffledPool` order. Both
// seats play σ after the graded action; chance deals come off the deck.
function rolloutAfterAction(game, strategyMap, st0, heroSeat, a, oppDown, shuffledPool, rng) {
  const oppSeat = 1 - heroSeat;
  // private deck: shuffledPool minus oppDown (oppDown is small)
  const deck = [];
  for (let i = 0; i < shuffledPool.length; i++) {
    if (oppDown.indexOf(shuffledPool[i]) < 0) deck.push(shuffledPool[i]);
  }
  let st = cloneState(st0);
  st.down[oppSeat] = oppDown.slice();
  st.deck = deck;
  // apply the graded action
  st = game.applyAction(st, a);

  let guard = 0;
  while (!game.isTerminal(st)) {
    if (++guard > 200) break;
    if (game.isChance(st)) { st = game.sampleChance(st, rng); continue; }
    const acts = game.legalActions(st);
    if (acts.length === 1) { st = game.applyAction(st, acts[0]); continue; }
    const act = sigmaAction(game, strategyMap, st, rng);
    st = game.applyAction(st, act);
  }
  return game.utility(st); // [u0,u1]; caller takes [heroSeat]
}

// Is the forward tree past this node deal-free? (7th-street decisions: no more
// cards are dealt, so the continuation is a finite BETTING tree — we take the
// exact σ-expectation over it rather than sampling.)
function dealFreeForward(snap) {
  return snap.street === 4; // 7th street: only betting remains
}

// Exact σ-expected hero utility of a deal-free continuation. No cards remain, so
// the betting subtree is finite: take the EXACT expectation over every betting
// decision (both seats play the blueprint σ) instead of SAMPLING it. Deterministic
// → a 7th-street "exact-forward" grade is genuinely seed-independent (real SE=0).
// (Previously the exact path sampled this via rolloutAfterAction and only LOOKED
// exact, so the grade silently carried opponent-betting Monte-Carlo noise.)
function exactForwardValue(game, strategyMap, st, heroSeat) {
  if (game.isTerminal(st)) return game.utility(st)[heroSeat];
  if (game.isChance(st)) {
    // Deal-free invariant: 7th continuations have no chance. If one ever appears,
    // advance it DETERMINISTICALLY (fixed rng) so the value stays seed-independent.
    return exactForwardValue(game, strategyMap, game.sampleChance(st, makeRng(0x7)), heroSeat);
  }
  const acts = game.legalActions(st);
  if (acts.length === 1) return exactForwardValue(game, strategyMap, game.applyAction(st, acts[0]), heroSeat);
  const { probs } = lookup(strategyMap, game.infosetKey(st), acts);
  let v = 0, wsum = 0;
  for (let i = 0; i < acts.length; i++) {
    const p = probs[i];
    if (!(p > 0)) continue;
    v += p * exactForwardValue(game, strategyMap, game.applyAction(st, acts[i]), heroSeat);
    wsum += p;
  }
  return wsum > 0 ? v / wsum : game.utility(st)[heroSeat];
}

// Exact σ-expected hero utility after the hero takes `a` vs a specific opp hand
// (deal-free / 7th street). The deterministic analogue of rolloutAfterAction.
function exactValueAfterAction(game, strategyMap, st0, heroSeat, a, oppDown) {
  const oppSeat = 1 - heroSeat;
  let st = cloneState(st0);
  st.down[oppSeat] = oppDown.slice();
  st = game.applyAction(st, a);
  return exactForwardValue(game, strategyMap, st, heroSeat);
}

// ── grade a single hero decision ───────────────────────────────────────
function gradeDecision(strategyMap, handRecord, gradeIdx, opts) {
  const game = opts.game || DEFAULT_GAME;
  const d = handRecord.decisions[gradeIdx];
  const snap = d.state;
  const heroSeat = d.actor;
  const oppSeat = 1 - heroSeat;
  const acts = d.acts;

  // 1. GTO mix (direct lookup).
  const look = lookup(strategyMap, d.key, acts);
  const gtoMix = { actions: acts.slice(), probs: look.probs.slice(), trained: look.trained };

  // 2. Reconstruct the reach-weighted opponent range. The dead cards (folded
  // opponents' exposed door cards, read from the hand record) are removed from
  // the candidate universe — so the opponent can never hold one, and since the
  // rollout deck is built from this same pool, no future/showdown card is dead.
  const k = oppDownCount(snap);
  const deadCards = handRecord.deadCards || [];
  const pool = unseenForOpp(snap, heroSeat, deadCards);
  // candidate combos: enumerate (exact) when small enough, else sample.
  const exactRangeBudget = opts.exactRangeBudget == null ? 4000 : opts.exactRangeBudget;
  // count combos = C(|pool|, k)
  const nPool = pool.length;
  const nCombos = k === 2 ? (nPool * (nPool - 1)) / 2 : (nPool * (nPool - 1) * (nPool - 2)) / 6;

  let candidates = []; // { hand:[...], w }
  let rangeMode;
  if (nCombos <= exactRangeBudget) {
    rangeMode = 'exact-range';
    for (const combo of combos(pool, k, 0, [])) {
      const w = reachWeight(game, strategyMap, handRecord, gradeIdx, oppSeat, combo);
      if (w > 0) candidates.push({ hand: combo, w });
    }
  } else {
    rangeMode = 'sampled-range';
    // sample combos uniformly from the pool, weight by reach; we'll combine
    // sampling weight (uniform) with reach weight — uniform proposal so the
    // reach weight IS the importance weight.
    const rng = makeRng(opts.rangeSeed >>> 0);
    const nSamp = opts.rangeSamples || 600;
    for (let s = 0; s < nSamp; s++) {
      // draw k distinct from pool
      const avail = pool.slice();
      const hand = [];
      for (let i = 0; i < k; i++) {
        const j = Math.floor(rng() * avail.length);
        hand.push(avail[j]); avail[j] = avail[avail.length - 1]; avail.pop();
      }
      const w = reachWeight(game, strategyMap, handRecord, gradeIdx, oppSeat, hand);
      if (w > 0) candidates.push({ hand, w });
    }
  }

  // normalise reach weights
  let wsum = 0;
  for (const c of candidates) wsum += c.w;
  if (wsum <= 0) {
    // no consistent opponent hand under σ (untrained/edge); fall back to uniform
    // over all combos with weight 1 so EV is still defined.
    candidates = [];
    let cnt = 0;
    for (const combo of combos(pool, k, 0, [])) {
      candidates.push({ hand: combo, w: 1 }); cnt++;
      if (cnt >= exactRangeBudget) break;
    }
    wsum = candidates.length;
    rangeMode += '+uniform-fallback';
  }
  for (const c of candidates) c.w /= wsum;

  // 3. Per-action EV with CRN.
  // Decide exact vs MC for the FORWARD rollout:
  //  - 7th street (deal-free): each candidate rolls deterministically -> EXACT
  //    over the (already enumerated or sampled) range.
  //  - else: Monte-Carlo the future deals; use a shared shuffled pool + a shared
  //    crn seed re-instantiated per action.
  const dealFree = dealFreeForward(snap);
  const useExactForward = dealFree && rangeMode.startsWith('exact-range');

  // shared shuffled pool (one Fisher-Yates) reused across actions for CRN.
  const crnRng = makeRng((opts.crnSeed >>> 0) ^ (gradeIdx * 0x9e3779b1));
  const sharedPool = pool.slice();
  for (let i = sharedPool.length - 1; i > 0; i--) {
    const j = Math.floor(crnRng() * (i + 1));
    const t = sharedPool[i]; sharedPool[i] = sharedPool[j]; sharedPool[j] = t;
  }
  const crnSeed = (crnRng() * 0xffffffff) >>> 0; // future-card rng seed, shared across actions

  // For MC we draw a fixed bag of (candidate, futureRng) particles ONCE and
  // reuse across actions. For exact-forward we just iterate candidates.
  // ADAPTIVE PRECISION: when opts.targetSE is set and the node is MC, double the
  // sample count until the chosen-vs-best evLoss SE drops below targetSE (or the
  // sample cap is hit). Exact-forward (7th) is already noise-free so we skip it.
  let samplesPerAction = opts.samples || 0;
  let result = computePerActionEV({
    game, strategyMap, st0: snap, heroSeat, acts, candidates,
    sharedPool, crnSeed, useExactForward, samples: samplesPerAction,
    crnAcrossActions: opts.crn !== false,
  });
  if (opts.targetSE && opts.targetSE > 0 && !useExactForward) {
    const cap = opts.maxSamples || 64000;
    let bestNow = acts[0];
    for (const a of acts) if (result.ev[a] > result.ev[bestNow]) bestNow = a;
    let curSE = pairSE(result, bestNow, d.chosen, opts.crn !== false);
    while (curSE > opts.targetSE && samplesPerAction < cap) {
      samplesPerAction = Math.min(cap, samplesPerAction * 2);
      result = computePerActionEV({
        game, strategyMap, st0: snap, heroSeat, acts, candidates,
        sharedPool, crnSeed, useExactForward, samples: samplesPerAction,
        crnAcrossActions: opts.crn !== false,
      });
      bestNow = acts[0];
      for (const a of acts) if (result.ev[a] > result.ev[bestNow]) bestNow = a;
      curSE = pairSE(result, bestNow, d.chosen, opts.crn !== false);
    }
  }

  const perActionEV = result.ev;        // {actionId: number}
  const perActionSE = result.se;        // {actionId: number} (per-action absolute EV SE)

  // best action + evLoss
  let bestA = acts[0], bestEV = -Infinity;
  for (const a of acts) if (perActionEV[a] > bestEV) { bestEV = perActionEV[a]; bestA = a; }
  const chosenEV = perActionEV[d.chosen];
  const evLoss = Math.max(0, bestEV - chosenEV);

  // evLoss SE = SE of (best - chosen) for THE HERO'S chosen action. Under CRN the
  // rows are aligned so this is the paired-difference SE (covariance-reduced);
  // under non-CRN it is the quadrature sum. result.maxPairSE is the worst pair
  // (used by the CRN-demonstration gate).
  const evLossSE = pairSE(result, bestA, d.chosen, opts.crn !== false);
  const maxPairSE = result.maxPairSE; // largest stochastic-vs-stochastic pair SE

  return {
    gradeIdx,
    seat: heroSeat,
    street: snap.street,
    streetName: ['3rd', '4th', '5th', '6th', '7th'][snap.street],
    infosetKey: d.key,
    trained: look.trained,
    heroCards: { down: snap.down[heroSeat].map(cardStr), up: snap.up[heroSeat].map(cardStr) },
    oppUp: snap.up[oppSeat].map(cardStr),
    gtoMix,
    chosen: d.chosen,
    bestAction: bestA,
    perActionEV,
    perActionSE,
    evLoss,
    evLossSE,
    maxPairSE,
    rangeMode,
    forwardMode: useExactForward ? 'exact-forward' : 'mc-forward',
    rangeCombos: candidates.length,
    samplesUsed: useExactForward ? 0 : samplesPerAction,
  };
}

// SE of (util[a] - util[b]) across particles. If the util matrix is available
// (MC mode) compute the paired/independent difference directly; covariance is
// included automatically when rows are aligned (CRN). For exact-forward the SE
// is 0 (deterministic). `crn` selects whether rows are paired.
function pairSE(result, a, b, crn) {
  if (a === b) return 0;
  if (!result.util) return 0; // exact-forward: noise-free
  const util = result.util, parts = result.parts;
  const ea = result.ev[a], eb = result.ev[b];
  const dm = ea - eb;
  const n = parts.length;
  if (crn) {
    let v = 0;
    for (let i = 0; i < n; i++) { const di = util[a][i] - util[b][i]; v += parts[i].w * (di - dm) * (di - dm); }
    let sumw2 = 0; for (let i = 0; i < n; i++) sumw2 += parts[i].w * parts[i].w;
    return Math.sqrt(v * sumw2);
  }
  // independent rows: quadrature sum
  return Math.sqrt(result.se[a] * result.se[a] + result.se[b] * result.se[b]);
}

// Core EV computation, shared by exact-forward and MC-forward, with optional CRN.
function computePerActionEV(args) {
  const { game, strategyMap, st0, heroSeat, acts, candidates, sharedPool, crnSeed,
    useExactForward, samples, crnAcrossActions } = args;

  const ev = {}, se = {};
  // We also accumulate, per (action), the per-particle hero-utility so we can
  // compute the evLoss difference's SE via paired differences vs the best action.
  // Strategy: compute a matrix util[a][i] = hero utility on particle i for action
  // a (same particle i across all actions => paired). Then ev[a] = Σ w_i util,
  // and evLoss SE from paired diffs of the realised best vs chosen.

  if (useExactForward) {
    // deal-free 7th street: take the EXACT σ-expectation over the finite betting
    // continuation per (action, candidate) — genuinely deterministic (no betting
    // SAMPLING), so EV is exact given the range and SE is truly 0. (Previously this
    // called rolloutAfterAction, which sampled the betting via sigmaAction, so the
    // "exact-forward" grade actually carried opponent-betting Monte-Carlo noise.)
    const util = {}; // util[a] = array aligned with candidates
    for (const a of acts) {
      util[a] = new Array(candidates.length);
      for (let i = 0; i < candidates.length; i++) {
        util[a][i] = exactValueAfterAction(game, strategyMap, st0, heroSeat, a, candidates[i].hand);
      }
    }
    finalizeEV(acts, candidates, util, ev, se);
    // exact-forward: EV is the exact expectation given the enumerated range -> SE = 0.
    return { ev, se, util: null, parts: candidates, maxPairSE: 0 };
  }

  // MC forward. Build N particles. A particle bundles the three independent
  // sources of rollout randomness:
  //   (1) the opponent's hand (sampled ∝ reach weight) — ~86% of the variance,
  //   (2) the future-card deck ORDER (a per-particle shuffle of the unseen pool),
  //   (3) a σ-betting rng SEED (consumed by both seats' action sampling).
  //
  // CRN (crnAcrossActions=true): the SAME N particles — i.e. the same (oppHand,
  // deck, σ-seed) triples — are reused for EVERY candidate action. So when we
  // difference two actions' EVs the dominant (1)+(2) terms CANCEL particle-by-
  // particle, leaving only the small post-divergence σ-sampling noise → the
  // evLoss SE collapses. Each action gets its OWN deck COPY (rollout mutates it)
  // and its OWN re-instantiated σ-rng from the shared seed.
  //
  // Non-CRN (the variance-reduction control): each action draws an INDEPENDENT
  // set of particles (fresh oppHand + fresh deck + fresh σ-seed), so nothing
  // cancels and the difference variance is the sum of both actions' full
  // variances — the honest "no common random numbers" baseline.
  const N = samples || 1200;
  const wcum = [];
  let acc = 0;
  for (const c of candidates) { acc += c.w; wcum.push(acc); }
  function sampleCandidate(rng) {
    const r = rng() * acc;
    let lo = 0, hi = wcum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (wcum[mid] < r) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function shuffledDeck(rng) {
    const sp = sharedPool.slice();
    for (let i = sp.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = sp[i]; sp[i] = sp[j]; sp[j] = t; }
    return sp;
  }

  // Build the shared particle set once (used as-is in CRN; ignored in non-CRN).
  const pickRng = makeRng((crnSeed ^ 0x51ed270b) >>> 0);
  const particles = [];
  for (let i = 0; i < N; i++) {
    particles.push({
      ci: sampleCandidate(pickRng),
      deck: shuffledDeck(pickRng),
      sigSeed: (crnSeed + i * 2654435761) >>> 0,
    });
  }

  const util = {};
  for (const a of acts) {
    util[a] = new Array(N);
    if (crnAcrossActions) {
      for (let i = 0; i < N; i++) {
        const p = particles[i];
        const u = rolloutAfterAction(game, strategyMap, st0, heroSeat, a, candidates[p.ci].hand,
          p.deck, makeRng(p.sigSeed));
        util[a][i] = u[heroSeat];
      }
    } else {
      // independent particles per action
      const indep = makeRng((crnSeed ^ hashStr(a)) >>> 0);
      for (let i = 0; i < N; i++) {
        const ci = sampleCandidate(indep);
        const deck = shuffledDeck(indep);
        const sigSeed = (indep() * 0xffffffff) >>> 0;
        const u = rolloutAfterAction(game, strategyMap, st0, heroSeat, a, candidates[ci].hand,
          deck, makeRng(sigSeed));
        util[a][i] = u[heroSeat];
      }
    }
  }
  const eqCand = new Array(N).fill(0).map(() => ({ w: 1 / N }));
  finalizeEV(acts, eqCand, util, ev, se);
  // maxPairSE = the largest best-vs-other difference SE (used by the CRN gate).
  let bestA = acts[0];
  for (const a of acts) if (ev[a] > ev[bestA]) bestA = a;
  let maxPairSE = 0;
  let sumw2 = 0; for (let i = 0; i < eqCand.length; i++) sumw2 += eqCand[i].w * eqCand[i].w;
  for (const a of acts) {
    if (a === bestA) continue;
    let seD;
    if (crnAcrossActions) {
      const dm = ev[bestA] - ev[a];
      let v = 0;
      for (let i = 0; i < N; i++) { const di = util[bestA][i] - util[a][i]; v += eqCand[i].w * (di - dm) * (di - dm); }
      seD = Math.sqrt(v * sumw2);
    } else {
      seD = Math.sqrt(se[bestA] * se[bestA] + se[a] * se[a]);
    }
    if (seD > maxPairSE) maxPairSE = seD;
  }
  return { ev, se, util, parts: eqCand, maxPairSE };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// EV[a] = Σ_i w_i util[a][i]; SE[a] = sqrt(Σ w_i^2 (util-EV)^2) ... for equal
// weights w=1/n this reduces to the standard mean SE = sd/sqrt(n).
function finalizeEV(acts, parts, util, ev, se) {
  const n = parts.length;
  for (const a of acts) {
    let m = 0;
    for (let i = 0; i < n; i++) m += parts[i].w * util[a][i];
    ev[a] = m;
    // variance of the weighted mean. For equal weights this is sd^2/n.
    let v = 0;
    for (let i = 0; i < n; i++) v += parts[i].w * (util[a][i] - m) * (util[a][i] - m);
    // effective sample size for SE: with equal weights ESS = n.
    let sumw2 = 0; for (let i = 0; i < n; i++) sumw2 += parts[i].w * parts[i].w;
    const essInv = sumw2; // Σ w_i^2 ; for equal weights = 1/n
    se[a] = Math.sqrt(v * essInv);
  }
}

// ── TRUE-GTO 7th-street ORACLE grading (opt-in, behind a flag) ──────────
// The blueprint grader charges evLoss vs its own bucketed self. On 7th street
// (a real showdown — EXACT, no value net) we can instead source the grade from
// the neural re-solver's TRUE-GTO per-action EV. This is 7th-STREET ONLY and
// only at the START of the betting round (equal contributions), where the
// oracle's root reconstruction faithfully matches the decision node; early
// streets are blocked until the net-leaf-vs-exact check passes.

// Which blueprint grades are eligible for an oracle override?
//   - 7th street (snap.street === 4), the deal-free real showdown,
//   - the hero opens the round (equal contributions => the oracle's start-of-
//     street root reconstruction matches this exact decision node),
//   - a 2-action k/b decision (the resolver's root has the hero to act first).
function oracleEligible(handRecord, gradeIdx) {
  const d = handRecord.decisions[gradeIdx];
  const snap = d.state;
  if (!snap || snap.street !== 4) return false;             // 7th street only
  const c = snap.contrib;
  if (!c || Math.abs(c[0] - c[1]) > 1e-9) return false;     // start-of-street only
  if (snap.toAct !== d.actor) return false;
  // Hero must be the OPENER (the street's first-actor), not the second actor after
  // a check: equal contributions are preserved through a check, so that test alone
  // does NOT distinguish them. The oracle re-solves from the first-actor's root, so
  // a hero-acts-second spot is rejected there ('hero not first actor at root') and
  // silently falls back. `starter` = the first-actor set at street start
  // (razz-game.js:263 / play.js). Fixes 5th/6th/7th (7th/6th just hit it rarely).
  if (snap.toAct !== snap.starter) return false;
  return true;
}

// 6th-street eligibility: same shape as oracleEligible but for 6th (snap.street
// === 3), start-of-street (equal contributions), hero to act. The bucketed 6th
// resolver's root then matches this exact decision node (hero opens 6th).
function oracleEligible6th(handRecord, gradeIdx) {
  const d = handRecord.decisions[gradeIdx];
  const snap = d.state;
  if (!snap || snap.street !== 3) return false;             // 6th street only
  const c = snap.contrib;
  if (!c || Math.abs(c[0] - c[1]) > 1e-9) return false;     // start-of-street only
  if (snap.toAct !== d.actor) return false;
  // Hero must be the OPENER (the street's first-actor), not the second actor after
  // a check: equal contributions are preserved through a check, so that test alone
  // does NOT distinguish them. The oracle re-solves from the first-actor's root, so
  // a hero-acts-second spot is rejected there ('hero not first actor at root') and
  // silently falls back. `starter` = the first-actor set at street start
  // (razz-game.js:263 / play.js). Fixes 5th/6th/7th (7th/6th just hit it rarely).
  if (snap.toAct !== snap.starter) return false;
  return true;
}

// 5th-street eligibility: 5th (snap.street === 2), start-of-street, hero opens.
// razz-only for now (only its 6th net — the depth-limited leaf — is trained); the
// dispatch also gates on the game being razz before routing a decision here.
function oracleEligible5th(handRecord, gradeIdx) {
  const d = handRecord.decisions[gradeIdx];
  const snap = d.state;
  if (!snap || snap.street !== 2) return false;             // 5th street only
  const c = snap.contrib;
  if (!c || Math.abs(c[0] - c[1]) > 1e-9) return false;     // start-of-street only
  if (snap.toAct !== d.actor) return false;
  // Hero must be the OPENER (the street's first-actor), not the second actor after
  // a check: equal contributions are preserved through a check, so that test alone
  // does NOT distinguish them. The oracle re-solves from the first-actor's root, so
  // a hero-acts-second spot is rejected there ('hero not first actor at root') and
  // silently falls back. `starter` = the first-actor set at street start
  // (razz-game.js:263 / play.js). Fixes 5th/6th/7th (7th/6th just hit it rarely).
  if (snap.toAct !== snap.starter) return false;
  return true;
}

// Build the oracle spot dict (what oracle_worker.py expects) from a blueprint
// grade's already-computed reach-weighted opponent range. `blueprintGrade` is a
// gradeDecision result; `candidates` is its normalized [{hand:[int],w}] range.
function buildOracleSpot(game, handRecord, gradeIdx, candidates, iters) {
  const d = handRecord.decisions[gradeIdx];
  const snap = d.state;
  const heroSeat = d.actor;
  const oppSeat = 1 - heroSeat;
  return {
    game: game.id,
    up0: snap.up[heroSeat].map(cardStr),
    up1: snap.up[oppSeat].map(cardStr),
    dead: (handRecord.deadCards || []).map(cardStr),
    pot: snap.contrib[0] + snap.contrib[1],
    me: snap.down[heroSeat].map(cardStr),
    opp_range: candidates.map(c => [c.hand.map(cardStr), c.w]),
    iters: iters || 2000,
  };
}

// 6th-street spot: reuse buildOracleSpot (me = snap.down[heroSeat] is naturally
// the 2 hole cards on 6th) and tag it for the bucketed 6th->7th resolver. `mode`
// routes to oracle_worker._solve_stud6_bucketed; `street:6` is its guard.
function buildOracleSpot6th(game, handRecord, gradeIdx, candidates, iters) {
  const spot = buildOracleSpot(game, handRecord, gradeIdx, candidates, iters || 250);
  spot.mode = 'resolve6';
  spot.street = 6;
  return spot;
}

// 5th-street spot: reuse buildOracleSpot (me = snap.down[heroSeat] is the 2 hole
// cards on 5th) and tag it for the depth-limited net-leaf 5th resolver. `mode`
// routes to oracle_worker._solve_stud5_net; `street:5` is its guard. iters left
// undefined so the worker uses its tuned default (100).
function buildOracleSpot5th(game, handRecord, gradeIdx, candidates, iters) {
  const spot = buildOracleSpot(game, handRecord, gradeIdx, candidates, iters || 100);
  spot.mode = 'resolve5';
  spot.street = 5;
  return spot;
}

// Game-agnostic-enough STRENGTH scorer for the range-sensitive strength-tilt: an
// opponent DOWN-card combo → a scalar where HIGHER = a STRONGER opponent hand,
// evaluated over the opponent's FULL board (their upcards + this down combo).
// razz: ace-to-five low is LOWER=better, so negate. stud8: the hi rank is a valid
// monotone strength axis (the tilt only needs to concentrate mass on one end of
// the range; it does not need the exact showdown order). Returns null for an
// unknown game so the ensemble falls back to posterior+uniform.
function studStrengthScorer(game, oppUp) {
  const up = oppUp || [];
  if (game.id === 'razz' || game.id === 'razzv1' || game.id === 'razzv2') {
    return (down) => -bestLowRazz(up.concat(down));
  }
  if (game.id === 'stud8') {
    return (down) => bestHi7(up.concat(down));
  }
  return undefined;
}

// Recompute the candidate opp range for a decision (same reach-weighting the
// blueprint grader uses), so the oracle sees the same range — then PRUNE to the
// top-`oppCap` reach-weighted holdings. The blueprint grader enumerates the full
// ~C(40,3)≈8.4k opp combos and rolls each cheaply per-candidate; the exact CFR
// re-solver instead builds an O(H²)-showdown tree over the union, so a full
// enumeration is intractable/times out. Capping to the top-mass holdings keeps
// the solve node-locked (<~1s) while covering the bulk of the opponent's reach.
// Returns normalized [{hand,w}] over the retained holdings (renormalized).
// Realistic full-ring 3rd-street ENTRY PRIOR (razz). The blueprint is a HEADS-UP
// bot that enters/completes/raises with trash a real full-table player folds, so
// the reach-weighted opponent range is unrealistically WIDE. Apply a Bayesian prior
// over the opponent's STARTING hand (door + hole pair):
//   P(holding | line)  ∝  P(holding)_realistic  ×  P(line | holding)_blueprint
// earlyLowTier (0=best low .. 5=trash) is the razz-v2 starting-hand-strength tier;
// map it to a [0,1] entry weight (validated: wheel/three-low->1.0, two-low->0.35,
// faces->0.04, pairs penalised). On 7th (3 hidden = hole pair + river) which 2 are
// the hole pair is unobserved -> take the MAX over the 3 decompositions (a legit
// start exists if ANY hole-pair choice is legit). stud8 (hi/lo) entry is more
// complex -> deferred (returns 1, no change). ORACLE-ONLY: the blueprint grader
// uses its own range builder, so this only tightens the opt-in oracle grades.
const RAZZ_ENTRY_W = { 0: 1.0, 1: 1.0, 2: 0.7, 3: 0.35, 4: 0.12, 5: 0.04 };

// ── stud8 (hi/lo) realistic full-ring 3rd-street ENTRY model ──────────────────
// P(a winning full-ring stud8 player voluntarily plays this 3-card starting hand
// = door + 2 hole). TWO-DIMENSIONAL (low draw × high pair/draw × scoop), unlike
// razz's low-only earlyLowTier. First-match-wins classifier over the 3 cards ->
// one of six tiers -> weight. Designed + adversarially validated (design workflow
// wf_6261eb65: 3 angles -> synthesis -> 4-lens critique -> finalize; 32/32 labeled
// examples reproduce). Weights T0..T5 = {1,.85,.6,.35,.12,.04}; trash is DOWN-
// weighted 25x, never zeroed (bring-in defense / disguise floor). ORDERING IS
// LOAD-BEARING (see STEP comments) — do not reorder without re-running the
// 32-example unit test (solver/razz-trainer/stud8-entry.test.js).
const STUD8_ENTRY_W = { 0: 1.0, 1: 0.85, 2: 0.6, 3: 0.35, 4: 0.12, 5: 0.04 };
function stud8EntryTier(cards3) {
  if (!cards3 || cards3.length !== 3) return 5; // defensive: only classify a 3-card start
  const ranks = cards3.map(rankOf);             // 2..14 (ace high)
  const lrank = cards3.map(lowRankOf);          // ace = 1
  const suits = cards3.map(suitOf);
  const L = new Set(lrank.filter(r => r <= 8)).size;   // # distinct low ranks <= 8
  const hasAce = ranks.some(r => r === 14);
  const hasTwo = ranks.some(r => r === 2);
  const rc = {}; for (const r of ranks) rc[r] = (rc[r] || 0) + 1;
  const counts = Object.values(rc);
  const isTrips = counts.includes(3);
  const isPair = counts.includes(2);
  const pairRank = isPair ? Math.max(...Object.keys(rc).filter(r => rc[r] === 2).map(Number)) : 0;
  const threeFlush = suits[0] === suits[1] && suits[1] === suits[2];
  const distinct3 = new Set(ranks).size === 3;
  const allWheel = distinct3 && lrank.every(r => r <= 5);          // three-to-a-wheel
  const spanLow = Math.max(...lrank) - Math.min(...lrank);
  const connected3 = distinct3 && spanLow <= 2;                    // TIGHT (adjacent only)
  const highStraight = distinct3 && ranks.every(r => r >= 9) &&
    (Math.max(...ranks) - Math.min(...ranks) <= 4);               // K-Q-J, J-T-9, A-K-Q ...

  // STEP 0 — rolled-up trips
  if (isTrips) return 0;
  // STEP 1 — pairs FIRST (matched cards are not two separate lows)
  if (isPair) {
    if (pairRank === 14) return 0;                        // AA
    if (pairRank === 13 || pairRank === 12) return 1;     // KK / QQ
    if (pairRank === 11) return 2;                        // JJ
    if (pairRank === 10 || pairRank === 9) return 3;      // TT / 99
    if (pairRank <= 8 && hasAce && hasTwo) return 2;      // A-2-2 (pair doesn't cut the {A,2} nut low)
    return 4;                                             // any other small pair
  }
  // STEP 2 — three distinct lows (L === 3 ⟹ three distinct ranks <= 8)
  if (L === 3) {
    if (threeFlush || allWheel || (hasAce && hasTwo)) return 0; // low three-flush / wheel / A-2-x
    if (hasAce) return 1;                                        // ace-anchored nut-low draw
    if (connected3) return 1;                                    // no-ace low three-STRAIGHT (two-way)
    return 2;                                                    // bare no-ace three-low
  }
  // STEP 3 — straight-flush draw (adjacent suited)
  if (threeFlush && connected3) return 1;
  // STEP 4 — ace three-flush (flush + ace, two-way) before flat high-flush
  if (threeFlush && hasAce) return hasTwo ? 1 : 2;             // A-2+flush / A-x+flush
  // STEP 5 — high three-flush (no ace, not adjacent)
  if (threeFlush) return 3;
  // STEP 6 — one-way / leaning three-straight (medium two-way & broadway)
  if (connected3 || highStraight) return 3;
  // STEP 7 — exactly two distinct lows
  if (L === 2) return (hasAce && hasTwo) ? 2 : 4;             // A-2+high / partial-low
  // STEP 8 — one or zero lows
  if (hasAce) return 4;                                        // lone-ace junk
  return 5;                                                    // high-card trash
}

function entryPrior(game, door, combo) {
  const isRazz = (game.id === 'razz' || game.id === 'razzv1' || game.id === 'razzv2');
  const isStud8 = (game.id === 'stud8');
  if (!isRazz && !isStud8) return 1;
  // Evaluate the 3-card STARTING hand = door + 2 hole. Past 3rd street the
  // opponent has >2 hidden cards (7th adds the river); which 2 were the hole is
  // unobserved -> take the MAX over dropping each extra hidden card (a legit
  // start exists if ANY 2-hidden choice is legit). Mirrors the razz path.
  // Razz: prefer the DERIVED (CFR uniform-deal) entry range when a table exists
  // (solver/strategies/razz3-uniform-entry.json, emitted by extract-cfr-entry.js);
  // else fall back to the hand-tuned tiers. The derived range is horizon-correct
  // and threshold-free (the equity fixed point was ill-conditioned — see
  // solver/entry/DERIVATION_SPEC.md). Absent the file, behavior is unchanged.
  const derivedPrior = require('../entry/derived-prior');
  const weightOf = isRazz
    ? (three) => {
        const d = derivedPrior.pEnter('razz', three);
        if (d != null) return d;
        const t = DEFAULT_GAME.earlyLowTier(three); return RAZZ_ENTRY_W[t] != null ? RAZZ_ENTRY_W[t] : 0.04;
      }
    : (three) => {
        const d = derivedPrior.pEnter('stud8', three);
        if (d != null) return d;
        return STUD8_ENTRY_W[stud8EntryTier(three)];
      };
  if (combo.length <= 2) return weightOf([door, ...combo]);
  let best = 0;
  for (let r = 0; r < combo.length; r++) {
    best = Math.max(best, weightOf([door, ...combo.filter((_, i) => i !== r)]));
  }
  return best;
}

function oracleCandidates(game, strategyMap, handRecord, gradeIdx, opts) {
  const d = handRecord.decisions[gradeIdx];
  const snap = d.state;
  const heroSeat = d.actor;
  const oppSeat = 1 - heroSeat;
  const k = oppDownCount(snap);
  const pool = unseenForOpp(snap, heroSeat, handRecord.deadCards || []);
  const budget = opts.exactRangeBudget == null ? 20000 : opts.exactRangeBudget;
  const oppCap = opts.oppCap == null ? 40 : opts.oppCap; // resolver union cap
  const candidates = [];
  // Realistic full-ring 3rd-street entry prior (razz): tighten the opponent range by
  // the strength of their STARTING hand (door + hole pair). Toggle with opts.entryPrior.
  const door = (snap.up[oppSeat] && snap.up[oppSeat].length) ? snap.up[oppSeat][0] : null;
  const usePrior = opts.entryPrior !== false && door != null;
  for (const combo of combos(pool, k, 0, [])) {
    let w = reachWeight(game, strategyMap, handRecord, gradeIdx, oppSeat, combo);
    if (w > 0 && usePrior) w *= entryPrior(game, door, combo);
    if (w > 0) candidates.push({ hand: combo, w });
    if (candidates.length > budget) break;
  }
  let wsum = 0; for (const c of candidates) wsum += c.w;
  if (wsum <= 0) return null;                 // no consistent opp hand -> no oracle
  // Down-select to `oppCap` holdings so the O(union²) re-solve stays fast. The
  // budget is a LATENCY cap (union size), not a coverage target: on stud/razz 7th
  // the opponent's consistent range is ~8.4k combos and reach-weighting is very
  // FLAT (top weight ≈ 2x uniform), so the old "top-oppCap by mass" head captured
  // <1% of reach AND — because the flat head is an arbitrary, unrepresentative
  // slice — biased the solved subgame: it over-charged strong-hero spots by
  // ~10 chips (an ARTIFACT), while leaving crushed-hero spots unchanged. Instead
  // we take a SYSTEMATIC (evenly-strided) sample across the reach-sorted range:
  // for a flat range this is a representative miniature of the WHOLE range, so its
  // showdown-equity distribution — hence the per-action EV — matches the full
  // range at the SAME union size / latency. (Verified: on a strong-hero razz spot
  // systematic-30 → 2.8 chips vs top-20's 11.6, matching the K=250 reference 2.1;
  // on crushed-hero spots both agree.) Weights are the retained holdings' own
  // reach, renormalized. `coverage` (reach-mass retained) is kept for diagnostics
  // but is intentionally small — representativeness, not mass, is what matters for
  // a flat range.
  let kept = candidates;
  let coverage = 1;
  if (oppCap > 0 && candidates.length > oppCap) {
    candidates.sort((a, b) => b.w - a.w);     // reach-sorted (desc)
    const stride = candidates.length / oppCap; // fractional stride across the range
    kept = [];
    for (let i = 0; kept.length < oppCap && Math.floor(i) < candidates.length; i += stride) {
      kept.push(candidates[Math.floor(i)]);
    }
    let keptSum = 0; for (const c of kept) keptSum += c.w;
    coverage = keptSum / wsum;                // fraction of opp reach retained (small — by design)
    wsum = keptSum;
  }
  for (const c of kept) c.w /= wsum;
  kept.coverage = coverage;                   // stashed for diagnostics
  return kept;
}

// ── oracle self-consistency gauge (HONEST at the grade setting) ─────────
// The resolver returns res.exploitability = its OWN best-response gap after
// `iters` CFR+ iterations. At the trainer default (oracleIters=300) that gauge
// reads ~0.33 chips: the CFR SELF-PLAY hasn't fully converged its own mixed
// strategy (reaching <0.06 needs ~5000 iters / ~69s). BUT the quantity the GRADE
// depends on — the PER-ACTION EV / evLoss at the root — is already CONVERGED at
// 300 iters (stable to <=0.2 chips out to 5000 iters). So the resolver's own
// <0.06 exploitability bar is the WRONG trust signal for a 300-iter grade:
// gating on exploitability>0.1 would falsely flag a good, EV-converged grade as
// broken. We therefore:
//   (1) surface the raw gauge under an HONEST name (oracleResolveExploitability)
//       that says what it is — the resolver's self-play gap at these iters, NOT a
//       claim that the grade is "<0.06 exploitable / fully solved";
//   (2) publish oracleGradeTrusted based on EV-CONVERGENCE (guaranteed by
//       iters >= EV_CONVERGED_ITERS), not on the exploitability bar. A 300-iter
//       grade is trusted because its per-action EV has converged, full-strategy
//       exploitability notwithstanding.
// This changes only LABELS/metadata — the grade (evLoss) is untouched.
const EV_CONVERGED_ITERS = 300; // per-action EV is stable to <=0.2 chips at/above this
const RESOLVE_FULLY_SOLVED_ITERS = 5000; // iters needed for the resolver's OWN <0.06 gauge

// Overlay a true-GTO oracle grade onto a blueprint grade. Returns a NEW grade
// object with per-action EV / evLoss / gtoMix / bestAction sourced from the
// oracle, tagged gradeSource:'oracle'. On ANY failure (worker down, range empty,
// ineligible, action mismatch) returns the BLUEPRINT grade (tagged
// gradeSource:'blueprint') so the trainer never breaks.
//
// `g` may be EITHER a full blueprint gradeDecision result OR a light stub
// {gradeIdx} (see gradeHandWithOracle's short-circuit): on oracle-eligible
// 7th-street decisions we must NOT pay the ~10s blueprint Monte-Carlo up front —
// it is redundant with the oracle grade and only needed as a fallback. When the
// oracle SUCCEEDS the blueprint grade is never computed; when it FAILS we compute
// the blueprint grade LAZILY via opts.blueprintGrade() so the fallback is intact.
async function overlayOracleGrade(oracle, game, strategyMap, handRecord, g, opts) {
  const gradeIdx = g.gradeIdx;
  const d = handRecord.decisions[gradeIdx];
  // Lazily materialise the blueprint grade only when we actually need it (fallback
  // or non-eligible). `g` already IS the blueprint grade unless it's the light
  // stub used by the short-circuit path, in which case opts.blueprintGrade()
  // computes it on demand. blueprintEvLoss is a diagnostic COMPARISON field; in
  // pro-mode it must not force the ~10s MC, so it is populated only when the
  // blueprint grade exists (fallback) or a debug flag asks for it.
  const materializeBlueprint = () =>
    (g && g.perActionEV) ? g : (opts.blueprintGrade ? opts.blueprintGrade() : g);
  const asBlueprintGrade = () => {
    const bp = materializeBlueprint();
    return Object.assign({}, bp, {
      gradeSource: 'blueprint',
      blueprintEvLoss: bp.evLoss,
    });
  };
  try {
    if (!oracleEligible(handRecord, gradeIdx)) return asBlueprintGrade();
    const candidates = oracleCandidates(game, strategyMap, handRecord, gradeIdx, opts);
    if (!candidates || !candidates.length) return asBlueprintGrade();
    const iters = opts.oracleIters || 2000;
    const spot = buildOracleSpot(game, handRecord, gradeIdx, candidates, iters);
    const res = await oracle.perActionEV(spot);
    if (!res || !res.per_action_ev) return asBlueprintGrade();

    // The oracle must cover exactly the hero's legal actions.
    const acts = d.acts;
    for (const a of acts) {
      if (!(a in res.per_action_ev)) return asBlueprintGrade();
    }

    const perActionEV = {};
    for (const a of acts) perActionEV[a] = res.per_action_ev[a];
    let bestA = acts[0], bestEV = -Infinity;
    for (const a of acts) if (perActionEV[a] > bestEV) { bestEV = perActionEV[a]; bestA = a; }
    const evLoss = Math.max(0, bestEV - perActionEV[d.chosen]);

    const gtoMix = res.gtoMix && res.gtoMix.actions
      ? { actions: res.gtoMix.actions.slice(), probs: res.gtoMix.freq.slice(),
          trained: true }
      : materializeBlueprint().gtoMix;

    // HONEST self-consistency gauge (Fix 2): the grade is trusted on EV-CONVERGENCE
    // (iters >= EV_CONVERGED_ITERS), NOT on the resolver's own <0.06 exploitability
    // bar. Surface the raw gauge under a name that says what it is.
    const evConverged = iters >= EV_CONVERGED_ITERS;
    // blueprintEvLoss only if the blueprint grade is already in hand (never forces
    // the ~10s MC on the eligible short-circuit path) or a debug flag requests it.
    const blueprintEvLoss = (g && g.perActionEV) ? g.evLoss
      : (opts.debugBlueprintEvLoss && opts.blueprintGrade ? opts.blueprintGrade().evLoss : undefined);

    // ── RANGE-SENSITIVE honesty flag (same mechanism as the draw grader) ──────
    // Re-solve this SAME 7th-street spot under a small prior ensemble (posterior /
    // uniform-over-support / strength-tilt) at reduced iters; flag on a best-action
    // FLIP or an evLoss SPREAD > ~2 chips. The strength-tilt scores each opponent
    // DOWN-card combo by the strength of the opponent's FULL board (opp upcards +
    // dead-free down combo): razz uses the ace-to-five low (lower=stronger→negate),
    // stud8 uses the hi rank as a monotone strength axis. When flagged, the oracle
    // grade is SHOWN but its charged evLoss is ZEROED — gated for STUD by
    // STUD_RANGE_FLAG (parent's deploy decision), since it changes shipped stud
    // grading (the draw path zeroes unconditionally).
    let rs = null;
    if (opts.rangeSensitive !== false) {
      const snap0 = d.state;
      const oppSeat0 = 1 - d.actor;
      const oppUp = snap0.up[oppSeat0];
      const strengthScore = studStrengthScorer(game, oppUp);
      rs = await computeRangeSensitivity({
        oracle,
        buildSpot: (range, itr) => buildOracleSpot(game, handRecord, gradeIdx, range, itr),
        baseRange: candidates,   // [{hand,w}] — the primary grade's opp range
        acts,
        chosen: d.chosen,
        strengthScore,
        spreadThreshold: opts.rangeSensitiveThreshold,
      });
    }
    const flagged = !!(rs && rs.rangeSensitive);
    // STUD charge-zeroing is gated (STUD_RANGE_FLAG) AND respects an explicit
    // per-call override (rangeSensitiveCharge:false surfaces the flag without
    // zeroing). Flag is always SURFACED; only the CHARGE is gated.
    const chargeZeroed = flagged && STUD_RANGE_FLAG && opts.rangeSensitiveCharge !== false;

    const out = Object.assign({}, materializeBlueprintShell(g, d, gtoMix), {
      gradeIdx,
      gradeSource: 'oracle',
      perActionEV,
      perActionSE: acts.reduce((o, a) => (o[a] = 0, o), {}), // exact showdown
      bestAction: bestA,
      evLoss,
      evLossSE: 0,
      gtoMix,
      forwardMode: 'oracle-exact',
      // HONEST gauge fields:
      oracleResolveExploitability: res.exploitability, // resolver self-play gap AT these iters (NOT a grade-quality claim)
      oracleGradeTrusted: evConverged,                 // trust = per-action EV converged
      oracleGradeTrust: evConverged ? 'ev-converged' : 'ev-unconverged',
      oracleIters: iters,
      oracleFullySolved: iters >= RESOLVE_FULLY_SOLVED_ITERS, // only THEN is the <0.06 bar met
      // BACK-COMPAT: keep the old key but point it at the honestly-labelled value.
      // (No code THRESHOLDS on it; the server just passes it through to the client.)
      oracleExploitability: res.exploitability,
      oppCoverage: candidates.coverage == null ? 1 : candidates.coverage,
      oppCombos: candidates.length,
    });
    // ── range-sensitivity flag (display evLoss above is UNCHANGED). Attached ONLY
    // when the ensemble ran (rs !== null); with rangeSensitive:false these keys are
    // OMITTED so the payload is BYTE-IDENTICAL to the pre-flag oracle grade. ──
    if (rs) {
      out.rangeSensitive = flagged;
      out.rangeSensitiveSpread = rs.rangeSensitiveSpread;
      out.rangeSensitiveFlip = rs.rangeSensitiveFlip;
      out.rangeSensitiveEnsemble = rs.ensembleSize;
      // chargedEvLoss = what the running scoreboard counts. Zeroed on a flagged +
      // active spot ("shown, not charged"); == evLoss otherwise. When STUD_RANGE_FLAG
      // is OFF a flagged stud spot is SHOWN but still CHARGED (chargedEvLoss==evLoss).
      out.chargedEvLoss = chargeZeroed ? 0 : evLoss;
    }
    if (blueprintEvLoss !== undefined) out.blueprintEvLoss = blueprintEvLoss;
    return out;
  } catch (e) {
    // never let the oracle break a grade
    return asBlueprintGrade();
  }
}

// Per-game 6th-street abstraction-gap badge, from the bucketed-vs-exact CERT
// (cert_st6.py, 2026-07-08): stud8's 25-bucket hi/lo grid is TIGHT on realistic
// boards (~sub-chip), razz's 8-bucket low ladder is the COARSER one (~2 chips).
// This is the reverse of the net-quality ordering — grading rides the ABSTRACTION,
// not the net. Numbers are conservative honest estimates, not certified bars.
function oracle6thTrust(gameId) {
  if (gameId === 'stud8') return { label: 'oracle-6th-tight', chips: 0.7 };
  return { label: 'oracle-6th-approximate', chips: 2.0 };   // razz / razzv1 / razzv2
}

// 6th-STREET oracle overlay — the LEANER, more conservative sibling of
// overlayOracleGrade. The grade comes from the BUCKETED 6th->7th resolve
// (mode:'resolve6'), which is APPROXIMATE (bucket abstraction + sampled
// transitions). So it is:
//   • a DISTINCT gradeSource ('oracle-6th') — a pro must never confuse it with the
//     near-exact 7th 'oracle';
//   • SHOWN but NEVER CHARGED (chargedEvLoss = 0 unconditionally) — hence no
//     range-sensitivity ensemble is needed (the charge is always zero anyway),
//     which also avoids tripling an already-~14s solve;
//   • NEVER labelled exact/GTO (forwardMode 'oracle-6th-bucketed').
// Falls back to the blueprint grade on ANY failure/timeout.
async function overlayOracleGrade6th(oracle, game, strategyMap, handRecord, g, opts) {
  const gradeIdx = g.gradeIdx;
  const d = handRecord.decisions[gradeIdx];
  const materializeBlueprint = () =>
    (g && g.perActionEV) ? g : (opts.blueprintGrade ? opts.blueprintGrade() : g);
  const asBlueprintGrade = () => {
    const bp = materializeBlueprint();
    return Object.assign({}, bp, { gradeSource: 'blueprint', blueprintEvLoss: bp.evLoss });
  };
  try {
    if (!oracleEligible6th(handRecord, gradeIdx)) return asBlueprintGrade();
    const candidates = oracleCandidates(game, strategyMap, handRecord, gradeIdx, opts);
    if (!candidates || !candidates.length) return asBlueprintGrade();
    // 250 iters: the per-action EV is CONVERGED here — measured drift vs a 600-iter
    // reference is <=0.06 chips (negligible for a grade) — while keeping the solve
    // well under the 20s oracle-bridge timeout (~10s stud8 / ~4s razz uncontended).
    // At 400 the stud8 solve flirted with the timeout on slower CPUs -> silent
    // blueprint fallback; 250 gives margin with no grade-quality cost.
    const iters = opts.oracleIters6th || 250;
    const spot = buildOracleSpot6th(game, handRecord, gradeIdx, candidates, iters);
    const res = await oracle.perActionEV(spot);
    if (!res || !res.per_action_ev) return asBlueprintGrade();

    const acts = d.acts;
    for (const a of acts) if (!(a in res.per_action_ev)) return asBlueprintGrade();

    const perActionEV = {};
    for (const a of acts) perActionEV[a] = res.per_action_ev[a];
    let bestA = acts[0], bestEV = -Infinity;
    for (const a of acts) if (perActionEV[a] > bestEV) { bestEV = perActionEV[a]; bestA = a; }
    const evLoss = Math.max(0, bestEV - perActionEV[d.chosen]);

    const gtoMix = materializeBlueprint().gtoMix;   // 6th v1: blueprint mix for display
    const trust = oracle6thTrust(game.id);
    const blueprintEvLoss = (g && g.perActionEV) ? g.evLoss
      : (opts.debugBlueprintEvLoss && opts.blueprintGrade ? opts.blueprintGrade().evLoss : undefined);

    const out = Object.assign({}, materializeBlueprintShell(g, d, gtoMix), {
      gradeIdx,
      gradeSource: 'oracle-6th',                     // DISTINCT from 7th 'oracle'
      perActionEV,
      perActionSE: acts.reduce((o2, a) => (o2[a] = 0, o2), {}),
      bestAction: bestA,
      evLoss,
      evLossSE: 0,
      gtoMix,
      forwardMode: 'oracle-6th-bucketed',            // NEVER exact/GTO
      oracle6thApproximate: true,
      oracleGradeTrusted: false,                     // approximate; not a charged 'trusted' grade
      oracleGradeTrust: trust.label,                 // 'oracle-6th-tight' | 'oracle-6th-approximate'
      oracle6thAbstractionChips: trust.chips,        // per-game abstraction-gap estimate (cert)
      oracleResolveExploitability: res.exploitability,
      oracleIters: iters,
      oppCoverage: candidates.coverage == null ? 1 : candidates.coverage,
      oppCombos: candidates.length,
      chargedEvLoss: 0,                              // SHOWN, NEVER CHARGED (approximate 6th)
    });
    if (blueprintEvLoss !== undefined) out.blueprintEvLoss = blueprintEvLoss;
    return out;
  } catch (e) {
    return asBlueprintGrade();
  }
}

// 5th-street trust. 5th is the FIRST street BELOW the last exact-referenceable
// street (6th): its grade is the 6th NET used as a depth-limited leaf, so it is
// APPROXIMATE (net fit + public up-card sampling + NO exact anchor below 6th) — an
// honest 'laddered' tier, softer than the 6th. razz-only for now.
function oracle5thTrust(gameId) {
  return { label: 'oracle-5th-laddered' };
}

// 5th-STREET oracle overlay — the sibling of overlayOracleGrade6th, one street
// down. The grade comes from a DEPTH-LIMITED 5th resolve with the razz 6th NET as
// the leaf (mode:'resolve5'): the 5th->6th PUBLIC up-card boundary is valued by the
// net (sampled deals, CRN). More approximate than the 6th (net-leaf + no exact
// anchor below 6th), so: DISTINCT gradeSource ('oracle-5th'), SHOWN but NEVER
// CHARGED, NEVER exact/GTO ('oracle-5th-netleaf'). Falls back to blueprint on any
// failure/timeout.
async function overlayOracleGrade5th(oracle, game, strategyMap, handRecord, g, opts) {
  const gradeIdx = g.gradeIdx;
  const d = handRecord.decisions[gradeIdx];
  const materializeBlueprint = () =>
    (g && g.perActionEV) ? g : (opts.blueprintGrade ? opts.blueprintGrade() : g);
  const asBlueprintGrade = () => {
    const bp = materializeBlueprint();
    return Object.assign({}, bp, { gradeSource: 'blueprint', blueprintEvLoss: bp.evLoss });
  };
  try {
    if (!oracleEligible5th(handRecord, gradeIdx)) return asBlueprintGrade();
    // 5th is the numpy net-leaf path — the net runs EVERY CFR iter, so it is the
    // slowest oracle. On Render's CPU the default oppCap=40 / iters=100 exceeded the
    // 20s oracle-bridge timeout -> the bridge silently returned null (NO worker error
    // logged) -> blueprint fallback, so oracle-5th never fired in prod (it fires
    // locally where the solve is fast). Cut to oppCap=15 / iters=60 (~1.6s local, big
    // prod margin; EV drift ~0.13 chips vs the 30/100 reference — fine for the
    // shown-not-charged laddered tier).
    const opts5 = Object.assign({}, opts, { oppCap: opts.oppCap5th || 15 });
    const candidates = oracleCandidates(game, strategyMap, handRecord, gradeIdx, opts5);
    if (!candidates || !candidates.length) return asBlueprintGrade();
    const iters = opts.oracleIters5th || 60;
    const spot = buildOracleSpot5th(game, handRecord, gradeIdx, candidates, iters);
    const res = await oracle.perActionEV(spot);
    if (!res || !res.per_action_ev) return asBlueprintGrade();

    const acts = d.acts;
    for (const a of acts) if (!(a in res.per_action_ev)) return asBlueprintGrade();

    const perActionEV = {};
    for (const a of acts) perActionEV[a] = res.per_action_ev[a];
    let bestA = acts[0], bestEV = -Infinity;
    for (const a of acts) if (perActionEV[a] > bestEV) { bestEV = perActionEV[a]; bestA = a; }
    const evLoss = Math.max(0, bestEV - perActionEV[d.chosen]);

    const gtoMix = materializeBlueprint().gtoMix;
    const trust = oracle5thTrust(game.id);
    const blueprintEvLoss = (g && g.perActionEV) ? g.evLoss
      : (opts.debugBlueprintEvLoss && opts.blueprintGrade ? opts.blueprintGrade().evLoss : undefined);

    const out = Object.assign({}, materializeBlueprintShell(g, d, gtoMix), {
      gradeIdx,
      gradeSource: 'oracle-5th',                     // DISTINCT from 6th/7th
      perActionEV,
      perActionSE: acts.reduce((o2, a) => (o2[a] = 0, o2), {}),
      bestAction: bestA,
      evLoss,
      evLossSE: 0,
      gtoMix,
      forwardMode: 'oracle-5th-netleaf',             // NEVER exact/GTO
      oracle5thApproximate: true,
      oracleGradeTrusted: false,
      oracleGradeTrust: trust.label,                 // 'oracle-5th-laddered'
      oracleResolveExploitability: res.exploitability,  // null below 7th
      oracleIters: iters,
      oppCoverage: candidates.coverage == null ? 1 : candidates.coverage,
      oppCombos: candidates.length,
      chargedEvLoss: 0,                              // SHOWN, NEVER CHARGED (approximate 5th)
    });
    if (blueprintEvLoss !== undefined) out.blueprintEvLoss = blueprintEvLoss;
    return out;
  } catch (e) {
    return asBlueprintGrade();
  }
}

// Build the display/passthrough shell an oracle grade inherits (seat/street/
// heroCards/etc.). If `g` is a full blueprint grade we reuse it as the base; if
// it's the light {gradeIdx} stub we synthesize the shell from the decision so the
// oracle grade carries the same descriptive fields WITHOUT a blueprint MC.
function materializeBlueprintShell(g, d, gtoMix) {
  if (g && g.perActionEV) return g;
  const snap = d.state;
  const heroSeat = d.actor;
  const oppSeat = 1 - heroSeat;
  return {
    seat: heroSeat,
    street: snap.street,
    streetName: ['3rd', '4th', '5th', '6th', '7th'][snap.street],
    infosetKey: d.key,
    trained: gtoMix ? gtoMix.trained : false,
    heroCards: { down: snap.down[heroSeat].map(cardStr), up: snap.up[heroSeat].map(cardStr) },
    oppUp: snap.up[oppSeat].map(cardStr),
    chosen: d.chosen,
    rangeMode: 'oracle',
    rangeCombos: 0,
    samplesUsed: 0,
  };
}

// Async oracle-enhanced gradeHand. Grades every non-eligible hero decision with
// the blueprint (byte-identical to gradeHand) and every ORACLE-ELIGIBLE 7th-
// street decision with the true-GTO re-solver — WITHOUT paying the redundant
// ~10s blueprint Monte-Carlo for those eligible decisions (Fix 1: the blueprint
// grade is computed only on oracle fallback). Any oracle failure falls back to
// the blueprint grade per-decision. Opt-in: callers use this instead of gradeHand
// only when the "oracle grading" option is on; the default gradeHand path is
// untouched.
async function gradeHandWithOracle(handRecord, blueprint, opts = {}) {
  const game = opts.game || DEFAULT_GAME;
  const strategyMap = strategyMapOf(blueprint);
  const { getOracle } = require('./oracle-bridge');
  const oracle = opts.oracle || getOracle();
  // Trainer defaults balance latency vs precision: the exact 7th-street re-solve
  // is O(iters · union²), so cap the opponent range to a fixed union size (oppCap)
  // and run enough CFR+ to converge the PER-ACTION EV (which stabilizes well
  // before full exploitability does). oppCap is a SYSTEMATIC sample across the
  // (flat) reach-sorted range, not a top-mass head — see oracleCandidates — so a
  // small union is representative of the whole ~8.4k-combo range. The PER-ACTION
  // EV (what the grade needs) converges FAST — within ~0.2 chips by ~300 iters,
  // long before full exploitability does — so the default is 300 iters, which
  // lands ~30 combos at ≈4-5 s/decision warm. Callers can raise oppCap/oracleIters
  // for research-grade precision (systematic-K converges to the full range as K
  // grows; more iters tightens the CFR self-play but barely moves per-action EV).
  // HONESTY NOTE (Fix 2): at 300 iters the resolver's OWN exploitability gauge
  // still reads ~0.33 (its mixed strategy needs ~5000 iters / ~69s to reach
  // <0.06) — but the GRADE is trusted on EV-CONVERGENCE, not on that <0.06 bar.
  // The overlay surfaces the raw gauge as oracleResolveExploitability (labelled as
  // the resolver's self-play gap, NOT a "fully solved" claim) and sets
  // oracleGradeTrusted from EV-convergence. See overlayOracleGrade.
  const o = { exactRangeBudget: opts.exactRangeBudget == null ? 20000 : opts.exactRangeBudget,
              oppCap: opts.oppCap == null ? 30 : opts.oppCap,
              oracleIters: opts.oracleIters || 300,
              debugBlueprintEvLoss: opts.debugBlueprintEvLoss === true,
              // RANGE-SENSITIVE flag: computed + surfaced for stud too (default ON);
              // whether a flagged stud grade's charge is ZEROED is additionally
              // gated by STUD_RANGE_FLAG (env, parent's deploy decision) inside the
              // overlay. rangeSensitive:false skips the ensemble (byte-identical to
              // the pre-flag oracle grade).
              rangeSensitive: opts.rangeSensitive !== false,
              rangeSensitiveCharge: opts.rangeSensitiveCharge !== false,
              rangeSensitiveThreshold: opts.rangeSensitiveThreshold };

  // Per-hand blueprint grading OPTS (the same config gradeHand builds) — used
  // only to compute a blueprint grade LAZILY for the decisions that need one
  // (non-eligible decisions, or eligible decisions where the oracle falls back).
  const bpOpts = {
    game,
    samples: opts.samples || 2000,
    crn: opts.crn !== false,
    crnSeed: (opts.seed == null ? 0xC0FFEE : opts.seed) >>> 0,
    rangeSeed: (opts.rangeSeed == null ? 0xBEEF : opts.rangeSeed) >>> 0,
    rangeSamples: opts.rangeSamples || 600,
    exactRangeBudget: opts.exactRangeBudget == null ? 20000 : opts.exactRangeBudget,
    targetSE: opts.targetSE || 0,
    maxSamples: opts.maxSamples || 64000,
  };
  // A blueprint gradeDecision for `i` is byte-identical to gradeHand's per-decision
  // output (same opts, same code path) — so the non-eligible decisions are graded
  // EXACTLY as before, and an eligible-decision fallback matches the pre-fix grade.
  const blueprintDecision = (i) => gradeDecision(strategyMap, handRecord, i, bpOpts);

  // LATENCY SHORT-CIRCUIT (Fix 1): the pre-fix path ran the full synchronous
  // blueprint Monte-Carlo grade for EVERY decision (incl. the ~10s 7th-street
  // eligible one) and THEN overlaid the oracle — so an eligible decision paid
  // ~14s (blueprint MC + oracle). Here we grade each hero decision at most once:
  //   • ORACLE-ELIGIBLE 7th-street decision  -> go STRAIGHT to the oracle with a
  //     light {gradeIdx} stub; the ~10s blueprint MC is NOT computed unless the
  //     oracle FALLS BACK (overlayOracleGrade calls opts.blueprintGrade() then).
  //   • every other decision (3rd–6th, non-hero-to-act) -> blueprint grade,
  //     UNCHANGED from gradeHand.
  const grades = [];
  for (let i = 0; i < handRecord.decisions.length; i++) {
    const dec = handRecord.decisions[i];
    if (!dec.isHero) continue;
    if (oracleEligible(handRecord, i)) {
      // Eligible: skip the blueprint MC; oracle grades directly. The blueprint
      // grade is available ONLY on fallback, computed lazily inside the overlay.
      const stub = { gradeIdx: i };
      grades.push(await overlayOracleGrade(oracle, game, strategyMap, handRecord,
        stub, Object.assign({}, o, { blueprintGrade: () => blueprintDecision(i) })));
    } else if (oracleEligible6th(handRecord, i)) {
      // 6th-street eligible: bucketed 6th->7th oracle (approximate, shown-not-charged).
      const stub = { gradeIdx: i };
      grades.push(await overlayOracleGrade6th(oracle, game, strategyMap, handRecord,
        stub, Object.assign({}, o, { blueprintGrade: () => blueprintDecision(i) })));
    } else if ((game.id === 'razz' || game.id === 'razzv1' || game.id === 'razzv2')
               && oracleEligible5th(handRecord, i)) {
      // 5th-street eligible (razz only — its 6th net is the depth-limited leaf):
      // net-leaf 5th oracle (approximate laddered, shown-not-charged).
      const stub = { gradeIdx: i };
      grades.push(await overlayOracleGrade5th(oracle, game, strategyMap, handRecord,
        stub, Object.assign({}, o, { blueprintGrade: () => blueprintDecision(i) })));
    } else {
      // Non-eligible: blueprint grade, byte-identical to the default gradeHand path.
      const bp = blueprintDecision(i);
      grades.push(await overlayOracleGrade(oracle, game, strategyMap, handRecord, bp, o));
    }
  }
  return {
    game: game.id,
    heroSeat: handRecord.heroSeat,
    utility: handRecord.utility,
    grades,
    oracleGraded: true,
  };
}

// ── public entry ───────────────────────────────────────────────────────
function gradeHand(handRecord, blueprint, opts = {}) {
  const strategyMap = strategyMapOf(blueprint);
  const o = {
    game: opts.game || DEFAULT_GAME,
    samples: opts.samples || 2000,
    crn: opts.crn !== false,
    crnSeed: (opts.seed == null ? 0xC0FFEE : opts.seed) >>> 0,
    rangeSeed: (opts.rangeSeed == null ? 0xBEEF : opts.rangeSeed) >>> 0,
    rangeSamples: opts.rangeSamples || 600,
    // Budget large enough that the opponent's down-card range is ENUMERATED
    // EXACTLY at every street: the largest case is 7th street (opp holds 3 down
    // cards from a ~40-card unseen pool => C(40,3) ≈ 9880 combos). Enumerating
    // the range is what unlocks the noise-free exact-forward 7th-street EV. Lower
    // it only to trade precision for speed.
    exactRangeBudget: opts.exactRangeBudget == null ? 20000 : opts.exactRangeBudget,
    targetSE: opts.targetSE || 0,        // adaptive: grow samples until evLoss SE < this
    maxSamples: opts.maxSamples || 64000, // adaptive cap
  };
  const grades = [];
  for (let i = 0; i < handRecord.decisions.length; i++) {
    if (!handRecord.decisions[i].isHero) continue;
    grades.push(gradeDecision(strategyMap, handRecord, i, o));
  }
  return {
    game: o.game.id,
    heroSeat: handRecord.heroSeat,
    utility: handRecord.utility,
    grades,
  };
}

module.exports = {
  gradeHand,
  gradeHandWithOracle,
  overlayOracleGrade,
  buildOracleSpot,
  oracleCandidates,
  oracleEligible,
  entryPrior,
  stud8EntryTier,
  STUD8_ENTRY_W,
  studStrengthScorer,
  STUD_RANGE_FLAG,
  gradeDecision,
  reachWeight,
  unseenForOpp,
  rolloutAfterAction,
  lookup,
  cloneState,
  sigmaAction,
};

// ── CLI ──
//   node solver/razz-trainer/grade.js --selftest               (razz gates)
//   node solver/razz-trainer/grade.js --selftest --game stud8  (stud8 gates)
//   node solver/razz-trainer/grade.js --demo [--game stud8]    (grade one hand)
if (require.main === module) {
  const gameArg = process.argv.find(a => a.startsWith('--game='));
  const gameId = gameArg ? gameArg.split('=')[1]
    : (process.argv.includes('--game') ? process.argv[process.argv.indexOf('--game') + 1] : 'razz');
  if (process.argv.includes('--selftest')) {
    require('./grade.test.js').run(gameId);
  } else if (process.argv.includes('--demo')) {
    const fs = require('fs'), path = require('path');
    const play = require('./play');
    const gameMod = require(`../games/${gameId}-game`);
    const bp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'strategies', `${gameId}.json`), 'utf8'));
    const { makeRng } = require('../engine/cards');
    const seedArg = process.argv.find(a => a.startsWith('--seed='));
    const seed = seedArg ? parseInt(seedArg.split('=')[1], 10) : ((Math.random() * 1e9) >>> 0);
    const rec = play.dealHand(bp, { rng: makeRng(seed), heroSeat: 0, game: gameMod });
    const g = gradeHand(rec, bp, { samples: 2000, seed, game: gameMod });
    console.log(`${gameMod.name} hand (seed ${seed}); hero seat ${rec.heroSeat}; net result ${rec.utility[rec.heroSeat]} chips\n`);
    for (const gr of g.grades) {
      const mix = gr.gtoMix.actions.map((a, i) => `${a}:${(gr.gtoMix.probs[i] * 100).toFixed(0)}%`).join(' ');
      const evs = gr.gtoMix.actions.map(a => `${a}=${gr.perActionEV[a].toFixed(2)}`).join(' ');
      console.log(`${gr.streetName} | hero ${gr.heroCards.down.join('')}(${gr.heroCards.up.join(' ')}) vs opp up ${gr.oppUp.join(' ')}`);
      console.log(`   GTO mix [${mix}]${gr.trained ? '' : ' (UNTRAINED→uniform)'}`);
      console.log(`   EV(chips) [${evs}]  (${gr.forwardMode}, ${gr.rangeMode}, ${gr.rangeCombos} opp combos)`);
      console.log(`   chose '${gr.chosen}', best '${gr.bestAction}', evLoss ${gr.evLoss.toFixed(2)} ± ${gr.evLossSE.toFixed(2)} chips\n`);
    }
  } else {
    console.log('usage: node grade.js [--selftest | --demo [--seed=N]]');
  }
}
