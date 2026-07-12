// Derived 3rd-street entry economics — read VERBATIM from razz3-game.js so the
// threshold moves with the rulebook and can never drift into a hand-tuned
// constant (the property the pro demanded). Design spec: wf_583effdb.
//
// Entry rule: enter iff E[share(h) * pot] - c >= 0  <=>  E[share(h)] >= E* = c/pot.
// The threshold is EV on the TRUE split share (multiwayShare), so a reverse-
// quartered one-way hand is auto-penalized; for a non-split game this reduces to
// a plain share >= E* cutoff.
//
// pot accounting matches razz3-game.js utility() (pot = deadPot + sum(live
// contrib)): with m == NSEAT the folded/live antes collapse to
//   pot = totalAntes + m*c,  totalAntes = ANTES*ANTE.
// So the OPEN threshold is E* = SMALL/(ANTES*ANTE + m*SMALL) = 4/(8+12) = 0.20,
// and the forced-high-door BRING-IN defense is discounted (BRING already posted):
//   E*_bringin = (SMALL-BRING)/(ANTES*ANTE + m*SMALL) = 2/20 = 0.10.
// HORIZON HONESTY: the equity term is a full 3rd->7th runout but c is the single
// 3rd-street commitment, so E*=0.20 is deliberately the WIDE end (retains fold
// options) — the correct posture for a deal/opponent PRIOR the consumer re-solve
// then tightens. Do NOT pick c from a menu of streets to hit a target VPIP.
const { ANTE, BRING, SMALL, DEFAULT_ANTES, NSEAT } = require('../multiway/razz3-game');

// m = contested seats (2 or 3); action = 'open' (first-in complete) | 'bringin'
// (forced high-door defending). antes overridable to test rule-sensitivity.
function potAndCost({ m = NSEAT, action = 'open', antes = DEFAULT_ANTES } = {}) {
  const totalAntes = antes * ANTE;
  const openCost = SMALL;                                  // per-live-seat forward cost
  const c = action === 'bringin' ? (SMALL - BRING) : openCost;
  const pot = totalAntes + m * openCost;                  // bring-in discount is a private price, not a smaller pot
  return { pot, c, eStar: c / pot, totalAntes, openCost, m, action };
}

module.exports = { potAndCost, ANTE, BRING, SMALL, ANTES: DEFAULT_ANTES, NSEAT };
