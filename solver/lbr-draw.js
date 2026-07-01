// ── Particle-filter Local Best Response (LBR) for the DRAW games ─────────────
// An exploitability LOWER BOUND (chips/hand) for the 2-7 Triple Draw and Badugi
// blueprints — the draw-game analogue of the Kuhn-calibrated LBR in lbr.js. At
// each of ITS OWN decisions the LBR best-responds against a belief over the
// opponent's hidden cards, then plays a fixed continuation for the rest of the
// hand. Whatever the continuation, the realised line is SOME concrete policy, so
// its value vs σ is a strict lower bound on σ's exploitability (a true BR would
// also play its own future optimally). We measure that realised value directly.
//
// WHY A PARTICLE FILTER. On Kuhn the opponent has one of three cards, so the
// belief is a 3-vector updated in closed form (lbr.js). In the draw games the
// opponent holds 4-5 hidden cards out of ~47 unseen and DRAWS new ones three
// times — the belief lives over C(47,5) ≈ 1.5M hands and is reshaped by every
// draw. We approximate it with N weighted particles = candidate opponent hands
// consistent with the public state and the LBR's own dead cards:
//   • OPPONENT BET  -> reweight each particle by σ(observed action | particle):
//                      particle hand -> cfg.bucket -> infoset key -> σ prob.
//   • OPPONENT DRAW -> resample each particle: cfg.chooseKeep picks its discards,
//                      then draw the OBSERVED number of replacements from that
//                      particle's unseen pool (52 − my cards − my discards −
//                      this particle's kept cards − this particle's own discards).
//   • LBR DECISION  -> best-respond: for each legal action estimate EV by rolling
//                      to showdown over the weighted particles (opp plays σ, LBR
//                      plays its rollout continuation), compare via cfg.compare.
//
// THREE THINGS MAKE THE NUMBER TRUSTWORTHY AND TIGHT (each learned from a failure
// mode found while building this — see the worklog):
//   1. CONTINUATION = max over {sigma, aggro}. A naive call-down rollout is so
//      weak (it loses ~2.7 chips/hand to σ in badugi by itself) that the LBR's
//      deviation goes NEGATIVE. 'sigma' (LBR plays the blueprint after its
//      deviation) is a competent continuation; 'aggro' (keep betting/raising)
//      exposes a blueprint that folds/calls too much under pressure — the leak a
//      σ-continuation can't see because σ stops firing. Each mode is a real
//      policy ⇒ exploitability ≥ EVERY mode ⇒ ≥ their MAX; we take the per-seat
//      max.
//   2. DEVIATE ONLY ON CONFIDENT IMPROVEMENT (`margin`), with COMMON RANDOM
//      NUMBERS across the actions at a node. A noisy argmax is NOT a best
//      response — taking the highest *estimated* action can realise worse than
//      σ's own mixture when EV gaps are within the estimate noise (this dragged
//      badugi below σ). Evaluating every action on the SAME particles + same
//      future draws cancels most of that noise; the margin gates the rest.
//   3. SHIP max(particle-filter, fixed-exploiter). A lower-bound meter should
//      publish the best bound it can prove. On td27 the simple maniac exploiter
//      is still tighter than the particle filter, so the combined number leans on
//      it there; on badugi the fixed bound is 0 and the particle filter IS the
//      meter. The driver lbr-draw-run.js reports the combined number.
//
// There is NO exact calibration for the draw games (that intractability is the
// whole reason they are unmeasured), so trust is gated on sanity checks (runSanity
// / the CLI / lbr-draw-run.js) and reported honestly:
//   (1) particle-filter ≥ the existing fixed-exploiter LB (at least as tight);
//   (2) on the trained blueprint it is a SMALL positive number;
//   (3) on deliberately broken strategies (uniform, always-fold) it is LARGE;
//   (4) it is STABLE as the particle count grows.
//
//   const { drawLBR } = require('./lbr-draw');
//   drawLBR(game, strategyMap, { particles: 150, hands: 4000 }).exploitability
//   // or, parallel + combined meter + standard errors:
//   //   node solver/lbr-draw-run.js --game td27   --particles 120 --hands 6000
//   //   node solver/lbr-draw-run.js --game badugi --particles 120 --hands 8000

const { makeRng, makeDeck } = require('./engine/cards');

const FULL_DECK = makeDeck(); // static [0..51], never mutated

