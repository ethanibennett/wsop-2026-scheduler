// ── Best-response / exploitability meter for the STUD games (razz, stud8) ─────
// An exploitability UPPER-BOUND-style meter (a Local Best Response, LBR) for the
// razz and stud8 blueprints — the STUD analogue of the particle-filter LBR that
// lbr-draw.js provides for the DRAW games. Where lbr-draw hides its opponent's
// info in DOWN-cards-that-get-redrawn (draws), stud hides it in DOWN cards under
// a growing board of UPcards. The belief is therefore a reach-weighted posterior
// over the opponent's 2 (3rd–6th) or 3 (7th) hidden down cards.
//
// WE REUSE THE GRADER. solver/razz-trainer/grade.js already implements every
// belief primitive this meter needs, and does so IDENTICALLY to how a real study
// grade is computed (so the meter and the trainer agree by construction):
//   • unseenForOpp     — candidate down-card pool = deck minus dead cards / seen,
//   • reachWeight      — σ-reach-weight a candidate opp down-combo by replaying
//                        the betting line (with the 7th-street hole-pair/river
//                        decomposition summed),
//   • combos / sampling of the candidate range,
//   • rolloutAfterAction — MC roll to showdown (opp plays σ) for streets 3rd–6th,
//   • exactForwardValue  — the EXACT σ-expectation over the finite 7th-street
//                        betting subtree (deal-free ⇒ noise-free) — AVAILABLE, but
//                        NOT engaged at the shipped default (see next paragraph).
// The meter's own decision = gradeDecision's per-action EV over the reach-
// weighted belief, but instead of grading a HUMAN's chosen action we BEST-RESPOND
// (argmax action) with common-random-numbers across actions and a deviate margin.
//
// EXACT-vs-SAMPLED 7TH STREET — READ THIS (shipped-config honesty). The exact
// 7th-street path (exactForwardValueVia) engages ONLY when the opponent range is
// ENUMERATED, i.e. nCombos <= exactRangeBudget. At the shipped default budget 1200,
// a 7th-street node (unseen pool ~38 ⇒ C(38,3)=8436 ≫ 1200) SAMPLES its range and
// takes the MC-forward path, so the meter's 7th-street EVs carry opponent-betting
// Monte-Carlo noise and are NOT seed-independent at default settings. The exact
// path only fires on 6th-street-or-earlier SMALL ranges, or when the caller raises
// exactRangeBudget to ~9000 (≈13× slower/hand — see the exactRangeBudget comment).
// grade.js gets exactness on 7th because it uses budget 20000; this meter trades it
// for speed. Bottom line: at defaults, 7th is ALSO MC-sampled, not exact.
//
// WHY THIS IS AN EXPLOITABILITY BOUND. At each of ITS OWN nodes the meter picks
// the action that maximises EV against the reach-weighted opponent posterior; for
// the rest of the hand it plays a fixed continuation (σ). The realised line is
// therefore SOME concrete policy, and its per-hand value vs σ is measured
// directly on CRN-paired deals. A concrete policy's value is a LOWER bound on the
// TRUE best response's value; the meter approximates the true BR from below at
// each node (local BR) — the standard LBR guarantee. We report it as an
// exploitability estimate and gate it against the fixed-exploiter lower bound
// from exploitability.js: the meter must be AT LEAST as tight.
//
// TIGHTNESS / TRUST (mirrors lbr-draw, each a real failure mode):
//   • CONTINUATION = max over {sigma, aggro}. A σ-continuation is competent but
//     can't see a fold/call-too-much leak because σ stops firing after the
//     deviation; an 'aggro' continuation (keep completing/betting/raising) keeps
//     the pressure on and exposes it. Each is a real policy ⇒ exploitability ≥
//     their max ⇒ we take the per-seat max.
//   • DEVIATE ONLY ON A CONFIDENT IMPROVEMENT (margin) with COMMON RANDOM NUMBERS
//     across the actions at a node — a noisy argmax is not a best response and can
//     realise worse than σ's own mixture. grade.js already evaluates every action
//     on the SAME candidate particles + shared future-card rng (CRN); the margin
//     gates the residual noise.
//   • SHIP max(meter, fixed-exploiter). A bound-meter publishes the best bound it
//     can prove.
//
// SANITY GATES (runSanity / --sanity, reported honestly):
//   (1) a UNIFORM-RANDOM blueprint must yield LARGE exploitability (the meter
//       finds leaks — non-vacuous);
//   (2) the real blueprint should be SMALL(er);
//   (3) meter ≥ the fixed-exploiter lower bound from exploitability.js. NOTE gate
//       (3)'s "PASS (meter dominates)" is not a tie — the fixed exploiter reports
//       ~0 for razz while this meter reports several chips/hand, i.e. THE LBR FOUND
//       A LEAK THE CRUDE STATION/MANIAC/ROCK EXPLOITERS CANNOT. That gap is the
//       point, not a contradiction (documented in strategies/BLUEPRINT_TRUST.md).
// CRN deal-pairing + per-hand-deviation standard errors are reported throughout.
//
// TWO SCOPE NOTES so the number isn't misread:
//   • HEADLINE NEEDS THOUSANDS OF HANDS. At the CLI defaults (2000 hands/seat) the
//     ±SE is a few tenths of a chip; at low hand counts (the tests use 40, --sanity
//     uniform caps at 600) the number is NOISY and only the INEQUALITY gates are
//     meaningful, not the point estimate. Do not quote a headline from a short run.
//   • NO DEAD-CARD CONDITIONING. cell() always passes deadCards=[], so the belief
//     and rollout deck ignore folded-door dead cards even though grade.unseenForOpp
//     supports them. This is deliberate: it measures the PURE HU blueprint (which is
//     HU-trained and does not second-order-condition on dead cards). The TRAINER
//     does use dead cards; this METER does not — so the two are not expected to
//     match card-for-card, and that is correct for what the meter claims to measure.
//
//   const { studLBR } = require('./lbr-stud');
//   studLBR('razz', strategyMap, { hands: 2000 }).exploitability
//   // CLI:  node solver/lbr-stud.js --game razz  --hands 2000 --sanity
//   //       node solver/lbr-stud.js --game stud8 --hands 2000

