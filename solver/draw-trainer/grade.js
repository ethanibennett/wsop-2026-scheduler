// ── Draw trainer: GRADING engine (td27 / draw games) ──────────────────────────
// gradeHand(handRecord, blueprint, {game, seed, samples, N}) -> per-hero-decision
// grades. Built on the lbr-draw.js PARTICLE machinery, NOT on the razz-trainer's
// fixed-hidden-card reach-weighting (which has no draw analogue: the opponent
// DRAWS new hidden cards three times, so its hidden hand is not a fixed combo we
// can enumerate — it is a belief that is reshaped by every draw).
//
// CORE INSIGHT — a DRAW node and a BET node are the SAME to the grader. At any
// hero node, game.legalActions(st) returns betting actions (['f','c','r'] /
// ['k','b']) OR draw-count actions (['d0','d2',...]); game.infosetKey(st) returns
// the right key either way. EV grading is, with ZERO draw-special-casing in the
// EV math:
//     enumerate legalActions; roll each to terminal under σ + chance;
//     EV(a) = value; bestEV = max_a EV(a); evLoss = bestEV − EV(chosen).
// ALL draw-specificity lives in the OPPONENT POSTERIOR (the particle filter):
//   • OPPONENT BET a  → reweightOnAction(σ, particle→bucket→infoset→σ(a)); resample
//                       if ESS < N/2.
//   • OPPONENT DRAW K → resampleOnDraw (cfg.chooseKeep picks discards, draw K fresh
//                       from the per-particle unseen pool).
//   • HERO action/draw → just advance the state; NO belief update (hero's cards
//                       are known to the grader; only the opponent is hidden).
// After replaying the observed line to the graded node, the (normalized) particle
// set IS the opponent range.
//
// PER-ACTION EV uses COMMON RANDOM NUMBERS (CRN): ONE shared shuffled unseen pool
// + ONE crn seed across ALL actions, the SAME top-weighted particles for each →
// the EV *differences* (= evLoss) are low-variance even when absolute EVs are
// noisy. Rollout continuation = 'sigma' (the blueprint), NOT 'aggro' (aggro forces
// a natural draw and biases bet-continuations — wrong for grading a fixed σ).
//
// EXACT-FORWARD ANCHOR — when snap.street===3 && snap.phase==='bet' (after the
// 3rd/last draw, no cards remain in either hand's future) the forward tree is
// DEAL-FREE: roll each particle to showdown with ZERO chance nodes → the EV is
// EXACT given the particle range (forward SE = 0; the only residual is the
// particle-sampled range itself). This is the trusted reference path.
//
// INSTRUMENTATION (risk mitigation): we count uniform-σ-fallback hits inside the
// posterior replay + rollouts and track ESS through the replay, and surface a
// `confidence` flag ('high'/'low') when ESS degrades or fallbacks are high.

const DEFAULT_GAME = require('../games/triple-draw-27');
const { makeRng, makeDeck, cardStr } = require('../engine/cards');
const { strategyMapOf, isExplicitDiscard, keepForDiscard, parseDiscard } = require('./play');
const lbr = require('../lbr-draw');

// Apply a hero action generically: route an EXPLICIT-discard 'd:...' through
// game.applyDraw (explicit keep = hand minus the thrown cards) and everything
// else (abstraction draw 'dK' / betting) through game.applyAction. This is the
// one seam where the per-action EV loop differs between an abstraction option and
// the hero's actual full-control discard.
function applyHeroAction(game, st, a) {
  if (isExplicitDiscard(a)) {
    return game.applyDraw(st, keepForDiscard(st.hands[st.toAct], a));
  }
  return game.applyAction(st, a);
}

const {
  initParticles, reweightOnAction, resampleOnDraw, unseenUniverse,
  effectiveSampleSize, resampleByWeight, topByWeight, oppInfosetKey,
  rolloutValue, sigmaAction, normalize,
} = lbr;

// ── blueprint lookup (canonical contract) — also the σ-fallback INSTRUMENT ─────
function lookup(strategyMap, key, acts) {
  const node = strategyMap[key];
  if (node && node.a.length === acts.length && node.a.every((a, i) => a === acts[i])) {
    return { probs: node.p.slice(), trained: true };
  }
  return { probs: acts.map(() => 1 / acts.length), trained: false };
}

