// ── Seven Card Stud Hi-Lo 8-or-better (heads-up fixed limit) ─
// Chips: ante 1, bring-in 2, small bet 4 (3rd/4th st), big bet 8
// (5th-7th). Streets indexed 0..4 = 3rd..7th. Lowest upcard brings
// in (ace high, suit order c<d<h<s breaks ties); the bring-in may
// complete instead, and keeps the option to complete if just called.
// From 4th street on, the best showing board acts first. 4-bet cap.
//
// Showdown splits the pot between the best hi and the best
// 8-or-better lo (hi scoops if no lo qualifies).
//
// Abstraction: own bucket = pair class + distinct-low-rank count +
// flush-draw/ace/made-low flags; opponent bucket = visible board
// features. Betting history is kept exactly.

const { shuffledDeck, cardStr, rankOf, suitOf } = require('../engine/cards');
const { bestHi7, bestLo8, lowRankCount } = require('../eval/stud8');

const ANTE = 1, BRING = 2, SMALL = 4, BIG = 8, CAP = 4;
const STREET_NAMES = ['3rd Street', '4th Street', '5th Street', '6th Street', '7th Street'];

function betSize(street) { return street < 2 ? SMALL : BIG; }

// Partial-board strength for first-to-act (higher acts first).
// Compares as a poker hand fragment: groups by count then rank,
// suit of the highest card breaks exact ties.
function boardValue(up) {
  const counts = {};
  for (const c of up) { const r = rankOf(c); counts[r] = (counts[r] || 0) + 1; }
  const groups = Object.keys(counts)
    .map(r => ({ r: parseInt(r, 10), n: counts[r] }))
    .sort((a, b) => (b.n - a.n) || (b.r - a.r));
  let v = 0;
  for (let i = 0; i < 4; i++) {
    const g = groups[i];
    v = v * 100 + (g ? g.n * 15 + g.r : 0);
  }
  // suit tiebreak on the single highest card
  let hi = up[0];
  for (const c of up) if (rankOf(c) > rankOf(hi) || (rankOf(c) === rankOf(hi) && suitOf(c) > suitOf(hi))) hi = c;
  return v * 4 + suitOf(hi);
}

function clone(s) {
  return {
    deck: s.deck,
    down: [s.down[0].slice(), s.down[1].slice()],
    up: [s.up[0].slice(), s.up[1].slice()],
    street: s.street,
    phase: s.phase,
    toAct: s.toAct,
    bets: s.bets,
    base: s.base,
    contrib: s.contrib.slice(),
    acted: s.acted.slice(),
    folded: s.folded,
    bringIn: s.bringIn,
    hist: s.hist,
    curSeq: s.curSeq,
    starter: s.starter,
    log: s.log.slice(),
  };
}

function allCards(s, p) { return s.down[p].concat(s.up[p]); }

// Own-hand abstraction bucket
function ownBucket(s, p) {
  const cards = allCards(s, p);
  const counts = {};
  for (const c of cards) { const r = rankOf(c); counts[r] = (counts[r] || 0) + 1; }
  const groups = Object.keys(counts)
    .map(r => ({ r: parseInt(r, 10), n: counts[r] }))
    .sort((a, b) => (b.n - a.n) || (b.r - a.r));

  let pairCls = '-';
  if (groups[0].n >= 3) pairCls = 'T';
  else if (groups[0].n === 2 && groups[1] && groups[1].n === 2) pairCls = '2';
  else if (groups[0].n === 2) {
    if (groups[0].r === 14) pairCls = 'A';
    else pairCls = groups[0].r <= 8 ? 'p' : 'P';
  }

  const L = lowRankCount(cards);
  const suits = [0, 0, 0, 0];
  for (const c of cards) suits[suitOf(c)]++;
  const maxSuit = Math.max(...suits);
  const flushFlag = maxSuit >= 5 ? 'F' : (maxSuit >= (s.street < 2 ? 3 : 4) ? 'f' : '');
  const aceFlag = cards.some(c => rankOf(c) === 14) ? 'a' : '';

  let lowFlag = '';
  const lo = bestLo8(cards);
  if (lo !== null) {
    const topOfLow = Math.floor(lo / Math.pow(15, 4)); // high card of the made low
    lowFlag = 'L' + topOfLow;
  }
  return `${pairCls}${L}${aceFlag}${flushFlag}${lowFlag}`;
}

