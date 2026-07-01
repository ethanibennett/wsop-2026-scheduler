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
const { makeDeck, makeRng, cardStr } = require('../engine/cards');
const { strategyMapOf } = require('./play');

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
// cards are dealt, so the rollout is deterministic given oppDown -> exact.)
function dealFreeForward(snap) {
  return snap.street === 4; // 7th street: only betting remains
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
    // deal-free: one deterministic rollout per (action, candidate). No rng noise
    // except CRN is irrelevant (no draws). EV is EXACT given the range.
    const util = {}; // util[a] = array aligned with candidates
    for (const a of acts) {
      util[a] = new Array(candidates.length);
      for (let i = 0; i < candidates.length; i++) {
        const u = rolloutAfterAction(game, strategyMap, st0, heroSeat, a, candidates[i].hand,
          sharedPool, makeRng(crnSeed)); // rng unused (no deals) but harmless
        util[a][i] = u[heroSeat];
      }
    }
    finalizeEV(acts, candidates, util, ev, se);
    // exact-forward: EV is deterministic given the enumerated range -> SE = 0.
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
