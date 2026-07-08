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
// Shared, game-agnostic RANGE-SENSITIVE honesty flag (also used by the stud
// grader razz-trainer/grade.js — the two share the "re-solve vs an assumed
// opponent range" pattern).
const { computeRangeSensitivity } = require('../razz-trainer/range-sensitivity');

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
    // evLoss = how much worse the chosen action is than the best legal option,
    // clamped >= 0. NO benchmark clamp: when every option is itself −EV (hero in a
    // losing spot), playing the BEST option is still 0 loss — we grade DECISION
    // quality, not the spot. Matches the stud grader (razz-trainer/grade.js).
    const evLoss = Math.max(0, bestEV - chosenEV);
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

// ── TRUE-GTO POST-LAST-DRAW ORACLE grading (opt-in, behind a flag) ─────────────
// The blueprint grader charges evLoss vs its own bucketed self. On the FINAL
// betting round (street 3, after the 3rd/last draw — a real showdown, deal-free,
// no chance ahead) we can instead source the grade from the neural exact draw
// re-solver's TRUE-GTO per-action EV (solver/neural/resolve_draw_final.py via
// oracle_worker.py, routed by oracle-bridge.js). This is the draw analogue of the
// SHIPPED stud 7th-street oracle (solver/razz-trainer/grade.js) — the exact same
// overlay-or-fall-back-to-blueprint shape.
//
// SCOPE: post-last-draw (street 3) hero BET decisions ONLY, for badugi + td27
// (the two games with an M2 resolver — DRAW_FINAL_GAMES). Every OTHER hero
// decision (earlier streets, every DRAW decision, the street-3 bet for a5td which
// has no resolver) stays on the blueprint grade. Any oracle failure (worker down,
// range empty, action-set mismatch, timeout) falls back to the blueprint grade
// for that decision, tagged honestly (gradeSource:'blueprint').

// The games that HAVE an exact post-last-draw resolver. a5td is deliberately
// absent — it has no M2 resolver (see resolve_draw_final.DRAW_FINAL_GAMES), so it
// is never offered the oracle and always grades via the blueprint.
const ORACLE_DRAW_GAMES = new Set(['badugi', 'td27']);

// Which blueprint grades are eligible for an oracle override?
//   - street 3 (the post-3rd-draw final betting round), no draws remaining,
//   - a BET decision (phase === 'bet') — the resolver's root is a betting node,
//   - the hero is to act (snap.toAct === d.actor).
// The exact-forward anchor the blueprint grader trusts is exactly this node
// (snap.street === 3 && snap.phase === 'bet'); the oracle re-solves the SAME node
// as a full equilibrium instead of a σ-expectation over the blueprint.
function oracleEligible(game, handRecord, gradeIdx) {
  if (!game || !ORACLE_DRAW_GAMES.has(game.id)) return false;
  const d = handRecord.decisions[gradeIdx];
  const snap = d.state;
  if (!snap || snap.street !== 3 || snap.phase !== 'bet') return false; // post-last-draw bet only
  if (snap.toAct !== d.actor) return false;                            // hero to act
  return true;
}

// Deduplicate a particle set into [{hand:[ints], w}] and, when wider than `cap`,
// take a SYSTEMATIC (evenly-strided) sample across the reach-sorted range — a
// representative miniature of the whole posterior. This is the SAME sampler the
// draw mis-grade study uses (solver/neural/draw_misgrade_study.js particlesToRange):
// NOT a top-K-by-mass head, which the stud oracle proved biases the solve on a
// flat range (the "flat-range top-K trap"). Weights are the retained holdings'
// own reach, renormalized. Returns { range:[{hand,w}], distinct } (distinct = the
// pre-cap combo count, for diagnostics).
function particlesToRange(parts, cap) {
  const acc = new Map();
  for (const p of parts) {
    if (!(p.w > 0)) continue;
    const key = p.hand.slice().sort((a, b) => a - b).join(',');
    const e = acc.get(key);
    if (e) e.w += p.w;
    else acc.set(key, { hand: p.hand.slice().sort((a, b) => a - b), w: p.w });
  }
  let cands = [...acc.values()];
  cands.sort((a, b) => b.w - a.w);
  const distinct = cands.length;
  let kept = cands;
  if (cap > 0 && cands.length > cap) {
    const stride = cands.length / cap;
    kept = [];
    for (let i = 0; kept.length < cap && Math.floor(i) < cands.length; i += stride) {
      kept.push(cands[Math.floor(i)]);
    }
  }
  let z = 0; for (const c of kept) z += c.w;
  if (z <= 0) return { range: [], distinct };
  for (const c of kept) c.w /= z;
  return { range: kept, distinct };
}