// Clone a snapshot into a fresh mutable draw-game state (mirrors draw-game.clone
// / lbr-draw.cloneState — every field the engine reads).
function cloneState(s) {
  return {
    deck: s.deck.slice(),
    hands: [s.hands[0].slice(), s.hands[1].slice()],
    street: s.street, phase: s.phase, toAct: s.toAct,
    bets: s.bets, contrib: s.contrib.slice(), acted: s.acted.slice(),
    folded: s.folded, hist: s.hist, curSeq: s.curSeq,
    pendingDraw: s.pendingDraw ? { player: s.pendingDraw.player, count: s.pendingDraw.count } : null,
    drawCounts: [s.drawCounts[0].slice(), s.drawCounts[1].slice()],
    discards: [s.discards[0].slice(), s.discards[1].slice()],
    log: [],
  };
}

// ── OPPONENT POSTERIOR via the particle filter ────────────────────────────────
// Replay the observed line (handRecord.decisions[0..gradeIdx)) from a fresh
// pre-draw state, maintaining N particles = candidate OPPONENT hands consistent
// with the public state + the hero's dead cards. Returns { parts, st, ess[],
// fallbacks } where `parts` (normalized) is the opponent range at the graded node
// and `st` is the live state at that node (hero's real hand installed).
//
// We re-derive the live state by re-applying the recorded actions to a fresh
// newHand-shaped root whose hands are the REAL dealt hands — but we cannot know
// the real shuffle, so instead we drive the engine off the graded snapshot's deck
// for hero's own future draws and use the recorded chosen actions for both seats.
// Simpler + exact: the graded decision's stored snapshot IS the live state at the
// graded node (toAct === hero). We only need to walk the PRIOR decisions to build
// the belief; the belief update at each opponent node uses that node's stored
// snapshot (which carries the correct contrib/curSeq/drawCounts/hero-hand), with
// the opponent's hand swapped per particle via oppInfosetKey / the engine.
function buildPosterior(game, strategyMap, handRecord, gradeIdx, heroSeat, N, rng, instr) {
  const opp = 1 - heroSeat;
  const handSize = game.cfg.handSize;
  // Init from the FIRST decision's snapshot (pre-draw root): the unseen universe
  // there is the full deck minus hero's 5 cards. (discards are empty pre-draw.)
  const root = handRecord.decisions[0].state;
  let parts = initParticles(root, heroSeat, N, handSize, rng);
  const ess = [effectiveSampleSize(parts)];

  for (let i = 0; i < gradeIdx; i++) {
    const d = handRecord.decisions[i];
    const snap = d.state;
    if (d.actor === opp) {
      // OPPONENT node — update the belief.
      if (d.phase === 'draw') {
        // Draw declaration: the count is public. The belief shift happens on the
        // DRAW itself (resample the particles by the observed count from the
        // per-particle unseen pool). draw-game declares the count then a chance
        // node deals; we fold both into one resampleOnDraw here.
        const K = parseInt(d.chosen.slice(1), 10);
        if (K > 0) {
          const pool = unseenUniverse(snap, heroSeat);
          resampleOnDraw(game, snap, heroSeat, parts, K, pool, rng);
        }
        // (K === 0 = pat: belief unchanged.)
      } else {
        // Betting action: reweight by σ(observed action | particle).
        const acts = d.acts;
        const ai = acts.indexOf(d.chosen);
        instr.fallbacks += countFallback(strategyMap, game, snap, heroSeat, parts, acts);
        // reweightOnAction returns FALSE when every particle weight collapsed to ~0
        // and normalize() had to RESET the population to UNIFORM (the observed
        // action was σ-prob-zero under every particle → the belief learned nothing
        // and is now maximally uninformed). Count those collapses: any EV computed
        // off a collapsed posterior is against a WRONG range and must be flagged.
        const updated = reweightOnAction(strategyMap, game, snap, heroSeat, parts, acts, ai);
        if (!updated) instr.collapses++;
        if (effectiveSampleSize(parts) < N / 2) parts = resampleByWeight(parts, rng);
      }
    } else {
      // HERO node — known cards; NO belief update. (Hero's own draw shrinks the
      // unseen universe for FUTURE opponent resamples, but the opponent-pool used
      // by resampleOnDraw is recomputed from the then-current snapshot, which
      // already reflects hero's discards, so nothing to do here.)
    }
    ess.push(effectiveSampleSize(parts));
  }
  // Final normalize after the replay. If THIS collapses (e.g. the last update left
  // every weight at ~0), it also degrades the range — count it too.
  if (!normalize(parts)) instr.collapses++;
  return { parts, ess, fallbacks: instr.fallbacks, collapses: instr.collapses };
}

