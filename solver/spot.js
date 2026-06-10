// ── Trainer spot generator ──────────────────────────────────
// Plays out a hand with both seats sampling from the trained average
// strategy, snapshots every decision point, then returns one random
// decision as a quiz spot: the situation from that player's view,
// the legal actions, and the solver's strategy for the infoset.

function strategyFor(strategyMap, key, acts) {
  const node = strategyMap[key];
  if (node && node.a.length === acts.length && node.a.every((a, i) => a === acts[i])) {
    return { probs: node.p, trained: true, mass: node.m || 0 };
  }
  return { probs: acts.map(() => 1 / acts.length), trained: false, mass: 0 };
}

function sampleIndex(probs, rng) {
  let r = rng();
  for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r <= 0) return i; }
  return probs.length - 1;
}

function generateSpot(game, strategyMap, rng, opts = {}) {
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let state = game.newHand(rng);
    const snapshots = [];

    while (!game.isTerminal(state)) {
      if (game.isChance(state)) { state = game.sampleChance(state, rng); continue; }
      const acts = game.legalActions(state);
      if (acts.length > 1) {
        const key = game.infosetKey(state);
        const strat = strategyFor(strategyMap, key, acts);
        snapshots.push({ state, acts, key, strat });
      }
      const { probs } = strategyFor(strategyMap, game.infosetKey(state), acts);
      state = game.applyAction(state, acts[sampleIndex(probs, rng)]);
    }

    let pool = snapshots;
    if (opts.trainedOnly !== false) {
      const trained = snapshots.filter(sn => sn.strat.trained);
      if (trained.length) pool = trained;
      else if (attempt < maxAttempts - 1) continue; // try a fresh hand
    }
    if (!pool.length) continue;

    const pick = pool[Math.floor(rng() * pool.length)];
    const desc = game.describe(pick.state);
    return {
      game: game.id,
      gameName: game.name,
      infosetKey: pick.key,
      trained: pick.strat.trained,
      description: desc,
      actions: pick.acts.map((a, i) => ({
        id: a,
        label: game.actionLabel(a, pick.state),
        prob: pick.strat.probs[i],
      })),
    };
  }
  return null;
}

module.exports = { generateSpot };