const path = require('path');
const { makeRng } = require('./engine/cards');
const grade = require('./razz-trainer/grade');
const play = require('./razz-trainer/play');

const STUD_GAMES = {
  razz: require('./games/razz-game'),         // shipped default = v2 hole-aware key (pairs with razz.json)
  razzv1: require('./games/razz-game').v1,    // frozen hole-blind key (pairs with razz.frozen-v1.json)
  razzv2: require('./games/razz-game').v2,    // v2 key under the opt-in training id (pairs with razzv2.json)
  stud8: require('./games/stud8-game'),
};

// ── belief-based EV at ONE meter decision (reuses grade.js primitives) ───────
// `record` is a live handRecord whose decisions[0..gradeIdx) are the line so far
// (built incrementally by lbrHand); decision gradeIdx is the meter's node. We
// reconstruct the reach-weighted opponent range exactly as gradeDecision does,
// then compute per-action EV under a chosen ROLLOUT CONTINUATION for the meter's
// own future play, with CRN across actions. Returns { ev:{a:val}, evLossToSigma }.
//
// The ONLY behavioural difference from gradeDecision is the meter's continuation
// after the graded action: gradeDecision has both seats follow σ; here the OPP
// still follows σ but the METER (heroSeat) follows `continuation`:
//   'sigma'  — the meter plays σ after its deviation (default, competent);
//   'aggro'  — the meter keeps completing/betting/raising (never folds), exposing
//              a blueprint that over-folds/over-calls to sustained pressure.
// Both are concrete policies, so max over them is a valid (tighter) bound.
function beliefEV(gameId, strategyMap, record, gradeIdx, continuation, opts) {
  const game = STUD_GAMES[gameId];
  const d = record.decisions[gradeIdx];
  const snap = d.state;
  const heroSeat = d.actor;
  const oppSeat = 1 - heroSeat;
  const acts = d.acts;

  // 1. Reconstruct the reach-weighted opponent down-card range (grade.js).
  const k = snap.street <= 3 ? 2 : 3;
  const deadCards = record.deadCards || [];
  const pool = grade.unseenForOpp(snap, heroSeat, deadCards);
  const nPool = pool.length;
  const nCombos = k === 2 ? (nPool * (nPool - 1)) / 2
    : (nPool * (nPool - 1) * (nPool - 2)) / 6;
  // Range budget: enumerate the opponent range EXACTLY when it is small (3rd–6th
  // street: C(≤46,2) ≤ ~1000, unlocking the noise-free exact-forward 7th path via
  // useExact below), else SAMPLE it. Left much lower than the grader's 20000 so a
  // 7th-street node (C(~40,3) ≈ 9880) SAMPLES rather than enumerating + running
  // the finite betting subtree over ~10k candidates — the latter is exact but
  // ~13× slower/hand, and this meter needs thousands of hands for a stable mean.
  const exactRangeBudget = opts.exactRangeBudget == null ? 1200 : opts.exactRangeBudget;

  let candidates = [];
  let exactRange;
  if (nCombos <= exactRangeBudget) {
    exactRange = true;
    for (const combo of comboGen(pool, k)) {
      const w = grade.reachWeight(game, strategyMap, record, gradeIdx, oppSeat, combo);
      if (w > 0) candidates.push({ hand: combo, w });
    }
  } else {
    exactRange = false;
    const rng = makeRng(opts.rangeSeed >>> 0);
    const nSamp = opts.rangeSamples || 600;
    for (let s = 0; s < nSamp; s++) {
      const avail = pool.slice();
      const hand = [];
      for (let i = 0; i < k; i++) {
        const j = Math.floor(rng() * avail.length);
        hand.push(avail[j]); avail[j] = avail[avail.length - 1]; avail.pop();
      }
      const w = grade.reachWeight(game, strategyMap, record, gradeIdx, oppSeat, hand);
      if (w > 0) candidates.push({ hand, w });
    }
  }
  // no σ-consistent opponent hand: uniform fallback so EV is still defined.
  let wsum = 0;
  for (const c of candidates) wsum += c.w;
  if (wsum <= 0) {
    candidates = [];
    let cnt = 0;
    for (const combo of comboGen(pool, k)) {
      candidates.push({ hand: combo, w: 1 });
      if (++cnt >= exactRangeBudget) break;
    }
    wsum = candidates.length;
  }
  for (const c of candidates) c.w /= wsum;

  // 2. Per-action EV. 7th street (deal-free) with an enumerated range → EXACT
  //    σ-expectation over the finite betting subtree (noise-free). Otherwise MC.
  const dealFree = snap.street === 4;
  const useExact = dealFree && exactRange && continuation === 'sigma';

  if (useExact) {
    const ev = {};
    for (const a of acts) {
      let m = 0;
      for (const c of candidates) {
        m += c.w * exactValueAfter(game, strategyMap, snap, heroSeat, a, c.hand, continuation);
      }
      ev[a] = m;
    }
    return { ev, util: null, parts: candidates, exact: true };
  }

  // MC forward with CRN across actions. One shared shuffled pool + one shared
  // σ-seed reused per action so the per-action EV DIFFERENCES are low-variance.
  const N = opts.samples || 1200;
  const crnRng = makeRng((opts.crnSeed >>> 0) ^ (gradeIdx * 0x9e3779b1));
  const sharedPool = pool.slice();
  for (let i = sharedPool.length - 1; i > 0; i--) {
    const j = Math.floor(crnRng() * (i + 1));
    const t = sharedPool[i]; sharedPool[i] = sharedPool[j]; sharedPool[j] = t;
  }
  const crnSeed = (crnRng() * 0xffffffff) >>> 0;

  const wcum = []; let acc = 0;
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
  const pickRng = makeRng((crnSeed ^ 0x51ed270b) >>> 0);
  const particles = [];
  for (let i = 0; i < N; i++) {
    particles.push({ ci: sampleCandidate(pickRng), deck: shuffledDeck(pickRng), sigSeed: (crnSeed + i * 2654435761) >>> 0 });
  }

  const util = {};
  for (const a of acts) {
    util[a] = new Array(N);
    for (let i = 0; i < N; i++) {
      const p = particles[i];
      const u = rolloutAfter(game, strategyMap, snap, heroSeat, a, candidates[p.ci].hand,
        p.deck, makeRng(p.sigSeed), continuation);
      util[a][i] = u[heroSeat];
    }
  }
  const ev = {};
  for (const a of acts) { let m = 0; for (let i = 0; i < N; i++) m += util[a][i]; ev[a] = m / N; }
  const eqParts = new Array(N).fill(0).map(() => ({ w: 1 / N }));
  return { ev, util, parts: eqParts, exact: false };
}