// Count how many particles hit the uniform-σ fallback at this opponent betting
// node (instrument only — does NOT change the reweight, which uses probsOf with
// the same fallback semantics).
function countFallback(strategyMap, game, snap, heroSeat, parts, acts) {
  let n = 0;
  for (const p of parts) {
    const key = oppInfosetKey(game, snap, heroSeat, p.hand);
    const node = strategyMap[key];
    const trained = node && node.a.length === acts.length && node.a.every((a, i) => a === acts[i]);
    if (!trained) n++;
  }
  return n;
}

// Clone `st` and install the opponent's particle hand + an empty deck (deal-free).
function install(st, heroSeat, oppHand) {
  const n = cloneState(st);
  n.hands[1 - heroSeat] = oppHand.slice();
  n.deck = [];
  return n;
}

// EXACT expectation of hero's terminal utility over the σ-mixed betting subtree,
// for a DEAL-FREE state (street-3 bet, no chance nodes). Enumerates every action
// at every node, weighting by σ(action). Both seats play σ (this is the grade of
// a fixed blueprint, hero already committed the graded action upstream). Returns a
// noise-free number → the forward SE is genuinely 0. The subtree is tiny (a
// capped HU limit betting round), so full enumeration is cheap.
function exactSigmaValue(strategyMap, game, st, heroSeat) {
  if (game.isTerminal(st)) return game.utility(st)[heroSeat];
  const acts = game.legalActions(st);
  const { probs } = lookup(strategyMap, game.infosetKey(st), acts);
  let v = 0;
  for (let i = 0; i < acts.length; i++) {
    if (probs[i] <= 0) continue;
    v += probs[i] * exactSigmaValue(strategyMap, game, game.applyAction(st, acts[i]), heroSeat);
  }
  return v;
}

// ── per-action EV (CRN), with a deal-free EXACT-FORWARD branch ─────────────────
// Returns { ev:{id:chips}, util:{id:[per-particle]}|null, used, exact }.
// `st` is the live graded state (hero's real hand installed, toAct === hero).
function perActionEV(game, strategyMap, st, heroSeat, acts, parts, opts) {
  const evParticles = opts.evParticles;
  const used = evParticles && evParticles < parts.length ? topByWeight(parts, evParticles) : parts;
  // ADAPTIVE VARIANCE REDUCTION (evRepeats) — each USED particle is rolled out R
  // times with INDEPENDENT future-card streams (the chance nodes inside the
  // forward tree), and the per-particle utility is the average of those R
  // rollouts. This drives down the MONTE-CARLO noise component of each particle's
  // value WITHOUT touching the posterior population (N) or which particles are
  // used — so the EXACT-FORWARD path (deal-free, deterministic) is byte-identical
  // at any R (its R rollouts are all the same number), and the exact-forward
  // grades never move when adaptive sampling is turned on. Default R=1 = legacy.
  const repeats = Math.max(1, opts.evRepeats || 1);

  // ONE shared shuffled unseen pool for ALL actions (CRN). unseenUniverse(st,hero)
  // excludes hero's cards + hero's discards; it INCLUDES the opponent's (unknown)
  // real hand — exactly the pool the LBR rolls from.
  const pool = unseenUniverse(st, heroSeat);
  const sp = pool.slice();
  for (let i = sp.length - 1; i > 0; i--) {
    const j = Math.floor(opts.shuffleRng() * (i + 1));
    const t = sp[i]; sp[i] = sp[j]; sp[j] = t;
  }
  // R distinct CRN seeds (one per rollout repeat), SHARED across all actions so
  // every action sees the identical R future-card streams per particle (the
  // common-random-numbers pairing that keeps the evLoss difference low-variance).
  const crnSeeds = new Array(repeats);
  for (let k = 0; k < repeats; k++) crnSeeds[k] = (opts.shuffleRng() * 0xffffffff) >>> 0;

  // EXACT-FORWARD predicate: after the 3rd (last) draw, the betting round is
  // deal-free → no chance nodes → deterministic rollout per particle → EXACT EV.
  const exact = st.street === 3 && st.phase === 'bet';

  // Continuation policy for the rollout. PRODUCTION default 'sigma' (the hero
  // plays the blueprint after the graded action — the faithful grade). The gate
  // suite passes 'passive' for the isolated monotone-DRAW spots so the hand is
  // CHECKED DOWN to a guaranteed showdown, exposing the draw's SHOWDOWN value
  // without σ folding the betting out first (a synthetic-spot artefact, not a
  // property of the draw). 'sigma'/'passive'/'aggro' all come from lbr-draw.
  const rolloutMode = opts.rolloutMode || 'sigma';
  const isExact = exact && rolloutMode === 'sigma';

  const ev = {}, util = {};
  for (const a of acts) {
    const st2 = applyHeroAction(game, st, a);
    const col = new Array(used.length);
    let wsum = 0, m = 0;
    for (let i = 0; i < used.length; i++) {
      const p = used[i];
      let u;
      if (isExact) {
        // EXACT-FORWARD: the betting round past a street-3 action is deal-free AND
        // (under the σ continuation) finite, so we take the EXACT EXPECTATION over
        // σ by enumerating the betting subtree weighted by σ probs — forward SE = 0,
        // no sampling, and the repeats loop is a no-op (every term is identical).
        u = exactSigmaValue(strategyMap, game, install(st2, heroSeat, p.hand), heroSeat);
      } else {
        // MC-FORWARD: average R independent rollouts (chance nodes remain). Each
        // repeat re-seeds from a SHARED crnSeed → identical future-card stream and
        // σ-sampling across actions (common random numbers).
        let acc = 0;
        for (let k = 0; k < repeats; k++) {
          const rng = makeRng(crnSeeds[k]);
          acc += rolloutValue(strategyMap, game, st2, heroSeat, p.hand, sp, rng, rolloutMode);
        }
        u = acc / repeats;
      }
      col[i] = u;
      m += p.w * u; wsum += p.w;
    }
    ev[a] = wsum > 0 ? m / wsum : 0;
    util[a] = col;
  }
  return { ev, util, used, exact };
}