// Rebuild the opponent posterior EXACTLY as gradeDecision does (byte-identical
// belief: same seed derivation), then systematic-sample it to `oppCap` holdings.
// Returns { range:[{hand,w}], distinct } or null when the posterior is empty.
function oracleDrawRange(game, strategyMap, handRecord, gradeIdx, heroSeat, opts) {
  const N = opts.N || 200;
  const instr = { fallbacks: 0, collapses: 0 };
  const post = buildPosterior(
    game, strategyMap, handRecord, gradeIdx, heroSeat, N,
    makeRng((opts.seed ^ (gradeIdx * 0x9e3779b1)) >>> 0), instr);
  const oppCap = opts.oppCap == null ? 40 : opts.oppCap;
  const { range, distinct } = particlesToRange(post.parts, oppCap);
  if (!range.length) return null;
  return { range, distinct };
}

// ── CERTIFIED-NET PRE-LAST-DRAW badugi grading (M-PROD, first neural grade) ────
// The exact resolver above grades POST-last-draw (street 3, deal-free showdown).
// The PRE-last-draw betting round (street 2 — "After 2nd draw", the round BEFORE
// the 3rd/last draw) has a private draw ahead of it, so it has no exact rung. It
// IS served by the trained badugi value net (nets/badugi_draw1.npz, certified
// 0.059 SB mean grade error) via a DEPTH-LIMITED net-leaf resolve in
// oracle_worker.py's numpy path (mode:'net'). The net is the equilibrium value
// function over pre-last-draw badugi nodes; per-action EV = the net's value of
// each child node (after the hero action) for hero's bucket.
//
// SCOPE: badugi street-2 hero BET decisions ONLY. The provenance tier is ALWAYS
// 'certified-net' (NEVER 'oracle'/'exact'/'GTO' — those are reserved for the pure-
// python EXACT resolvers) with the honest certification surfaced. Every OTHER
// decision stays on the blueprint or (street 3) the exact oracle. Any net failure
// (worker down, numpy/asset missing, range empty, action mismatch) falls back to
// the blueprint grade for that decision, tagged gradeSource:'blueprint'.

// Only badugi has a certified pre-last-draw net (td27's net is not built/certified).
const NET_DRAW_GAMES = new Set(['badugi']);

// Which blueprint grades are eligible for a certified-net override?
//   - badugi (the only game with a certified pre-last-draw net),
//   - street 2 (the betting round BEFORE the 3rd/last draw), phase 'bet',
//   - the hero is to act (snap.toAct === d.actor).
function netEligible(game, handRecord, gradeIdx) {
  if (!game || !NET_DRAW_GAMES.has(game.id)) return false;
  const d = handRecord.decisions[gradeIdx];
  const snap = d.state;
  if (!snap || snap.street !== 2 || snap.phase !== 'bet') return false; // pre-last-draw bet only
  if (snap.toAct !== d.actor) return false;                            // hero to act
  return true;
}

// Build the certified-NET spot dict (what oracle_worker._solve_draw_net expects).
// mode:'net' routes the worker to the numpy net path. Hero maps to SEAT 0 of
// contrib/acted (the net's to-act convention: seat 0 = hero, to act). `range` is
// the normalized [{hand,w}] systematic sample of the opponent posterior.
function buildDrawNetSpot(game, handRecord, gradeIdx, range) {
  const d = handRecord.decisions[gradeIdx];
  const snap = d.state;
  const heroSeat = d.actor;
  const opp = 1 - heroSeat;
  return {
    game: game.id,
    mode: 'net',
    me: snap.hands[heroSeat].map(cardStr),
    opp_range: range.map(c => [c.hand.map(cardStr), c.w]),
    contrib: [snap.contrib[heroSeat], snap.contrib[opp]],
    bets: snap.bets,
    acted: [snap.acted[heroSeat], snap.acted[opp]],
    toAct: 0,
    street: 2,
    draws_remaining: 1,
  };
}

