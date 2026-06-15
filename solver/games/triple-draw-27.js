// ── 2-7 Triple Draw (heads-up fixed limit) ──────────────────
// Draw-aware abstraction. Hands are classified by what they DRAW TO,
// not by the made-hand evaluator (which mislabels an unpaired
// four-low-plus-a-high hand like 2-3-4-5-K as "pat" when it is really a
// premium one-card draw). Buckets:
//   M<hi><2nd>      — pat made 8-or-better low (e.g. M75 = 7-5 low)
//   D<n>k<top><d?><x?><p?>
//                   — a draw: <n> = cards drawn (1-4) keeping the low
//                     cards, <top> = highest LOW card kept (0 = none),
//                     d = holds a deuce (the premium card), x = straight
//                     danger (4 consecutive lows), p = currently a rough
//                     made 9/T low that may also stand pat.
// The discard heuristic keeps the lowest distinct low cards; the draw
// COUNT in each bucket is the count the solver actually takes, so a
// "1-card draw to a 9" no longer exists — that hand is a 2-card draw to
// the cards underneath, and is bucketed/labeled as such.

const { rankOf, RANK_CHARS } = require('../engine/cards');
const { score27 } = require('../eval/low27');
const { makeDrawGame } = require('./draw-game');

const CAT_BASE = Math.pow(15, 5);

// Distinct "keepable" low ranks (2..8), ascending.
function lowRanks(hand) {
  return [...new Set(hand.map(rankOf).filter(r => r <= 8))].sort((a, b) => a - b);
}

function bucket(hand) {
  const ranks = hand.map(rankOf);
  const top = Math.max(...ranks);
  const cat = Math.floor(score27(hand) / CAT_BASE);

  // Pat made 8-or-better low (no pair/straight/flush, high card <= 8).
  if (cat === 0 && top <= 8) {
    const desc = [...new Set(ranks)].sort((a, b) => b - a);
    return 'M' + desc[0] + desc[1]; // M75 = 7-5 low, M86 = 8-6 low
  }

  // Otherwise a draw: keep the low cards, draw the rest.
  const lows = lowRanks(hand);
  const L = lows.length;
  let draw = 5 - L;
  if (draw <= 0) draw = 1; // 5 distinct lows but a straight: break one
  if (draw > 4) draw = 4;
  const topLow = L > 0 ? lows[L - 1] : 0;
  const deuce = (L > 0 && lows[0] === 2) ? 'd' : '';
  let srisk = '';
  for (let i = 0; i + 3 < L; i++) if (lows[i + 3] - lows[i] === 3) { srisk = 'x'; break; }
  // A rough made 9/10-high low can also stand pat (street-dependent choice).
  const patable = (cat === 0 && top <= 10) ? 'p' : '';
  return `D${draw}k${topLow}${deuce}${srisk}${patable}`;
}

// Keep the (5 - drawCount) lowest distinct ranks (then lowest dups).
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

// Draw counts offered to the solver. A made 8-or-better low only pats.
// A rough made 9/10 low chooses pat vs. its natural draw (the
// street-dependent decision). Everything else: snow (0) or natural draw.
function drawOptions(hand) {
  const ranks = hand.map(rankOf);
  const top = Math.max(...ranks);
  const cat = Math.floor(score27(hand) / CAT_BASE);
  if (cat === 0 && top <= 8) return [0]; // pat the made low
  let natural = 5 - new Set(ranks.filter(r => r <= 8)).size;
  if (natural <= 0) natural = 1;
  if (natural > 4) natural = 4;
  return [...new Set([0, natural])].sort((a, b) => a - b); // 0 = pat/snow
}

function describeHand(hand) {
  const ranks = hand.map(rankOf).sort((a, b) => b - a);
  const top = ranks[0];
  const cat = Math.floor(score27(hand) / CAT_BASE);
  if (cat === 0 && top <= 8) return `${RANK_CHARS[ranks[0]]}-${RANK_CHARS[ranks[1]]} low (pat)`;
  const lows = lowRanks(hand);
  const draw = Math.min(4, Math.max(1, 5 - lows.length));
  const deuce = lows[0] === 2 ? ' with a deuce' : '';
  if (cat === 0 && top <= 10) return `${RANK_CHARS[top]}-high low — pat or ${draw}-card draw${deuce}`;
  if (lows.length === 0) return `no low cards (${draw}-card draw)`;
  const tgt = lows[lows.length - 1] <= 7 ? 'a 7' : 'an 8';
  return `${draw}-card draw to ${tgt}${deuce}`;
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
