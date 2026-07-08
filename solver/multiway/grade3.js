// ── MULTIWAY (3-player) razz trainer: GRADING engine ────────────────────────
// gradeHand3(handRecord, blueprint, opts) → per-hero-decision grades, the 3-player
// analogue of solver/razz-trainer/grade.js. HONEST BY CONSTRUCTION (product
// requirement — 3-player razz is general-sum, there is NO equilibrium/GTO):
//
//   • 7th-street hero decisions are graded EXACTLY via grade7.grade7th — the
//     VERIFIED multiway oracle. We reconstruct the exact 7th-street spec + the two
//     opponents' reach-weighted, support-RESTRICTED ranges from the hand record,
//     then call grade7th holding the two opponents at the STATED PROFILE (the razz3
//     blueprint σ). The certified number is per-action EV-loss-vs-stated-profile.
//     A grade3 7th-street grade MATCHES a direct grade7th call to <=1e-9 (the gate).
//
//   • EARLIER-STREET hero decisions (3rd–6th) are graded vs the BLUEPRINT: the
//     per-action EV-loss under the profile, estimated by CRN-paired Monte-Carlo
//     rollouts where the two opponents (and the hero after its graded action) play
//     σ and future chance cards are dealt from the reach-consistent deck. These are
//     tagged forwardMode:'blueprint-graded' — an estimate against the stated
//     profile, NOT the exact-oracle certificate the 7th-street grade carries.
//
//   • The per-seat exploitability LOWER-BOUND bar (grade7.perSeatBR /
//     perSeatBRWithBounds) is attached to every 7th-street grade as the published
//     error bar on the profile itself.
//
//   • The GTO label is IMPOSSIBLE to emit: gradeLabel() (reused from grade7) throws
//     on any "gto" request. gradeHand3 stamps the honest label on its output.
//
// TRACTABILITY. grade7th is O(H^3) in the per-seat holding count H (the 3-way
// showdown), so the reconstructed opponent ranges are SUPPORT-RESTRICTED to keep
// each seat's holding count small (opts.oppCap, default 12 → per grade7-tract's
// <1s guidance a total under ~15 holdings/seat grades in well under a second). We
// take a SYSTEMATIC (evenly-strided) sample across the reach-sorted range so the
// small retained set is a representative miniature of the whole range (the same
// technique grade.js:oracleCandidates uses for the HU oracle).

// razz3-game exports a makeGame FACTORY. Build the default instance at the
// blueprint's training params (cap 2 / antes 8), same as play3.
const { makeGame: makeRazz3 } = require('./razz3-game');
const DEFAULT_GAME = makeRazz3({ cap: 2, antes: 8 });
const grade7 = require('./grade7');
const { grade7th, perSeatBR, perSeatBRWithBounds, gradeLabel } = grade7;
const { makeDeck, makeRng, cardStr } = require('../engine/cards');
const { strategyMapOf, strategyFor } = require('./play3');

const NSEAT = 3;
const STREET_NAMES = ['3rd', '4th', '5th', '6th', '7th'];

// ── blueprint lookup (canonical contract) ──────────────────────────────────
function lookup(strategyMap, key, acts) {
  const node = strategyMap[key];
  if (node && node.a && node.a.length === acts.length && node.a.every((a, i) => a === acts[i])) {
    return { probs: node.p.slice(), trained: true };
  }
  return { probs: acts.map(() => 1 / acts.length), trained: false };
}

function sampleIndex(probs, rng) {
  let r = rng();
  for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r <= 0) return i; }
  return probs.length - 1;
}

// Clone a snapshot/live razz3 state into a fresh mutable engine state (byte-
// identical field surface to razz3-game.clone, incl. deadPot/lastAgg).
function cloneState(s) {
  return {
    deck: s.deck.slice(),
    down: [s.down[0].slice(), s.down[1].slice(), s.down[2].slice()],
    up: [s.up[0].slice(), s.up[1].slice(), s.up[2].slice()],
    street: s.street, phase: s.phase, toAct: s.toAct,
    bets: s.bets, base: s.base, contrib: s.contrib.slice(),
    acted: s.acted.slice(), folded: s.folded.slice(), bringIn: s.bringIn,
    lastAgg: s.lastAgg, hist: s.hist, curSeq: s.curSeq, starter: s.starter,
    deadPot: s.deadPot, log: [],
  };
}