// SE of (ev[best] - ev[chosen]) as a paired difference across the (weighted)
// particle column. For exact-forward the forward tree is deterministic, so the
// only randomness is the particle SAMPLING of the range — we report the weighted
// paired SE of the realised per-particle differences either way (it is the SE of
// the evLoss *estimate* given this finite particle set).
function pairedSE(res, best, chosen, used) {
  if (best === chosen) return 0;
  const ub = res.util[best], uc = res.util[chosen];
  // normalize weights over `used`
  let z = 0; for (const p of used) z += p.w;
  if (z <= 0) return 0;
  const dm = res.ev[best] - res.ev[chosen];
  let v = 0, sumw2 = 0;
  for (let i = 0; i < used.length; i++) {
    const w = used[i].w / z;
    const di = ub[i] - uc[i];
    v += w * (di - dm) * (di - dm);
    sumw2 += w * w;
  }
  return Math.sqrt(v * sumw2);
}

// ── grade ONE hero decision ───────────────────────────────────────────────────
function gradeDecision(game, strategyMap, handRecord, gradeIdx, opts) {
  const d = handRecord.decisions[gradeIdx];
  const snap = d.state;
  const heroSeat = d.actor;
  const acts = d.acts;
  const kind = snap.phase === 'draw' ? 'draw' : 'bet';

  // 1. GTO mix at the node (bet OR draw) — direct σ lookup. node.a must equal acts
  //    positionally or it is a uniform fallback (instrumented as UNTRAINED).
  const look = lookup(strategyMap, d.key, acts);
  const gtoMix = {
    actions: acts.slice(),
    labels: acts.map(a => game.actionLabel(a, snap)),
    probs: look.probs.slice(),
    trained: look.trained,
  };

  // 2. Opponent posterior via the particle filter (replay the observed line).
  const instr = { fallbacks: 0, collapses: 0 };
  const post = buildPosterior(
    game, strategyMap, handRecord, gradeIdx, heroSeat, opts.N,
    makeRng((opts.seed ^ (gradeIdx * 0x9e3779b1)) >>> 0), instr);
  const parts = post.parts;
  const essAtNode = post.ess[post.ess.length - 1];
  const essMin = Math.min(...post.ess);

  // 2b. FULL DISCARD CONTROL — is the hero's chosen action an EXPLICIT discard
  //     ('d:...') rather than one of the abstraction draw options? If so we grade
  //     the hero's ACTUAL discard alongside the abstraction options on the SAME
  //     CRN particle set + shared pool. The abstraction options (pat / natural,
  //     via chooseKeep) remain the BENCHMARK the evLoss is measured against; the
  //     hero's discard is an extra column in the per-action EV table.
  const explicitHero = kind === 'draw' && isExplicitDiscard(d.chosen);
  // The EV action list: abstraction options always; the hero's explicit discard
  // appended (deduped — it never positionally equals a 'dK' string).
  const evActs = explicitHero && acts.indexOf(d.chosen) < 0 ? acts.concat([d.chosen]) : acts;

  // 3. Per-action EV (CRN; exact-forward on street-3 bet; explicit-keep apply for
  //    the hero's 'd:...' column).
  //
  // ADAPTIVE SAMPLING (opts.targetSE) — the EARLY-street / mc-forward nodes carry
  // chance nodes in their forward tree, so each per-particle rollout is a single
  // sampled future-card stream → the paired evLoss estimate has real MC variance
  // (±1.5–2 chips at the base budget). We DRIVE that variance down to a target by
  // AVERAGING MORE INDEPENDENT ROLLOUTS PER PARTICLE (evRepeats): re-run
  // perActionEV with a doubling repeat count until the node's paired evLoss SE ≤
  // opts.targetSE, capped at opts.maxRepeats.
  //
  // Why repeats and NOT a bigger particle population: growing N (or evParticles)
  // would RESAMPLE the posterior range, which would silently CHANGE the trusted
  // EXACT-FORWARD grades (their EV is an exact expectation over the sampled
  // range). evRepeats leaves N, evParticles, and the particle set byte-identical
  // to legacy — it only reduces the Monte-Carlo chance-node noise. So:
  //   • exact-forward nodes are UNCHANGED at any repeat count (deterministic tree
  //     → every repeat returns the same number → the loop bails on the first pass
  //     since res.exact is true);
  //   • best===chosen nodes have SE===0 and bail immediately (no extra rollouts);
  //   • only the genuinely-noisy mc-forward nodes pay for more rollouts.
  // Each repeat round re-derives a strict SUPERSET of CRN seeds (shuffleRng is
  // re-seeded from shuffleSeed each round), so the estimate is consistent as the
  // budget grows rather than jittering.
  const live = cloneState(snap); // hero's real hand already installed
  const shuffleSeed = (opts.seed ^ 0x51ed270b ^ (gradeIdx * 0x85ebca6b)) >>> 0;
  const maxRepeats = opts.targetSE ? Math.max(1, opts.maxRepeats || 1) : 1;

  function evalAt(repeats) {
    const res = perActionEV(game, strategyMap, live, heroSeat, evActs, parts, {
      evParticles: opts.evParticles,
      evRepeats: repeats,
      shuffleRng: makeRng(shuffleSeed),
    });
    // best ABSTRACTION action + evLoss (>= 0). The benchmark is the EV-best
    // abstraction option (pat / natural), NOT the hero's discard column — the hero
    // is graded against what the blueprint offers.
    let bestA = acts[0], bestEV = -Infinity;
    for (const a of acts) if (res.ev[a] > bestEV) { bestEV = res.ev[a]; bestA = a; }
    const chosenEV = res.ev[d.chosen];
    // evLoss = max(bestEV, 0-clamp) − heroEV, clamped >= 0. The 0-clamp guards the
    // (rare) case where every abstraction option is itself −EV: the hero is never
    // charged for "failing" to find a negative-EV line.
    const evLoss = Math.max(0, Math.max(bestEV, 0) - chosenEV);
    const evLossSE = pairedSE(res, bestA, d.chosen, res.used);
    return { res, bestA, bestEV, evLoss, evLossSE };
  }

  let repeats = 1;
  let r = evalAt(repeats);
  let sampleRounds = 1;
  // Adaptive refinement: only when a finite targetSE is requested, the node is a
  // sampling (mc-forward) node, and the current SE exceeds the target (SE===0
  // means best===chosen or a deterministic tree → nothing to refine).
  while (opts.targetSE && !r.res.exact && r.evLossSE > opts.targetSE && repeats < maxRepeats) {
    repeats = Math.min(repeats * 2, maxRepeats);
    r = evalAt(repeats);
    sampleRounds++;
  }
  const res = r.res;
  const bestA = r.bestA, bestEV = r.bestEV;
  const evLoss = r.evLoss, evLossSE = r.evLossSE;
  const chosenEV = res.ev[d.chosen];
  const repeatsUsed = repeats;            // independent rollouts/particle (1 = legacy)

  // ── off-book / note instrumentation (explicit-discard hero only) ────────────
  let offBookCount = false, discardNote = null, heroDrawCount = null;
  let heroActionLabel = game.actionLabel(d.chosen, snap);
  if (explicitHero) {
    const thrown = parseDiscard(d.chosen);
    heroDrawCount = thrown.length;
    const handAtNode = snap.hands[heroSeat];
    const offered = game.cfg.drawOptions(handAtNode); // counts the abstraction models
    offBookCount = offered.indexOf(heroDrawCount) < 0;
    // Did the hero's discard equal cfg.chooseKeep(count)'s thrown cards for an
    // OFFERED count? (i.e. the recommended natural discard.) chooseKeep returns
    // the KEPT cards; the thrown set is the hand minus those.
    let isRecommended = false;
    if (!offBookCount && heroDrawCount > 0) {
      const keep = new Set(game.cfg.chooseKeep(handAtNode, heroDrawCount));
      const recThrown = new Set(handAtNode.filter(c => !keep.has(c)));
      const heroThrown = new Set(thrown);
      isRecommended = recThrown.size === heroThrown.size &&
        [...heroThrown].every(c => recThrown.has(c));
    } else if (!offBookCount && heroDrawCount === 0) {
      isRecommended = true; // pat = the abstraction's pat, trivially
    }
    discardNote = isRecommended
      ? 'kept your best low cards (the recommended draw)'
      : 'non-standard keep / off-book count — EV is an estimate';
    heroActionLabel = labelDiscard(game, d.chosen, heroDrawCount);
  }

  // confidence flag from the particle-filter health instruments.
  const fallbackRate = instr.fallbacks /
    Math.max(1, opts.N * countOppBetNodes(handRecord, gradeIdx, heroSeat));
  // A COLLAPSE (all particle weights zeroed → normalize() reset to UNIFORM) means
  // the posterior degraded to a maximally-uninformed range while building THIS
  // node, so every EV/evLoss here is computed against a WRONG range — force low
  // confidence and surface a hard flag regardless of ESS/fallback. An OFF-BOOK
  // hero draw count (not in cfg.drawOptions) ALSO degrades the grade: the
  // continuation rollout samples the opponent's draws off the blueprint, which
  // never modelled this count, so the EV is an estimate.
  const rangeDegraded = post.collapses > 0 || offBookCount;
  const lowConf = rangeDegraded || essMin < opts.N / 4 || fallbackRate > 0.5;

  return {
    gradeIdx,
    seat: heroSeat,
    street: snap.street,
    streetName: ['Pre-draw', 'After 1st draw', 'After 2nd draw', 'After 3rd draw'][snap.street],
    phase: snap.phase,
    kind,                                // 'bet' | 'draw'
    infosetKey: d.key,
    trained: look.trained,
    heroActionId: d.chosen,              // may be an explicit 'd:...' discard
    heroActionLabel,
    explicitDiscard: explicitHero,       // true → hero used FULL DISCARD CONTROL
    heroDrawCount,                       // # cards thrown (explicit hero only)
    offBookCount,                        // count not in cfg.drawOptions(hand)
    discardNote,                         // human note (explicit hero only)
    gtoMix,                              // {actions, labels, probs, trained} — abstraction
    perActionEV: res.ev,                 // {id: chips} — abstraction options + hero discard
    bestActionId: bestA,                 // EV-best ABSTRACTION option
    bestActionLabel: game.actionLabel(bestA, snap),
    evLoss,
    evLossSE,
    forwardMode: res.exact ? 'exact-forward' : 'mc-forward',
    particlesUsed: res.used.length,    // # posterior particles in the EV rollout
    repeatsUsed,                       // independent rollouts averaged per particle
    sampleRounds,                      // adaptive doublings spent (1 = base budget)
    essAtNode,
    essMin,
    fallbackRate,
    rangeDegraded,                       // posterior collapsed OR off-book count
    confidence: lowConf ? 'low' : 'high',
  };
}