// ── Memoize the per-hand cfg hooks (HOT PATH) ────────────────────────────────
// These are re-evaluated thousands of times on the SAME hands inside rollouts (a
// hand only changes when it draws), and each involves a sort / 2^n subset scan /
// score. Caching them by a per-hand card key cuts the dominant cost (profile:
// infosetKey+chooseKeep+legalActions ≈ 25%+ of ticks). We patch the live game.cfg
// once per game object; idempotent via a marker.
//
// KEYING — the two functions differ in what they actually depend on, and the key
// MUST match or a value computed for one hand leaks into a later hand (an
// order-dependent, non-reproducible grade):
//   • bucket / drawOptions are pure functions of the card MULTISET — they return a
//     category / draw-count set that is identical for every ordering of the same
//     cards. Key on the ORDER-INDEPENDENT (sorted) key so all orderings share one
//     entry (max reuse).
//   • chooseKeep is a pure function of the ORDERED hand (+ draw count). It scans
//     subsets in input-array order and keeps the FIRST subset that ties the best
//     score (strict `v < bestScore`), so when two keep-sets tie the winner — and
//     therefore WHICH card is discarded — depends on the card order. The sorted
//     key would collapse all orderings into one entry, letting the first ordering
//     seen (in a PRIOR hand) decide the tie for every later hand with the same
//     multiset. Key on the ORDER-PRESERVING key so the cached value equals the
//     un-memoized value for the exact input, every time.
function handKey(hand) {
  // small fixed-size hands (4-5 cards): sort a copy, join. Order-INDEPENDENT.
  const h = hand.slice().sort((a, b) => a - b);
  return h.join(',');
}
function handKeyOrdered(hand) {
  // order-PRESERVING: distinguishes card orderings that tie-break differently.
  return hand.join(',');
}
function memoizeCfg(game) {
  const cfg = game.cfg;
  if (cfg.__memoized__) return;
  const bucket0 = cfg.bucket, drawOpts0 = cfg.drawOptions, keep0 = cfg.chooseKeep;
  const bCache = new Map(), dCache = new Map(), kCache = new Map();
  cfg.bucket = function (hand, street, phase) {
    // bucket() in both draw games ignores street/phase (signature kept for the
    // interface); key on the hand only.
    const k = handKey(hand);
    let v = bCache.get(k);
    if (v === undefined) { v = bucket0(hand, street, phase); bCache.set(k, v); }
    return v;
  };
  cfg.drawOptions = function (hand) {
    const k = handKey(hand);
    let v = dCache.get(k);
    if (v === undefined) { v = drawOpts0(hand); dCache.set(k, v); }
    return v;
  };
  cfg.chooseKeep = function (hand, n) {
    // ORDER-PRESERVING key: chooseKeep's tie-break is position-dependent, so the
    // multiset key would leak a prior hand's tie result into this one.
    const k = handKeyOrdered(hand) + '|' + n;
    let v = kCache.get(k);
    if (v === undefined) { v = keep0(hand, n); kCache.set(k, v); }
    return v.slice(); // callers mutate the returned array — hand back a copy
  };
  cfg.__memoized__ = true;
}

// σ(action | infoset). Matches exploitability.js / lbr.js: an unvisited or
// shape-mismatched infoset falls back to uniform over the legal actions.
//
// `strategyMap` may carry a `__policy__` tag that overrides the per-node
// distribution wholesale (used to express deliberately-broken opponents for the
// sanity gate without enumerating every infoset):
//   'fold'    — fold to any bet (prob 1 on 'f' when 'f' is legal), else passive;
//               at draw nodes, the natural draw. The always-fold baseline.
//   'uniform' — uniform over legal actions (identical to an empty map).
// The tag is consulted by BOTH the opponent's real play AND the LBR's belief
// reweighting, so the belief always matches how the opponent actually acts.
function probsOf(strategyMap, key, acts) {
  const tag = strategyMap && strategyMap.__policy__;
  if (tag) return taggedProbs(tag, acts);
  const n = strategyMap[key];
  if (n && n.a.length === acts.length && n.a.every((a, i) => a === acts[i])) return n.p;
  return acts.map(() => 1 / acts.length);
}

function taggedProbs(tag, acts) {
  if (tag === 'fold') {
    // Draw node: deterministic natural draw (largest non-zero, else pat).
    if (acts[0] && acts[0][0] === 'd') {
      const counts = acts.map(a => parseInt(a.slice(1), 10));
      const nz = counts.filter(c => c > 0);
      const k = nz.length ? Math.max(...nz) : 0;
      return acts.map(a => (a === 'd' + k ? 1 : 0));
    }
    if (acts.includes('f')) return acts.map(a => (a === 'f' ? 1 : 0));
    if (acts.includes('k')) return acts.map(a => (a === 'k' ? 1 : 0));
    return acts.map((_, i) => (i === 0 ? 1 : 0));
  }
  // 'uniform' or unknown tag
  return acts.map(() => 1 / acts.length);
}

// Sample an action from σ at the current node (used for the REAL opponent's play
// and for the opponent inside rollouts).
function sigmaAction(strategyMap, game, st, rng) {
  const acts = game.legalActions(st);
  const p = probsOf(strategyMap, game.infosetKey(st), acts);
  let r = rng();
  for (let i = 0; i < acts.length; i++) { r -= p[i]; if (r <= 0) return acts[i]; }
  return acts[acts.length - 1];
}

// ── The opponent infoset key for a HYPOTHETICAL opponent hand ────────────────
// Reuse the game's own infosetKey so the key is byte-identical to what the
// blueprint was trained on. `st` must be a node where the opponent (= 1 - me)
// is to act; we swap in the particle's hand and read the key, then restore.
function oppInfosetKey(game, st, me, particleHand) {
  const opp = 1 - me;
  const saved = st.hands[opp];
  st.hands[opp] = particleHand;
  const key = game.infosetKey(st);
  st.hands[opp] = saved;
  return key;
}

// ── Particle pool bookkeeping ────────────────────────────────────────────────
// From the LBR's seat `me`, the unseen universe is the full deck minus the
// cards the LBR can see: its own current hand and its own discards. (It never
// sees the opponent's cards or the opponent's discards.) Each particle is one
// possible opponent hand drawn from that universe; a particle additionally
// tracks its OWN simulated discards so its later draws stay card-consistent.
function unseenUniverse(st, me) {
  const seen = new Set();
  for (const c of st.hands[me]) seen.add(c);
  for (const c of st.discards[me]) seen.add(c);
  const pool = [];
  for (const c of FULL_DECK) if (!seen.has(c)) pool.push(c);
  return pool; // includes the opponent's real (unknown-to-us) hand
}