// ── continuation-aware rollout / exact value ─────────────────────────────────
// grade.js's rolloutAfterAction / exactForwardValue have BOTH seats play σ. Here
// the OPP plays σ but the METER (heroSeat) follows `continuation`. We inline the
// grade.js rollout loop but pick the meter's action from the continuation policy.
function rolloutAfter(game, strategyMap, st0, heroSeat, a, oppDown, shuffledPool, rng, continuation) {
  if (continuation === 'sigma') {
    // exact grade.js behaviour: both seats σ after the graded action.
    return grade.rolloutAfterAction(game, strategyMap, st0, heroSeat, a, oppDown, shuffledPool, rng);
  }
  const oppSeat = 1 - heroSeat;
  const deck = [];
  for (let i = 0; i < shuffledPool.length; i++) if (oppDown.indexOf(shuffledPool[i]) < 0) deck.push(shuffledPool[i]);
  let st = grade.cloneState(st0);
  st.down[oppSeat] = oppDown.slice();
  st.deck = deck;
  st = game.applyAction(st, a);
  let guard = 0;
  while (!game.isTerminal(st)) {
    if (++guard > 200) break;
    if (game.isChance(st)) { st = game.sampleChance(st, rng); continue; }
    const acts = game.legalActions(st);
    if (acts.length === 1) { st = game.applyAction(st, acts[0]); continue; }
    const p = game.currentPlayer(st);
    let act;
    if (p === heroSeat) act = continuationAction(acts, continuation);
    else act = grade.sigmaAction(game, strategyMap, st, rng);
    st = game.applyAction(st, act);
  }
  return game.utility(st);
}

