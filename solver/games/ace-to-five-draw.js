// ── A-5 Triple Draw (heads-up fixed limit, "California lowball") ─
// Ace-to-five lowball triple draw. Structurally identical to 2-7
// triple draw, but the low evaluation is ace-to-five: aces play LOW,
// straights and flushes do NOT count against you, only pairs hurt.
// Best hand: 5-4-3-2-A (the wheel). Reuses razz's score5Razz.
//
// Draw-aware abstraction (mirrors triple-draw-27.js). Hands are
// classified by what they DRAW TO, not by the made-hand evaluator
// (which would mislabel an unpaired four-low-plus-a-high hand like
// A-2-3-4-K as "pat" when it is really a premium one-card draw).
// Buckets:
//   M<hi><2nd>      — pat made 8-or-better low (e.g. M54 = 5-4 low,
//                     i.e. the wheel; M86 = 8-6 low)
//   D<n>k<top><a?><p?>
//                   — a draw: <n> = cards drawn (1-4) keeping the low
//                     cards, <top> = highest LOW card kept (0 = none),
//                     a = holds an ace (the premium card), p = currently
//                     a rough made 9/T low that may also stand pat.
// The discard heuristic keeps the lowest distinct low cards; the draw
// COUNT in each bucket is the count the solver actually takes, so a
// "1-card draw to a 9" no longer exists — that hand is a 2-card draw to
// the cards underneath, and is bucketed/labeled as such. Unlike 2-7
// there is no straight danger (straights don't count), so no 'x' flag.

const { lowRankOf, RANK_CHARS } = require('../engine/cards');
const { score5Razz } = require('../eval/razz');
const { makeDrawGame } = require('./draw-game');

const CAT_BASE = Math.pow(15, 5);

// Distinct "keepable" low ranks (A..8 = 1..8, ace low), ascending.
function lowRanks(hand) {
  return [...new Set(hand.map(lowRankOf).filter(r => r <= 8))].sort((a, b) => a - b);
}

function bucket(hand) {
  const ranks = hand.map(lowRankOf);
  const top = Math.max(...ranks);
  const cat = Math.floor(score5Razz(hand) / CAT_BASE);

  // Pat made 8-or-better low (no pair, high card <= 8). Straights and
  // flushes are irrelevant in ace-to-five.
  if (cat === 0 && top <= 8) {
    const desc = [...new Set(ranks)].sort((a, b) => b - a);
    return 'M' + desc[0] + desc[1]; // M54 = 5-4 low (wheel), M86 = 8-6 low
  }

  // Otherwise a draw: keep the low cards, draw the rest.
  const lows = lowRanks(hand);
  const L = lows.length;
  let draw = 5 - L;
  if (draw <= 0) draw = 1; // 5 distinct lows but high-only (>8): break one
  if (draw > 4) draw = 4;
  const topLow = L > 0 ? lows[L - 1] : 0;
  const ace = (L > 0 && lows[0] === 1) ? 'a' : '';
  // A rough made 9/10-high low can also stand pat (street-dependent choice).
  const patable = (cat === 0 && top <= 10) ? 'p' : '';
  return `D${draw}k${topLow}${ace}${patable}`;
}

// Keep the (5 - drawCount) lowest distinct ranks (then lowest dups).
// Ace-low ordering: an ace is the lowest card.
function chooseKeep(hand, drawCount) {
  const keepN = hand.length - drawCount;
  const sorted = hand.slice().sort((a, b) => lowRankOf(a) - lowRankOf(b));
  const keep = [], seen = new Set();
  for (const c of sorted) {
    if (keep.length >= keepN) break;
    if (!seen.has(lowRankOf(c))) { keep.push(c); seen.add(lowRankOf(c)); }
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
  const ranks = hand.map(lowRankOf);
  const top = Math.max(...ranks);
  const cat = Math.floor(score5Razz(hand) / CAT_BASE);
  if (cat === 0 && top <= 8) return [0]; // pat the made low
  let natural = 5 - new Set(ranks.filter(r => r <= 8)).size;
  if (natural <= 0) natural = 1;
  if (natural > 4) natural = 4;
  return [...new Set([0, natural])].sort((a, b) => a - b); // 0 = pat/snow
}

function describeHand(hand) {
  const ranks = hand.map(lowRankOf).sort((a, b) => b - a);
  const top = ranks[0];
  const cat = Math.floor(score5Razz(hand) / CAT_BASE);
  // RANK_CHARS keys on ace-high ranks (A=14); map ace-low 1 back to 14.
  const ch = r => RANK_CHARS[r === 1 ? 14 : r];
  if (cat === 0 && top <= 8) return `${ch(ranks[0])}-${ch(ranks[1])} low (pat)`;
  const lows = lowRanks(hand);
  const draw = Math.min(4, Math.max(1, 5 - lows.length));
  const ace = lows[0] === 1 ? ' with an ace' : '';
  if (cat === 0 && top <= 10) return `${ch(top)}-high low — pat or ${draw}-card draw${ace}`;
  if (lows.length === 0) return `no low cards (${draw}-card draw)`;
  const tgt = lows[lows.length - 1] <= 7 ? 'a 7' : 'an 8';
  return `${draw}-card draw to ${tgt}${ace}`;
}

module.exports = makeDrawGame({
  id: 'a5td',
  name: 'A-5 Triple Draw',
  handSize: 5,
  compare(h0, h1) {
    const a = score5Razz(h0), b = score5Razz(h1);
    return a < b ? 1 : a > b ? -1 : 0;
  },
  bucket,
  chooseKeep,
  drawOptions,
  describeHand,
});

module.exports.bucketA5 = bucket;
module.exports.chooseKeepA5 = chooseKeep;