// Draw `count` distinct cards from `pool` excluding `exclude` (a Set), via rng.
function drawFrom(pool, exclude, count, rng) {
  const avail = [];
  for (const c of pool) if (!exclude.has(c)) avail.push(c);
  // partial Fisher-Yates: pick `count` without replacement
  const out = [];
  for (let i = 0; i < count && avail.length > 0; i++) {
    const j = Math.floor(rng() * avail.length);
    out.push(avail[j]);
    avail[j] = avail[avail.length - 1];
    avail.pop();
  }
  return out;
}

// Initialise N particles: random opponent hands of the right size from the
// unseen universe. Weights uniform. Each particle also remembers its discards
// (empty at the deal).
function initParticles(st, me, N, handSize, rng) {
  const pool = unseenUniverse(st, me);
  const parts = [];
  for (let i = 0; i < N; i++) {
    const hand = drawFrom(pool, new Set(), handSize, rng);
    parts.push({ hand, discards: [], w: 1 });
  }
  return parts;
}

// Normalise weights; if they all collapsed to ~0 (the observed line was σ-prob
// zero under every particle), reset to uniform so the filter degrades to "no
// information from this action" rather than dividing by zero.
function normalize(parts) {
  let z = 0;
  for (const p of parts) z += p.w;
  if (z <= 1e-300) { for (const p of parts) p.w = 1 / parts.length; return false; }
  for (const p of parts) p.w /= z;
  return true;
}

// Systematic (low-variance) resampling of particles by weight → N equal-weight
// particles. Keeps the population from degenerating to one heavy particle.
function resampleByWeight(parts, rng) {
  const N = parts.length;
  const out = [];
  const step = 1 / N;
  let u = rng() * step;
  let c = parts[0].w, i = 0;
  for (let k = 0; k < N; k++) {
    const target = u + k * step;
    while (target > c && i < N - 1) { i++; c += parts[i].w; }
    const src = parts[i];
    out.push({ hand: src.hand.slice(), discards: src.discards.slice(), w: 1 });
  }
  return out;
}

// ── Reweight on an observed OPPONENT betting action ──────────────────────────
// `st` is the node where the opponent acted; `ai` is the index of the action it
// took among game.legalActions(st). Multiply each particle weight by σ of that
// action for the particle's hand. Returns `normalize`'s boolean: TRUE if a real
// (non-degenerate) update occurred, FALSE if every particle's weight collapsed to
// ~0 and `normalize` had to RESET the population to uniform (the observed action
// was σ-prob-zero under every particle — the belief learned NOTHING and is now
// maximally uninformed). Callers that care about belief quality (the grader)
// inspect this; the LBR's own callers ignore it (unchanged behaviour).
function reweightOnAction(strategyMap, game, st, me, parts, acts, ai) {
  for (const p of parts) {
    const key = oppInfosetKey(game, st, me, p.hand);
    const pr = probsOf(strategyMap, key, acts)[ai];
    p.w *= pr;
  }
  return normalize(parts);
}

// ── Resample on an observed OPPONENT draw of `count` cards ───────────────────
// Each particle keeps cfg.chooseKeep(hand, count) and draws `count` fresh cards
// from ITS OWN unseen pool: the global unseen universe minus the cards THIS
// particle holds (kept) and has discarded. The discarded kept-cards join the
// particle's dead set (they are now used up for that particle, though invisible
// to the LBR's public view).
function resampleOnDraw(game, st, me, parts, count, globalPool, rng) {
  if (count === 0) return; // pat: hand unchanged
  const cfg = game.cfg;
  for (const p of parts) {
    const keep = cfg.chooseKeep(p.hand, count);
    const discarded = p.hand.filter(c => !keep.includes(c));
    p.discards = p.discards.concat(discarded);
    // Exclude everything this particle has touched (kept + all its discards) so
    // replacements are card-consistent; globalPool already excludes MY cards.
    const exclude = new Set();
    for (const c of keep) exclude.add(c);
    for (const c of p.discards) exclude.add(c);
    const fresh = drawFrom(globalPool, exclude, count, rng);
    p.hand = keep.concat(fresh);
  }
}

// ── Rollout to showdown, for ONE particle hand ───────────────────────────────
// The opponent (= 1 - me) ALWAYS plays σ. The LBR (= me) plays its ROLLOUT
// continuation, set by `rolloutMode`:
//   'sigma'   (default) — the LBR follows the blueprint σ for its own future
//             actions. This is the right default for a MULTI-STREET LIMIT game:
//             the "deviate to the best action NOW, then play σ" policy is a real
//             policy, so its value is a VALID lower bound on exploitability, and
//             it is far tighter than a passive rollout because σ is a competent
//             continuation. (A naive call-down rollout loses ~2.7 chips/hand to σ
//             in badugi all by itself, swamping any one-decision gain — see the
//             passive-policy probe — so passive UNDER-states exploitability and
//             routinely goes negative. σ-rollout fixes that.)
//   'passive' — never folds/raises: check/call and take the natural draw. Kept
//             only for diagnostics; do not use for the headline number.
// Returns the utility to `me`. Draw replacements come from the per-particle
// unseen pool so the rollout is card-consistent.
function passiveAction(game, st) {
  const acts = game.legalActions(st);
  if (acts[0] && acts[0][0] === 'd') {
    // natural draw: the largest non-zero draw on offer, else pat (matches the
    // "improve" intent; pat-only hands only offer d0).
    const counts = acts.map(a => parseInt(a.slice(1), 10));
    const nonzero = counts.filter(c => c > 0);
    const k = nonzero.length ? Math.max(...nonzero) : 0;
    return 'd' + k;
  }
  if (acts.includes('k')) return 'k';
  if (acts.includes('c')) return 'c';
  return acts[acts.length - 1];
}