function exactValueAfter(game, strategyMap, st0, heroSeat, a, oppDown, continuation) {
  // continuation is always 'sigma' on the exact (7th) path (see useExact gate).
  const oppSeat = 1 - heroSeat;
  let st = grade.cloneState(st0);
  st.down[oppSeat] = oppDown.slice();
  st = game.applyAction(st, a);
  return exactForwardValueVia(game, strategyMap, st, heroSeat);
}

// EXACT σ-expected hero utility over a deal-free (7th) betting subtree. Re-derived
// here (grade.js does not export exactForwardValue) — identical semantics: both
// seats play σ, expectation taken over σ's mixture, deterministic (SE=0).
function exactForwardValueVia(game, strategyMap, st, heroSeat) {
  if (game.isTerminal(st)) return game.utility(st)[heroSeat];
  if (game.isChance(st)) return exactForwardValueVia(game, strategyMap, game.sampleChance(st, makeRng(0x7)), heroSeat);
  const acts = game.legalActions(st);
  if (acts.length === 1) return exactForwardValueVia(game, strategyMap, game.applyAction(st, acts[0]), heroSeat);
  const { probs } = grade.lookup(strategyMap, game.infosetKey(st), acts);
  let v = 0, wsum = 0;
  for (let i = 0; i < acts.length; i++) {
    const p = probs[i];
    if (!(p > 0)) continue;
    v += p * exactForwardValueVia(game, strategyMap, game.applyAction(st, acts[i]), heroSeat);
    wsum += p;
  }
  return wsum > 0 ? v / wsum : game.utility(st)[heroSeat];
}

// The meter's own action under the 'aggro' continuation: keep the pressure on —
// complete / bet / raise whenever legal, else call/check, NEVER fold. Matches the
// aggro action id space of both stud games (br/co/r/b/c/k/f).
function continuationAction(acts, continuation) {
  if (continuation === 'aggro') {
    for (const want of ['co', 'r', 'b', 'br', 'c', 'k']) if (acts.includes(want)) return want;
    return acts[acts.length - 1];
  }
  // sigma handled by caller; fall back to a passive call-down.
  for (const want of ['c', 'k', 'co', 'br']) if (acts.includes(want)) return want;
  return acts[acts.length - 1];
}

// ── σ-action-index sampling with a legal-action fallback (opponent's play) ───
function comboGen(pool, k) {
  const out = [];
  (function rec(start, pre) {
    if (pre.length === k) { out.push(pre.slice()); return; }
    for (let i = start; i <= pool.length - (k - pre.length); i++) { pre.push(pool[i]); rec(i + 1, pre); pre.pop(); }
  })(0, []);
  return out;
}