// Overlay a CERTIFIED-NET grade onto a blueprint grade for ONE pre-last-draw
// badugi bet decision. Returns a NEW grade object with per-action EV / evLoss /
// bestAction sourced from the net, tagged gradeSource:'certified-net'. On ANY
// failure returns the BLUEPRINT grade (tagged gradeSource:'blueprint'). Mirrors
// overlayDrawOracleGrade's shape so the client badge logic is shared — but the
// tier is HONEST: certified-net + the 0.059-SB certification, never 'exact'/'GTO'.
async function overlayDrawNetGrade(oracle, game, strategyMap, handRecord, g, opts) {
  const gradeIdx = g.gradeIdx;
  const d = handRecord.decisions[gradeIdx];
  const heroSeat = d.actor;
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
    if (!netEligible(game, handRecord, gradeIdx)) return asBlueprintGrade();
    const built = oracleDrawRange(game, strategyMap, handRecord, gradeIdx, heroSeat, opts);
    if (!built || !built.range.length) return asBlueprintGrade();
    const spot = buildDrawNetSpot(game, handRecord, gradeIdx, built.range);
    const res = await oracle.perActionEV(spot);
    // VISIBILITY (cheap, dedup'd): the worker/bridge already log worker-side
    // exceptions to stderr. These two branches are the ONLY remaining SILENT
    // fallbacks (net returned but was rejected here), so surface their reason once
    // so a bad deploy shows WHY the grade fell back instead of an invisible
    // blueprint. Positive success is logged once below.
    if (!res || !res.per_action_ev) return asBlueprintGrade();
    if (res.tier !== 'certified-net') {
      netLogOnce('tier-mismatch', `[certified-net] fallback: tier=${res.tier}`);
      return asBlueprintGrade(); // must be the net path
    }

    // The net must cover exactly the hero's legal (betting) actions.
    const acts = d.acts;
    for (const a of acts) {
      if (!(a in res.per_action_ev)) {
        netLogOnce('act-mismatch', `[certified-net] fallback: net missing action '${a}' (acts=${acts.join(',')})`);
        return asBlueprintGrade();
      }
    }
    const perActionEV = {};
    for (const a of acts) perActionEV[a] = res.per_action_ev[a];
    let bestA = acts[0], bestEV = -Infinity;
    for (const a of acts) if (perActionEV[a] > bestEV) { bestEV = perActionEV[a]; bestA = a; }
    if (!Number.isFinite(bestEV)) return asBlueprintGrade();
    const chosenEV = perActionEV[d.chosen];
    if (chosenEV == null || !Number.isFinite(chosenEV)) return asBlueprintGrade();
    const evLoss = Math.max(0, bestEV - chosenEV);

    const snap = d.state;
    // The net returns per-action VALUES, not a strategy — keep the blueprint's
    // GTO mix for display (materialized lazily on the fallback path anyway).
    const gtoMix = materializeBlueprint().gtoMix;

    // ── RANGE-SENSITIVE honesty flag (same fragility mitigation as the exact
    // draw path — a pre-last-draw grade is against a particle posterior too). ──
    let rs = null;
    if (opts.rangeSensitive !== false) {
      const support = built.range;
      const strengthScore = (typeof game.cfg.compare === 'function')
        ? (hand) => {
            let wins = 0;
            for (const c of support) {
              try { if (game.cfg.compare(hand, c.hand) > 0) wins++; } catch (e) { /* skip */ }
            }
            return wins;
          }
        : undefined;
      rs = await computeRangeSensitivity({
        oracle,
        buildSpot: (range) => buildDrawNetSpot(game, handRecord, gradeIdx, range),
        baseRange: built.range,
        acts,
        chosen: d.chosen,
        strengthScore,
        spreadThreshold: opts.rangeSensitiveThreshold,
      });
    }
    const flagged = !!(rs && rs.rangeSensitive);
    const chargeZeroed = flagged && opts.rangeSensitiveCharge !== false;

    const out = Object.assign({}, materializeDrawShell(g, game, d, gtoMix), {
      gradeIdx,
      // HONEST provenance: certified NET, not exact/GTO. The certification
      // (0.059 SB mean grade error) rides along so the client badge is truthful.
      gradeSource: 'certified-net',
      certificationSB: (typeof res.certification_sb === 'number') ? res.certification_sb : 0.059,
      perActionEV,
      bestActionId: bestA,
      bestActionLabel: game.actionLabel(bestA, snap),
      evLoss,
      evLossSE: 0,                          // net value function → no MC forward SE
      gtoMix,
      forwardMode: 'certified-net',
      // Honest net self-consistency gauge (zero-sum residual at the decision node;
      // ~0 by the ZeroSumLayer — a large value would flag an off-distribution query).
      netValueGauge: (typeof res.net_value_gauge === 'number') ? res.net_value_gauge : undefined,
      // NOT trust-labelled 'ev-converged' — the net is an APPROXIMATOR, not a
      // converging exact solve; its trust is the CERTIFICATION, surfaced above.
      oppCombos: built.range.length,
      rangeDistinct: built.distinct,
      pot: (typeof res.pot === 'number') ? res.pot : undefined,
    });
    if (rs) {
      out.rangeSensitive = flagged;
      out.rangeSensitiveSpread = rs.rangeSensitiveSpread;
      out.rangeSensitiveFlip = rs.rangeSensitiveFlip;
      out.rangeSensitiveEnsemble = rs.ensembleSize;
      out.chargedEvLoss = chargeZeroed ? 0 : evLoss;
    }
    // VISIBILITY: the FIRST certified-net success per process prints one line so a
    // deploy's Render logs positively confirm the net path is live (not just the
    // absence of an error). Dedup'd -> not per-grade log spam.
    netLogOnce('ok', `[certified-net] LIVE: badugi street-2 net grade served (certSB=${out.certificationSB}, gauge=${out.netValueGauge})`);
    return out;
  } catch (e) {
    return asBlueprintGrade(); // never let the net break a grade
  }
}