// Aggressive rollout action: bet/raise whenever legal, else call/check, NEVER
// fold; natural draw at draw nodes. This is the continuation that exposes a
// blueprint that folds/calls too much against sustained pressure (the kind of
// leak the 'maniac' fixed exploiter catches but a σ-continuation cannot, because
// σ won't keep firing). It is a real policy, so the LBR that deviates-then-plays
// this is a valid lower bound.
function aggroAction(game, st) {
  const acts = game.legalActions(st);
  if (acts[0] && acts[0][0] === 'd') return passiveAction(game, st); // natural draw
  if (acts.includes('r')) return 'r';
  if (acts.includes('b')) return 'b';
  if (acts.includes('k')) return 'k';
  if (acts.includes('c')) return 'c';
  return acts[0];
}

// The LBR's own action inside a rollout, per mode.
function rolloutSelfAction(strategyMap, game, st, rng, rolloutMode) {
  if (rolloutMode === 'passive') return passiveAction(game, st);
  if (rolloutMode === 'aggro') return aggroAction(game, st);
  return sigmaAction(strategyMap, game, st, rng); // 'sigma'
}

// Roll a single hypothetical hand (me holds its real cards, opp holds `oppHand`)
// out to terminal. `shuffledPool` is an ALREADY-SHUFFLED copy of the scenario's
// unseen cards (excludes my cards/discards); we form this particle's private deck
// by filtering out oppHand while PRESERVING the shuffled order — so we pay the
// O(n) shuffle once per decision (in bestResponseAction), not once per particle.
// Draws for both players come off the end of that deck, mirroring sampleChance.
function rolloutValue(strategyMap, game, st0, me, oppHand, shuffledPool, rng, rolloutMode) {
  const opp = 1 - me;
  // Exclude only the opponent's CURRENT hand (its prior discards are unknown to
  // us — second-order, washes out across particles). oppHand is tiny (≤5), so a
  // linear membership test beats a Set.
  const deck = [];
  for (let i = 0; i < shuffledPool.length; i++) {
    const c = shuffledPool[i];
    if (oppHand.indexOf(c) < 0) deck.push(c);
  }
  // clone the public state but install oppHand + private deck
  let st = cloneState(st0);
  st.hands[opp] = oppHand.slice();
  st.deck = deck;

  let guard = 0;
  while (!game.isTerminal(st)) {
    if (++guard > 200) break;
    if (game.isChance(st)) { st = game.sampleChance(st, rng); continue; }
    const p = game.currentPlayer(st);
    let a;
    if (p === me) a = rolloutSelfAction(strategyMap, game, st, rng, rolloutMode);
    else a = sigmaAction(strategyMap, game, st, rng);
    st = game.applyAction(st, a);
  }
  return game.utility(st)[me];
}

// Deep-ish clone of the public state (same fields draw-game.js clones).
function cloneState(s) {
  return {
    deck: s.deck,
    hands: [s.hands[0].slice(), s.hands[1].slice()],
    street: s.street, phase: s.phase, toAct: s.toAct,
    bets: s.bets, contrib: s.contrib.slice(), acted: s.acted.slice(),
    folded: s.folded, hist: s.hist, curSeq: s.curSeq,
    pendingDraw: s.pendingDraw,
    drawCounts: [s.drawCounts[0].slice(), s.drawCounts[1].slice()],
    discards: [s.discards[0].slice(), s.discards[1].slice()],
    log: [], // LBR never reads the log; start empty so engine clones stay cheap
  };
}

// The k highest-weight particles (for capping rollout cost at decision nodes).
function topByWeight(parts, k) {
  if (k >= parts.length) return parts;
  return parts.slice().sort((a, b) => b.w - a.w).slice(0, k);
}

// EV of an action over a FIXED set of rollout scenarios (particles + one shared
// shuffled deck + a fixed rng seed). Re-using the SAME seed across actions makes
// the per-action EV *differences* low-variance (common random numbers), so the
// argmax is reliable even when absolute EVs are noisy.
function actionEVcrn(strategyMap, game, st, me, a, used, shuffledPool, rolloutMode, crnSeed) {
  const st2 = game.applyAction(st, a);
  const rng = makeRng(crnSeed);
  let ev = 0, wsum = 0;
  for (const p of used) {
    if (p.w <= 0) continue;
    ev += p.w * rolloutValue(strategyMap, game, st2, me, p.hand, shuffledPool, rng, rolloutMode);
    wsum += p.w;
  }
  return wsum > 0 ? ev / wsum : 0;
}

