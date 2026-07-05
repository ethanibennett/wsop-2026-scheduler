// range-sensitivity.js — the per-grade RANGE-SENSITIVE honesty flag for the
// EXACT oracle (shared by the stud grader razz-trainer/grade.js AND the draw
// grader draw-trainer/grade.js — they share the exact same "re-solve a spot
// against an assumed opponent range" pattern).
//
// WHY: the exact oracle grades a hero decision against an ASSUMED opponent
// range (the reach/particle posterior). A prior-shape sensitivity study
// (solver/neural/draw_misgrade_study.js scaffolding + resolve_draw_final.
// draw_root_action_ev) found that on ~5/22 post-last-draw spots per draw game
// the oracle's BEST ACTION FLIPS across plausible opponent-range priors and the
// evLoss SPREAD reaches 12-24 chips — always at thin value-bets / marginal
// call-vs-folds. The systematic-stride SAMPLING of the range is faithful (0
// flips vs full support); it is the belief SHAPE that the grade is sensitive to.
// So on those spots a single-prior evLoss is not a defensible charge against a
// human pro — it depends on a belief we cannot pin down.
//
// THE FLAG: at an oracle-eligible spot, in addition to the primary (shipped)
// grade we re-solve under a small PRIOR ENSEMBLE at REDUCED iters (we only need
// to detect a best-action FLIP or an evLoss SPREAD, not a precise grade):
//   (a) the shipped particle/reach posterior       (the primary grade's range),
//   (b) UNIFORM over the same support,
//   (c) a STRENGTH-TILT prior (weight toward stronger opponent holdings).
// If the best action FLIPS across the ensemble OR the evLoss spread exceeds
// ~RANGE_SENSITIVE_SPREAD_CHIPS chips, the spot is RANGE-SENSITIVE: we keep the
// oracle grade for DISPLAY (bestAction / gtoMix / perActionEV / evLoss) but ZERO
// the CHARGED evLoss (excluded from the running session score — "shown, not
// charged"), and surface rangeSensitive:true + rangeSensitiveSpread:[min,max].
//
// GAME-AGNOSTIC: this module knows only about ranges (arrays of {hand, w}),
// weights, and an oracle handle with .perActionEV(spot). Each caller supplies:
//   - a base range (already built the way its primary grade builds it),
//   - a buildSpot(range, iters) closure (the caller's buildOracleSpot /
//     buildDrawOracleSpot — the ONLY game/street-specific piece),
//   - the hero's legal action ids + the hero's chosen action id,
//   - an optional strengthScore(hand) (its own evaluator; when absent the
//     strength-tilt member is skipped and the ensemble is posterior+uniform).

'use strict';

// evLoss spread (max-min across the ensemble) above which a spot is flagged even
// if the best action never flips — a thin-value / marginal spot whose CHARGE
// swings materially with the assumed belief. ~2 chips = ~half a small bet.
const RANGE_SENSITIVE_SPREAD_CHIPS = 2.0;

// Reduced CFR+ iters for the ENSEMBLE re-solves: we are only detecting a flip or
// a spread, not producing a precise grade, so this is deliberately low (the
// primary grade keeps the caller's full oracleIters). The final draw round /
// 7th street are deal-free, so per-action EV converges fast even here.
const ENSEMBLE_ITERS = 300;

// Build the UNIFORM-over-support variant of a base range: same holdings, equal
// weight. Probes the "I have no idea how the opponent's belief concentrates"
// corner of belief-shape space.
function uniformRange(base) {
  const n = base.length;
  if (!n) return [];
  const w = 1 / n;
  return base.map(c => ({ hand: c.hand.slice(), w }));
}

// Build the STRENGTH-TILT variant: reweight the SAME support toward the opponent
// holdings a caller's strengthScore ranks as STRONGER (higher score = stronger).
// We rank the holdings and assign a linear tilt weight (rank+1)/n so the
// strongest holding gets ~n× the weight of the weakest, then renormalize. This
// probes the "opponent's range is polarized toward value" corner — the corner
// the study found flips thin value-bets. Returns null when no scorer is given.
function strengthTiltRange(base, strengthScore) {
  if (typeof strengthScore !== 'function' || !base.length) return null;
  let scored;
  try {
    scored = base.map((c, i) => ({ c, i, s: strengthScore(c.hand) }));
  } catch (e) {
    return null; // a broken scorer must never break grading
  }
  if (scored.some(x => !Number.isFinite(x.s))) return null;
  // ascending by strength → the strongest holding gets the largest rank weight.
  scored.sort((a, b) => a.s - b.s);
  const n = scored.length;
  const out = new Array(n);
  let z = 0;
  for (let r = 0; r < n; r++) {
    const w = (r + 1) / n;              // linear tilt toward the strong end
    out[scored[r].i] = { hand: scored[r].c.hand.slice(), w };
    z += w;
  }
  if (!(z > 0)) return null;
  for (const c of out) c.w /= z;
  return out;
}