// One-line-per-distinct-key stderr logger for the certified-net path so the next
// deploy's Render logs show either a positive "LIVE" line or the exact silent-
// fallback reason — WITHOUT per-grade spam (each key logs at most once/process).
const _netLogged = new Set();
function netLogOnce(key, msg) {
  if (_netLogged.has(key)) return;
  _netLogged.add(key);
  try { process.stderr.write(msg + '\n'); } catch (e) { /* ignore */ }
}

// Build the draw oracle spot dict (what oracle_worker._solve_draw expects — the
// SAME shape draw_misgrade_study.js builds). Hero maps to SEAT 0 of contrib/acted
// (the resolver treats the to-act player as seat 0; facing = contrib[1]-contrib[0]
// must be >= 0, which holds at any genuine hero-to-act node). `range` is the
// normalized [{hand,w}] systematic sample.
function buildDrawOracleSpot(game, handRecord, gradeIdx, range, iters) {
  const d = handRecord.decisions[gradeIdx];
  const snap = d.state;
  const heroSeat = d.actor;
  const opp = 1 - heroSeat;
  return {
    game: game.id,
    me: snap.hands[heroSeat].map(cardStr),
    opp_range: range.map(c => [c.hand.map(cardStr), c.w]),
    contrib: [snap.contrib[heroSeat], snap.contrib[opp]],
    bets: snap.bets,
    acted: [snap.acted[heroSeat], snap.acted[opp]],
    street: 3,
    draws_remaining: 0,
    iters: iters || 800,
  };
}

// ── oracle self-consistency gauge (HONEST at the grade setting) ─────────
// The final draw round is DEAL-FREE, so the resolver's res.exploitability is an
// EXACT best-response certificate (not a converging self-play gap like the stud
// 7th-street case). At the trainer default (800 iters) it lands ~0.1 chips. We
// still surface it HONESTLY (oracleResolveExploitability = the resolver's own BR
// gap at these iters) and publish oracleGradeTrusted from EV-convergence, mirroring
// the stud overlay's labelling so the client badges are identical.
const EV_CONVERGED_ITERS = 300; // per-action EV is stable at/above this (draws converge fast)