// Human label for an explicit hero discard 'd:...'. Game-generic: shows the draw
// count and the thrown cards (or "Stand Pat" for a 0-card discard).
function labelDiscard(game, action, count) {
  if (count === 0) return 'Stand Pat';
  const thrown = parseDiscard(action).map(cardStr).join(' ');
  return `Draw ${count} (discard ${thrown})`;
}

function countOppBetNodes(handRecord, gradeIdx, heroSeat) {
  const opp = 1 - heroSeat;
  let n = 0;
  for (let i = 0; i < gradeIdx; i++) {
    const d = handRecord.decisions[i];
    if (d.actor === opp && d.phase !== 'draw') n++;
  }
  return n;
}

// ── public entry ──────────────────────────────────────────────────────────────
function gradeHand(handRecord, blueprint, opts = {}) {
  const game = opts.game || DEFAULT_GAME;
  lbr.memoizeCfg(game); // patch the hot pure cfg hooks (idempotent)
  const strategyMap = strategyMapOf(blueprint);
  // ADAPTIVE SAMPLING — when opts.targetSE is set we drive each NOISY (mc-forward)
  // node's paired evLoss SE down to the target by AVERAGING MORE INDEPENDENT
  // ROLLOUTS per particle (gradeDecision doubles evRepeats up to maxRepeats). This
  // deliberately leaves N (the posterior population) AND evParticles at their
  // legacy values so the sampled opponent range — and therefore the trusted
  // EXACT-FORWARD grades — are byte-identical to non-adaptive grading; only the
  // mc-forward chance-node noise is reduced. maxRepeats (default 16) bounds the
  // per-node cost. The cheap/sharp nodes (best===chosen, exact-forward) bail on
  // the first pass, so the extra rollouts are spent only where the SE needs them.
  const targetSE = opts.targetSE || null;
  const o = {
    seed: (opts.seed == null ? 0xC0FFEE : opts.seed) >>> 0,
    N: opts.N || 200,
    // EV rollouts use the top-weighted particles to bound cost; caps at `samples`
    // (default 60) but never exceeds N.
    evParticles: opts.samples || Math.min(60, opts.N || 200),
    targetSE,                              // null = legacy fixed-budget grading
    maxRepeats: targetSE ? (opts.maxRepeats || 16) : 1,
  };
  const grades = [];
  for (let i = 0; i < handRecord.decisions.length; i++) {
    if (!handRecord.decisions[i].isHero) continue;
    grades.push(gradeDecision(game, strategyMap, handRecord, i, o));
  }
  return {
    game: game.id,
    heroSeat: handRecord.heroSeat,
    utility: handRecord.utility,
    grades,
  };
}

