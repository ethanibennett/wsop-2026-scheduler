// ── Badugi (heads-up fixed limit) ───────────────────────────
// Abstraction buckets, by best playable subset:
//   B5/B6/B7/B8/B9/BH — 4-card badugi by its high card (B9 = 9/T, BH = J+)
//   T4/T5/T6/T7/T8/TH — 3-card hand by its high card
//   W4/WH             — 2-card hand
//   X                 — 1-card hand
// Discard heuristic: keep the best (lowest) valid badugi subset of
// the kept size.

const { lowRankOf, RANK_CHARS } = require('../engine/cards');
const { badugiScore, bestBadugiSubset } = require('../eval/badugi');
const { makeDrawGame } = require('./draw-game');

function bucket(hand) {
  const best = bestBadugiSubset(hand);
  const top = Math.max(...best.map(lowRankOf));
  if (best.length === 4) {
    if (top <= 5) return 'B5';
    if (top <= 8) return 'B' + top;
    if (top <= 10) return 'B9';
    return 'BH';
  }
  if (best.length === 3) {
    if (top <= 4) return 'T4';
    if (top <= 8) return 'T' + top;
    return 'TH';
  }
  if (best.length === 2) return top <= 4 ? 'W4' : 'WH';
  return 'X';
}

// Keep the best-scoring subset of the kept size
function chooseKeep(hand, drawCount) {
  const keepN = hand.length - drawCount;
  let best = null, bestScore = Infinity;
  const n = hand.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    const sub = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sub.push(hand[i]);
    if (sub.length !== keepN) continue;
    const v = badugiScore(sub);
    if (v < bestScore) { bestScore = v; best = sub; }
  }
  return best;
}

// Draw counts worth considering: snow (0), the natural draw (complete
// the badugi), and breaking a made badugi (k=1 when already complete).
function drawOptions(hand) {
  const natural = 4 - bestBadugiSubset(hand).length;
  const opts = new Set([0, natural]);
  if (natural === 0) opts.add(1); // break a rough badugi
  return [...opts].sort((a, b) => a - b);
}

function describeHand(hand) {
  const best = bestBadugiSubset(hand);
  const top = Math.max(...best.map(lowRankOf));
  const topChar = RANK_CHARS[top === 1 ? 14 : top];
  if (best.length === 4) return `${topChar}-high badugi`;
  if (best.length === 3) return `3-card ${topChar}`;
  if (best.length === 2) return `2-card ${topChar}`;
  return 'one card';
}

module.exports = makeDrawGame({
  id: 'badugi',
  name: 'Badugi',
  handSize: 4,
  compare(h0, h1) {
    const a = badugiScore(h0), b = badugiScore(h1);
    return a < b ? 1 : a > b ? -1 : 0;
  },
  bucket,
  chooseKeep,
  drawOptions,
  describeHand,
});

module.exports.bucketBadugi = bucket;
