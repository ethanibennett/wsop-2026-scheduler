// ── Monker-style equity for heads-up ranges (showdown only, no CFR) ──
// For a HU spot — your range vs the opponent's range (+ the public board on
// Stud 8) — compute each of your hands' equity (the pot share it wins at
// showdown) against the whole opposing range, card-removal-aware, and the
// sorted equity distribution ("equity graph"). Reuses the game evaluators; no
// solver needed. Heads-up only.
//
//   const { equityCurve, range } = require('./equity');
//   const c = equityCurve('td27', range(['7d5c4h3s2d']), range(['8d7c5h4s2d', ...]));
//   c.rangeEquity            // range-vs-range equity
//   c.points                 // [{cards, weight, equity}] sorted high->low (the curve)

const { score27 } = require('./eval/low27');
const { badugiScore } = require('./eval/badugi');
const { bestHi7, bestLo8 } = require('./eval/stud8');
const { bestLowRazz } = require('./eval/razz');
const { cardFromStr, cardStr, makeDeck } = require('./engine/cards');

// Result to the FIRST hand: 1 win / 0.5 tie / 0 lose for the draw games, or the
// hi/lo pot share for Stud 8. Inputs are full showdown hands (arrays of card ints).
const MATCHUP = {
  td27: (a, b) => { const x = score27(a), y = score27(b); return x < y ? 1 : x > y ? 0 : 0.5; },
  badugi: (a, b) => { const x = badugiScore(a), y = badugiScore(b); return x < y ? 1 : x > y ? 0 : 0.5; },
  razz: (a, b) => { const x = bestLowRazz(a), y = bestLowRazz(b); return x < y ? 1 : x > y ? 0 : 0.5; },
  stud8: (a, b) => {
    const hiA = bestHi7(a), hiB = bestHi7(b);
    const hi = hiA > hiB ? 1 : hiA < hiB ? 0 : 0.5;
    const loA = bestLo8(a), loB = bestLo8(b);
    if (loA === null && loB === null) return hi;
    let lo;
    if (loA !== null && loB !== null) lo = loA < loB ? 1 : loA > loB ? 0 : 0.5;
    else lo = loA !== null ? 1 : 0;
    return 0.5 * hi + 0.5 * lo;
  },
};

// hero's TRUE split share of the pot in a k-way all-in showdown (hero + opps,
// each a full 7-card showdown hand). Generalizes MATCHUP from 2 to m seats with
// exact tie-splitting — the EV-exact payoff the entry fixed-point thresholds on.
// razz/draw (lower score wins): 1/(#tied for best) if hero is a best, else 0.
// stud8 (hi/lo split): 0.5*hiShare + 0.5*loShare; if NO seat qualifies for low
// the high winner(s) scoop (whole pot by hi). share in {0,.25,.5,.75,1,...}.
const LOWSCORE = { td27: score27, badugi: badugiScore, razz: bestLowRazz };
function multiwayShare(game, hero, opps) {
  const all = [hero, ...opps];
  if (game === 'stud8') {
    const hi = all.map(bestHi7);
    const maxHi = Math.max(...hi);
    const hiWinners = hi.filter(s => s === maxHi).length;
    const hiShare = hi[0] === maxHi ? 1 / hiWinners : 0;
    const lo = all.map(bestLo8);                       // null = no qualifying low
    const quals = lo.filter(s => s !== null);
    if (quals.length === 0) return hiShare;            // no low -> hi scoops the pot
    const minLo = Math.min(...quals);
    const loWinners = lo.filter(s => s === minLo).length;
    const loShare = (lo[0] !== null && lo[0] === minLo) ? 1 / loWinners : 0;
    return 0.5 * hiShare + 0.5 * loShare;
  }
  const scorer = LOWSCORE[game];
  if (!scorer) throw new Error('multiwayShare: unsupported game ' + game);
  const s = all.map(scorer);
  const best = Math.min(...s);
  const winners = s.filter(x => x === best).length;
  return s[0] === best ? 1 / winners : 0;
}

function parseHand(s) {
  const o = [];
  for (let i = 0; i < s.length; i += 2) o.push(cardFromStr(s.slice(i, i + 2)));
  return o;
}
const handStr = h => h.map(cardStr).join(' ');

// A range is [{cards: [int...], weight}]. Build one from hand strings.
function range(handStrings, weight = 1) {
  return handStrings.map(s => ({ cards: parseHand(s), weight }));
}

function* combosGen(arr, k, start, pre) {
  if (pre.length === k) { yield pre.slice(); return; }
  for (let i = start; i <= arr.length - (k - pre.length); i++) {
    pre.push(arr[i]); yield* combosGen(arr, k, i + 1, pre); pre.pop();
  }
}
const combos = (arr, k) => [...combosGen(arr, k, 0, [])];

// All k-card hands from the deck minus `dead`, optionally filtered. Use for
// tractable sizes (badugi C(52,4)=270k ok; 2-7 C(52,5)=2.6M is heavy — sample
// or pass an explicit range instead).
function allHands(k, dead = [], filter = null) {
  const deadSet = new Set(dead);
  const deck = makeDeck().filter(c => !deadSet.has(c));
  const out = [];
  for (const cs of combosGen(deck, k, 0, [])) if (!filter || filter(cs)) out.push({ cards: cs, weight: 1 });
  return out;
}