module.exports = {
  gradeHand,
  gradeDecision,
  buildPosterior,
  perActionEV,
  pairedSE,
  cloneState,
  lookup,
  applyHeroAction,   // route 'd:...' → applyDraw, else applyAction
  labelDiscard,
};

// ── CLI ───────────────────────────────────────────────────────────────────────
//   node solver/draw-trainer/grade.js --game td27 --selftest   (run the gates)
//   node solver/draw-trainer/grade.js --game td27 --demo --seed N  (grade 1 hand)
if (require.main === module) {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
  const gameId = arg('game', 'td27');
  const gameMod = require('../games').GAMES[gameId];
  if (!gameMod) { console.error('unknown game', gameId); process.exit(1); }

  if (process.argv.includes('--selftest')) {
    require('./grade.test.js').run(gameId);
  } else if (process.argv.includes('--demo')) {
    const fs = require('fs'), path = require('path');
    const play = require('./play');
    const bp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'strategies', `${gameId}.json`), 'utf8'));
    const seed = parseInt(arg('seed', String((Math.random() * 1e9) >>> 0)), 10);
    const N = parseInt(arg('N', '200'), 10);
    const rec = play.dealHand(bp, { rng: makeRng(seed), heroSeat: 0, game: gameMod });
    const g = gradeHand(rec, bp, { seed, N, game: gameMod });
    console.log(`${gameMod.name} hand (seed ${seed}); hero seat ${rec.heroSeat}; net ${rec.utility[rec.heroSeat]} chips; ${g.grades.length} hero decisions\n`);
    for (const gr of g.grades) {
      const mix = gr.gtoMix.actions.map((a, i) => `${gr.gtoMix.labels[i]}:${(gr.gtoMix.probs[i] * 100).toFixed(0)}%`).join(' / ');
      const evs = gr.gtoMix.actions.map(a => `${a}=${gr.perActionEV[a].toFixed(2)}`).join(' ');
      console.log(`${gr.streetName} [${gr.kind}] — you played "${gr.heroActionLabel}"`);
      console.log(`   GTO: ${mix}${gr.trained ? '' : ' (UNTRAINED→uniform)'}`);
      console.log(`   EV(chips): ${evs}   (${gr.forwardMode}, ${gr.particlesUsed}p, ESS@node ${gr.essAtNode.toFixed(0)})`);
      console.log(`   best "${gr.bestActionLabel}", evLoss ${gr.evLoss.toFixed(3)} ± ${gr.evLossSE.toFixed(3)} [${gr.confidence}${gr.rangeDegraded ? ', RANGE-DEGRADED (posterior collapsed to uniform)' : ''}]\n`);
    }
  } else if (process.argv.includes('--collapse-demo')) {
    // FIX-1 verification: a node FOLLOWING a σ-prob-0 opponent action must now be
    // flagged low-confidence / rangeDegraded. We construct a deterministic record
    // where the opponent is observed to CALL while the graded strategy assigns
    // call-prob 0 at EVERY particle's infoset — exactly the production trigger
    // (an observed action that is σ-0 under every particle, which zeroes all
    // weights so normalize() resets the belief to UNIFORM). Before the fix this
    // node still reported confidence:'high'; now it must be 'low' + rangeDegraded.
    const fs = require('fs'), path = require('path');
    const play = require('./play');
    const { cardFromStr } = require('../engine/cards');
    const H = s => s.split(' ').map(cardFromStr);
    const bpReal = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'strategies', `${gameId}.json`), 'utf8'));
    lbr.memoizeCfg(gameMod);
    // hero (seat 0) and opp (seat 1) both hold made lows so the draws auto-pat and
    // the graded hero node is the street-1 check that FOLLOWS the opponent's call.
    const cards = { hands: [H('8s 6d 5c 3h 2s'), H('7d 6c 5h 4d 2c')], future: [] };
    const line = [{ actor: 0, action: 'r' }, { actor: 1, action: 'c' },
                  { actor: 1, action: 'k' }, { actor: 0, action: 'k' }];
    const rec = play.buildHandRecord(cards, line, { heroSeat: 0, blueprint: bpReal, game: gameMod });
    // Build a grading strategy whose every opponent infoset at the CALL node has
    // p(call)=0 (always-raise): cover every reachable particle key.
    const callSnap = rec.decisions[1].state, acts = rec.decisions[1].acts, opp = 1;
    const seen = new Set(callSnap.hands[0]); const pool = [];
    for (let c = 0; c < 52; c++) if (!seen.has(c)) pool.push(c);
    const krng = makeRng(1);
    const draw5 = () => { const a = pool.slice(), o = []; for (let i = 0; i < 5; i++) { const j = Math.floor(krng() * a.length); o.push(a[j]); a[j] = a[a.length - 1]; a.pop(); } return o; };
    const built = {};
    for (let t = 0; t < 60000; t++) {
      const h = draw5(); const sv = callSnap.hands[opp]; callSnap.hands[opp] = h;
      const k = gameMod.infosetKey(callSnap); callSnap.hands[opp] = sv;
      if (!built[k]) built[k] = { a: acts.slice(), p: [0, 0, 1] }; // call is hard-0
    }
    const g = gradeHand(rec, { strategy: built }, { seed: 0xC0FFEE, N: 200, game: gameMod });
    console.log(`FIX-1 collapse verification (${gameMod.name}) — opponent takes a σ-prob-0 CALL:\n`);
    for (const gr of g.grades) {
      const flag = gr.rangeDegraded ? 'RANGE-DEGRADED (posterior collapsed to uniform)' : 'ok';
      console.log(`  ${gr.streetName} [${gr.kind}] "${gr.heroActionLabel}": confidence=${gr.confidence}  rangeDegraded=${gr.rangeDegraded}  essMin=${gr.essMin.toFixed(0)}  -> ${flag}`);
    }
    const pre = g.grades.find(x => x.street === 0);
    const post = g.grades.find(x => x.street === 1);
    const ok = pre && !pre.rangeDegraded && pre.confidence === 'high'
            && post && post.rangeDegraded && post.confidence === 'low';
    console.log(`\n  ${ok ? 'PASS' : 'FAIL'} — the pre-collapse node is high-confidence; the post-σ-0-action node is flagged low/rangeDegraded` +
      `${post && post.essMin >= 200 ? ' (and note essMin=200, so ONLY the collapse flag catches it — ESS would have missed it)' : ''}.`);
    process.exit(ok ? 0 : 1);
  } else {
    console.log('usage: node grade.js --game td27 [--selftest | --demo --seed N | --collapse-demo]');
  }
}