// Overlay a true-GTO oracle grade onto a blueprint grade for ONE post-last-draw
// bet decision. Returns a NEW grade object with per-action EV / evLoss / gtoMix /
// bestAction sourced from the oracle, tagged gradeSource:'oracle'. On ANY failure
// (worker down, range empty, ineligible, action mismatch) returns the BLUEPRINT
// grade (tagged gradeSource:'blueprint') so the trainer never breaks.
//
// `g` may be EITHER a full blueprint gradeDecision result OR a light stub
// {gradeIdx}: on oracle-eligible decisions we must NOT pay the blueprint grade up
// front (it's redundant with the oracle grade and only needed as a fallback). When
// the oracle SUCCEEDS the blueprint grade is never computed; when it FAILS we
// compute it LAZILY via opts.blueprintGrade().
async function overlayDrawOracleGrade(oracle, game, strategyMap, handRecord, g, opts) {
  const gradeIdx = g.gradeIdx;
  const d = handRecord.decisions[gradeIdx];
  const heroSeat = d.actor;
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
    if (!oracleEligible(game, handRecord, gradeIdx)) return asBlueprintGrade();
    const built = oracleDrawRange(game, strategyMap, handRecord, gradeIdx, heroSeat, opts);
    if (!built || !built.range.length) return asBlueprintGrade();
    const iters = opts.oracleIters || 800;
    const spot = buildDrawOracleSpot(game, handRecord, gradeIdx, built.range, iters);
    const res = await oracle.perActionEV(spot);
    if (!res || !res.per_action_ev) return asBlueprintGrade();

    // The oracle must cover exactly the hero's legal (betting) actions.
    const acts = d.acts;
    for (const a of acts) {
      if (!(a in res.per_action_ev)) return asBlueprintGrade();
    }

    const perActionEV = {};
    for (const a of acts) perActionEV[a] = res.per_action_ev[a];
    let bestA = acts[0], bestEV = -Infinity;
    for (const a of acts) if (perActionEV[a] > bestEV) { bestEV = perActionEV[a]; bestA = a; }
    if (!Number.isFinite(bestEV)) return asBlueprintGrade();
    const chosenEV = perActionEV[d.chosen];
    if (chosenEV == null || !Number.isFinite(chosenEV)) return asBlueprintGrade();
    const evLoss = Math.max(0, bestEV - chosenEV);

    // GTO mix from the oracle when it covers the hero's actions positionally; else
    // keep the blueprint mix (materialized lazily).
    const snap = d.state;
    let gtoMix;
    if (res.gtoMix && Array.isArray(res.gtoMix.actions) && Array.isArray(res.gtoMix.freq)) {
      gtoMix = {
        actions: res.gtoMix.actions.slice(),
        labels: res.gtoMix.actions.map(a => game.actionLabel(a, snap)),
        probs: res.gtoMix.freq.slice(),
        trained: true,
      };
    } else {
      gtoMix = materializeBlueprint().gtoMix;
    }

    const evConverged = iters >= EV_CONVERGED_ITERS;
    // blueprintEvLoss is a diagnostic COMPARISON; populate it only when the
    // blueprint grade is already in hand (never forces it on the fast path) or a
    // debug flag asks for it.
    const blueprintEvLoss = (g && g.perActionEV) ? g.evLoss
      : (opts.debugBlueprintEvLoss && opts.blueprintGrade ? opts.blueprintGrade().evLoss : undefined);

    // ── RANGE-SENSITIVE honesty flag ──────────────────────────────────────────
    // Re-solve this SAME spot under a small prior ensemble (posterior / uniform-
    // over-support / strength-tilt) at reduced iters; flag when the best action
    // FLIPS or the evLoss SPREAD exceeds ~2 chips (a thin value-bet / marginal
    // call-vs-fold whose CHARGE depends on the assumed belief SHAPE). On a flagged
    // spot the oracle grade is still SHOWN, but its charged evLoss is ZEROED. The
    // strength-tilt is game-agnostic: score each opponent holding by how many
    // OTHER support holdings it beats under the game's own showdown comparator
    // (cfg.compare(h0,h1) → 1 if h0 wins), so stronger holdings get more weight.
    let rs = null;
    if (opts.rangeSensitive !== false) {
      const support = built.range;
      const strengthScore = (typeof game.cfg.compare === 'function')
        ? (hand) => {
            let wins = 0;
            for (const c of support) {
              try { if (game.cfg.compare(hand, c.hand) > 0) wins++; } catch (e) { /* skip */ }
            }
            return wins;
          }
        : undefined;
      rs = await computeRangeSensitivity({
        oracle,
        buildSpot: (range, itr) => buildDrawOracleSpot(game, handRecord, gradeIdx, range, itr),
        baseRange: built.range,
        acts,
        chosen: d.chosen,
        strengthScore,
        spreadThreshold: opts.rangeSensitiveThreshold,
      });
    }
    // "shown, not charged": when flagged AND the charge-zeroing is active (default
    // ON for the draw path — the ship target), the CHARGED evLoss is 0 while the
    // display evLoss (headline) stays the oracle's. chargeZeroed records whether
    // the score actually excluded it (so a caller can leave stud UN-zeroed while
    // still surfacing the flag — see razz-trainer/grade.js STUD_RANGE_FLAG).
    const flagged = !!(rs && rs.rangeSensitive);
    const chargeZeroed = flagged && opts.rangeSensitiveCharge !== false;

    const out = Object.assign({}, materializeDrawShell(g, game, d, gtoMix), {
      gradeIdx,
      gradeSource: 'oracle',
      perActionEV,
      bestActionId: bestA,
      bestActionLabel: game.actionLabel(bestA, snap),
      evLoss,
      evLossSE: 0,                          // exact, deal-free showdown → forward SE 0
      gtoMix,
      forwardMode: 'oracle-exact',
      // HONEST gauge fields (mirror the stud overlay so the UI badges are shared):
      oracleResolveExploitability: res.exploitability, // EXACT BR gap at these iters
      oracleGradeTrusted: evConverged,
      oracleGradeTrust: evConverged ? 'ev-converged' : 'ev-unconverged',
      oracleIters: iters,
      oracleExploitability: res.exploitability, // back-compat alias
      oppCombos: built.range.length,
      rangeDistinct: built.distinct,
    });
    // ── range-sensitivity flag (display evLoss above is UNCHANGED). Attached ONLY
    // when the ensemble was actually run (rs !== null); with rangeSensitive:false
    // these keys are OMITTED so the payload is BYTE-IDENTICAL to the pre-flag
    // oracle grade (toggle-off = no observable change). ──
    if (rs) {
      out.rangeSensitive = flagged;
      out.rangeSensitiveSpread = rs.rangeSensitiveSpread;
      out.rangeSensitiveFlip = rs.rangeSensitiveFlip;
      out.rangeSensitiveEnsemble = rs.ensembleSize;
      // chargedEvLoss = what the running scoreboard should count. Zeroed on a
      // flagged+active spot ("shown, not charged"); otherwise == evLoss.
      out.chargedEvLoss = chargeZeroed ? 0 : evLoss;
    }
    if (blueprintEvLoss !== undefined) out.blueprintEvLoss = blueprintEvLoss;
    return out;
  } catch (e) {
    return asBlueprintGrade(); // never let the oracle break a grade
  }
}

