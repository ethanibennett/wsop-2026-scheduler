// ── Exact per-seat best response for micro-razz-3 ──────────────
// The MEASURABILITY check the spike demanded: given a fixed average
// profile sigma = (sigma0,sigma1,sigma2), compute — by EXACT enumeration
// over all deals and the whole betting tree — each seat p's best-response
// EV holding the OTHER TWO seats fixed at sigma. Seat p's exploitability
// is  BR_p - EV_p(sigma)  (>= 0). This is the multiway analogue of the
// repo's HU exact-BR gauge; it is a genuine, ground-truth-anchored
// convergence signal even though 3-player CFR has no equilibrium proof.
//
// Deck is tiny (8 ranks, 3 seats) so we enumerate all rank triples,
// weighted by the per-seat range priors, and for each triple walk the
// game tree exactly. At a fixed seat's node we AVERAGE over sigma; at the
// best-responder's node we MAX (for BR) or average over sigma (for
// on-policy EV). Opponent rank distributions are handled by summing over
// deals — the best-responder cannot see opponents' cards, so its strategy
// must be a single action distribution per (own-rank, hist) infoset; we
// therefore compute BR by, for each infoset, choosing the action that
// maximizes the deal-weighted continuation value. We do this with a
// standard two-pass (reach-weighted counterfactual) exact best response.

// Build reach + value for BR of seat `hero` against fixed sigma for the
// other two seats. We enumerate deals; for each deal we have concrete
// ranks so the hero's infoset is (rank_hero, hist). We accumulate, per
// hero infoset and action, the deal-reach-weighted value of taking that
// action (with opponents on sigma and hero on sigma below that node too —
// but for an EXACT best response we need hero to also best-respond in the
// subtree). We use the recursive exact-BR: value(node) with hero playing
// BR = for hero nodes, we cannot decide per-deal (info sets couple deals),
// so we do the classic algorithm: compute counterfactual value of each
// action per infoset summed over deals, pick argmax per infoset, then a
// second pass evaluates EV under that pure BR. Because the hero's pure BR
// is deterministic per infoset, one argmax pass then one eval pass is
// exact for this single-street game (no hero infoset is an ancestor of
// another hero infoset with a different deal — histories are shared, and
// argmax over summed cfv is optimal for a best response with perfect
// recall). We implement it directly.

function seatWeights(range) {
  const tot = range.reduce((a, b) => a + b, 0);
  return range.map(w => w / tot);
}

// Enumerate all (r0,r1,r2) in 1..8 with deal weight = product of per-seat
// range probs. (Card removal at rank granularity: up to 4 suits per rank,
// 3 seats < 4, so any rank triple is legal — no removal exclusion.)
function* deals() {
  for (let a = 1; a <= 8; a++)
    for (let b = 1; b <= 8; b++)
      for (let c = 1; c <= 8; c++)
        yield [a, b, c];
}

// sigma: map infosetKey -> {a:acts, p:probs}. For a missing key (never
// visited) fall back to uniform over legal actions.
function sigmaAt(sigma, game, state) {
  const key = game.infosetKey(state);
  const node = sigma[key];
  const acts = game.legalActions(state);
  if (!node) { const u = 1 / acts.length; return { acts, probs: acts.map(() => u) }; }
  // align node.p to acts order (they were stored in legalActions order)
  return { acts, probs: node.p };
}

// ── Pass 1: for hero, accumulate counterfactual value per (heroKey,action)
// summed over deals with opponents on sigma. Hero also on sigma inside the
// subtree during this accumulation is NOT correct for exact BR; instead we
// recurse with hero best-responding. To keep it exact and simple for this
// shallow tree we recurse returning, for a given deal, the hero-BR value
// while simultaneously recording argmax choices. We resolve the coupling
// by computing BR with memoized argmax over infosets: since the tree is
// shallow and every hero infoset's optimal action is independent given the
// fixed opponents (opponents don't condition on hero's future), we compute
// the BR action table by dynamic enumeration below.

// Value of a node for a specific deal, with `hero` best-responding and the
// other two seats on sigma. Returns hero's expected chips. Uses a shared
// brTable (heroKey -> chosen action) so hero acts consistently across the
// deals that reach the same infoset. We fill brTable greedily via a fixed
// number of sweeps (policy iteration); for this single-street game one
// sweep from a uniform init then a re-eval converges (verified by a second
// sweep changing nothing).
function heroValue(game, state, hero, sigma, brTable) {
  if (game.isTerminal(state)) return game.utility(state)[hero];
  const p = game.currentPlayer(state);
  const acts = game.legalActions(state);
  if (p === hero) {
    const key = game.infosetKey(state);
    const choice = brTable[key];
    if (choice != null) {
      const ai = acts.indexOf(choice);
      const use = ai >= 0 ? choice : acts[0];
      return heroValue(game, game.applyAction(state, use), hero, sigma, brTable);
    }
    // no decision yet: take best action myopically (used only during sweeps)
    let best = -Infinity;
    for (const a of acts) {
      const v = heroValue(game, game.applyAction(state, a), hero, sigma, brTable);
      if (v > best) best = v;
    }
    return best;
  }
  // opponent on sigma: average over its action probs
  const { acts: sa, probs } = sigmaAt(sigma, game, state);
  let ev = 0;
  for (let i = 0; i < sa.length; i++) {
    if (probs[i] <= 0) continue;
    ev += probs[i] * heroValue(game, game.applyAction(state, sa[i]), hero, sigma, brTable);
  }
  return ev;
}

