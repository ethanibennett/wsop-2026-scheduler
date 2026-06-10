// ── Deuce-to-seven lowball evaluator (5 cards) ─────────────
// Lower score = better hand. Aces are always HIGH; straights and
// flushes count AGAINST you. Best possible hand: 7-5-4-3-2 offsuit.

const { rankOf, suitOf } = require('../engine/cards');

// Category (lower = better for lowball):
// 0 = no pair / no straight / no flush
// 1 = one pair, 2 = two pair, 3 = trips, 4 = straight,
// 5 = flush, 6 = full house, 7 = quads, 8 = straight flush
function score27(cards) {
  const ranks = cards.map(rankOf).sort((a, b) => b - a); // desc
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.keys(counts)
    .map(r => ({ r: parseInt(r, 10), n: counts[r] }))
    .sort((a, b) => (b.n - a.n) || (b.r - a.r)); // by count desc, then rank desc

  const isFlush = cards.every(c => suitOf(c) === suitOf(cards[0]));
  // A2345 is NOT a straight in 2-7 (ace is high only)
  const distinct = groups.length === 5;
  const isStraight = distinct && (ranks[0] - ranks[4] === 4);

  let cat;
  if (isStraight && isFlush) cat = 8;
  else if (groups[0].n === 4) cat = 7;
  else if (groups[0].n === 3 && groups[1].n === 2) cat = 6;
  else if (isFlush) cat = 5;
  else if (isStraight) cat = 4;
  else if (groups[0].n === 3) cat = 3;
  else if (groups[0].n === 2 && groups[1].n === 2) cat = 2;
  else if (groups[0].n === 2) cat = 1;
  else cat = 0;

  // Pack significance order: grouped ranks first (count desc), then kickers desc.
  let v = cat;
  for (const g of groups) {
    for (let i = 0; i < g.n; i++) v = v * 15 + g.r;
  }
  return v; // lower is better
}

// Human-readable class of a made low, e.g. '75' for 7-5 low, 'T' for ten-low
function lowClass27(cards) {
  const v = score27(cards);
  const catBase = Math.pow(15, 5);
  if (v >= catBase) return null; // paired/straight/flush — not a made low
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  return ranks;
}

module.exports = { score27, lowClass27 };
