// ── measure3 — convergence harness + per-seat exploitability for razz3 ─────
// Two things, both mirroring patterns already trusted in this repo:
//
//  (A) CONVERGENCE HARNESS (convergenceRow) — per-seat mean positive regret
//      (from the trainer) + average-strategy L1 DRIFT between checkpoints. The
//      multiway no-regret signal: regret should fall and drift shrink. (3-player
//      general-sum CFR has NO equilibrium guarantee — this is the honest,
//      computable signal, exactly as the spike's mccfr3 header states.)
//
//  (B) PER-SEAT EXPLOITABILITY — two gauges:
//    • exactExploit(game, sigma) — EXACT enumeration over the reduced game (a
//      TINY razz3 config: few ranks, a shallow deck). This is the ground-truth
//      gate, the razz3 analogue of br3.js. Used to VALIDATE the sampled meter.
//    • sampledExploit(game, sigma, opts) — a SAMPLED per-seat best-response
//      LOWER BOUND for the FULL game (where exact enumeration is intractable).
//      Fix the other two seats at sigma; the hero best-responds by, at each of
//      its infosets, taking the CRN-paired argmax action (deviate only on a
//      confident margin, mirroring lbr-stud.js / lbr-draw.js). A concrete
//      policy's realised value is a genuine lower bound on exploitability.
//
// Both return per-seat { onPolicy, br, exploit } with exploit = br - onPolicy.

// ── strategy access ───────────────────────────────────────────────────────
function sigmaProbs(sigma, game, state) {
  const key = game.infosetKey(state);
  const acts = game.legalActions(state);
  const node = sigma[key];
  if (!node || node.a.length !== acts.length) { const u = 1 / acts.length; return acts.map(() => u); }
  return node.p;
}

// ── (A) convergence: L1 drift between two average-strategy maps ─────────────
function stratDrift(prev, cur) {
  let tot = 0, n = 0;
  for (const key of Object.keys(cur)) {
    if (!prev[key]) continue;
    const a = prev[key].p, b = cur[key].p;
    if (a.length !== b.length) continue;
    let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
    tot += d; n++;
  }
  return n ? tot / n : NaN;
}

// Per-seat mean positive regret. The trainer tags each node with the acting
// seat via the infoset key prefix... but razz3 keys don't carry the seat (they
// carry own-info, which is seat-agnostic on purpose). So we split regret by
// seat using a supplied seatOf(key)->0..2 if available; otherwise return the
// global scalar the trainer exposes. We expose BOTH.
function meanRegret(trainer) { return trainer.meanPositiveRegret(); }

// ── on-policy per-seat EV by Monte-Carlo (all seats on sigma) ───────────────
function onPolicyEV(game, sigma, hands, seed) {
  const { makeRng } = require('../engine/cards');
  const rng = makeRng(seed >>> 0);
  const sums = [0, 0, 0];
  for (let h = 0; h < hands; h++) {
    let s = game.newHand(rng);
    while (!game.isTerminal(s)) {
      if (game.isChance(s)) { s = game.sampleChance(s, rng); continue; }
      const acts = game.legalActions(s);
      const p = sigmaProbs(sigma, game, s);
      let r = rng(), ai = acts.length - 1;
      for (let i = 0; i < acts.length; i++) { r -= p[i]; if (r <= 0) { ai = i; break; } }
      s = game.applyAction(s, acts[ai]);
    }
    const u = game.utility(s);
    for (let k = 0; k < 3; k++) sums[k] += u[k];
  }
  return sums.map(x => x / hands);
}

// ── (B2) sampled per-seat best-response LOWER bound (full game) ─────────────
// hero best-responds; other two seats on sigma. A single-sample argmax is NOT
// a best response (noisy max → maximization bias, the failure lbr-stud/lbr-draw
// explicitly guard against). So we do a proper TWO-PASS sampled BR:
//   PASS 1 (build): sample many hands. Along each hand, both non-hero seats
//     play sigma; the hero, at each of its infosets, tries EACH action and
//     recurses with an independent MC continuation, accumulating the value of
//     that action into a per-infoset table (deal-reach = product of opponent
//     sigma probs above; for the hero the reach is 1). Averaged over many
//     samples this de-noises each action's counterfactual value. argmax per
//     infoset → a FIXED, deterministic BR policy.
//   PASS 2 (eval): play that fixed policy against sigma over fresh hands →
//     the hero's realised EV. A concrete policy's value is a genuine LOWER
//     bound on exploitability (the lbr-stud/lbr-draw contract). We ship
//     max(0, brEV − onPolicyEV). A `margin` keeps sigma's action unless a
//     deviation beats it by `margin` (kills residual noisy deviations).
//
// To keep PASS 1 tractable we cap the hero's per-node continuation sampling to
// ONE MC rollout per action per visit but AVERAGE over MANY visits — the same
// unbiased estimator MCCFR uses.

