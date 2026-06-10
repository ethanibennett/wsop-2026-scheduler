// ── 2-7 Triple Draw (heads-up fixed limit) ──────────────────
// Abstraction buckets:
//   Pat hands:  P75/P76/P85/.../P87 (top two ranks while <= 8),
//               P9-x / PT-x (9/T-high pat, x = what it breaks to), PH (J+)
//   Draws:      D1<top><d?><x?> — one-card draw to <top>, 'd' = holds a
//               deuce, 'x' = four in a row (straight danger)
//               D2<top><d?> — two-card draw, D3 — worse
// Discard heuristic: keep the lowest distinct ranks (aces are high).

const { rankOf, RANK_CHARS } = require('../engine/cards');
const { score27 } = require('../eval/low27');
const { makeDrawGame } = require('./draw-game');

const CAT_BASE = Math.pow(15, 5);

function bucket(hand) {
  const ranks = hand.map(rankOf).sort((a, b) => a - b); // asc
  const uniq = [...new Set(ranks)];
  const cat = Math.floor(score27(hand) / CAT_BASE);

  if (cat === 0) { // made low — no pair/straight/flush
    const hi = ranks[4], second = ranks[3];
    if (hi <= 8) return `P${hi}${second}`;
    const breakTop = uniq.slice(0, 4)[3]; // top rank after breaking the high card
    if (hi === 9) return `P9-${breakTop}`;
    if (hi === 10) return `PT-${breakTop}`;
    return 'PH';
  }

  const d = uniq[0] === 2 ? 'd' : '';
  if (uniq.length >= 4) {
    const four = uniq.slice(0, 4);
    if (four[3] <= 9) {
      const x = four[3] - four[0] === 3 ? 'x' : '';
      return `D1${four[3]}${d}${x}`;
    }
  }
  if (uniq.length >= 3 && uniq[2] <= 8) return `D2${uniq[2]}${d}`;
  return `D3${d}`;
}

// Keep the (5 - drawCount) best cards: lowest distinct ranks first,
// then pad with the lowest duplicates if needed.
function chooseKeep(hand, drawCount) {
  const keepN = hand.length - drawCount;
  const sorted = hand.slice().sort((a, b) => rankOf(a) - rankOf(b));
  const keep = [], seen = new Set();
  for (const c of sorted) {
    if (keep.length >= keepN) break;
    if (!seen.has(rankOf(c))) { keep.push(c); seen.add(rankOf(c)); }
  }
  for (const c of sorted) {
    if (keep.length >= keepN) break;
    if (!keep.includes(c)) keep.push(c);
  }
  return keep;
}

// Draw counts worth considering: snow (0), the natural draw toward an
// 8-or-better low, and breaking a pat 9/T (k=1 when already pat).
function drawOptions(hand) {
  const uniq = new Set(hand.map(rankOf).filter(r => r <= 8));
  const natural = Math.min(3, hand.length - Math.min(hand.length, uniq.size));
  const opts = new Set([0, natural]);
  if (natural === 0) opts.add(1); // option to break a pat hand
  return [...opts].sort((a, b) => a - b);
}

function describeHand(hand) {
  const cat = Math.floor(score27(hand) / CAT_BASE);
  const ranks = hand.map(rankOf).sort((a, b) => b - a);
  if (cat === 0) return `${RANK_CHARS[ranks[0]]}-${RANK_CHARS[ranks[1]]} low`;
  const names = { 1: 'a pair', 2: 'two pair', 3: 'trips', 4: 'a straight', 5: 'a flush', 6: 'a full house', 7: 'quads', 8: 'a straight flush' };
  return `${RANK_CHARS[ranks[0]]} high with ${names[cat]}`;
}

module.exports = makeDrawGame({
  id: 'td27',
  name: '2-7 Triple Draw',
  handSize: 5,
  compare(h0, h1) {
    const a = score27(h0), b = score27(h1);
    return a < b ? 1 : a > b ? -1 : 0;
  },
  bucket,
  chooseKeep,
  drawOptions,
  describeHand,
});

module.exports.bucket27 = bucket;
module.exports.chooseKeep27 = chooseKeep;
