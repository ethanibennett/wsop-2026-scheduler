// ── Self-play trajectory generator ─────────────────────────
// Plays a full hand with both seats sampling from the trained average
// strategy and records every decision node (full-information view of
// both hands, the legal actions, the solver's mixed strategy, and the
// sampled action) plus the terminal result. Used by the self-play
// viewer to step through a hand and watch the solver act.

const { explainStep } = require('./explain');

function strategyFor(strategyMap, key, acts) {
  const node = strategyMap[key];
  if (node && node.a.length === acts.length && node.a.every((a, i) => a === acts[i])) {
    return { probs: node.p, trained: true };
  }
  return { probs: acts.map(() => 1 / acts.length), trained: false };
}

function sampleIndex(probs, rng) {
  let r = rng();
  for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r <= 0) return i; }
  return probs.length - 1;
}

function playHand(game, strategyMap, rng) {
  let state = game.newHand(rng);
  const steps = [];
  let guard = 0;

  while (!game.isTerminal(state)) {
    if (++guard > 500) break;
    if (game.isChance(state)) { state = game.sampleChance(state, rng); continue; }
    const acts = game.legalActions(state);
    if (acts.length <= 1) { state = game.applyAction(state, acts[0]); continue; }

    const key = game.infosetKey(state);
    const strat = strategyFor(strategyMap, key, acts);
    const choiceIdx = sampleIndex(strat.probs, rng);
    const view = game.viewAll(state);

    const stepObj = {
      ...view,
      actor: game.currentPlayer(state),
      kind: view.phase === 'draw' ? 'draw' : 'bet',
      trained: strat.trained,
      actions: acts.map((a, i) => ({ id: a, label: game.actionLabel(a, state), prob: strat.probs[i] })),
      chosen: acts[choiceIdx],
    };
    stepObj.explain = explainStep(stepObj, game.id === 'stud8');
    steps.push(stepObj);
    state = game.applyAction(state, acts[choiceIdx]);
  }

  return {
    game: game.id,
    gameName: game.name,
    isStud: game.id === 'stud8',
    steps,
    result: game.result(state),
  };
}

module.exports = { playHand };