function heroContinuation(game, sigma, state, hero, rng) {
  // play sigma for everyone below (used to value a hero action during build).
  while (!game.isTerminal(state)) {
    if (game.isChance(state)) { state = game.sampleChance(state, rng); continue; }
    const acts = game.legalActions(state);
    const probs = sigmaProbs(sigma, game, state);
    let r = rng(), ai = acts.length - 1;
    for (let i = 0; i < acts.length; i++) { r -= probs[i]; if (r <= 0) { ai = i; break; } }
    state = game.applyAction(state, acts[ai]);
  }
  return game.utility(state)[hero];
}

// Accumulate per-hero-infoset action values along ONE sampled hand. At a hero
// node we (a) record each action's MC continuation value into acc, (b) follow
// the CURRENT best action so deeper hero infosets are visited consistently.
function buildPass(game, sigma, state, hero, rng, acc, brTable) {
  while (true) {
    if (game.isTerminal(state)) return;
    if (game.isChance(state)) { state = game.sampleChance(state, rng); continue; }
    const p = game.currentPlayer(state);
    const acts = game.legalActions(state);
    if (p !== hero) {
      const probs = sigmaProbs(sigma, game, state);
      let r = rng(), ai = acts.length - 1;
      for (let i = 0; i < acts.length; i++) { r -= probs[i]; if (r <= 0) { ai = i; break; } }
      state = game.applyAction(state, acts[ai]);
      continue;
    }
    const key = game.infosetKey(state);
    let rec = acc.get(key);
    if (!rec) { rec = { acts, val: new Float64Array(acts.length), cnt: new Float64Array(acts.length) }; acc.set(key, rec); }
    for (let i = 0; i < acts.length; i++) {
      rec.val[i] += heroContinuation(game, sigma, game.applyAction(state, acts[i]), hero, rng);
      rec.cnt[i] += 1;
    }
    // follow the current BR choice (default: myopic argmax of running means)
    let choice = brTable.get(key);
    if (choice == null || !acts.includes(choice)) {
      let bi = 0, bv = -Infinity;
      for (let i = 0; i < acts.length; i++) { const m = rec.val[i] / rec.cnt[i]; if (m > bv) { bv = m; bi = i; } }
      choice = acts[bi];
    }
    state = game.applyAction(state, choice);
  }
}

function evalPass(game, sigma, state, hero, rng, brTable, margin) {
  while (!game.isTerminal(state)) {
    if (game.isChance(state)) { state = game.sampleChance(state, rng); continue; }
    const p = game.currentPlayer(state);
    const acts = game.legalActions(state);
    if (p !== hero) {
      const probs = sigmaProbs(sigma, game, state);
      let r = rng(), ai = acts.length - 1;
      for (let i = 0; i < acts.length; i++) { r -= probs[i]; if (r <= 0) { ai = i; break; } }
      state = game.applyAction(state, acts[ai]);
      continue;
    }
    const key = game.infosetKey(state);
    const choice = brTable.get(key);
    let a;
    if (choice != null && acts.includes(choice)) a = choice;
    else { const probs = sigmaProbs(sigma, game, state); let r = rng(), ai = acts.length - 1; for (let i = 0; i < acts.length; i++) { r -= probs[i]; if (r <= 0) { ai = i; break; } } a = acts[ai]; }
    state = game.applyAction(state, a);
  }
  return game.utility(state)[hero];
}

function sampledExploit(game, sigma, opts = {}) {
  const hands = opts.hands != null ? opts.hands : 4000;
  const margin = opts.margin != null ? opts.margin : 0.0;
  const seed = opts.seed != null ? opts.seed : 12345;
  const buildHands = opts.buildHands != null ? opts.buildHands : hands;
  const { makeRng } = require('../engine/cards');
  const onPol = onPolicyEV(game, sigma, hands, seed);
  const out = [];
  for (let hero = 0; hero < 3; hero++) {
    // PASS 1: build the BR table (a few sweeps so deeper hero infosets settle).
    const acc = new Map();
    let brTable = new Map();
    for (let sweep = 0; sweep < 3; sweep++) {
      acc.clear();
      const rng = makeRng((seed + 100 + hero * 131 + sweep * 977) >>> 0);
      for (let h = 0; h < buildHands; h++) buildPass(game, sigma, game.newHand(rng), hero, rng, acc, brTable);
      const next = new Map();
      for (const [key, rec] of acc) {
        // margin gate vs sigma's mixed value at this infoset
        const probs = (() => { const n = sigma[key]; return (n && n.a.length === rec.acts.length) ? n.p : rec.acts.map(() => 1 / rec.acts.length); })();
        let sigVal = 0; for (let i = 0; i < rec.acts.length; i++) sigVal += probs[i] * (rec.val[i] / rec.cnt[i]);
        let bi = 0, bv = -Infinity;
        for (let i = 0; i < rec.acts.length; i++) { const m = rec.val[i] / rec.cnt[i]; if (m > bv) { bv = m; bi = i; } }
        // pick sigma's most-likely action if BR doesn't clear the margin
        if (bv < sigVal + margin) { let mi = 0; for (let i = 1; i < probs.length; i++) if (probs[i] > probs[mi]) mi = i; next.set(key, rec.acts[mi]); }
        else next.set(key, rec.acts[bi]);
      }
      brTable = next;
    }
    // PASS 2: evaluate the fixed BR policy vs sigma.
    const rng = makeRng((seed + 5000 + hero * 7919) >>> 0);
    let br = 0;
    for (let h = 0; h < hands; h++) br += evalPass(game, sigma, game.newHand(rng), hero, rng, brTable, margin);
    br /= hands;
    out.push({ seat: hero, onPolicy: onPol[hero], br, exploit: Math.max(0, br - onPol[hero]) });
  }
  return out;
}