// Pick the LBR's action at a betting node: best-respond over the belief, but only
// DEVIATE from σ when an action beats σ's own action by `margin` (else play a σ
// sample). Common-random rollouts across actions + the margin together stop a
// noisy argmax from realising WORSE than σ.
function bestResponseAction(strategyMap, game, st, me, parts, rng, cfg, acts) {
  const { rolloutMode, evParticles, margin } = cfg;
  const pool = unseenUniverse(st, me);
  const used = evParticles && evParticles < parts.length ? topByWeight(parts, evParticles) : parts;
  // one shared shuffled deck for ALL actions at this node
  const sp = pool.slice();
  for (let i = sp.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = sp[i]; sp[i] = sp[j]; sp[j] = t;
  }
  const crnSeed = (rng() * 0xffffffff) >>> 0; // shared rng seed for every action's rollouts

  // σ's reference action (what the blueprint would play here) and its EV.
  const sigA = sigmaAction(strategyMap, game, st, rng);
  const sigEV = actionEVcrn(strategyMap, game, st, me, sigA, used, sp, rolloutMode, crnSeed);

  let bestA = sigA, bestEV = sigEV;
  for (const a of acts) {
    if (a === sigA) continue;
    const ev = actionEVcrn(strategyMap, game, st, me, a, used, sp, rolloutMode, crnSeed);
    if (ev > bestEV) { bestEV = ev; bestA = a; }
  }
  // Deviate only on a confident improvement; otherwise stick with σ's action.
  return (bestA !== sigA && bestEV - sigEV > margin) ? bestA : sigA;
}

// ── One LBR hand vs σ, with the LBR in seat `me` ─────────────────────────────
// Returns the utility to `me`. The deal is sampled by the game; the REAL
// opponent plays σ throughout; at the LBR's nodes it best-responds using the
// particle belief; the particle filter is updated on every opponent action and
// draw. The LBR's OWN draws use the natural draw (chooseKeep) — it does not try
// to optimise its draw count (that keeps it a valid lower bound and avoids a
// second nested search; the value comes from the bet/fold/raise best response).
function lbrHandFrom(strategyMap, game, me, N, handSize, rng, cfg, st0) {
  const rolloutMode = cfg.rolloutMode;
  const evParticles = cfg.evParticles;
  let st = st0;
  let parts = initParticles(st, me, N, handSize, rng);
  let guard = 0;

  while (!game.isTerminal(st)) {
    if (++guard > 200) break;

    if (game.isChance(st)) {
      // A real chance node = a DRAW just declared by some player. If it was the
      // OPPONENT's draw, resample the particles by the observed count. (Our own
      // draw's chance node carries no opponent information.)
      const pd = st.pendingDraw;
      if (pd && pd.player === (1 - me)) {
        const pool = unseenUniverse(st, me);
        resampleOnDraw(game, st, me, parts, pd.count, pool, rng);
      }
      st = game.sampleChance(st, rng);
      continue;
    }

    const p = game.currentPlayer(st);
    const acts = game.legalActions(st);

    if (p === me) {
      if (st.phase === 'draw') {
        // LBR's own draw: follow the rollout continuation's draw policy so the
        // LBR's non-decision play is consistent with how its actions are valued.
        // Draw-count optimisation is intentionally left to that policy — the
        // exploitation signal comes from the bet/fold/raise best response, and
        // this keeps the bound clean.
        const a = rolloutSelfAction(strategyMap, game, st, rng, rolloutMode);
        st = game.applyAction(st, a);
        continue;
      }
      // Betting node: BEST RESPOND over the particle belief — but only DEVIATE
      // from σ when an action is CONFIDENTLY better (margin), else play σ. A
      // noisy argmax is not a best response; deterministically taking the
      // highest *estimated* action can be worse than σ's own mixture when the
      // EV gaps are within the estimate noise (this is exactly what dragged the
      // badugi LBR below σ). Evaluating all actions on COMMON random rollouts
      // (same particles + same future draws) cancels most of that noise, and the
      // margin gates out the rest. Both keep it a valid lower bound.
      const a = bestResponseAction(strategyMap, game, st, me, parts, rng, cfg, acts);
      st = game.applyAction(st, a);
      continue;
    }

    // Opponent node: it plays σ for real; we observe the action and update.
    if (st.phase === 'draw') {
      // Opponent's draw DECLARATION. The count it announces is public; reweight
      // happens at the following chance node (resampleOnDraw). Here just let it
      // act under σ. (Its declared count becomes observable via drawCounts.)
      const a = sigmaAction(strategyMap, game, st, rng);
      st = game.applyAction(st, a);
      continue;
    }
    // Opponent betting action under σ → reweight the belief by σ(action).
    const a = sigmaAction(strategyMap, game, st, rng);
    const ai = acts.indexOf(a);
    reweightOnAction(strategyMap, game, st, me, parts, acts, ai);
    // Periodically resample to fight weight degeneracy.
    if (effectiveSampleSize(parts) < parts.length / 2) parts = resampleByWeight(parts, rng);
    st = game.applyAction(st, a);
  }

  return game.utility(st)[me];
}

function effectiveSampleSize(parts) {
  let s = 0, s2 = 0;
  for (const p of parts) { s += p.w; s2 += p.w * p.w; }
  return s2 > 0 ? (s * s) / s2 : 0;
}

