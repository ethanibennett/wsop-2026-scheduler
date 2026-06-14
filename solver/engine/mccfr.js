// ── External-sampling Monte Carlo CFR engine ───────────────
// Works over a generic two-player zero-sum Game interface:
//
//   game.newHand(rng)            -> initial state (after blinds/deal)
//   game.isTerminal(state)       -> bool
//   game.utility(state)          -> [u0, u1] (chips, zero-sum)
//   game.isChance(state)         -> bool (e.g. pending draw replacements)
//   game.sampleChance(state,rng) -> next state
//   game.currentPlayer(state)    -> 0 | 1
//   game.legalActions(state)     -> array of action ids (strings)
//   game.applyAction(state, a)   -> next state (must not mutate input)
//   game.infosetKey(state)       -> abstraction key for current player
//
// Uses regret-matching+ (negative regrets floored at 0) and linear
// averaging (later iterations weigh more), the standard CFR+ recipe.

class MCCFRTrainer {
  constructor(game) {
    this.game = game;
    this.nodes = new Map(); // key -> { acts, regret: Float64Array, strat: Float64Array }
    this.iterations = 0;
  }

  node(key, acts) {
    let n = this.nodes.get(key);
    if (!n) {
      n = { acts, regret: new Float64Array(acts.length), strat: new Float64Array(acts.length) };
      this.nodes.set(key, n);
    }
    return n;
  }

  static regretMatch(regret, out) {
    let sum = 0;
    for (let i = 0; i < regret.length; i++) sum += regret[i] > 0 ? regret[i] : 0;
    if (sum <= 0) {
      out.fill(1 / regret.length);
    } else {
      for (let i = 0; i < regret.length; i++) out[i] = regret[i] > 0 ? regret[i] / sum : 0;
    }
    return out;
  }

  train(iterations, rng, onProgress) {
    for (let t = 0; t < iterations; t++) {
      this.iterations++;
      for (let traverser = 0; traverser < 2; traverser++) {
        this.traverse(this.game.newHand(rng), traverser, rng);
      }
      if (onProgress && (t + 1) % 10000 === 0) onProgress(t + 1, this.nodes.size);
    }
  }

  traverse(state, traverser, rng) {
    const g = this.game;
    if (g.isTerminal(state)) return g.utility(state)[traverser];
    if (g.isChance(state)) return this.traverse(g.sampleChance(state, rng), traverser, rng);

    const player = g.currentPlayer(state);
    const acts = g.legalActions(state);
    if (acts.length === 1) return this.traverse(g.applyAction(state, acts[0]), traverser, rng);

    const key = g.infosetKey(state);
    const node = this.node(key, acts);
    const strat = MCCFRTrainer.regretMatch(node.regret, new Float64Array(acts.length));

    if (player === traverser) {
      const utils = new Float64Array(acts.length);
      let ev = 0;
      for (let i = 0; i < acts.length; i++) {
        utils[i] = this.traverse(g.applyAction(state, acts[i]), traverser, rng);
        ev += strat[i] * utils[i];
      }
      // Discounted CFR — DCFR(alpha=3/2, beta=0, gamma=2), the default
      // recommended by Brown & Sandholm (AAAI 2019), reported to beat
      // CFR+ by ~2-3x. Each iteration t: discount accumulated POSITIVE
      // regret by t^1.5/(t^1.5+1) and NEGATIVE regret by 1/2 (beta=0),
      // then add the new instantaneous regret. (CFR+ is the limiting
      // case DCFR(inf,-inf,2), i.e. flooring negatives at 0.) The
      // average strategy keeps linear-in-t weighting below, which is
      // the gamma=2 recipe in the weight-at-visit MCCFR convention.
      const t = this.iterations;
      const posDiscount = Math.pow(t, 1.5) / (Math.pow(t, 1.5) + 1);
      for (let i = 0; i < acts.length; i++) {
        const prev = node.regret[i];
        node.regret[i] = (prev > 0 ? prev * posDiscount : prev * 0.5) + (utils[i] - ev);
      }
      return ev;
    }

    // Opponent node: accumulate average strategy (linear weighting), sample one action
    const w = this.iterations;
    for (let i = 0; i < acts.length; i++) node.strat[i] += w * strat[i];
    let r = rng(), a = acts.length - 1;
    for (let i = 0; i < acts.length; i++) { r -= strat[i]; if (r <= 0) { a = i; break; } }
    return this.traverse(g.applyAction(state, acts[a]), traverser, rng);
  }

  // Full trainer state for checkpoint/resume across training sessions
  toCheckpoint() {
    const nodes = {};
    for (const [key, n] of this.nodes.entries()) {
      nodes[key] = { a: n.acts, r: Array.from(n.regret), s: Array.from(n.strat) };
    }
    return { iterations: this.iterations, nodes };
  }

  static fromCheckpoint(game, data) {
    const trainer = new MCCFRTrainer(game);
    trainer.iterations = data.iterations;
    for (const [key, n] of Object.entries(data.nodes)) {
      trainer.nodes.set(key, { acts: n.a, regret: Float64Array.from(n.r), strat: Float64Array.from(n.s) });
    }
    return trainer;
  }

  // Normalized average strategy. minMass drops near-unvisited infosets
  // (relative to the most-visited node) to keep saved files small.
  averageStrategy({ minMassRatio = 0 } = {}) {
    let maxMass = 0;
    for (const n of this.nodes.values()) {
      let m = 0;
      for (const s of n.strat) m += s;
      if (m > maxMass) maxMass = m;
    }
    const out = {};
    for (const [key, n] of this.nodes.entries()) {
      let sum = 0;
      for (const s of n.strat) sum += s;
      if (sum <= 0 || sum < maxMass * minMassRatio) continue;
      const probs = Array.from(n.strat, s => Math.round((s / sum) * 1000) / 1000);
      out[key] = { a: n.acts, p: probs, m: Math.round(sum) };
    }
    return out;
  }
}

module.exports = { MCCFRTrainer };