// σ action sample at a live state, from seat s.toAct's view (used in the MC
// rollouts for the earlier-street blueprint grade).
function sigmaAction(game, strategyMap, st, rng) {
  const acts = game.legalActions(st);
  if (acts.length === 1) return acts[0];
  const key = game.infosetKey(st);
  const { probs } = lookup(strategyMap, key, acts);
  return acts[sampleIndex(probs, rng)];
}

// How many down cards does a seat hold at a decision on `street`? razz3 deals 2
// down on 3rd (streets 0), one up each on 4th–6th (streets 1–3), one DOWN on 7th
// (street 4). So a seat has 2 down cards on streets 0..3 and 3 down cards on 7th.
function seatDownCount(street) { return street <= 3 ? 2 : 3; }

// ── unseen universe for ONE opponent's hidden cards ────────────────────────
// Everything not visible to the hero at the graded node: full deck minus every
// visible card (hero down+up, all three seats' upcards) minus the OTHER seats'
// real hidden down cards (they are hidden but MUST NOT leak into a candidate pool
// nor be dealt to a future street). We keep the pool as the candidate universe for
// BOTH opponents jointly; grade7th enforces cross-seat removal at enumeration.
function unseenAtNode(snap, heroSeat) {
  const seen = new Set();
  for (const c of snap.down[heroSeat]) seen.add(c);
  for (let p = 0; p < NSEAT; p++) for (const c of snap.up[p]) seen.add(c);
  // The two opponents' REAL hidden down cards are excluded from the candidate pool
  // (they stay hidden — grading them via the truth would be clairvoyant) and never
  // reappear as a future deal.
  for (let p = 0; p < NSEAT; p++) if (p !== heroSeat) for (const c of snap.down[p]) seen.add(c);
  const pool = [];
  for (const c of makeDeck()) if (!seen.has(c)) pool.push(c);
  return pool;
}

// Enumerate all combos of k distinct cards from pool (k in {2,3}).
function* combos(pool, k, start, pre) {
  if (pre.length === k) { yield pre.slice(); return; }
  for (let i = start; i <= pool.length - (k - pre.length); i++) {
    pre.push(pool[i]); yield* combos(pool, k, i + 1, pre); pre.pop();
  }
}

// ── opponent-range reconstruction (reach-weighted vs the profile) ──────────
// At the graded node we know the public boards (all upcards through this street),
// the hero's full hand, and the full betting line so far. Each opponent's hidden
// cards are its DOWN cards (2 on streets 0..3; on a 7th-street decision 3). We
// enumerate every assignment of unseen cards to an opponent's down slots and
// weight it by the blueprint REACH: the product, over that opponent's PAST decision
// nodes, of σ(actual action | its infoset at that node with the candidate downs
// substituted). This is the SAME reach-weighting the HU grader uses, per opponent.
//
// publicLineUpTo → the decisions strictly BEFORE the graded node (each carries a
// pre-action snapshot). We rebuild, for each past decision by `oppSeat`, that
// node's state with the candidate down cards substituted, and read σ(chosen).
function publicLineUpTo(handRecord, gradeIdx) {
  return handRecord.decisions.slice(0, gradeIdx);
}

// Reach product for ONE fixed decomposition of an opponent's hidden cards.
// `holePair` (the 2 cards dealt 3rd, used on streets 0..3) and `full` (all down
// cards, used on 7th where the face-down river is also in hand).
function reachProductForDecomp(game, strategyMap, past, oppSeat, holePair, full) {
  let w = 1;
  for (const d of past) {
    if (d.actor !== oppSeat) continue;
    const st = cloneState(d.state);
    st.down[oppSeat] = d.street <= 3 ? holePair : full;
    const acts = game.legalActions(st);
    const idx = acts.indexOf(d.chosen);
    if (idx < 0) return 0; // candidate makes this node's action-set inconsistent
    const key = game.infosetKey(st);
    const { probs } = lookup(strategyMap, key, acts);
    w *= probs[idx];
    if (w === 0) return 0;
  }
  return w;
}

// Reach weight of a candidate opponent down-card combo, given the line. On 7th the
// combo has 3 cards but which is the river is unobserved, so the 3-card SET's
// weight is the SUM of reach over its 3 (hole-pair, river) decompositions (uniform
// river prior cancels in normalisation). Streets 0..3 (k=2) have one decomposition.
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