// Common-random-numbers (CRN): each hand `i` is DEALT from makeRng(dealSeed + i)
// so the LBR run and the σ-baseline run see the IDENTICAL deck on hand i, no
// matter how differently the two policies consume randomness. We deal the full
// shuffled deck once per hand and feed both seats from the same shuffle; the
// policy then draws from a SEPARATE rng stream so action noise doesn't perturb
// the deal. Their per-seat difference is thus a paired (low-variance) estimate.
function dealHand(game, dealSeed, i) {
  return game.newHand(makeRng((dealSeed + i * 2654435761) >>> 0));
}

// σ's own value to seat `me` (σ vs σ), Monte-Carlo over `hands` CRN deals.
function sigmaValueSeat(strategyMap, game, me, hands, dealSeed, polSeed) {
  const rng = makeRng(polSeed);
  let total = 0;
  for (let i = 0; i < hands; i++) {
    let st = dealHand(game, dealSeed, i);
    let guard = 0;
    while (!game.isTerminal(st)) {
      if (++guard > 200) break;
      if (game.isChance(st)) { st = game.sampleChance(st, rng); continue; }
      st = game.applyAction(st, sigmaAction(strategyMap, game, st, rng));
    }
    total += game.utility(st)[me];
  }
  return total / hands;
}

// LBR value to seat `me` (LBR vs σ), Monte-Carlo over `hands` CRN deals.
function lbrValueSeat(strategyMap, game, me, N, handSize, hands, dealSeed, polSeed, cfg) {
  const rng = makeRng(polSeed);
  let total = 0;
  for (let i = 0; i < hands; i++) {
    const st0 = dealHand(game, dealSeed, i);
    total += lbrHandFrom(strategyMap, game, me, N, handSize, rng, cfg, st0);
  }
  return total / hands;
}

// ── Public API ───────────────────────────────────────────────────────────────
// drawLBR(game, strategyMap, opts) → { exploitability, dev0, dev1, ... }
//   particles    number of belief particles            (default 200)
//   hands        LBR hands per seat                     (default 3000)
//   seed         PRNG seed                              (default 12345)
//   rolloutMode  'sigma' (default) | 'passive'          — own continuation policy
//   evParticles  cap on particles rolled out per EV     (default = particles)
// exploitability = mean over seats of (LBR value − σ value): a valid LOWER BOUND
// on the true exploitability. The per-seat deviations are returned too; they can
// dip slightly negative on a hard-to-exploit σ (the deviate-once continuation is
// no better than σ there) — which is itself evidence the strategy is solid. We
// report the raw deviation and clamp at 0 for the headline.
function drawLBR(game, strategyMap, opts = {}) {
  memoizeCfg(game); // patch the hot pure cfg hooks with caches (idempotent)
  const N = opts.particles || 200;
  const hands = opts.hands || 3000;
  const seed = opts.seed || 12345;
  const handSize = game.cfg.handSize;
  // Belief uses all N particles; rollouts at a decision use the top-weighted
  // `evParticles` to bound cost. Default caps at 40 (plenty for a stable EV mean)
  // but never exceeds N.
  const evParticles = opts.evParticles || Math.min(40, N);

  // Rollout-continuation policies to try. Each yields a DISTINCT realized LBR
  // policy, so the true exploitability is ≥ EVERY one of them ⇒ ≥ their MAX. We
  // take the max per seat. 'sigma' captures normal value; 'aggro' captures leaks
  // that need sustained pressure (the maniac-style fold/call-too-much leak that a
  // σ-continuation can't, because σ stops firing); 'passive' is a cheap floor.
  // (Validity: each is a real policy played out and measured directly.)
  const modes = opts.modes || ['sigma', 'aggro'];
  // Deviate from σ only on a confident EV improvement of at least `margin`
  // chips. Guards against a noisy argmax realising worse than σ. 0 = always take
  // the estimated argmax (old behaviour).
  const margin = opts.margin != null ? opts.margin : 0.2;

  // CRN: each seat uses a deal-seed shared across the σ baseline and every LBR
  // mode, plus separate policy-seeds. Hand i is dealt identically everywhere, so
  // every dev is a paired, low-variance estimate.
  const dealSeed0 = seed, dealSeed1 = seed + 777;
  const sig0 = sigmaValueSeat(strategyMap, game, 0, hands, dealSeed0, seed + 2);
  const sig1 = sigmaValueSeat(strategyMap, game, 1, hands, dealSeed1, seed + 4);

  const perMode = {};
  let best0 = -Infinity, best1 = -Infinity, bestMode0 = null, bestMode1 = null;
  let bestLbr0 = 0, bestLbr1 = 0;
  for (const m of modes) {
    const cfg = { rolloutMode: m, evParticles, margin };
    const lbr0 = lbrValueSeat(strategyMap, game, 0, N, handSize, hands, dealSeed0, seed + 1, cfg);
    const lbr1 = lbrValueSeat(strategyMap, game, 1, N, handSize, hands, dealSeed1, seed + 3, cfg);
    perMode[m] = { dev0: lbr0 - sig0, dev1: lbr1 - sig1, lbr0, lbr1 };
    if (lbr0 - sig0 > best0) { best0 = lbr0 - sig0; bestMode0 = m; bestLbr0 = lbr0; }
    if (lbr1 - sig1 > best1) { best1 = lbr1 - sig1; bestMode1 = m; bestLbr1 = lbr1; }
  }

  const dev0 = best0, dev1 = best1;
  const raw = (dev0 + dev1) / 2;
  return {
    exploitability: Math.max(0, raw),
    rawDeviation: raw,
    dev0, dev1,
    bestMode: [bestMode0, bestMode1],
    lbrValue: [bestLbr0, bestLbr1],
    sigmaValue: [sig0, sig1],
    perMode,
    particles: N, hands,
    modes, margin,
  };
}