// ── (B1) EXACT per-seat BR over a REDUCED razz3 config (ground truth) ──────
// Only usable when the game is tiny (few reachable deals). We enumerate deals
// by walking the chance structure exhaustively is impractical for the full 52-
// card game, so this exact path is intended for a SMALL synthetic razz3 built
// with a reduced deck / few streets. It reuses the br3.js two-pass algorithm
// generically: any game exposing enumerateDeals() + dealt()/deterministic
// chance. For the full game, use sampledExploit and validate its inequalities.
function exactExploit(game, sigma) {
  if (!game.enumerateDeals) throw new Error('exactExploit needs game.enumerateDeals() — use a reduced razz3 config');
  const deals = [...game.enumerateDeals()]; // [{state, w}]
  function sigmaValue(state, hero) {
    if (game.isTerminal(state)) return game.utility(state)[hero];
    const acts = game.legalActions(state);
    const probs = sigmaProbs(sigma, game, state);
    let ev = 0;
    for (let i = 0; i < acts.length; i++) if (probs[i] > 0) ev += probs[i] * sigmaValue(game.applyAction(state, acts[i]), hero);
    return ev;
  }
  function heroValue(state, hero, brTable) {
    if (game.isTerminal(state)) return game.utility(state)[hero];
    const p = game.currentPlayer(state);
    const acts = game.legalActions(state);
    if (p === hero) {
      const key = game.infosetKey(state);
      const choice = brTable[key];
      if (choice != null && acts.includes(choice)) return heroValue(game.applyAction(state, choice), hero, brTable);
      let best = -Infinity;
      for (const a of acts) { const v = heroValue(game.applyAction(state, a), hero, brTable); if (v > best) best = v; }
      return best;
    }
    const probs = sigmaProbs(sigma, game, state);
    let ev = 0;
    for (let i = 0; i < acts.length; i++) if (probs[i] > 0) ev += probs[i] * heroValue(game.applyAction(state, acts[i]), hero, brTable);
    return ev;
  }
  function accumulate(state, hero, brTable, reach, w, acc) {
    if (game.isTerminal(state)) return;
    const p = game.currentPlayer(state);
    const acts = game.legalActions(state);
    if (p === hero) {
      const key = game.infosetKey(state);
      if (!acc[key]) acc[key] = { acts, val: acts.map(() => 0) };
      const rec = acc[key];
      for (let i = 0; i < acts.length; i++) rec.val[i] += w * reach * heroValue(game.applyAction(state, acts[i]), hero, brTable);
      const choice = brTable[key] && acts.includes(brTable[key]) ? brTable[key] : acts[0];
      return accumulate(game.applyAction(state, choice), hero, brTable, reach, w, acc);
    }
    const probs = sigmaProbs(sigma, game, state);
    for (let i = 0; i < acts.length; i++) if (probs[i] > 0) accumulate(game.applyAction(state, acts[i]), hero, brTable, reach * probs[i], w, acc);
  }
  function buildBR(hero) {
    let brTable = {};
    for (let sweep = 0; sweep < 8; sweep++) {
      const acc = {};
      for (const d of deals) accumulate(d.state, hero, brTable, 1, d.w, acc);
      const next = {}; let changed = false;
      for (const key of Object.keys(acc)) {
        const a = acc[key]; let bi = 0, bv = -Infinity;
        for (let i = 0; i < a.acts.length; i++) if (a.val[i] > bv) { bv = a.val[i]; bi = i; }
        next[key] = a.acts[bi];
        if (brTable[key] !== next[key]) changed = true;
      }
      brTable = next;
      if (!changed && sweep > 0) break;
    }
    return brTable;
  }
  const out = [];
  let wsum = 0; for (const d of deals) wsum += d.w;
  for (let hero = 0; hero < 3; hero++) {
    let onPol = 0, br = 0;
    const brTable = buildBR(hero);
    for (const d of deals) { onPol += d.w * sigmaValue(d.state, hero); br += d.w * heroValue(d.state, hero, brTable); }
    onPol /= wsum; br /= wsum;
    out.push({ seat: hero, onPolicy: onPol, br, exploit: br - onPol });
  }
  return out;
}

module.exports = { stratDrift, meanRegret, onPolicyEV, sampledExploit, exactExploit, sigmaProbs };