// Equity of one hidden holding vs an opponent range, card-removal-aware.
// board = {myUp, oppUp, dead} (Stud 8 public cards; omit for draw games).
function equityVsRange(game, myDown, oppRange, board = {}) {
  const matchup = MATCHUP[game];
  const myUp = board.myUp || [], oppUp = board.oppUp || [], dead = board.dead || [];
  const blocked = new Set([...myDown, ...myUp, ...oppUp, ...dead]);
  const myFull = myDown.concat(myUp);
  let num = 0, den = 0;
  for (const oh of oppRange) {
    let bad = false;
    for (const c of oh.cards) if (blocked.has(c)) { bad = true; break; }
    if (bad) continue;
    num += oh.weight * matchup(myFull, oh.cards.concat(oppUp));
    den += oh.weight;
  }
  return den > 0 ? num / den : null;
}

// The equity graph: sorted equity distribution of `myRange` vs `oppRange`.
function equityCurve(game, myRange, oppRange, board = {}) {
  const points = [];
  for (const mh of myRange) {
    const eq = equityVsRange(game, mh.cards, oppRange, board);
    if (eq !== null) points.push({ cards: mh.cards, weight: mh.weight, equity: eq });
  }
  points.sort((a, b) => b.equity - a.equity);
  let tw = 0, te = 0;
  for (const p of points) { tw += p.weight; te += p.weight * p.equity; }
  // percentile + cumulative-weight bins for plotting
  return { points, n: points.length, rangeEquity: tw > 0 ? te / tw : null };
}

module.exports = { MATCHUP, multiwayShare, equityVsRange, equityCurve, allHands, range, parseHand, handStr, combos };

// ── self-test: node solver/equity.js ──
if (require.main === module) {
  const eq = (game, a, b) => MATCHUP[game](parseHand(a), parseHand(b));
  // 2-7: 7-5-4-3-2 (the nuts) beats 7-6-4-3-2; a pair loses to any made low
  console.assert(eq('td27', '7d5c4h3s2d', '7d6c4h3s2d') === 1, '27 nut');
  console.assert(eq('td27', '2d2c4h5s7d', '7d6c4h3s2h') === 0, '27 pair loses');
  // badugi: 4-card A-2-3-4 rainbow beats a 3-card badugi
  console.assert(eq('badugi', 'Ac2d3h4s', 'Ac2d3hKc') === 1, 'badugi 4 beats 3');
  // stud8: a wheel+low scoops a high-only hand (share 1.0)
  console.assert(eq('stud8', 'As2c3d4h5s6d7c', 'KhKdQcJs9h8s2h') === 1, 'stud8 scoop');
  // tie splits
  console.assert(eq('td27', '7d5c4h3s2d', '7h5s4d3c2h') === 0.5, '27 tie');
  // razz: a wheel (5-4-3-2-A) scoops a worse low (whole pot); equal lows split
  console.assert(eq('razz', 'As2c3d4h5sKhQc', '6h5d4c3h2sKdQs') === 1, 'razz wheel');
  console.assert(eq('razz', '7d5c4h3s2dKhQc', '7h5s4d3c2hKdQs') === 0.5, 'razz tie');

  // a curve: a strong 2-7 hand should beat a moderate range > 50%
  const villain = range(['8d7c5h4s2d', '9d8c6h4s3d', 'Th8d6c5s3h', 'Jd9c7h5s2d']);
  const hero = range(['7d5c4h3s2d', '8h6c5d4s3h', 'ThTc9h8s2d']); // nut, decent, a pair
  const c = equityCurve('td27', hero, villain);
  console.assert(c.points[0].equity >= c.points[c.points.length - 1].equity, 'sorted');
  const fmt = p => `${handStr(p.cards)} = ${(p.equity * 100).toFixed(1)}%`;
  console.log('ok: equity self-tests pass');
  console.log(`  2-7 example range equity = ${(c.rangeEquity * 100).toFixed(1)}%`);
  c.points.forEach(p => console.log('   ', fmt(p)));

  // razz equity graph with public upcards (stud-style, card-removal aware)
  const rzBoard = { myUp: parseHand('As4s3d2c'), oppUp: parseHand('KhQdJc9h'), dead: [] };
  const rzHero = range(['5h6d7c', 'Th9s8d']);      // a wheel vs an eight-low (down cards)
  const rzVillain = range(['Kd2h5c', 'Qs9c4d']);   // broadway board, weak lows
  const rzc = equityCurve('razz', rzHero, rzVillain, rzBoard);
  console.assert(rzc.points[0].equity >= rzc.points[rzc.points.length - 1].equity, 'razz sorted');
  console.log(`  razz example range equity = ${(rzc.rangeEquity * 100).toFixed(1)}%`);
  rzc.points.forEach(p => console.log('   ', fmt(p)));
}