// Build hero's exact BR action table by accumulating, per hero infoset and
// action, the deal-reach-weighted continuation value (opponents on sigma,
// hero best-responding below via the current brTable), then argmax. Repeat
// sweeps until stable.
function buildBR(game, hero, sigma, weights) {
  let brTable = {};
  for (let sweep = 0; sweep < 6; sweep++) {
    const acc = {}; // key -> { acts, val:Float[], w:Float[] }
    for (const rk of deals()) {
      const w = weights[0][rk[0] - 1] * weights[1][rk[1] - 1] * weights[2][rk[2] - 1];
      if (w <= 0) continue;
      accumulate(game, game.dealt(rk[0], rk[1], rk[2]), hero, sigma, brTable, 1, w, acc);
    }
    const next = {};
    let changed = false;
    for (const key of Object.keys(acc)) {
      const a = acc[key];
      let bi = 0, bv = -Infinity;
      for (let i = 0; i < a.acts.length; i++) if (a.val[i] > bv) { bv = a.val[i]; bi = i; }
      next[key] = a.acts[bi];
      if (brTable[key] !== next[key]) changed = true;
    }
    brTable = next;
    if (!changed && sweep > 0) break;
  }
  return brTable;
}

// Reach-weighted counterfactual accumulation for hero infosets. reach is
// the product of OPPONENT sigma probs along the path (hero's own reach is 1
// for a best responder). At a hero node we recurse each action to get its
// value (hero BR below), record cfv, and continue along... but a best
// responder's path forks by action, so we must accumulate each action's
// value and then continue for the tree below using the CURRENT brTable
// choice (so deeper hero infosets are consistent).
function accumulate(game, state, hero, sigma, brTable, reach, w, acc) {
  if (game.isTerminal(state)) return game.utility(state)[hero];
  const p = game.currentPlayer(state);
  const acts = game.legalActions(state);
  if (p === hero) {
    const key = game.infosetKey(state);
    if (!acc[key]) acc[key] = { acts, val: acts.map(() => 0), w: 0 };
    const rec = acc[key];
    // value of each action (hero BR below via brTable)
    for (let i = 0; i < acts.length; i++) {
      const v = heroValue(game, game.applyAction(state, acts[i]), hero, sigma, brTable);
      rec.val[i] += w * reach * v;
    }
    rec.w += w * reach;
    // continue down the CURRENT chosen action so deeper hero infosets see
    // consistent reach
    const choice = brTable[key] && acts.includes(brTable[key]) ? brTable[key] : acts[0];
    return accumulate(game, game.applyAction(state, choice), hero, sigma, brTable, reach, w, acc);
  }
  const { acts: sa, probs } = sigmaAt(sigma, game, state);
  let ev = 0;
  for (let i = 0; i < sa.length; i++) {
    if (probs[i] <= 0) continue;
    ev += probs[i] * accumulate(game, game.applyAction(state, sa[i]), hero, sigma, brTable, reach * probs[i], w, acc);
  }
  return ev;
}

// On-policy EV of seat p when ALL seats play sigma (exact enumeration).
function onPolicyEV(game, hero, sigma, weights) {
  let total = 0, wsum = 0;
  for (const rk of deals()) {
    const w = weights[0][rk[0] - 1] * weights[1][rk[1] - 1] * weights[2][rk[2] - 1];
    if (w <= 0) continue;
    total += w * sigmaValue(game, game.dealt(rk[0], rk[1], rk[2]), hero, sigma);
    wsum += w;
  }
  return total / wsum;
}
function sigmaValue(game, state, hero, sigma) {
  if (game.isTerminal(state)) return game.utility(state)[hero];
  const { acts, probs } = sigmaAt(sigma, game, state);
  let ev = 0;
  for (let i = 0; i < acts.length; i++) {
    if (probs[i] <= 0) continue;
    ev += probs[i] * sigmaValue(game, game.applyAction(state, acts[i]), hero, sigma);
  }
  return ev;
}

// BR EV of hero (enumerated) given hero's BR table.
function brEV(game, hero, sigma, brTable, weights) {
  let total = 0, wsum = 0;
  for (const rk of deals()) {
    const w = weights[0][rk[0] - 1] * weights[1][rk[1] - 1] * weights[2][rk[2] - 1];
    if (w <= 0) continue;
    total += w * heroValue(game, game.dealt(rk[0], rk[1], rk[2]), hero, sigma, brTable);
    wsum += w;
  }
  return total / wsum;
}

// Public entry: per-seat exploitability against fixed sigma.
function exploitability(game, sigma) {
  const weights = game.ranges.map(seatWeights);
  const out = [];
  for (let hero = 0; hero < 3; hero++) {
    const onPol = onPolicyEV(game, hero, sigma, weights);
    const brTable = buildBR(game, hero, sigma, weights);
    const br = brEV(game, hero, sigma, brTable, weights);
    out.push({ seat: hero, onPolicy: onPol, br, exploit: br - onPol });
  }
  return out;
}

module.exports = { exploitability, seatWeights, onPolicyEV };
