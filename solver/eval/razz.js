// ── Razz (ace-to-five lowball stud) evaluator ──────────────
// Best five-card low from up to 7 cards; LOWER score = better. Ace plays LOW,
// straights and flushes do NOT count, pairs hurt. Best hand: 5-4-3-2-A (wheel).
// No qualifier — every hand has a low. JS mirror of neural/eval_razz.py.

const { lowRankOf } = require('../engine/cards');

function* combosGen(arr, k, start, pre) {
  if (pre.length === k) { yield pre.slice(); return; }
  for (let i = start; i <= arr.length - (k - pre.length); i++) {
    pre.push(arr[i]); yield* combosGen(arr, k, i + 1, pre); pre.pop();
  }
}

// Ace-to-five low score for exactly 5 cards; LOWER is better. Category packs
// pairs (0 = no pair, best) above the grouped ranks; no straight/flush.
function score5Razz(cards) {
  const ranks = cards.map(lowRankOf).sort((a, b) => b - a); // desc
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.keys(counts)
    .map(r => ({ r: parseInt(r, 10), n: counts[r] }))
    .sort((a, b) => (b.n - a.n) || (b.r - a.r)); // count desc, then rank desc
  const top = groups[0].n, second = groups[1] ? groups[1].n : 0;
  let cat;
  if (top === 4) cat = 7;                        // quads (worst)
  else if (top === 3 && second === 2) cat = 6;   // full house
  else if (top === 3) cat = 3;                   // trips
  else if (top === 2 && second === 2) cat = 2;   // two pair
  else if (top === 2) cat = 1;                   // one pair
  else cat = 0;                                  // no pair (a real low)
  let v = cat;
  for (const g of groups) for (let i = 0; i < g.n; i++) v = v * 15 + g.r;
  return v; // lower is better; wheel 5-4-3-2-A is minimal
}

// Best (lowest) five-card razz low from up to 7 cards.
function bestLowRazz(cards) {
  if (cards.length <= 5) return score5Razz(cards);
  let best = Infinity;
  for (const five of combosGen(cards, 5, 0, [])) {
    const s = score5Razz(five);
    if (s < best) best = s;
  }
  return best;
}

module.exports = { score5Razz, bestLowRazz };

// ── self-test: node solver/eval/razz.js ──
if (require.main === module) {
  const { cardFromStr } = require('../engine/cards');
  const h = s => { const o = []; for (let i = 0; i < s.length; i += 2) o.push(cardFromStr(s.slice(i, i + 2))); return o; };
  const wheel = bestLowRazz(h('5s4d3c2hAh'));
  console.assert(wheel < bestLowRazz(h('6s4d3c2hAh')), 'wheel beats 6-low');
  // any no-pair low beats any paired hand
  console.assert(score5Razz(h('8s7d6c4h2h')) < score5Razz(h('2s2d3c4h5h')), 'no pair beats pair');
  // best-of-7 ignores the high junk and finds the wheel
  console.assert(bestLowRazz(h('Ah2c3d4s5hKsQd')) === wheel, 'best-of-7 wheel');
  // ace plays LOW: A-2-3-4-6 (a 6-low) beats 6-5-4-3-2? no — 6-4-3-2-A < 6-5-4-3-2
  console.assert(bestLowRazz(h('6h4d3c2hAs')) < bestLowRazz(h('6h5d4c3h2s')), 'ace low');
  console.log('ok: razz.js self-tests pass (wheel nut, pairs lose, ace plays low)');
}