// Single (seat, mode) cell — used by the parallel driver (lbr-draw-run.js). Runs
// the LBR and the σ baseline HAND-BY-HAND on the SAME CRN deal, so the per-hand
// deviation d_i = u_LBR(i) − u_σ(i) is paired; we return mean dev and its
// standard error (sd of d_i / √hands) so the report can state precision honestly.
function _cell(game, strategyMap, seat, mode, N, hands, evParticles, seed, margin) {
  memoizeCfg(game);
  const handSize = game.cfg.handSize;
  const cfg = { rolloutMode: mode, evParticles: evParticles || Math.min(40, N),
                margin: margin != null ? margin : 0.2 };
  const dealSeed = (seed + seat * 777) >>> 0;
  const rngL = makeRng(seed + 1), rngS = makeRng(seed + 2);
  let sumL = 0, sumS = 0, sumD = 0, sumD2 = 0;
  for (let i = 0; i < hands; i++) {
    const uL = lbrHandFrom(strategyMap, game, seat, N, handSize, rngL, cfg, dealHand(game, dealSeed, i));
    const uS = sigmaHandFrom(strategyMap, game, seat, rngS, dealHand(game, dealSeed, i));
    const d = uL - uS;
    sumL += uL; sumS += uS; sumD += d; sumD2 += d * d;
  }
  const dev = sumD / hands;
  const varD = Math.max(0, sumD2 / hands - dev * dev);
  const se = Math.sqrt(varD / hands);
  return { lbr: sumL / hands, sig: sumS / hands, dev, se, seat, mode, hands, N };
}

// One σ-vs-σ hand to seat `me` from a pre-dealt state (CRN partner of lbrHandFrom).
function sigmaHandFrom(strategyMap, game, me, rng, st0) {
  let st = st0, guard = 0;
  while (!game.isTerminal(st)) {
    if (++guard > 200) break;
    if (game.isChance(st)) { st = game.sampleChance(st, rng); continue; }
    st = game.applyAction(st, sigmaAction(strategyMap, game, st, rng));
  }
  return game.utility(st)[me];
}

module.exports = {
  drawLBR, probsOf, _cell, memoizeCfg,
  // ── Particle-filter internals reused by the draw-trainer grading engine ──
  // (solver/draw-trainer/grade.js). These are the EXACT primitives the LBR
  // uses to maintain + roll out the opponent posterior; the grader reuses them
  // so a DRAW node and a BET node share one belief-and-EV machine. Exporting
  // them is additive — no behaviour of drawLBR changes.
  initParticles, reweightOnAction, resampleOnDraw, unseenUniverse,
  effectiveSampleSize, resampleByWeight, topByWeight, oppInfosetKey,
  actionEVcrn, rolloutValue, sigmaAction, normalize,
};

// ── CLI / sanity harness:  node solver/lbr-draw.js --game td27 ───────────────
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const { GAMES } = require('./games');
  const { referenceLowerBound } = require('./exploitability');
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };

  const gameId = arg('game', 'td27');
  const particles = parseInt(arg('particles', '200'), 10);
  const hands = parseInt(arg('hands', '3000'), 10);
  const game = GAMES[gameId];
  if (!game) { console.error('unknown game', gameId); process.exit(1); }
  const file = arg('file', path.join(__dirname, 'strategies', gameId + '.json'));
  if (!fs.existsSync(file)) { console.error('no strategy file', file); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const sigma = data.strategy;

  console.log(`\n=== Particle-filter LBR — ${game.name} ===`);
  console.log(`blueprint: ${data.iterations.toLocaleString()} iters, ${data.infosets.toLocaleString()} infosets`);
  console.log(`settings: ${particles} particles, ${hands} hands/seat\n`);

  // Headline number on the trained blueprint.
  const t0 = Date.now();
  const main = drawLBR(game, sigma, { particles, hands });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`TRAINED BLUEPRINT`);
  for (const m of main.modes) {
    const d = main.perMode[m];
    console.log(`  [${m.padEnd(7)}] dev seat0 ${d.dev0.toFixed(3)}, seat1 ${d.dev1.toFixed(3)}`);
  }
  console.log(`  σ self-value(seat0,seat1): ${main.sigmaValue.map(x => x.toFixed(3)).join(', ')}`);
  console.log(`  best deviation (seat0,seat1): ${main.dev0.toFixed(3)} [${main.bestMode[0]}], ${main.dev1.toFixed(3)} [${main.bestMode[1]}]`);
  console.log(`  EXPLOITABILITY (LBR lower bound): ${main.exploitability.toFixed(3)} chips/hand  [${secs}s]`);

  if (process.argv.includes('--sanity')) runSanity(game, sigma, particles, hands, main);
}