// Opponent visible-board bucket
function oppBucket(s, p) {
  const up = s.up[1 - p];
  const L = lowRankCount(up);
  const counts = {};
  let paired = '';
  for (const c of up) { const r = rankOf(c); counts[r] = (counts[r] || 0) + 1; if (counts[r] >= 2) paired = 'P'; }
  const aceUp = up.some(c => rankOf(c) === 14) ? 'a' : '';
  const suits = [0, 0, 0, 0];
  for (const c of up) suits[suitOf(c)]++;
  const suitedFlag = Math.max(...suits) >= 3 ? 'f' : '';
  const big = up.some(c => rankOf(c) >= 11 && rankOf(c) <= 13) ? 'h' : '';
  return `${L}${paired}${aceUp}${suitedFlag}${big}`;
}

function endStreet(s) {
  if (s.street === 4) { s.phase = 'showdown'; return; }
  s.phase = 'deal';
  s.hist += '/';
}

const game = {
  id: 'stud8',
  name: 'Stud 8 or Better',

  newHand(rng) {
    const deck = shuffledDeck(rng);
    const down = [[deck[0], deck[1]], [deck[2], deck[3]]];
    const up = [[deck[4]], [deck[5]]];
    // lowest upcard brings in; ace plays high here
    const r0 = rankOf(up[0][0]), r1 = rankOf(up[1][0]);
    const bringIn = (r0 < r1 || (r0 === r1 && suitOf(up[0][0]) < suitOf(up[1][0]))) ? 0 : 1;
    return {
      deck: deck.slice(6),
      down, up,
      street: 0,
      phase: 'bet',
      toAct: bringIn,
      bets: 0,
      base: ANTE,           // equal contribution at street start
      contrib: [ANTE, ANTE],
      acted: [false, false],
      folded: null,
      bringIn,
      hist: '',
      curSeq: '',
      starter: bringIn,
      log: [],
    };
  },

  isTerminal(s) { return s.phase === 'showdown' || s.folded !== null; },

  utility(s) {
    if (s.folded === 0) return [-s.contrib[0], s.contrib[0]];
    if (s.folded === 1) return [s.contrib[1], -s.contrib[1]];
    const pot = s.contrib[0] + s.contrib[1];
    const c0 = allCards(s, 0), c1 = allCards(s, 1);
    const hi0 = bestHi7(c0), hi1 = bestHi7(c1);
    const hiShare0 = hi0 > hi1 ? 1 : hi0 < hi1 ? 0 : 0.5;
    const lo0 = bestLo8(c0), lo1 = bestLo8(c1);
    let share0;
    if (lo0 === null && lo1 === null) share0 = hiShare0;
    else {
      let loShare0;
      if (lo0 !== null && lo1 !== null) loShare0 = lo0 < lo1 ? 1 : lo0 > lo1 ? 0 : 0.5;
      else loShare0 = lo0 !== null ? 1 : 0;
      share0 = hiShare0 * 0.5 + loShare0 * 0.5;
    }
    const u0 = share0 * pot - s.contrib[0];
    return [u0, -u0];
  },

  isChance(s) { return s.phase === 'deal'; },

  sampleChance(s) {
    const n = clone(s);
    n.deck = n.deck.slice();
    n.street++;
    const faceUp = n.street <= 3; // 7th street (index 4) is dealt down
    for (let p = 0; p < 2; p++) {
      const c = n.deck.pop();
      if (faceUp) n.up[p].push(c); else n.down[p].push(c);
    }
    n.phase = 'bet';
    n.bets = 0;
    n.base = n.contrib[0]; // contributions are equal between streets
    n.acted = [false, false];
    n.toAct = boardValue(n.up[0]) >= boardValue(n.up[1]) ? 0 : 1;
    n.starter = n.toAct;
    n.curSeq = '';
    n.log.push({ p: -1, a: STREET_NAMES[n.street] + ' dealt' });
    return n;
  },

  currentPlayer(s) { return s.toAct; },

  legalActions(s) {
    if (s.street === 0 && s.hist === '') return ['br', 'co']; // forced open
    const p = s.toAct;
    const facing = s.contrib[1 - p] - s.contrib[p];
    if (facing > 0) {
      const acts = ['f', 'c'];
      if (s.bets < CAP) acts.push('r');
      return acts;
    }
    const acts = ['k'];
    if (s.bets < CAP) acts.push('b');
    return acts;
  },

  applyAction(s, a) {
    const n = clone(s);
    const p = n.toAct;
    const facing = n.contrib[1 - p] - n.contrib[p];

    if (a === 'br') {
      n.contrib[p] = n.base + BRING;
      // forced bet — the bring-in keeps the option, so don't mark acted
      n.hist += 'i';
      n.curSeq += 'i';
      n.log.push({ p, a: `brings in for ${BRING}` });
      n.toAct = 1 - p;
      return n;
    }
    if (a === 'co') {
      n.contrib[p] = n.base + SMALL;
      n.bets = 1;
      n.acted[p] = true;
      n.hist += 'o';
      n.curSeq += 'o';
      n.log.push({ p, a: `completes to ${SMALL}` });
      n.toAct = 1 - p;
      return n;
    }

    n.acted[p] = true;
    n.hist += a;
    n.curSeq += a;
    if (a === 'f') {
      n.folded = p;
      n.log.push({ p, a: 'folds' });
      return n;
    }
    if (a === 'c' || a === 'k') {
      n.contrib[p] += facing;
      n.log.push({ p, a: a === 'k' ? 'checks' : 'calls' });
      if (n.acted[1 - p]) endStreet(n);
      else n.toAct = 1 - p; // bring-in retains the completion option
      return n;
    }
    // bet / raise / complete-over-bring-in
    if (n.bets === 0) n.contrib[p] = n.base + betSize(n.street); // completion, not a raise
    else n.contrib[p] = n.contrib[1 - p] + betSize(n.street);
    n.bets++;
    n.log.push({ p, a: n.bets === 1 ? `completes to ${n.contrib[p] - n.base}` : `raises to ${n.contrib[p] - n.base}` });
    n.toAct = 1 - p;
    return n;
  },

  // Abstraction: exact action sequence for the current street only;
  // earlier streets are summarized by a quantized pot size. Cumulative
  // hand/board information lives in the buckets. Full histories make
  // the infoset space explode past available memory.
  infosetKey(s) {
    const p = s.toAct;
    const potBin = Math.min(12, Math.round((s.contrib[0] + s.contrib[1]) / (2 * SMALL)));
    const first = s.starter === p ? 1 : 0;
    return `${s.street}|p${potBin}|${s.curSeq}|f${first}|${ownBucket(s, p)}|o${oppBucket(s, p)}|b${s.bringIn === p ? 1 : 0}`;
  },

  actionLabel(a, s) {
    if (a === 'br') return `Bring-in ${BRING}`;
    if (a === 'co') return `Complete to ${SMALL}`;
    if (a === 'f') return 'Fold';
    if (a === 'k') return 'Check';
    if (a === 'c') return `Call ${s.contrib[1 - s.toAct] - s.contrib[s.toAct]}`;
    if (s.bets === 0) return `Complete to ${betSize(s.street)}`;
    return `Raise to ${s.contrib[1 - s.toAct] + betSize(s.street) - s.base}`;
  },

  describe(s) {
    const p = s.toAct;
    return {
      seat: p,
      position: s.bringIn === p ? 'Bring-in' : 'Other',
      street: s.street,
      streetName: STREET_NAMES[s.street],
      phase: s.phase,
      heroCards: s.down[p].map(cardStr).concat(s.up[p].map(c => cardStr(c))),
      heroDownCount: s.down[p].length,
      heroUp: s.up[p].map(cardStr),
      heroDown: s.down[p].map(cardStr),
      oppUp: s.up[1 - p].map(cardStr),
      handLabel: ownBucketLabel(s, p),
      pot: s.contrib[0] + s.contrib[1],
      toCall: Math.max(0, s.contrib[1 - p] - s.contrib[p]),
      betSize: betSize(s.street),
      log: s.log.map(e => ({ who: e.p === -1 ? 'Dealer' : (e.p === p ? 'Hero' : 'Opponent'), what: e.a })),
    };
  },
};

function ownBucketLabel(s, p) {
  const cards = allCards(s, p);
  const lo = bestLo8(cards);
  const L = lowRankCount(cards);
  const parts = [];
  if (lo !== null) parts.push('made low');
  else if (L >= 3) parts.push(`${L} low cards`);
  return parts.join(', ') || 'high hand';
}

module.exports = game;
module.exports.boardValue = boardValue;