// ── one LBR hand: meter in seat `me`, opponent plays σ; returns u_me ─────────
// We drive the hand through the game engine ourselves (mirroring play.runHand)
// so we can, at each meter node, build a live handRecord of the line-so-far and
// call beliefEV to pick the best-responding action. The opponent samples σ; every
// decision (both seats) is appended to the record so reachWeight can replay it.
function lbrHand(gameId, strategyMap, me, rng, cfg, st0, deadCards) {
  const game = STUD_GAMES[gameId];
  const { continuation, margin } = cfg;
  let state = st0;
  const decisions = [];
  // record is rebuilt lazily each meter node from `decisions` (cheap: shallow).
  let guard = 0;
  while (!game.isTerminal(state)) {
    if (++guard > 500) break;
    if (game.isChance(state)) { state = game.sampleChance(state, rng); continue; }
    const acts = game.legalActions(state);
    if (acts.length <= 1) { state = game.applyAction(state, acts[0]); continue; }
    const actor = game.currentPlayer(state);
    const key = game.infosetKey(state);
    const snap = play.snapshotState(state);

    let chosen;
    if (actor === me) {
      // BEST RESPOND: build the live record (decisions so far + this node) and
      // compute per-action EV over the reach-weighted belief. Deviate from σ only
      // on a confident improvement (margin), else play σ's action.
      const gradeIdx = decisions.length;
      decisions.push({ actor, isHero: true, street: state.street, key, acts: acts.slice(),
        chosen: acts[0], state: snap });
      const record = { game: gameId, heroSeat: me, decisions, deadCards };
      const sigA = grade.sigmaAction(game, strategyMap, state, rng);
      const r = beliefEV(gameId, strategyMap, record, gradeIdx, continuation, cfg);
      let bestA = sigA, bestEV = r.ev[sigA];
      for (const a of acts) { if (a === sigA) continue; if (r.ev[a] > bestEV) { bestEV = r.ev[a]; bestA = a; } }
      chosen = (bestA !== sigA && bestEV - r.ev[sigA] > margin) ? bestA : sigA;
      decisions[gradeIdx].chosen = chosen; // record what the meter actually did
    } else {
      chosen = grade.sigmaAction(game, strategyMap, state, rng);
      decisions.push({ actor, isHero: false, street: state.street, key, acts: acts.slice(),
        chosen, state: snap });
    }
    state = game.applyAction(state, chosen);
  }
  return game.utility(state)[me];
}

// One σ-vs-σ hand to seat `me` from a pre-dealt state (CRN partner of lbrHand).
function sigmaHand(gameId, strategyMap, me, rng, st0) {
  const game = STUD_GAMES[gameId];
  let st = st0, guard = 0;
  while (!game.isTerminal(st)) {
    if (++guard > 500) break;
    if (game.isChance(st)) { st = game.sampleChance(st, rng); continue; }
    const acts = game.legalActions(st);
    if (acts.length === 1) { st = game.applyAction(st, acts[0]); continue; }
    st = game.applyAction(st, grade.sigmaAction(game, strategyMap, st, rng));
  }
  return game.utility(st)[me];
}

// CRN deal: hand i dealt from a per-seat deal seed shared by the LBR and σ runs.
function dealHand(gameId, dealSeed, i) {
  const game = STUD_GAMES[gameId];
  return game.newHand(makeRng((dealSeed + i * 2654435761) >>> 0));
}

// ── one (seat, continuation) cell: LBR & σ hand-by-hand on the SAME CRN deal ─
// Returns mean dev = mean(u_LBR - u_σ) and its paired standard error.
function cell(gameId, strategyMap, seat, continuation, hands, seed, cfg0) {
  const cfg = { continuation, margin: cfg0.margin, samples: cfg0.samples,
    rangeSamples: cfg0.rangeSamples, rangeSeed: cfg0.rangeSeed, crnSeed: cfg0.crnSeed,
    exactRangeBudget: cfg0.exactRangeBudget };
  const dealSeed = (seed + seat * 777) >>> 0;
  const rngL = makeRng(seed + 1), rngS = makeRng(seed + 2);
  let sumL = 0, sumS = 0, sumD = 0, sumD2 = 0;
  for (let i = 0; i < hands; i++) {
    const st0L = dealHand(gameId, dealSeed, i);
    const st0S = dealHand(gameId, dealSeed, i);
    const uL = lbrHand(gameId, strategyMap, seat, rngL, cfg, st0L, []);
    const uS = sigmaHand(gameId, strategyMap, seat, rngS, st0S);
    const d = uL - uS;
    sumL += uL; sumS += uS; sumD += d; sumD2 += d * d;
  }
  const dev = sumD / hands;
  const varD = Math.max(0, sumD2 / hands - dev * dev);
  return { lbr: sumL / hands, sig: sumS / hands, dev, se: Math.sqrt(varD / hands), seat, continuation, hands };
}