// Build the display/passthrough shell an oracle grade inherits (seat/street/kind/
// hero labels/etc.). If `g` is a full blueprint grade reuse it as the base; if it's
// the light {gradeIdx} stub, synthesize the shell from the decision so the oracle
// grade carries the same descriptive fields WITHOUT a blueprint MC. Fields match
// gradeDecision's return shape (and drawGradeToContract's reads).
function materializeDrawShell(g, game, d, gtoMix) {
  if (g && g.perActionEV) return g;
  const snap = d.state;
  const heroSeat = d.actor;
  const kind = snap.phase === 'draw' ? 'draw' : 'bet'; // 'bet' on any eligible node
  return {
    gradeIdx: undefined,
    seat: heroSeat,
    street: snap.street,
    streetName: ['Pre-draw', 'After 1st draw', 'After 2nd draw', 'After 3rd draw'][snap.street],
    phase: snap.phase,
    kind,                                 // 'bet'
    infosetKey: d.key,
    trained: gtoMix ? !!gtoMix.trained : false,
    heroActionId: d.chosen,
    heroActionLabel: game.actionLabel(d.chosen, snap),
    explicitDiscard: false,               // post-last-draw BET node → never a discard
    heroDrawCount: null,
    offBookCount: false,
    discardNote: null,
    gtoMix,
    particlesUsed: 0,
    repeatsUsed: 1,
    sampleRounds: 1,
    essAtNode: undefined,
    essMin: undefined,
    fallbackRate: 0,
    rangeDegraded: false,
    confidence: 'high',
  };
}