// Build ONE opponent seat's reach-weighted, support-restricted range from the hand
// record. Enumerates the opponent's consistent down-card combos (weight = reach vs
// the profile), then SYSTEMATICALLY down-samples the reach-sorted list to `oppCap`
// holdings (a representative miniature of the flat range — same as the HU oracle's
// oracleCandidates). Returns normalized [{down:[ints], w}]. `pool` is the shared
// unseen universe; cross-seat removal is enforced later by grade7th at enumeration.
function buildSeatRange(game, strategyMap, handRecord, gradeIdx, oppSeat, snap, pool, oppCap) {
  const k = seatDownCount(snap.street);
  const cands = [];
  for (const combo of combos(pool, k, 0, [])) {
    const w = reachWeight(game, strategyMap, handRecord, gradeIdx, oppSeat, combo);
    if (w > 0) cands.push({ down: combo, w });
  }
  let wsum = 0; for (const c of cands) wsum += c.w;
  if (wsum <= 0) {
    // No consistent hand under σ (untrained/edge): fall back to a uniform sample so
    // the grade is still defined. Uniform over the first oppCap combos.
    const uni = [];
    for (const combo of combos(pool, k, 0, [])) { uni.push({ down: combo, w: 1 }); if (uni.length >= oppCap) break; }
    let uw = 0; for (const c of uni) uw += c.w; for (const c of uni) c.w /= uw;
    uni.fallback = true; uni.coverage = 0;
    return uni;
  }
  let kept = cands, coverage = 1;
  if (oppCap > 0 && cands.length > oppCap) {
    cands.sort((a, b) => b.w - a.w);
    const stride = cands.length / oppCap;
    kept = [];
    for (let i = 0; kept.length < oppCap && Math.floor(i) < cands.length; i += stride) kept.push(cands[Math.floor(i)]);
    let keptSum = 0; for (const c of kept) keptSum += c.w;
    coverage = keptSum / wsum; wsum = keptSum;
  }
  for (const c of kept) c.w /= wsum;
  kept.coverage = coverage; kept.fallback = false;
  return kept;
}

// ── build the grade7th inputs for a 7th-street hero decision ────────────────
// From a 7th-street hero decision's snapshot + reconstructed opponent ranges, build
// the (spec, ranges, hero) that grade7.grade7th consumes. spec.up/contrib/deadPot
// come straight off the snapshot; the hero's own range is its single REAL holding
// (we grade the hero's ACTUAL hand); the two opponents get their reach-weighted
// support-restricted ranges. This is the object the gate cross-checks against a
// direct grade7th call.
function build7thInputs(game, strategyMap, handRecord, gradeIdx, oppCap) {
  const d = handRecord.decisions[gradeIdx];
  const snap = d.state;
  const heroSeat = d.actor;
  const pool = unseenAtNode(snap, heroSeat);
  const opps = [0, 1, 2].filter(s => s !== heroSeat);
  const rangesBySeat = [null, null, null];
  // hero range = its single real 3-down holding (grade its actual hand)
  rangesBySeat[heroSeat] = [{ down: snap.down[heroSeat].slice(), w: 1 }];
  for (const o of opps) {
    rangesBySeat[o] = buildSeatRange(game, strategyMap, handRecord, gradeIdx, o, snap, pool, oppCap);
  }
  const spec = {
    cap: game.CAP != null ? game.CAP : 2,
    antes: game.ANTES != null ? game.ANTES : 8,
    up: [snap.up[0].slice(), snap.up[1].slice(), snap.up[2].slice()],
    // grade7.build7thState only needs a placeholder concrete down deal (it is
    // overridden per-holding by the resolver); use each seat's range head.
    down: [rangesBySeat[0][0].down, rangesBySeat[1][0].down, rangesBySeat[2][0].down],
    contrib: snap.contrib.slice(),
    deadPot: snap.deadPot,
    folded: snap.folded.slice(),
  };
  return { spec, ranges: rangesBySeat, hero: heroSeat, opps,
    coverage: opps.map(o => rangesBySeat[o].coverage), fallback: opps.some(o => rangesBySeat[o].fallback) };
}