// ── public API ───────────────────────────────────────────────────────────────
// studLBR(gameId, strategyMap, opts) → { exploitability, dev0, dev1, se, ... }
//   hands            LBR hands per seat                (default 2000)
//   seed             PRNG seed                         (default 12345)
//   continuations    rollout continuation policies     (default ['sigma','aggro'])
//   margin           deviate-from-σ EV threshold       (default 0.25 chips)
//   samples          MC rollout particles per action   (default 300)
//   rangeSamples     candidate opp hands when sampling  (default 600)
//   exactRangeBudget enumerate range when ≤ this        (default 1200)
// exploitability = max(0, mean over seats of the BEST-continuation deviation).
function studLBR(gameId, strategyMap, opts = {}) {
  if (!STUD_GAMES[gameId]) throw new Error('studLBR: unknown stud game ' + gameId);
  const hands = opts.hands || 2000;
  const seed = opts.seed || 12345;
  const continuations = opts.continuations || ['sigma', 'aggro'];
  const cfg0 = {
    margin: opts.margin != null ? opts.margin : 0.25,
    samples: opts.samples || 300,
    rangeSamples: opts.rangeSamples || 600,
    rangeSeed: (opts.rangeSeed == null ? 0xBEEF : opts.rangeSeed) >>> 0,
    crnSeed: (opts.crnSeed == null ? 0xC0FFEE : opts.crnSeed) >>> 0,
    exactRangeBudget: opts.exactRangeBudget == null ? 1200 : opts.exactRangeBudget,
  };

  const perCont = {};
  let best0 = -Infinity, best1 = -Infinity, bm0 = null, bm1 = null, se0 = 0, se1 = 0;
  let sig0 = 0, sig1 = 0;
  for (const c of continuations) {
    const c0 = cell(gameId, strategyMap, 0, c, hands, seed, cfg0);
    const c1 = cell(gameId, strategyMap, 1, c, hands, seed + 5000, cfg0);
    perCont[c] = { dev0: c0.dev, dev1: c1.dev, se0: c0.se, se1: c1.se };
    sig0 = c0.sig; sig1 = c1.sig;
    if (c0.dev > best0) { best0 = c0.dev; bm0 = c; se0 = c0.se; }
    if (c1.dev > best1) { best1 = c1.dev; bm1 = c; se1 = c1.se; }
  }
  const raw = (best0 + best1) / 2;
  return {
    exploitability: Math.max(0, raw),
    rawDeviation: raw,
    dev0: best0, dev1: best1,
    bestCont: [bm0, bm1],
    se: Math.sqrt(se0 * se0 + se1 * se1) / 2,
    sigmaValue: [sig0, sig1],
    perCont, hands, continuations, margin: cfg0.margin,
  };
}

module.exports = { studLBR, cell, beliefEV, lbrHand, sigmaHand, STUD_GAMES };