// Async oracle-enhanced gradeHand. Grades every non-eligible hero decision with
// the blueprint (byte-identical to gradeHand) and every ORACLE-ELIGIBLE post-last-
// draw bet decision with the exact draw re-solver — WITHOUT paying the redundant
// blueprint grade for those eligible decisions (computed only on oracle fallback).
// Any oracle failure falls back to the blueprint grade per-decision. Opt-in:
// callers use this instead of gradeHand only when Pro mode is on; the default
// gradeHand path is untouched.
async function gradeHandWithOracle(handRecord, blueprint, opts = {}) {
  const game = opts.game || DEFAULT_GAME;
  lbr.memoizeCfg(game); // patch the hot pure cfg hooks (idempotent) — as gradeHand does
  const strategyMap = strategyMapOf(blueprint);
  const { getOracle } = require('../razz-trainer/oracle-bridge');
  const oracle = opts.oracle || getOracle();

  const targetSE = opts.targetSE || null;
  // Per-decision blueprint OPTS (the same config gradeHand builds) — used only to
  // compute a blueprint grade LAZILY for the decisions that need one (non-eligible
  // decisions, or eligible decisions where the oracle falls back).
  const bpOpts = {
    seed: (opts.seed == null ? 0xC0FFEE : opts.seed) >>> 0,
    N: opts.N || 200,
    evParticles: opts.samples || Math.min(60, opts.N || 200),
    targetSE,
    maxRepeats: targetSE ? (opts.maxRepeats || 16) : 1,
  };
  // A blueprint gradeDecision for `i` is byte-identical to gradeHand's per-decision
  // output (same opts, same code path).
  const blueprintDecision = (i) => gradeDecision(game, strategyMap, handRecord, i, bpOpts);

  // Oracle OPTS: systematic-strided posterior cap + CFR iters. The final draw round
  // is deal-free so the exploitability is an EXACT certificate; per-action EV
  // converges fast → default 800 iters, oppCap 40 (systematic sample of the ~flat
  // posterior — see particlesToRange).
  const o = {
    seed: bpOpts.seed,
    N: bpOpts.N,
    oppCap: opts.oppCap == null ? 40 : opts.oppCap,
    oracleIters: opts.oracleIters || 800,
    debugBlueprintEvLoss: opts.debugBlueprintEvLoss === true,
    // RANGE-SENSITIVE flag: compute it (default ON) and, when flagged, ZERO the
    // charged evLoss ("shown, not charged"). For the DRAW path both default ON —
    // this is the draw Pro-mode ship prerequisite. Callers can pass
    // rangeSensitive:false to skip the ensemble entirely (byte-identical to the
    // pre-flag oracle grade) or rangeSensitiveCharge:false to surface the flag
    // without zeroing the charge.
    rangeSensitive: opts.rangeSensitive !== false,
    rangeSensitiveCharge: opts.rangeSensitiveCharge !== false,
    rangeSensitiveThreshold: opts.rangeSensitiveThreshold,
  };

  const grades = [];
  for (let i = 0; i < handRecord.decisions.length; i++) {
    const dec = handRecord.decisions[i];
    if (!dec.isHero) continue;
    if (netEligible(game, handRecord, i)) {
      // CERTIFIED-NET: pre-last-draw (street 2) badugi bet decision → the trained
      // value net (first neural grade to prod). Skip the blueprint grade up front;
      // it's the lazy fallback if the net path fails.
      const stub = { gradeIdx: i };
      grades.push(await overlayDrawNetGrade(oracle, game, strategyMap, handRecord,
        stub, Object.assign({}, o, { blueprintGrade: () => blueprintDecision(i) })));
    } else if (oracleEligible(game, handRecord, i)) {
      // Eligible: skip the blueprint grade; oracle grades directly. The blueprint
      // grade is available ONLY on fallback, computed lazily inside the overlay.
      const stub = { gradeIdx: i };
      grades.push(await overlayDrawOracleGrade(oracle, game, strategyMap, handRecord,
        stub, Object.assign({}, o, { blueprintGrade: () => blueprintDecision(i) })));
    } else {
      // Non-eligible: blueprint grade, byte-identical to the default gradeHand path.
      const bp = blueprintDecision(i);
      grades.push(await overlayDrawOracleGrade(oracle, game, strategyMap, handRecord, bp, o));
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
  gradeHandWithOracle,     // opt-in: overlay the exact post-last-draw oracle + certified net
  overlayDrawOracleGrade,
  overlayDrawNetGrade,     // CERTIFIED-NET pre-last-draw badugi overlay (first neural grade)
  buildDrawOracleSpot,
  buildDrawNetSpot,
  oracleDrawRange,
  oracleEligible,
  netEligible,             // badugi street-2 (pre-last-draw) bet decision
  particlesToRange,        // systematic-stride posterior sampler (shared w/ study)
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