// Is the hero the FIRST actor of the 7th-street betting round at this node? Only
// then is the pre-hero betting line EMPTY, so grade7.grade7th (which rebuilds a
// fresh start-of-street state and re-derives any pre-hero opponent actions from σ)
// grades the hero's REAL node. Mirrors the HU oracle's oracleEligible: start-of-
// round (curSeq empty) AND the hero is to act. For a hero who acts AFTER a real
// opponent bet/check, grade7th's σ-reconstructed root is the WRONG node — so those
// nodes are graded via the SNAPSHOT-EXACT path (which preserves the real mid-round
// betting) instead. Both paths are exact; only the eligible ones admit a direct
// grade7th cross-check (the gate's <=1e-9 match).
function heroIsRoundFirstActor(snap) {
  return snap.curSeq === '' && snap.starter === snap.toAct;
}

// ── SNAPSHOT-EXACT per-action EV at the REAL 7th-street node ─────────────────
// Enumerate the removal-consistent joint opponent support (from the reconstructed
// ranges), seat each triple into a CLONE OF THE REAL SNAPSHOT (preserving curSeq/
// contrib/acted/bets/lastAgg/toAct — the actual mid-round position), and evaluate
// the hero's per-action EV exactly via grade7.dealtValue (deal-free betting tree,
// opponents held at the profile). This grades the hero's ACTUAL node for ANY 7th-
// street decision — start-of-round OR facing a real check/bet. For the start-of-
// round case it is byte-identical to grade7th (verified by the gate cross-check).
function snapshotExact7th(game, strategyMap, built, snap, heroSeat) {
  const opps = built.opps;
  const R = [built.ranges[opps[0]], built.ranges[opps[1]]];
  const heroDown = built.ranges[heroSeat][0].down; // the hero's single real holding
  const heroActs = game.legalActions(cloneMid(snap, heroDown, R, opps, heroSeat, R[0][0].down, R[1][0].down));
  const actEV = {}; for (const a of heroActs) actEV[a] = 0;
  let onPolicy = 0, mass = 0;
  const publicUsed = new Set();
  for (let p = 0; p < NSEAT; p++) for (const c of snap.up[p]) publicUsed.add(c);
  const heroSet = new Set(heroDown); for (const c of snap.up[heroSeat]) heroSet.add(c);
  for (const o0 of R[0]) {
    if (o0.down.some(c => heroSet.has(c) || publicUsed.has(c))) continue;
    const s0 = new Set(heroSet); for (const c of o0.down) s0.add(c);
    for (const o1 of R[1]) {
      if (o1.down.some(c => s0.has(c) || publicUsed.has(c))) continue;
      const w = o0.w * o1.w;
      if (w <= 0) continue;
      mass += w;
      const st = cloneMid(snap, heroDown, R, opps, heroSeat, o0.down, o1.down);
      onPolicy += w * grade7.dealtValue(game, st, heroSeat, strategyMap, null, { v: true });
      for (const a of heroActs) {
        const st2 = cloneMid(snap, heroDown, R, opps, heroSeat, o0.down, o1.down);
        actEV[a] += w * grade7.dealtValue(game, st2, heroSeat, strategyMap, a, { v: false });
      }
    }
  }
  if (mass <= 0) throw new Error('snapshotExact7th: empty removal-consistent support');
  for (const a of heroActs) actEV[a] /= mass;
  onPolicy /= mass;
  let bestA = heroActs[0], bestV = -Infinity;
  for (const a of heroActs) if (actEV[a] > bestV) { bestV = actEV[a]; bestA = a; }
  const evLoss = {}; for (const a of heroActs) evLoss[a] = bestV - actEV[a];
  return { actions: heroActs, actionEV: actEV, bestAction: bestA, bestEV: bestV,
    onPolicyEV: onPolicy, evLoss, supportMass: mass,
    actionLabel: Object.fromEntries(heroActs.map(a => [a, game.actionLabel(a, cloneMid(snap, heroDown, R, opps, heroSeat, R[0][0].down, R[1][0].down))])) };
}

