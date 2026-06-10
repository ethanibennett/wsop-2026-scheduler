// ── Seven Card Stud Hi-Lo (8 or better) evaluator ──────────
// Hi: standard poker, best 5 of 7 (higher score = better).
// Lo: 8-or-better — best 5 distinct ranks all <= 8, aces low,
// straights/flushes don't count against (lower score = better, or
// null if the hand doesn't qualify).

const { rankOf, suitOf, lowRankOf } = require('../engine/cards');

// Standard 5-card hi evaluator. Higher score = better.
// Categories: 8=straight flush, 7=quads, 6=full house, 5=flush,
// 4=straight, 3=trips, 2=two pair, 1=pair, 0=high card.
function score5hi(cards) {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.keys(counts)
    .map(r => ({ r: parseInt(r, 10), n: counts[r] }))
    .sort((a, b) => (b.n - a.n) || (b.r - a.r));

  const isFlush = cards.every(c => suitOf(c) === suitOf(cards[0]));
  const distinct = groups.length === 5;
  let straightHigh = 0;
  if (distinct) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    // wheel: A-5-4-3-2
    else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) straightHigh = 5;
  }

  let cat, sig;
  if (straightHigh && isFlush) { cat = 8; sig = [straightHigh]; }
  else if (groups[0].n === 4) { cat = 7; sig = [groups[0].r, groups[1].r]; }
  else if (groups[0].n === 3 && groups[1].n === 2) { cat = 6; sig = [groups[0].r, groups[1].r]; }
  else if (isFlush) { cat = 5; sig = ranks; }
  else if (straightHigh) { cat = 4; sig = [straightHigh]; }
  else if (groups[0].n === 3) { cat = 3; sig = [groups[0].r, groups[1].r, groups[2].r]; }
  else if (groups[0].n === 2 && groups[1].n === 2) { cat = 2; sig = [groups[0].r, groups[1].r, groups[2].r]; }
  else if (groups[0].n === 2) { cat = 1; sig = [groups[0].r, groups[1].r, groups[2].r, groups[3].r]; }
  else { cat = 0; sig = ranks; }

  let v = cat;
  for (let i = 0; i < 5; i++) v = v * 15 + (sig[i] || 0);
  return v; // higher is better
}

const COMBOS_7C5 = (() => {
  const out = [];
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 4; b++)
      for (let c = b + 1; c < 5; c++)
        for (let d = c + 1; d < 6; d++)
          for (let e = d + 1; e < 7; e++)
            out.push([a, b, c, d, e]);
  return out;
})();

function bestHi7(cards7) {
  let best = -1;
  for (const idx of COMBOS_7C5) {
    const v = score5hi(idx.map(i => cards7[i]));
    if (v > best) best = v;
  }
  return best;
}

// Best 8-or-better low from up to 7 cards, or null if none qualifies.
// Lower score = better. The best low is the 5 lowest distinct ranks <= 8.
function bestLo8(cards7) {
  const lows = [...new Set(cards7.map(lowRankOf).filter(r => r <= 8))].sort((a, b) => a - b);
  if (lows.length < 5) return null;
  const five = lows.slice(0, 5).sort((a, b) => b - a); // desc for comparison
  let v = 0;
  for (const r of five) v = v * 15 + r;
  return v;
}

// Count of distinct low ranks (<=8) — used by abstraction buckets
function lowRankCount(cards) {
  return new Set(cards.map(lowRankOf).filter(r => r <= 8)).size;
}

module.exports = { score5hi, bestHi7, bestLo8, lowRankCount };