// Re-solve ONE range variant through the oracle at ENSEMBLE_ITERS and return
// { bestAction, evLoss } over the hero's legal actions, or null on any failure
// (worker down, range empty, action-set mismatch) — a failed member is simply
// dropped from the ensemble (it never fabricates a flag).
async function solveVariant(oracle, buildSpot, range, acts, chosen) {
  if (!range || !range.length) return null;
  let res;
  try {
    const spot = buildSpot(range, ENSEMBLE_ITERS);
    res = await oracle.perActionEV(spot);
  } catch (e) {
    return null;
  }
  if (!res || !res.per_action_ev) return null;
  const ev = res.per_action_ev;
  for (const a of acts) if (!(a in ev)) return null; // must cover the legal set
  let bestA = acts[0], bestEV = -Infinity;
  for (const a of acts) if (ev[a] > bestEV) { bestEV = ev[a]; bestA = a; }
  if (!Number.isFinite(bestEV)) return null;
  const chosenEV = ev[chosen];
  if (chosenEV == null || !Number.isFinite(chosenEV)) return null;
  return { bestAction: bestA, evLoss: Math.max(0, bestEV - chosenEV) };
}

// Compute the range-sensitivity flag for one oracle-eligible spot.
//
// opts = {
//   oracle,                    // the oracle handle (.perActionEV)
//   buildSpot(range, iters),   // caller closure → the oracle spot dict
//   baseRange:  [{hand:[int], w}],   // the primary grade's opponent range
//   acts:       [actionId],    // hero's legal actions
//   chosen:     actionId,      // hero's chosen action
//   strengthScore?(hand)->num, // optional per-holding strength (higher=stronger)
//   spreadThreshold?,          // chips; default RANGE_SENSITIVE_SPREAD_CHIPS
// }
//
// Returns {
//   rangeSensitive: bool,          // flip across the ensemble OR spread > thr
//   rangeSensitiveSpread: [min,max]|null,  // evLoss min/max across the ensemble
//   rangeSensitiveFlip: bool,      // best action flipped across the ensemble
//   ensembleSize: int,             // # members that actually solved
//   ensembleBestActions: [id],     // best action per solved member (diagnostic)
// }
// On ANY failure (no oracle, <2 members solve) returns rangeSensitive:false with
// ensembleSize the number that did solve — the caller then charges normally, so
// the flag can only ever SUPPRESS a charge on a genuinely-detected sensitivity,
// never fabricate one.
async function computeRangeSensitivity(opts) {
  const { oracle, buildSpot, baseRange, acts, chosen } = opts;
  const spreadThreshold = opts.spreadThreshold == null
    ? RANGE_SENSITIVE_SPREAD_CHIPS : opts.spreadThreshold;
  const empty = {
    rangeSensitive: false, rangeSensitiveSpread: null, rangeSensitiveFlip: false,
    ensembleSize: 0, ensembleBestActions: [],
  };
  if (!oracle || typeof buildSpot !== 'function' || !baseRange || !baseRange.length) {
    return empty;
  }

  // The prior ENSEMBLE: (a) shipped posterior, (b) uniform-over-support,
  // (c) strength-tilt (when a scorer is available).
  const members = [baseRange, uniformRange(baseRange)];
  const tilt = strengthTiltRange(baseRange, opts.strengthScore);
  if (tilt) members.push(tilt);

  const solved = [];
  for (const range of members) {
    const r = await solveVariant(oracle, buildSpot, range, acts, chosen);
    if (r) solved.push(r);
  }
  // Need at least 2 members to compare a flip / a spread; fewer → can't detect
  // sensitivity, so DON'T flag (the caller charges normally).
  if (solved.length < 2) {
    return Object.assign({}, empty, {
      ensembleSize: solved.length,
      ensembleBestActions: solved.map(r => r.bestAction),
    });
  }

  const losses = solved.map(r => r.evLoss);
  const bestActions = solved.map(r => r.bestAction);
  const min = Math.min(...losses), max = Math.max(...losses);
  const flip = bestActions.some(a => a !== bestActions[0]);
  const spreadExceeds = (max - min) > spreadThreshold;
  return {
    rangeSensitive: flip || spreadExceeds,
    rangeSensitiveSpread: [min, max],
    rangeSensitiveFlip: flip,
    ensembleSize: solved.length,
    ensembleBestActions: bestActions,
  };
}

module.exports = {
  computeRangeSensitivity,
  uniformRange,
  strengthTiltRange,
  RANGE_SENSITIVE_SPREAD_CHIPS,
  ENSEMBLE_ITERS,
};