// Clone the real 7th-street snapshot with concrete downs seated by seat index.
function cloneMid(snap, heroDown, R, opps, heroSeat, o0down, o1down) {
  const downs = [null, null, null];
  downs[heroSeat] = heroDown.slice();
  downs[opps[0]] = o0down.slice();
  downs[opps[1]] = o1down.slice();
  return {
    deck: [], down: downs,
    up: [snap.up[0].slice(), snap.up[1].slice(), snap.up[2].slice()],
    street: 4, phase: 'bet', toAct: snap.toAct, bets: snap.bets, base: snap.base,
    contrib: snap.contrib.slice(), acted: snap.acted.slice(), folded: snap.folded.slice(),
    bringIn: -1, lastAgg: snap.lastAgg, hist: snap.hist, curSeq: snap.curSeq,
    starter: snap.starter, deadPot: snap.deadPot, log: [],
  };
}

// ── 7th-street EXACT grade (the certificate) ────────────────────────────────
// Grade one 7th-street hero decision EXACTLY, attach the per-seat exploitability
// bar, and return a grade object. Two exact paths:
//   • hero is the round's FIRST actor (pre-hero line empty) → grade7.grade7th
//     directly (the gate cross-checks this to <=1e-9).
//   • hero faces a real check/bet (mid-round) → snapshotExact7th, which preserves
//     the REAL betting position (grade7th would mis-reconstruct the pre-hero line
//     from σ-argmax and grade the WRONG node).
// Both are exact against the stated profile; the certificate framing is identical.
// `opts.withTrueBR` also attaches the tighter per-physical-state bound (default on).
function grade7thDecision(game, strategyMap, handRecord, gradeIdx, opts) {
  const d = handRecord.decisions[gradeIdx];
  const snap = d.state;
  const heroSeat = d.actor;
  const oppCap = opts.oppCap == null ? 12 : opts.oppCap;
  const built = build7thInputs(game, strategyMap, handRecord, gradeIdx, oppCap);
  const eligible = heroIsRoundFirstActor(snap); // grade7th-cross-checkable?

  // EXACT per-action EV, opponents held at the profile (the razz3 blueprint σ).
  // Eligible → grade7th (start-of-round); else → snapshotExact7th (real mid-round).
  const res = eligible
    ? grade7th(built.spec, built.ranges, strategyMap, { hero: heroSeat })
    : snapshotExact7th(game, strategyMap, built, snap, heroSeat);

  // The per-seat exploitability bar on the profile over THIS enumerated subgame.
  let bar = null;
  try {
    bar = opts.withTrueBR === false
      ? { lower: perSeatBR(built.spec, built.ranges, strategyMap) }
      : { bounds: perSeatBRWithBounds(built.spec, built.ranges, strategyMap) };
  } catch (e) { bar = { error: e.message }; }

  const chosen = d.chosen;
  // The exact grade's discovered action set MUST equal the record's legal set at
  // this node (both are the real hero node). If not, something is inconsistent —
  // surface it rather than silently coercing evLoss to 0.
  const actionSetOk = JSON.stringify(res.actions.slice().sort()) === JSON.stringify(d.acts.slice().sort());
  const evLoss = res.evLoss[chosen] != null ? res.evLoss[chosen] : 0;
  const oppSeats = built.opps;
  const look = lookup(strategyMap, d.key, d.acts);

  return {
    gradeIdx,
    seat: heroSeat,
    street: snap.street,
    streetName: STREET_NAMES[snap.street],
    infosetKey: d.key,
    trained: look.trained,
    heroCards: { down: snap.down[heroSeat].map(cardStr), up: snap.up[heroSeat].map(cardStr) },
    oppUp: oppSeats.map(o => snap.up[o].map(cardStr)),
    gtoMix: { actions: d.acts.slice(), probs: look.probs, trained: look.trained },
    actions: res.actions,
    actionLabel: res.actionLabel,
    perActionEV: res.actionEV,
    chosen,
    bestAction: res.bestAction,
    bestEV: res.bestEV,
    onPolicyEV: res.onPolicyEV,
    evLoss,
    evLossByAction: res.evLoss,
    actionSetOk,
    // HONESTY: this IS the exact multiway oracle certificate.
    gradeSource: 'grade7th-exact',
    // 'grade7th-first-actor' → a direct grade7th call (cross-checkable to <=1e-9);
    // 'snapshot-exact' → the same exact math seated into the REAL mid-round node.
    exactPath: eligible ? 'grade7th-first-actor' : 'snapshot-exact',
    grade7thEligible: eligible,
    forwardMode: 'exact-multiway-oracle',
    certified: 'certified-EV-loss-vs-stated-profile',
    exploitabilityBar: bar,       // per-seat BR gap(s) on the profile (the error bar)
    oppCoverage: built.coverage,  // reach mass retained per opponent (small by design)
    oppRangeSizes: oppSeats.map(o => built.ranges[o].length),
    rangeFallback: built.fallback,
    supportTriples: res.tripleCount != null ? res.tripleCount : res.supportMass,
    // build7thInputs is exposed on the grade so the gate can reproduce the exact
    // grade7th call and assert a <=1e-9 match (only meaningful when eligible).
    _grade7Inputs: opts.attachInputs ? built : undefined,
  };
}