// Full honesty harness — runs every gate and prints PASS/FAIL with the numbers.
// The sub-checks use lighter settings than the headline (broken strategies are
// obvious; stability only needs a moderate, fixed hand count) so the whole gate
// finishes in minutes, not hours.
function runSanity(game, sigma, particles, hands, main) {
  const { referenceLowerBound } = require('./exploitability');
  const PF = main.exploitability; // pure particle-filter best-response number

  console.log(`\n--- SANITY CHECKS ---  (PF = particle-filter LBR = ${PF.toFixed(3)})`);

  // (1) PF must be AT LEAST AS TIGHT as the fixed-exploiter lower bound. We also
  //     report the COMBINED meter = max(PF, fixed) — a lower-bound meter should
  //     always publish the best bound it can prove, so the shipped number is the
  //     combined one. The check is honest about whether the particle filter ALONE
  //     already dominates the fixed exploiters.
  const ref = referenceLowerBound(game, sigma, { hands: 40000 }).lowerBound;
  const combined = Math.max(PF, ref);
  const pass1 = PF >= ref - 0.10; // small MC tolerance
  console.log(`(1) tighter-than-fixed-exploiter:`);
  console.log(`      PF ${PF.toFixed(3)}  vs  fixed-exploiter ${ref.toFixed(3)}   -> ${pass1 ? 'PASS (PF dominates)' : 'BELOW (fixed is tighter here)'}`);
  console.log(`      COMBINED meter = max(PF, fixed) = ${combined.toFixed(3)} chips/hand  (the number to ship)`);

  // (2) on the blueprint the meter should be a SMALL POSITIVE number — positive
  //     (real leaks exist; no abstraction is perfect) but well under a big bet (4)
  //     for a 1.8M-iteration blueprint.
  const small = combined > 0.05 && combined < 4.0;
  console.log(`(2) small-positive on blueprint: ${combined.toFixed(3)}  -> ${small ? 'PASS' : 'CHECK'} (expect >0 and < 1 big bet = 4)`);

  // (3) deliberately broken strategies must be LARGE. The clean signal is UNIFORM
  //     (a uniform-random opponent) — clearly more exploitable than the blueprint.
  //     always-fold is reported too but its DEVIATION is confounded (always-fold
  //     self-play already lets one seat steal every pot, so its baseline is high),
  //     so we gate on uniform and show always-fold as context. Few hands needed.
  const bhands = Math.min(hands, 800);
  const bN = Math.min(particles, 100);
  const bu = drawLBR(game, {}, { particles: bN, hands: bhands, margin: 0 }); // empty map = uniform; margin 0 to attack freely
  const bf = drawLBR(game, makeBrokenStrategy(game, 'fold'), { particles: bN, hands: bhands, margin: 0 });
  const pass3 = bu.exploitability > combined + 1.0;
  console.log(`(3) broken strategies LARGE (${bhands} hands, margin 0):`);
  console.log(`      uniform ${bu.exploitability.toFixed(3)}  (>> blueprint ${combined.toFixed(3)}?)  -> ${pass3 ? 'PASS' : 'FAIL'}`);
  console.log(`      always-fold ${bf.exploitability.toFixed(3)}  (context; deviation baseline is confounded)`);

  // (4) stability in particle count at a fixed moderate hand count: the SHIPPED
  //     number (combined) should not drift with N. (The pure-PF aggro mode can
  //     trend mildly with N — a coarse belief bets more indiscriminately — but
  //     that does not move the combined number when the fixed bound dominates.)
  const shands = Math.min(hands, 800);
  const sN = [Math.max(40, Math.floor(particles / 2)), particles, particles * 2];
  const svals = sN.map(n => Math.max(drawLBR(game, sigma, { particles: n, hands: shands, margin: main.margin }).exploitability, ref));
  const spread = Math.max(...svals) - Math.min(...svals);
  const pass4 = spread < 0.75; // chips/hand; loose (MC + particle noise at this hand count)
  console.log(`(4) stable in particle count (${shands} hands, combined meter):`);
  console.log(`      N=${sN[0]}:${svals[0].toFixed(3)}  N=${sN[1]}:${svals[1].toFixed(3)}  N=${sN[2]}:${svals[2].toFixed(3)}  (spread ${spread.toFixed(3)})  -> ${pass4 ? 'PASS' : 'CHECK'}`);

  console.log(`\n--- VERDICT ---`);
  console.log(`  shipped lower bound (combined): ${combined.toFixed(3)} chips/hand`);
  const trust = pass3 && pass4 && combined > 0;
  if (trust && pass1) console.log(`  TRUST: yes — PF dominates the fixed exploiters and all gates pass; the COMBINED number is a trustworthy TIGHT lower bound.`);
  else if (trust && !pass1) console.log(`  TRUST: PARTIAL — the broken/stability gates pass and the combined number is a valid lower bound, but the particle filter alone does NOT yet beat the fixed exploiter in every seat (more hands/particles needed to claim the PF is the source of tightness). Ship the COMBINED number.`);
  else console.log(`  TRUST: NO — a gate failed (see above). Do NOT present this number as trustworthy.`);
}

// Build a deliberately-broken opponent σ for the sanity gate. We can't enumerate
// every infoset, so the broken policy is expressed as a `__policy__` tag that
// probsOf interprets for ALL infosets (see taggedProbs). This keeps the broken
// opponent's real play and the LBR's belief reweighting perfectly consistent.
function makeBrokenStrategy(_game, kind) {
  return { __policy__: kind }; // 'fold' or 'uniform'
}
