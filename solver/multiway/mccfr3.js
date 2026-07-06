// ── 3-player external-sampling MCCFR (general-sum) ─────────────
// A minimal, SELF-CONTAINED N=3 port of solver/engine/mccfr.js. The
// production engine is hard-wired 2-player (traverser<2, opponent = 1-p,
// utility -> [u0,u1]); this leaves it untouched (a grind is running) and
// implements the three changes the feasibility spike called for:
//
//   (a) traverser loops 0..2;
//   (b) at a NON-traverser node we sample that seat's action from its own
//       regret-matched strategy (both non-traversers are sampled, each
//       from its own table) — this is the multiway external-sampling seam;
//   (c) utility(state) returns [u0,u1,u2] indexed by seat.
//
// Regret/strategy tables are PER-SEAT (nodes keyed by seat-qualified
// infoset keys the game provides). DCFR(alpha=3/2,beta=0,gamma=2) applies
// per seat exactly as in the 2-player engine — no CFR+ math changes.
//
// CAVEAT (stated plainly, as the spike requires): CFR in >2-player
// general-sum games has NO equilibrium-convergence guarantee. What we
// CAN and DO measure here is per-seat regret and per-seat exploitability
// against the OTHER TWO seats held fixed at the current average — that is
// a genuine, computable convergence signal, and it is what this engine
// is built to expose.

class MCCFR3Trainer {
  constructor(game) {
    this.game = game;
    this.nodes = new Map(); // key -> { acts, regret:Float64Array, strat:Float64Array }
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
    if (sum <= 0) out.fill(1 / regret.length);
    else for (let i = 0; i < regret.length; i++) out[i] = regret[i] > 0 ? regret[i] / sum : 0;
    return out;
  }

  train(iterations, rng, onProgress) {
    for (let t = 0; t < iterations; t++) {
      this.iterations++;
      for (let traverser = 0; traverser < 3; traverser++) {
        this.traverse(this.game.newHand(rng), traverser, rng);
      }
      if (onProgress && (t + 1) % 5000 === 0) onProgress(t + 1, this.nodes.size);
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
    const strat = MCCFR3Trainer.regretMatch(node.regret, new Float64Array(acts.length));

    if (player === traverser) {
      const utils = new Float64Array(acts.length);
      let ev = 0;
      for (let i = 0; i < acts.length; i++) {
        utils[i] = this.traverse(g.applyAction(state, acts[i]), traverser, rng);
        ev += strat[i] * utils[i];
      }
      const t = this.iterations;
      const posDiscount = Math.pow(t, 1.5) / (Math.pow(t, 1.5) + 1);
      for (let i = 0; i < acts.length; i++) {
        const prev = node.regret[i];
        node.regret[i] = (prev > 0 ? prev * posDiscount : prev * 0.5) + (utils[i] - ev);
      }
      return ev;
    }

    // Non-traverser (one of the OTHER TWO seats): accumulate avg strategy
    // (linear weighting) and sample a single action from THIS seat's own
    // regret-matched strategy. Both non-traversers hit this branch on
    // their own nodes during a single traversal.
    const w = this.iterations;
    for (let i = 0; i < acts.length; i++) node.strat[i] += w * strat[i];
    let r = rng(), a = acts.length - 1;
    for (let i = 0; i < acts.length; i++) { r -= strat[i]; if (r <= 0) { a = i; break; } }
    return this.traverse(g.applyAction(state, acts[a]), traverser, rng);
  }

  // Full trainer state for checkpoint/resume across training sessions.
  // Mirrors the 2-player engine's toCheckpoint/fromCheckpoint (solver/engine/
  // mccfr.js) exactly: per-node acts + regret + (un-normalized) avg-strat
  // accumulator, plus the iteration count (the DCFR discount + linear
  // averaging both key off it, so resume must preserve it).
  toCheckpoint() {
    const nodes = {};
    for (const [key, n] of this.nodes.entries()) {
      nodes[key] = { a: n.acts, r: Array.from(n.regret), s: Array.from(n.strat) };
    }
    return { iterations: this.iterations, nodes };
  }

  static fromCheckpoint(game, data) {
    const trainer = new MCCFR3Trainer(game);
    trainer.iterations = data.iterations;
    for (const [key, n] of Object.entries(data.nodes)) {
      trainer.nodes.set(key, { acts: n.a, regret: Float64Array.from(n.r), strat: Float64Array.from(n.s) });
    }
    return trainer;
  }

  // Normalized average strategy: key -> { a:acts, p:probs, m:mass }.
  averageStrategy() {
    const out = {};
    for (const [key, n] of this.nodes.entries()) {
      let sum = 0;
      for (const s of n.strat) sum += s;
      if (sum <= 0) continue;
      out[key] = { a: n.acts, p: Array.from(n.strat, s => s / sum), m: sum };
    }
    return out;
  }

  // Current-iterate regret-matched strategy (used for regret readouts).
  currentStrategy() {
    const out = {};
    for (const [key, n] of this.nodes.entries()) {
      out[key] = { a: n.acts, p: Array.from(MCCFR3Trainer.regretMatch(n.regret, new Float64Array(n.acts.length))) };
    }
    return out;
  }

  // Sum of positive regret over all nodes, normalized by iterations — a
  // cheap "is regret shrinking?" scalar. Not exploitability, but monotone
  // decrease is the multiway no-regret signal.
  meanPositiveRegret() {
    let tot = 0, count = 0;
    for (const n of this.nodes.values()) {
      let s = 0;
      for (const x of n.regret) if (x > 0) s += x;
      tot += s / Math.max(1, this.iterations);
      count++;
    }
    return count ? tot / count : 0;
  }
}

module.exports = { MCCFR3Trainer };