// ── earlier-street (3rd–6th) BLUEPRINT grade (an estimate, flagged) ─────────
// Per-action EV-loss vs the profile via CRN-paired Monte-Carlo. For each legal hero
// action a: apply a, then roll to terminal with the two opponents (and the hero
// after a) sampling σ and future chance cards dealt from the reach-consistent deck;
// the opponents' hidden hands are drawn from their reach-weighted ranges. Common
// random numbers (same opponent-hand + deck + σ-seed particle set across actions)
// make the evLoss difference low-variance. Tagged blueprint-graded — NOT the exact
// certificate.
function gradeEarlierDecision(game, strategyMap, handRecord, gradeIdx, opts) {
  const d = handRecord.decisions[gradeIdx];
  const snap = d.state;
  const heroSeat = d.actor;
  const acts = d.acts;
  const oppCap = opts.oppCapEarly == null ? 8 : opts.oppCapEarly;
  const N = opts.samples || 800;
  const oppSeats = [0, 1, 2].filter(s => s !== heroSeat);
  const pool = unseenAtNode(snap, heroSeat);

  // reach-weighted range per opponent (support-restricted) + the deal pool
  const oppRanges = oppSeats.map(o => buildSeatRange(game, strategyMap, handRecord, gradeIdx, o, snap, pool, oppCap));

  // Build N particles: a joint (opp0 hand, opp1 hand) drawn ∝ reach (removal-
  // consistent) + a σ-betting/deal rng seed. CRN: the SAME particles feed every
  // action so the dominant hand/deck variance cancels in the evLoss difference.
  const crnRng = makeRng(((opts.crnSeed == null ? 0xC0FFEE : opts.crnSeed) >>> 0) ^ (gradeIdx * 0x9e3779b1));
  const particles = [];
  let tries = 0;
  while (particles.length < N && tries < N * 40) {
    tries++;
    const h0 = oppRanges[0][sampleIndex(oppRanges[0].map(c => c.w), crnRng)].down;
    const h1 = oppRanges[1][sampleIndex(oppRanges[1].map(c => c.w), crnRng)].down;
    // removal: the two opponent hands + hero + all upcards must be disjoint
    const used = new Set(snap.down[heroSeat]);
    for (let p = 0; p < NSEAT; p++) for (const c of snap.up[p]) used.add(c);
    let bad = false;
    for (const c of h0) { if (used.has(c)) { bad = true; break; } used.add(c); }
    if (!bad) for (const c of h1) { if (used.has(c)) { bad = true; break; } used.add(c); }
    if (bad) continue;
    // the rollout deck = pool minus the two opponent hands, shuffled per particle
    const deck = [];
    const oppUsed = new Set([...h0, ...h1]);
    for (const c of pool) if (!oppUsed.has(c)) deck.push(c);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(crnRng() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    particles.push({ h0, h1, deck, sigSeed: (crnRng() * 0xffffffff) >>> 0 });
  }

  // roll one particle for one hero action → hero utility
  function rollout(a, part) {
    let st = cloneState(snap);
    st.down[oppSeats[0]] = part.h0.slice();
    st.down[oppSeats[1]] = part.h1.slice();
    st.deck = part.deck.slice();
    st = game.applyAction(st, a);
    const rng = makeRng(part.sigSeed);
    let guard = 0;
    while (!game.isTerminal(st)) {
      if (++guard > 300) break;
      if (game.isChance(st)) { st = game.sampleChance(st, rng); continue; }
      const la = game.legalActions(st);
      if (la.length === 1) { st = game.applyAction(st, la[0]); continue; }
      st = game.applyAction(st, sigmaAction(game, strategyMap, st, rng));
    }
    return game.utility(st)[heroSeat];
  }

  // util[a][i] = hero utility on particle i for action a (paired across actions)
  const util = {}; const ev = {}, se = {};
  const n = particles.length || 1;
  for (const a of acts) {
    util[a] = new Array(particles.length);
    let m = 0;
    for (let i = 0; i < particles.length; i++) { const u = rollout(a, particles[i]); util[a][i] = u; m += u; }
    ev[a] = particles.length ? m / particles.length : 0;
  }
  // best action + evLoss (paired-difference SE vs chosen)
  let bestA = acts[0], bestEV = -Infinity;
  for (const a of acts) if (ev[a] > bestEV) { bestEV = ev[a]; bestA = a; }
  const evLoss = Math.max(0, bestEV - ev[d.chosen]);
  // paired SE of (best - chosen)
  let evLossSE = 0;
  if (bestA !== d.chosen && particles.length > 1) {
    const dm = ev[bestA] - ev[d.chosen];
    let v = 0;
    for (let i = 0; i < particles.length; i++) { const di = util[bestA][i] - util[d.chosen][i]; v += (di - dm) * (di - dm); }
    evLossSE = Math.sqrt(v / (particles.length * (particles.length - 1)));
  }

  const look = lookup(strategyMap, d.key, acts);
  return {
    gradeIdx,
    seat: heroSeat,
    street: snap.street,
    streetName: STREET_NAMES[snap.street],
    infosetKey: d.key,
    trained: look.trained,
    heroCards: { down: snap.down[heroSeat].map(cardStr), up: snap.up[heroSeat].map(cardStr) },
    oppUp: oppSeats.map(o => snap.up[o].map(cardStr)),
    gtoMix: { actions: acts.slice(), probs: look.probs, trained: look.trained },
    actions: acts.slice(),
    perActionEV: ev,
    chosen: d.chosen,
    bestAction: bestA,
    bestEV,
    evLoss,
    evLossSE,
    // HONESTY: an ESTIMATE against the stated profile, NOT the exact oracle.
    gradeSource: 'blueprint',
    forwardMode: 'blueprint-graded',
    certified: 'estimated-EV-loss-vs-stated-profile',
    samplesUsed: particles.length,
    oppRangeSizes: oppRanges.map(r => r.length),
    oppCoverage: oppRanges.map(r => (r.coverage == null ? 1 : r.coverage)),
  };
}

// ── public entry ────────────────────────────────────────────────────────────
// gradeHand3(handRecord, blueprint, opts) → { game, heroSeat, utility, grades[],
//   label, gtoBanned, oracleGraded }. Every HERO decision is graded: 7th street
//   EXACTLY via grade7th (the certificate + the per-seat exploitability bar);
//   3rd–6th via the blueprint MC estimate (flagged blueprint-graded).
function gradeHand3(handRecord, blueprint, opts = {}) {
  const game = opts.game || DEFAULT_GAME;
  const strategyMap = strategyMapOf(blueprint);
  const grades = [];
  for (let i = 0; i < handRecord.decisions.length; i++) {
    const d = handRecord.decisions[i];
    if (!d.isHero) continue;
    if (d.state.street === 4) grades.push(grade7thDecision(game, strategyMap, handRecord, i, opts));
    else grades.push(gradeEarlierDecision(game, strategyMap, handRecord, i, opts));
  }
  // HONEST label — the GTO label is impossible in multiway (gradeLabel throws on
  // "gto"). We stamp the certified framing on the whole grade.
  const label = gradeLabel('ev-loss'); // 'certified-EV-loss-vs-stated-profile'
  return {
    game: game.id,
    heroSeat: handRecord.heroSeat,
    utility: handRecord.utility,
    grades,
    label,
    gtoBanned: true, // no equilibrium claim in 3-player razz (general-sum)
    oracleGraded: grades.some(g => g.gradeSource === 'grade7th-exact'),
  };
}

module.exports = {
  gradeHand3,
  grade7thDecision,
  gradeEarlierDecision,
  build7thInputs,
  buildSeatRange,
  reachWeight,
  unseenAtNode,
  cloneState,
  sigmaAction,
  lookup,
  seatDownCount,
  // re-export the honest label helper for callers/gates
  gradeLabel,
};