// ── CLI / sanity harness ─────────────────────────────────────────────────────
//   node solver/lbr-stud.js --game razz  --hands 2000 --sanity
//   node solver/lbr-stud.js --game stud8 --hands 2000
if (require.main === module) {
  const fs = require('fs');
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
  const gameId = arg('game', 'razz');
  const hands = parseInt(arg('hands', '2000'), 10);
  const margin = parseFloat(arg('margin', '0.25'));
  const samples = parseInt(arg('samples', '300'), 10);
  if (!STUD_GAMES[gameId]) { console.error('unknown stud game', gameId, '(use razz | stud8)'); process.exit(1); }
  const file = arg('file', path.join(__dirname, 'strategies', gameId + '.json'));
  if (!fs.existsSync(file)) { console.error('no strategy file', file); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const sigma = data.strategy;

  console.log(`\n=== Best-response LBR meter — ${STUD_GAMES[gameId].name} ===`);
  console.log(`blueprint: ${(data.iterations || 0).toLocaleString()} iters, ${(data.infosets || 0).toLocaleString()} infosets`);
  console.log(`settings: ${hands} hands/seat, margin ${margin}, ${samples} MC samples/action\n`);

  const t0 = Date.now();
  const main = studLBR(gameId, sigma, { hands, margin, samples });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`TRAINED BLUEPRINT`);
  for (const c of main.continuations) {
    const d = main.perCont[c];
    console.log(`  [${c.padEnd(6)}] dev seat0 ${d.dev0.toFixed(3)} ±${d.se0.toFixed(3)}, seat1 ${d.dev1.toFixed(3)} ±${d.se1.toFixed(3)}`);
  }
  console.log(`  σ self-value (seat0,seat1): ${main.sigmaValue.map(x => x.toFixed(3)).join(', ')}`);
  console.log(`  best deviation (seat0,seat1): ${main.dev0.toFixed(3)} [${main.bestCont[0]}], ${main.dev1.toFixed(3)} [${main.bestCont[1]}]`);
  console.log(`  METER (best-response LBR): ${main.exploitability.toFixed(3)} ± ${main.se.toFixed(3)} chips/hand  [${secs}s]`);

  if (process.argv.includes('--sanity')) runSanity(gameId, sigma, hands, margin, samples, main);
}

// Full honesty harness: (1) uniform blueprint LARGE, (2) blueprint small(er),
// (3) meter ≥ fixed-exploiter LB.
function runSanity(gameId, sigma, hands, margin, samples, main) {
  const { referenceLowerBound } = require('./exploitability');
  const game = STUD_GAMES[gameId];
  const meter = main.exploitability;

  console.log(`\n--- SANITY CHECKS ---  (meter = best-response LBR = ${meter.toFixed(3)})`);

  // (3) meter ≥ fixed-exploiter lower bound; COMBINED = max(meter, fixed) ships.
  const ref = referenceLowerBound(game, sigma, { hands: 40000 }).lowerBound;
  const combined = Math.max(meter, ref);
  const pass3 = meter >= ref - 0.15;
  console.log(`(3) meter ≥ fixed-exploiter LB:`);
  console.log(`      meter ${meter.toFixed(3)}  vs  fixed-exploiter ${ref.toFixed(3)}  -> ${pass3 ? 'PASS (meter dominates)' : 'BELOW (fixed tighter here)'}`);
  console.log(`      COMBINED = max(meter, fixed) = ${combined.toFixed(3)} chips/hand  (the number to ship)`);

  // (1) UNIFORM-RANDOM blueprint must be LARGE. Empty map = uniform for BOTH the
  //     opponent's play and the belief reweighting (grade.lookup falls back to
  //     uniform on every infoset), so the belief matches how the opponent acts.
  const bhands = Math.min(hands, 600);
  const bu = studLBR(gameId, {}, { hands: bhands, margin: 0, samples });
  const pass1 = bu.exploitability > combined + 1.0;
  console.log(`(1) uniform-random blueprint LARGE (${bhands} hands, margin 0):`);
  console.log(`      uniform ${bu.exploitability.toFixed(3)} ± ${bu.se.toFixed(3)}  (>> blueprint ${combined.toFixed(3)}?)  -> ${pass1 ? 'PASS' : 'FAIL'}`);

  // (2) blueprint SMALL: positive but well under a big bet (8 for stud).
  const pass2 = combined >= 0 && combined < 8.0;
  console.log(`(2) blueprint small-ish: ${combined.toFixed(3)}  -> ${pass2 ? 'PASS' : 'CHECK'} (expect < 1 big bet = 8)`);

  console.log(`\n--- VERDICT ---`);
  console.log(`  shipped meter (combined): ${combined.toFixed(3)} chips/hand`);
  const trust = pass1 && pass2 && pass3;
  if (trust) console.log(`  TRUST: yes — the meter finds huge leaks in a uniform opponent, dominates the fixed exploiter, and is small on the blueprint.`);
  else console.log(`  TRUST: PARTIAL/NO — a gate did not pass cleanly (see above); ship the COMBINED number and read the gate detail.`);
  return { combined, pass1, pass2, pass3 };
}
