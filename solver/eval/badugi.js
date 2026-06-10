// ── Badugi evaluator ────────────────────────────────────────
// A badugi hand is 4 cards; the playable hand is the largest subset
// with all-distinct ranks AND all-distinct suits. More cards beats
// fewer; among equal sizes, lower ranks win (compare highest down).
// Aces are LOW.

const { lowRankOf, suitOf } = require('../engine/cards');

// Score any set of 1..4 cards. Lower = better.
// Encodes (4 - subsetSize) in the high digits so a 4-card badugi
// always beats a 3-card hand, etc.
function badugiScore(cards) {
  let best = Infinity;
  const n = cards.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    const sub = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sub.push(cards[i]);
    if (!validBadugiSet(sub)) continue;
    const ranks = sub.map(lowRankOf).sort((a, b) => b - a); // desc
    let v = (4 - sub.length) * 100000;
    // pad to 4 digits so same-size hands compare top card first
    for (let i = 0; i < 4; i++) v = v * 15 + (ranks[i] || 0);
    if (v < best) best = v;
  }
  return best;
}

function validBadugiSet(sub) {
  const ranks = new Set(), suits = new Set();
  for (const c of sub) {
    const r = lowRankOf(c), s = suitOf(c);
    if (ranks.has(r) || suits.has(s)) return false;
    ranks.add(r); suits.add(s);
  }
  return true;
}

// Best playable subset (the actual cards), used for keep heuristics + display
function bestBadugiSubset(cards) {
  let best = null, bestScore = Infinity;
  const n = cards.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    const sub = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sub.push(cards[i]);
    if (!validBadugiSet(sub)) continue;
    const ranks = sub.map(lowRankOf).sort((a, b) => b - a);
    let v = (4 - sub.length) * 100000;
    for (let i = 0; i < 4; i++) v = v * 15 + (ranks[i] || 0);
    if (v < bestScore) { bestScore = v; best = sub; }
  }
  return best;
}

module.exports = { badugiScore, bestBadugiSubset, validBadugiSet };
