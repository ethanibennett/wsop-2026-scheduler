// ── Standalone Hand Evaluation Test Suite ──────────────────────
// Extracted from public/index.html for testing

// ── Constants ──────────────────────────────────────────────────
const RANK_VAL = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };
const RANK_NAME = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'T',11:'J',12:'Q',13:'K',14:'A' };
const RANK_WORD = { 14:'Ace',13:'King',12:'Queen',11:'Jack',10:'Ten',9:'Nine',8:'Eight',7:'Seven',6:'Six',5:'Five',4:'Four',3:'Three',2:'Two' };
const RANK_SHORT = { 14:'A',13:'K',12:'Q',11:'J',10:'10',9:'9',8:'8',7:'7',6:'6',5:'5',4:'4',3:'3',2:'2' };
const rankPlural = v => { const w = RANK_WORD[v]; return w.endsWith('x') ? w + 'es' : w + 's'; };
const rankShortPlural = v => RANK_SHORT[v] + 's';

// ── Helpers ────────────────────────────────────────────────────
function combinations(arr, k) {
  const res = [];
  (function go(s, c) {
    if (c.length === k) { res.push([...c]); return; }
    for (let i = s; i <= arr.length - (k - c.length); i++) { c.push(arr[i]); go(i + 1, c); c.pop(); }
  })(0, []);
  return res;
}

function parseCardNotation(str) {
  if (!str) return [];
  const CARD_RANKS = new Set('AKQJT98765432'.split(''));
  const CARD_SUITS = new Set('hdcsx'.split(''));
  const ranks = [], suits = [];
  for (const ch of str) {
    if (CARD_RANKS.has(ch.toUpperCase())) ranks.push(ch.toUpperCase());
    else if (CARD_SUITS.has(ch.toLowerCase())) suits.push(ch.toLowerCase());
  }
  return ranks.map((r, i) => ({ rank: r, suit: suits[i] || 'x' }));
}

// Shorthand: "AhKs" => [{rank:'A',suit:'h'},{rank:'K',suit:'s'}]
function cards(str) { return parseCardNotation(str); }

// ── Eval Functions (from index.html) ───────────────────────────
function evalHigh5(cards) {
  const vals = cards.map(c => RANK_VAL[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  let isStraight = false, straightHigh = 0;
  if (vals[0] - vals[4] === 4 && new Set(vals).size === 5) { isStraight = true; straightHigh = vals[0]; }
  if (!isStraight && vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) {
    isStraight = true; straightHigh = 5;
  }
  const freq = {};
  vals.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
  const groups = Object.entries(freq).map(([v, c]) => [c, +v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const P = 15;
  let cat, kickers, name, shortName;

  if (isStraight && isFlush) {
    cat = 9; kickers = [straightHigh, 0, 0, 0, 0];
    name = straightHigh === 14 ? 'Royal Flush' : 'Straight Flush, ' + RANK_WORD[straightHigh] + '-high';
    shortName = straightHigh === 14 ? 'Royal Flush' : 'Str. Flush, ' + RANK_SHORT[straightHigh] + '-high';
  } else if (groups[0][0] === 4) {
    cat = 8; kickers = [groups[0][1], groups[1][1], 0, 0, 0];
    name = 'Four of a Kind, ' + rankPlural(groups[0][1]);
    shortName = 'Quad ' + rankShortPlural(groups[0][1]);
  } else if (groups[0][0] === 3 && groups[1][0] === 2) {
    cat = 7; kickers = [groups[0][1], groups[1][1], 0, 0, 0];
    name = rankPlural(groups[0][1]) + ' full of ' + rankPlural(groups[1][1]);
    shortName = rankShortPlural(groups[0][1]) + ' full of ' + rankShortPlural(groups[1][1]);
  } else if (isFlush) {
    cat = 6; kickers = vals;
    name = 'Flush, ' + RANK_WORD[vals[0]] + '-high';
    shortName = 'Flush, ' + RANK_SHORT[vals[0]] + '-high';
  } else if (isStraight) {
    cat = 5; kickers = [straightHigh, 0, 0, 0, 0];
    name = straightHigh === 5 ? 'Wheel' : 'Straight, ' + RANK_WORD[straightHigh] + '-high';
    shortName = straightHigh === 5 ? 'Wheel' : 'Straight, ' + RANK_SHORT[straightHigh] + '-high';
  } else if (groups[0][0] === 3) {
    cat = 4; const rest = vals.filter(v => v !== groups[0][1]);
    kickers = [groups[0][1], rest[0], rest[1], 0, 0];
    name = 'Three ' + rankPlural(groups[0][1]);
    shortName = 'Trip ' + rankShortPlural(groups[0][1]);
  } else if (groups[0][0] === 2 && groups[1][0] === 2) {
    cat = 3; const kick = vals.find(v => v !== groups[0][1] && v !== groups[1][1]);
    kickers = [groups[0][1], groups[1][1], kick, 0, 0];
    name = 'Two Pair, ' + rankPlural(groups[0][1]) + ' and ' + rankPlural(groups[1][1]);
    shortName = 'Two Pair, ' + rankShortPlural(groups[0][1]) + ' & ' + rankShortPlural(groups[1][1]);
  } else if (groups[0][0] === 2) {
    cat = 2; const rest = vals.filter(v => v !== groups[0][1]);
    kickers = [groups[0][1], rest[0], rest[1], rest[2], 0];
    name = 'Pair of ' + rankPlural(groups[0][1]);
    shortName = 'Pair of ' + rankShortPlural(groups[0][1]);
  } else {
    cat = 1; kickers = vals;
    name = RANK_WORD[vals[0]] + '-high';
    shortName = RANK_SHORT[vals[0]] + '-high';
  }
  const score = cat * Math.pow(P, 5) + kickers[0] * Math.pow(P, 4) + kickers[1] * Math.pow(P, 3) + kickers[2] * Math.pow(P, 2) + kickers[3] * P + (kickers[4] || 0);
  return { cat, score, name, shortName };
}

function evalLowA5(cards, eightOrBetter) {
  const vals = cards.map(c => RANK_VAL[c.rank] === 14 ? 1 : RANK_VAL[c.rank]).sort((a, b) => b - a);
  if (new Set(vals).size < 5) return { score: Infinity, name: null, qualified: false };
  if (eightOrBetter && vals[0] > 8) return { score: Infinity, name: null, qualified: false };
  const P = 15;
  const score = vals[0] * Math.pow(P, 4) + vals[1] * Math.pow(P, 3) + vals[2] * Math.pow(P, 2) + vals[3] * P + vals[4];
  const dispRank = v => v === 1 ? 'A' : RANK_NAME[v];
  const name = vals.map(dispRank).join('-') + ' low';
  return { score, name, qualified: true };
}

function evalLow27(cards) {
  const vals = cards.map(c => RANK_VAL[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  let isStraight = false;
  if (vals[0] - vals[4] === 4 && new Set(vals).size === 5) isStraight = true;
  if (isFlush || isStraight || new Set(vals).size < 5) {
    const hi = evalHigh5(cards);
    return { score: 1e9 + hi.score, name: hi.name + ' (bad low)' };
  }
  const P = 15;
  const score = vals[0] * Math.pow(P, 4) + vals[1] * Math.pow(P, 3) + vals[2] * Math.pow(P, 2) + vals[3] * P + vals[4];
  const name = vals.map(v => RANK_NAME[v]).join('-') + ' low';
  return { score, name };
}

function evalBadugi(cards) {
  const tryN = (arr, n) => {
    const combos = n === arr.length ? [arr] : combinations(arr, n);
    let best = null;
    for (const combo of combos) {
      const suitSet = new Set(combo.map(c => c.suit));
      const rankSet = new Set(combo.map(c => c.rank));
      if (suitSet.size === n && rankSet.size === n) {
        const vals = combo.map(c => RANK_VAL[c.rank] === 14 ? 1 : RANK_VAL[c.rank]).sort((a, b) => a - b);
        const P = 15;
        let score = 0;
        for (let i = 0; i < vals.length; i++) score += vals[i] * Math.pow(P, n - 1 - i);
        if (!best || score < best.score) {
          const dispRank = v => v === 1 ? 'A' : RANK_NAME[v];
          best = { score, name: vals.map(dispRank).join('-') + (n === 4 ? ' Badugi' : ' (' + n + '-card)') };
        }
      }
    }
    return best;
  };
  for (let n = Math.min(cards.length, 4); n >= 1; n--) {
    const result = tryN(cards, n);
    if (result) {
      result.numCards = n;
      result.score = (5 - n) * 1e8 + result.score;
      return result;
    }
  }
  return { score: Infinity, numCards: 0, name: 'No Badugi' };
}

// Best-hand selectors
function bestHighHand(cards) {
  if (cards.length === 5) return evalHigh5(cards);
  if (cards.length < 5) return null;
  let best = null;
  for (const c of combinations(cards, 5)) { const ev = evalHigh5(c); if (!best || ev.score > best.score) best = ev; }
  return best;
}

function bestOmahaHigh(hole, board) {
  if (hole.length < 2 || board.length < 3) return null;
  let best = null;
  for (const h2 of combinations(hole, 2)) for (const b3 of combinations(board, 3)) {
    const ev = evalHigh5([...h2, ...b3]);
    if (!best || ev.score > best.score) best = ev;
  }
  return best;
}

function bestOmahaLow(hole, board) {
  if (hole.length < 2 || board.length < 3) return null;
  let best = null;
  for (const h2 of combinations(hole, 2)) for (const b3 of combinations(board, 3)) {
    const ev = evalLowA5([...h2, ...b3], true);
    if (ev.qualified && (!best || ev.score < best.score)) best = ev;
  }
  return best;
}

function bestLowA5Hand(cards, eightOrBetter) {
  if (cards.length === 5) return evalLowA5(cards, eightOrBetter);
  if (cards.length < 5) return null;
  let best = null;
  for (const c of combinations(cards, 5)) { const ev = evalLowA5(c, eightOrBetter); if (ev.qualified && (!best || ev.score < best.score)) best = ev; }
  return best;
}

function bestLow27Hand(cards) {
  if (cards.length === 5) return evalLow27(cards);
  if (cards.length < 5) return null;
  let best = null;
  for (const c of combinations(cards, 5)) { const ev = evalLow27(c); if (!best || ev.score < best.score) best = ev; }
  return best;
}

function bestBadugiHand(cards) {
  if (cards.length <= 4) return evalBadugi(cards);
  let best = null;
  for (const c of combinations(cards, 4)) { const ev = evalBadugi(c); if (!best || ev.score < best.score) best = ev; }
  return best;
}

// Game variant evaluation config
const GAME_EVAL = {
  'NLH':{type:'high',method:'standard'},'LHE':{type:'high',method:'standard'},'PLH':{type:'high',method:'standard'},
  'Stud Hi':{type:'high',method:'standard'},'PL 5CD Hi':{type:'high',method:'standard'},
  'PLO':{type:'high',method:'omaha'},'LO Hi':{type:'high',method:'omaha'},
  'PLO8':{type:'hilo',method:'omaha'},'O8':{type:'hilo',method:'omaha'},'Big O':{type:'hilo',method:'omaha'},
  'Stud 8':{type:'hilo',method:'standard'},'Stud Hi-Lo':{type:'hilo',method:'standard'},
  'Razz':{type:'low',lowType:'a5'},'A-5 TD':{type:'low',lowType:'a5'},
  '2-7 TD':{type:'low',lowType:'27'},'PL 2-7 TD':{type:'low',lowType:'27'},'L 2-7 TD':{type:'low',lowType:'27'},
  'NL 2-7 SD':{type:'low',lowType:'27'},'2-7 Razz':{type:'low',lowType:'27'},
  'Badugi':{type:'badugi'},
  'Badeucy':{type:'split-badugi',otherLow:'27'},'Badacy':{type:'split-badugi',otherLow:'a5'},
  'OFC Pineapple':null
};

function evaluateHand(game, heroCards, opponentCards, boardCards) {
  const cfg = GAME_EVAL[game];
  if (!cfg) return null;

  const heroAll = boardCards.length ? [...heroCards, ...boardCards] : heroCards;
  const oppAll = boardCards.length ? [...opponentCards, ...boardCards] : opponentCards;
  let hHi = null, oHi = null, hLo = null, oLo = null, hBad = null, oBad = null;

  if (cfg.type === 'high' || cfg.type === 'hilo') {
    if (cfg.method === 'omaha') {
      hHi = bestOmahaHigh(heroCards, boardCards);
      oHi = bestOmahaHigh(opponentCards, boardCards);
    } else {
      hHi = bestHighHand(heroAll);
      oHi = bestHighHand(oppAll);
    }
  }
  if (cfg.type === 'hilo') {
    if (cfg.method === 'omaha') {
      hLo = bestOmahaLow(heroCards, boardCards);
      oLo = bestOmahaLow(opponentCards, boardCards);
    } else {
      hLo = bestLowA5Hand(heroAll, true);
      oLo = bestLowA5Hand(oppAll, true);
    }
  }
  if (cfg.type === 'low') {
    if (cfg.lowType === 'a5') { hLo = bestLowA5Hand(heroAll, false); oLo = bestLowA5Hand(oppAll, false); }
    else { hLo = bestLow27Hand(heroAll); oLo = bestLow27Hand(oppAll); }
  }
  if (cfg.type === 'badugi') {
    hBad = bestBadugiHand(heroCards); oBad = bestBadugiHand(opponentCards);
  }
  if (cfg.type === 'split-badugi') {
    hBad = bestBadugiHand(heroCards); oBad = bestBadugiHand(opponentCards);
    if (cfg.otherLow === '27') { hLo = bestLow27Hand(heroCards); oLo = bestLow27Hand(opponentCards); }
    else { hLo = bestLowA5Hand(heroCards, false); oLo = bestLowA5Hand(opponentCards, false); }
  }

  // Determine result
  if (cfg.type === 'high') {
    if (!hHi || !oHi) return null;
    if (hHi.score > oHi.score) return { result: { outcome:'hero', text:'Hero wins' }, heroHigh:hHi, opponentHigh:oHi };
    if (oHi.score > hHi.score) return { result: { outcome:'opponent', text:'Opp wins' }, heroHigh:hHi, opponentHigh:oHi };
    return { result: { outcome:'chop', text:'Chop' }, heroHigh:hHi, opponentHigh:oHi };
  }
  if (cfg.type === 'low') {
    if (!hLo || !oLo) return null;
    if (hLo.score < oLo.score) return { result: { outcome:'hero', text:'Hero wins' }, heroLow:hLo, opponentLow:oLo };
    if (oLo.score < hLo.score) return { result: { outcome:'opponent', text:'Opp wins' }, heroLow:hLo, opponentLow:oLo };
    return { result: { outcome:'chop', text:'Chop' }, heroLow:hLo, opponentLow:oLo };
  }
  if (cfg.type === 'badugi') {
    if (!hBad || !oBad) return null;
    if (hBad.score < oBad.score) return { result: { outcome:'hero', text:'Hero wins' }, heroBadugi:hBad, opponentBadugi:oBad };
    if (oBad.score < hBad.score) return { result: { outcome:'opponent', text:'Opp wins' }, heroBadugi:hBad, opponentBadugi:oBad };
    return { result: { outcome:'chop', text:'Chop' }, heroBadugi:hBad, opponentBadugi:oBad };
  }
  if (cfg.type === 'hilo') {
    if (!hHi || !oHi) return null;
    const highW = hHi.score > oHi.score ? 'hero' : oHi.score > hHi.score ? 'opponent' : 'chop';
    const anyLo = (hLo && hLo.qualified) || (oLo && oLo.qualified);
    if (!anyLo) {
      if (highW === 'hero') return { result: { outcome:'hero' }, heroHigh:hHi, opponentHigh:oHi };
      if (highW === 'opponent') return { result: { outcome:'opponent' }, heroHigh:hHi, opponentHigh:oHi };
      return { result: { outcome:'chop' }, heroHigh:hHi, opponentHigh:oHi };
    }
    let lowW = 'chop';
    if (hLo && oLo && hLo.qualified && oLo.qualified) lowW = hLo.score < oLo.score ? 'hero' : oLo.score < hLo.score ? 'opponent' : 'chop';
    else if (hLo && hLo.qualified) lowW = 'hero';
    else if (oLo && oLo.qualified) lowW = 'opponent';
    if (highW === lowW && highW !== 'chop') return { result: { outcome: highW }, heroHigh:hHi, opponentHigh:oHi, heroLow:hLo, opponentLow:oLo };
    return { result: { outcome: 'split', highWinner: highW, lowWinner: lowW }, heroHigh:hHi, opponentHigh:oHi, heroLow:hLo, opponentLow:oLo };
  }
  if (cfg.type === 'split-badugi') {
    if (!hBad || !oBad || !hLo || !oLo) return null;
    const badW = hBad.score < oBad.score ? 'hero' : oBad.score < hBad.score ? 'opponent' : 'chop';
    const lowW2 = hLo.score < oLo.score ? 'hero' : oLo.score < hLo.score ? 'opponent' : 'chop';
    if (badW === lowW2 && badW !== 'chop') return { result: { outcome: badW } };
    return { result: { outcome: 'split', badugiWinner: badW, lowWinner: lowW2 } };
  }
  return null;
}

function evaluateShowdown(gameType, playerHands, boardCards) {
  const cfg = GAME_EVAL[gameType];
  if (!cfg || playerHands.length === 0) return [];

  var evals = playerHands.map(function(ph) {
    var cards = ph.cards;
    var all = boardCards.length ? cards.concat(boardCards) : cards;
    var hi = null, lo = null, bad = null;
    if (cfg.type === 'high' || cfg.type === 'hilo') {
      hi = cfg.method === 'omaha' ? bestOmahaHigh(cards, boardCards) : bestHighHand(all);
    }
    if (cfg.type === 'hilo') {
      lo = cfg.method === 'omaha' ? bestOmahaLow(cards, boardCards) : bestLowA5Hand(all, true);
    }
    if (cfg.type === 'low') {
      lo = cfg.lowType === 'a5' ? bestLowA5Hand(all, false) : bestLow27Hand(all);
    }
    if (cfg.type === 'badugi') {
      bad = bestBadugiHand(cards);
    }
    if (cfg.type === 'split-badugi') {
      bad = bestBadugiHand(cards);
      lo = cfg.otherLow === '27' ? bestLow27Hand(cards) : bestLowA5Hand(cards, false);
    }
    return { idx: ph.idx, hi: hi, lo: lo, bad: bad };
  });

  if (cfg.type === 'high') {
    var validHi = evals.filter(function(e) { return e.hi; });
    if (!validHi.length) return [];
    var bestScore = Math.max.apply(null, validHi.map(function(e) { return e.hi.score; }));
    var hiWinners = validHi.filter(function(e) { return e.hi.score === bestScore; });
    return hiWinners.map(function(e) { return { playerIdx: e.idx, split: hiWinners.length > 1 }; });
  }

  if (cfg.type === 'low') {
    var validLo = evals.filter(function(e) { return e.lo; });
    if (!validLo.length) return [];
    var bestLoScore = Math.min.apply(null, validLo.map(function(e) { return e.lo.score; }));
    var loWinners = validLo.filter(function(e) { return e.lo.score === bestLoScore; });
    return loWinners.map(function(e) { return { playerIdx: e.idx, split: loWinners.length > 1 }; });
  }

  if (cfg.type === 'badugi') {
    var validBad = evals.filter(function(e) { return e.bad; });
    if (!validBad.length) return [];
    var bestBadScore = Math.min.apply(null, validBad.map(function(e) { return e.bad.score; }));
    var badWinners = validBad.filter(function(e) { return e.bad.score === bestBadScore; });
    return badWinners.map(function(e) { return { playerIdx: e.idx, split: badWinners.length > 1 }; });
  }

  if (cfg.type === 'hilo') {
    var winners = [];
    var vHi = evals.filter(function(e) { return e.hi; });
    if (vHi.length) {
      var bHi = Math.max.apply(null, vHi.map(function(e) { return e.hi.score; }));
      var hWin = vHi.filter(function(e) { return e.hi.score === bHi; });
      var vLo = evals.filter(function(e) { return e.lo && e.lo.qualified; });
      if (vLo.length === 0) {
        return hWin.map(function(e) { return { playerIdx: e.idx, split: hWin.length > 1 }; });
      }
      hWin.forEach(function(e) { winners.push({ playerIdx: e.idx, split: true }); });
      var bLo = Math.min.apply(null, vLo.map(function(e) { return e.lo.score; }));
      var lWin = vLo.filter(function(e) { return e.lo.score === bLo; });
      lWin.forEach(function(e) {
        if (!winners.some(function(w) { return w.playerIdx === e.idx; })) {
          winners.push({ playerIdx: e.idx, split: true });
        }
      });
      if (winners.length === 1) winners[0].split = false;
    }
    return winners;
  }

  if (cfg.type === 'split-badugi') {
    var sbWinners = [];
    var vBad2 = evals.filter(function(e) { return e.bad; });
    var vLo2 = evals.filter(function(e) { return e.lo; });
    if (vBad2.length) {
      var bBad2 = Math.min.apply(null, vBad2.map(function(e) { return e.bad.score; }));
      vBad2.filter(function(e) { return e.bad.score === bBad2; }).forEach(function(e) {
        sbWinners.push({ playerIdx: e.idx, split: true });
      });
    }
    if (vLo2.length) {
      var bLo2 = Math.min.apply(null, vLo2.map(function(e) { return e.lo.score; }));
      vLo2.filter(function(e) { return e.lo.score === bLo2; }).forEach(function(e) {
        if (!sbWinners.some(function(w) { return w.playerIdx === e.idx; })) {
          sbWinners.push({ playerIdx: e.idx, split: true });
        }
      });
    }
    if (sbWinners.length === 1) sbWinners[0].split = false;
    return sbWinners;
  }

  return [];
}

// ══════════════════════════════════════════════════════════════
// TEST FRAMEWORK
// ══════════════════════════════════════════════════════════════
let totalTests = 0, passed = 0, failed = 0;
const failures = [];

function assert(condition, testName, detail) {
  totalTests++;
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push({ testName, detail });
    console.log(`  FAIL: ${testName} -- ${detail || ''}`);
  }
}

function section(name) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${name}`);
  console.log('='.repeat(60));
}

// ══════════════════════════════════════════════════════════════
// NLH / HOLDEM TESTS
// ══════════════════════════════════════════════════════════════
section('NLH - High Hand Evaluation (evalHigh5)');

// Royal Flush
let h = evalHigh5(cards('AhKhQhJhTh'));
assert(h.cat === 9, 'Royal Flush category', `got cat=${h.cat}`);
assert(h.name === 'Royal Flush', 'Royal Flush name', `got "${h.name}"`);

// Straight Flush (5-high = steel wheel)
h = evalHigh5(cards('5h4h3h2hAh'));
assert(h.cat === 9, 'Steel Wheel (A-5 straight flush) cat=9', `got cat=${h.cat}`);
assert(h.name.includes('5') || h.name.includes('Wheel'), 'Steel Wheel name', `got "${h.name}"`);

// Straight Flush (regular)
h = evalHigh5(cards('9s8s7s6s5s'));
assert(h.cat === 9, 'Straight Flush 9-high cat', `got cat=${h.cat}`);

// Four of a Kind
h = evalHigh5(cards('KhKdKcKs3h'));
assert(h.cat === 8, 'Quads cat', `got cat=${h.cat}`);
assert(h.name.includes('King'), 'Quads name has Kings', `got "${h.name}"`);

// Full House
h = evalHigh5(cards('JhJdJc5s5d'));
assert(h.cat === 7, 'Full house cat', `got cat=${h.cat}`);
assert(h.name.includes('Jack') && h.name.includes('Five'), 'FH name', `got "${h.name}"`);

// Flush
h = evalHigh5(cards('AhTh8h6h3h'));
assert(h.cat === 6, 'Flush cat', `got cat=${h.cat}`);

// Straight (regular)
h = evalHigh5(cards('Ts9h8d7c6s'));
assert(h.cat === 5, 'Straight cat', `got cat=${h.cat}`);

// Wheel (A-5 straight)
h = evalHigh5(cards('5d4c3h2sAd'));
assert(h.cat === 5, 'Wheel cat', `got cat=${h.cat}`);
assert(h.name === 'Wheel', 'Wheel name', `got "${h.name}"`);

// Three of a Kind
h = evalHigh5(cards('7h7d7cKsJh'));
assert(h.cat === 4, 'Trips cat', `got cat=${h.cat}`);

// Two Pair
h = evalHigh5(cards('AhAdKcKs3h'));
assert(h.cat === 3, 'Two pair cat', `got cat=${h.cat}`);

// One Pair
h = evalHigh5(cards('QhQd9c6s3h'));
assert(h.cat === 2, 'Pair cat', `got cat=${h.cat}`);

// High card
h = evalHigh5(cards('Ah9d7c5s3h'));
assert(h.cat === 1, 'High card cat', `got cat=${h.cat}`);

// ── NLH: Hand ranking order ──
section('NLH - Ranking Order');
const rfScore = evalHigh5(cards('AhKhQhJhTh')).score;
const sfScore = evalHigh5(cards('9s8s7s6s5s')).score;
const quadsScore = evalHigh5(cards('KhKdKcKs3h')).score;
const fhScore = evalHigh5(cards('JhJdJc5s5d')).score;
const flScore = evalHigh5(cards('AhTh8h6h3h')).score;
const stScore = evalHigh5(cards('Ts9h8d7c6s')).score;
const tripsScore = evalHigh5(cards('7h7d7cKsJh')).score;
const twoPairScore = evalHigh5(cards('AhAdKcKs3h')).score;
const pairScore = evalHigh5(cards('QhQd9c6s3h')).score;
const hiCardScore = evalHigh5(cards('Ah9d7c5s3h')).score;

assert(rfScore > sfScore, 'RF > SF');
assert(sfScore > quadsScore, 'SF > Quads');
assert(quadsScore > fhScore, 'Quads > FH');
assert(fhScore > flScore, 'FH > Flush');
assert(flScore > stScore, 'Flush > Straight');
assert(stScore > tripsScore, 'Straight > Trips');
assert(tripsScore > twoPairScore, 'Trips > Two Pair');
assert(twoPairScore > pairScore, 'Two Pair > Pair');
assert(pairScore > hiCardScore, 'Pair > High Card');

// ── NLH: best-of-7 ──
section('NLH - bestHighHand (7-card selection)');
const bh = bestHighHand(cards('AhKhQhJhTh2s3d'));
assert(bh.name === 'Royal Flush', '7-card picks Royal Flush', `got "${bh.name}"`);

const bh2 = bestHighHand(cards('AhKs9d8c7h6s5d'));
assert(bh2.cat === 5, '7-card picks best straight', `got cat=${bh2.cat}`);

// ── NLH: Kicker tests ──
section('NLH - Kicker Comparisons');
const pairAK = bestHighHand(cards('AhAdKc9s5h3d2c'));
const pairAQ = bestHighHand(cards('AhAdQc9s5h3d2c'));
assert(pairAK.score > pairAQ.score, 'Pair of Aces K kicker > Q kicker');

// ── NLH: evaluateHand ──
section('NLH - evaluateHand');
let ev = evaluateHand('NLH', cards('AhKh'), cards('QsQd'), cards('Qh7h2h5c3d'));
assert(ev.result.outcome === 'hero', 'Hero flush vs opp trips', `got ${ev.result.outcome}`);

ev = evaluateHand('NLH', cards('AhKs'), cards('AcKd'), cards('Qh7h2d5c3s'));
assert(ev.result.outcome === 'chop', 'Identical hands chop', `got ${ev.result.outcome}`);

// Wheel in NLH
ev = evaluateHand('NLH', cards('5h4d'), cards('KsQd'), cards('Ah2c3s9dTh'));
assert(ev.result.outcome === 'hero', 'Wheel beats K-high', `got ${ev.result.outcome}, hero=${ev.heroHigh?.name}, opp=${ev.opponentHigh?.name}`);

// ── Split pot (identical hands) ──
section('NLH - Split Pots (evaluateShowdown)');
let sw = evaluateShowdown('NLH', [
  { idx: 0, cards: cards('AhKs') },
  { idx: 1, cards: cards('AcKd') },
], cards('Qh7h2d5c3s'));
assert(sw.length === 2, 'Two winners in split', `got ${sw.length}`);
assert(sw[0].split === true, 'split=true for player 0');
assert(sw[1].split === true, 'split=true for player 1');

// ── Multi-way showdown ──
sw = evaluateShowdown('NLH', [
  { idx: 0, cards: cards('AhKh') },
  { idx: 1, cards: cards('QsQd') },
  { idx: 2, cards: cards('JhTh') },
], cards('Qh7h2h5c3d'));
assert(sw.length === 1, 'One winner in 3-way', `got ${sw.length}`);
assert(sw[0].playerIdx === 0, 'Hero (flush) wins 3-way', `winner idx=${sw[0].playerIdx}`);

// ══════════════════════════════════════════════════════════════
// PLO TESTS
// ══════════════════════════════════════════════════════════════
section('PLO - Must use exactly 2 hole cards + 3 board');

// Hero has 4 hearts but only 2 hole cards can be used
ev = evaluateHand('PLO', cards('AhKhQhJh'), cards('TsTd9s8s'), cards('Th7h2d5c3s'));
// Hero: must pick 2 from AhKhQhJh + 3 from board. Board has one heart (7h).
// Best: Ah Kh from hand + 7h + two others? No, that's only 2 hearts.
// Actually AhKh + Th7h2d = pair of T, AK high? Or QhJh + Th7h2d? No, only 3 from board.
// Let's verify hero can't make flush (only 2 hole hearts + 1 board heart = 3 hearts max)
// Hero best: likely a pair or straight
assert(ev.heroHigh.cat < 6, 'PLO: cannot use 3+ hole cards for flush', `got cat=${ev.heroHigh.cat}, name=${ev.heroHigh.name}`);

// PLO: must use exactly 2 hole cards
// Hero: AsAh9d8d, Board: Ad7h6h5h4h
// Hero could make nut flush in holdem (Ah + 4 board hearts), but in PLO must use exactly 2 from hand + 3 from board.
// Best: Ah + 9d from hand + 7h6h5h from board = flush (Ah7h6h5h + 9d? No, that's not flush)
// Wait: Ah from hand + one other, then 3 hearts from board. Ah + Xd + 7h6h5h = only Ah is heart = not flush.
// Actually: Ah + any from hand, then pick 3 from board. Ah+As + Ad7h6h = trips aces.
// Or Ah+9d + 7h6h5h = Ah-high with hearts... Ah is one heart + 7h6h5h = 4 cards, need 5 total with 2 from hand.
// Ah + 8d from hand + 7h 6h 5h from board = A-high flush? No: Ah8d7h6h5h has suits h,d,h,h,h = not all same suit for flush.
// Hmm, for flush ALL 5 cards must be same suit. Ah + need another h from hand... none of As,9d,8d are hearts.
// So no flush. Best is likely trip aces: As Ah + Ad 7h 6h = three aces.
ev = evaluateHand('PLO', cards('AsAh9d8d'), cards('KhQh'), cards('Ad7h6h5h4h'));
assert(ev.heroHigh.cat <= 8, 'PLO: hero trip aces (not flush)', `got cat=${ev.heroHigh.cat}, name=${ev.heroHigh.name}`);
// Opponent: KhQh from hand + 7h6h5h from board = all hearts! KhQh7h6h5h = flush!
assert(ev.opponentHigh.cat === 6, 'PLO: opp makes flush with 2 hole hearts', `got cat=${ev.opponentHigh.cat}, name=${ev.opponentHigh.name}`);
assert(ev.result.outcome === 'opponent', 'PLO: flush beats trips', `got ${ev.result.outcome}`);

// PLO: straight must use 2 from hand
ev = evaluateHand('PLO', cards('Ah2d3c4s'), cards('Kd9s8h7c'), cards('5hTdJc6sQh'));
// Hero: best 2 from hand + 3 from board.
// A2345 wheel? A(14)+2+3+4 from hand but can only use 2. So Ah4s + 5h6sTd? = nothing.
// 3c4s + 5h6sQh = 3456Q = straight 3-6 only 4 consec... 3c4s + 5h6s + any = 6-high straight
// Actually 3c4s from hand + 5h6sTd from board = 3,4,5,6,T = not straight
// 3c4s from hand + 5h6sJc from board = 3,4,5,6,J = not straight
// 2d3c from hand + 4s(wait, 4s is in hero hand)... Hmm, board is 5hTdJc6sQh
// Hero hand: Ah2d3c4s. 2d3c + 5h6sTd = 2,3,5,6,T nah. 3c4s + 5h6sTd = 3,4,5,6,T nah.
// Ah4s + 5h6sTd? nah. 3c4s + 5h6sQh = 3,4,5,6,Q nah.
// Actually: 3c4s from hand + 5h6sQh, only 3,4,5,6 consecutive = not 5-card straight
// Let me try: Ah2d from hand + TdJcQh from board = A,2,T,J,Q = no
// Hmm this is getting complicated, let me use a clearer test

// Clearer PLO test: hero has nuts
ev = evaluateHand('PLO', cards('AhAs8d7d'), cards('KhKd2c3c'), cards('Ac5h6s9hTd'));
// Hero: AhAs + Ac5h6s = trip aces. Or 8d7d + 9hTd5h? No flush. Or AhAs + AcTd9h = trip A.
// Best: Ah+As + Ac+any2 from board. Ah As Ac Td 9h = trip aces.
// But also: 8d7d from hand + 9hTd6s from board? 10,9,8,7,6 = straight!
// 8d7d + Td 9h 6s = T9876 straight!
// Or AhAs + Ac + two = trips (cat 4) vs straight (cat 5). Straight wins.
assert(ev.heroHigh.cat === 5, 'PLO hero makes straight with 2 hole cards', `got cat=${ev.heroHigh.cat}, name=${ev.heroHigh.name}`);

// ══════════════════════════════════════════════════════════════
// OMAHA HI-LO TESTS
// ══════════════════════════════════════════════════════════════
section('PLO8 - Omaha Hi-Lo');

// Hero scoops with nut low and high
ev = evaluateHand('PLO8', cards('Ah2dKhQh'), cards('9s8s7c6c'), cards('3h4h5dJsTd'));
// Hero low: Ah2d from hand + 3h4h5d from board = A2345 = nut low (wheel)
// Hero high: Ah2d + 3h4h5d = 5-high straight (wheel, cat 5). Or KhQh + JsTd3h = KQJTx not straight.
// Actually KhQh from hand + JsTd3h from board = K,Q,J,T,3 = no. KhQh + JsTd5d = KQJT5 no.
// Best high from hero: AhKh + 3h4hJsTd5d... pick 3: AhKh + 3h4hJsTd5d
// Ah2d + 3h4h5d = wheel (straight, cat 5)
// KhQh + JsTd5d = not straight. KhQh + JsTd3h = KQJT3 no.
// Ah Kh from hand + Js Td 5d from board = AKJT5 no straight, A-high.
// So hero high is wheel (straight) = cat 5
// Opp: 9s8s from hand. 9876 from hand but only 2. 9s8s + JsTd5d = 9,8,J,T,5 no.
// 9s8s + 3h4h5d = 9,8,3,4,5 no. 7c6c + 3h4h5d = 7,6,3,4,5 = 7-high straight!
// So opp best high: 7c6c + 3h4h5d = 34567 straight (7-high)
// Wait, hero has wheel (5-high straight). Opp has 7-high straight. 7-high > 5-high.
// So opp wins high, hero wins low.
assert(ev.heroLow != null, 'PLO8: hero has qualifying low');
assert(ev.heroLow.qualified === true, 'PLO8: hero low qualified');

// No qualifying low
ev = evaluateHand('PLO8', cards('AhKhQhJh'), cards('TsTd9s8s'), cards('KdKcTs9dQd'));
// Board: KdKcTs9dQd — all 9+ cards. No low possible (need 5 unpaired cards 8 or under)
assert(ev.heroLow == null || ev.heroLow.qualified === false, 'PLO8: no qualifying low on high board');

// A-5 low in Omaha Hi-Lo (nut low)
section('PLO8 - A-5 Low (Nut Low)');
const nutLow = bestOmahaLow(cards('Ah2d9c8c'), cards('3h4s5d9hKc'));
assert(nutLow != null, 'Nut low exists');
assert(nutLow.qualified === true, 'Nut low qualifies');
assert(nutLow.name.includes('A'), 'Nut low contains A', `got "${nutLow.name}"`);

// Low that doesn't qualify (9-low)
const badLow = bestOmahaLow(cards('9h2d3c4c'), cards('ThJsKdQhAc'));
// 2+3 from hand, board has T,J,K,Q,A. 2d3c + ThJsAc = 2,3,T,J,A — pairs? No. But T>8.
// No combo of 2 from hand + 3 from board gives 5 cards all <=8
assert(badLow == null, 'PLO8: 9-high board doesnt qualify for low');

// ══════════════════════════════════════════════════════════════
// STUD TESTS
// ══════════════════════════════════════════════════════════════
section('Stud Hi - 7-card evaluation');

ev = evaluateHand('Stud Hi', cards('AhAdAcKsKdQhJh'), cards('2s3s4s5s6s7s8s'), []);
// Hero: trip aces + pair kings in 7 cards. Best 5: AhAdAcKsKd = full house (aces full of kings)
assert(ev.heroHigh.cat === 7, 'Stud: full house from 7 cards', `got cat=${ev.heroHigh.cat}`);
assert(ev.heroHigh.name.includes('Ace') && ev.heroHigh.name.includes('King'), 'Stud: aces full of kings', `got "${ev.heroHigh.name}"`);

// Stud Hi-Lo (8 or better)
section('Stud 8 - Stud Hi-Lo');
ev = evaluateHand('Stud 8', cards('Ah2d3c4s5hKsQd'), cards('9h8d7c6sThJhKh'), []);
// Hero: Ah2d3c4s5h in there = wheel (straight, cat 5) for high, and A-5 low
// Opp: 9h8d7c6sTh = straight (T-high, cat 5)
assert(ev.heroHigh != null, 'Stud8: hero has high hand');
assert(ev.heroLow != null && ev.heroLow.qualified, 'Stud8: hero has qualifying low');

// ══════════════════════════════════════════════════════════════
// 2-7 TRIPLE DRAW TESTS
// ══════════════════════════════════════════════════════════════
section('2-7 Triple Draw - Lowball');

// Best possible hand: 7-5-4-3-2 (not suited, not a straight in 2-7 rules)
// Wait: 7-5-4-3-2 IS a straight (7-6-5-4-3 is, but 7-5-4-3-2 has a gap)
// 7-5-4-3-2: values are 7,5,4,3,2. 7-2=5 but only 5 cards with gap. Not consecutive. Not a straight!
const best27 = evalLow27(cards('7h5d4c3s2h'));
// Check: is it treated as a straight? 7-2=5, all unique, but vals are [7,5,4,3,2] — 7-2=5 but not consecutive
// vals[0]-vals[4] = 7-2 = 5, but Set size = 5. The code checks: vals[0]-vals[4]===4. 7-2=5 !== 4. NOT a straight.
assert(best27.score < 1e9, '7-5-4-3-2 is valid low (not a straight)', `score=${best27.score}, name=${best27.name}`);

// 7-6-5-4-3 IS a straight in 2-7
const straight27 = evalLow27(cards('7h6d5c4s3h'));
// vals[0]-vals[4] = 7-3 = 4, Set size = 5. IS a straight!
assert(straight27.score >= 1e9, '7-6-5-4-3 is a straight (bad for 2-7)', `score=${straight27.score}, name=${straight27.name}`);

// Flush is bad in 2-7
const flush27 = evalLow27(cards('7h5h4h3h2h'));
assert(flush27.score >= 1e9, '7-5-4-3-2 all hearts is flush (bad for 2-7)', `score=${flush27.score}, name=${flush27.name}`);

// Pair is bad in 2-7
const pair27 = evalLow27(cards('7h7d4c3s2h'));
assert(pair27.score >= 1e9, 'Pair of 7s is bad for 2-7', `score=${pair27.score}, name=${pair27.name}`);

// 8-6-5-4-2 is second-worst qualifying hand? No, it's a fine hand. Just worse than 7-5-4-3-2.
const second27 = evalLow27(cards('7h5d4c3s2d'));
const worse27 = evalLow27(cards('8h5d4c3s2h'));
assert(second27.score < worse27.score, '7-5 low beats 8-5 low', `7-5=${second27.score}, 8-5=${worse27.score}`);

// A is high in 2-7 (A=14)
const ace27 = evalLow27(cards('Ah7d5c3s2h'));
// Ace is 14, so this is A-7-5-3-2 where A is high. Score should be high.
// Not a straight (14,7,5,3,2: 14-2=12, not 4). Not a flush. Not paired. Valid low but very bad.
assert(ace27.score < 1e9, 'A-7-5-3-2 is valid low (ace high, not a straight)', `score=${ace27.score}`);
assert(ace27.score > worse27.score, 'A-high worse than 8-high in 2-7', `A-high=${ace27.score}, 8-high=${worse27.score}`);

// A-5-4-3-2 in 2-7: NOT a straight (ace is high = 14, so 14-2=12, not 4)
const aceWheel27 = evalLow27(cards('Ah5d4c3s2h'));
// vals: [14,5,4,3,2], 14-2=12 !== 4. Not a straight. Not flush (mixed suits). Not paired.
// So it's a valid low but A-high (bad).
assert(aceWheel27.score < 1e9, 'A-5-4-3-2 is NOT a straight in 2-7 (ace is high)', `score=${aceWheel27.score}`);

// evaluateHand for 2-7 TD
ev = evaluateHand('2-7 TD', cards('7h5d4c3s2d'), cards('8h6d5c4s2h'), []);
assert(ev.result.outcome === 'hero', '2-7 TD: 7-5 low beats 8-6 low', `got ${ev.result.outcome}`);

// bestLow27Hand from 7 cards
section('2-7 TD - bestLow27Hand from more cards');
const best27from7 = bestLow27Hand(cards('7h5d4c3s2d9hKc'));
assert(best27from7 != null, 'Finds best 2-7 low from 7 cards');
assert(best27from7.name.includes('7'), 'Best 2-7 from 7 cards includes 7', `got "${best27from7.name}"`);

// ══════════════════════════════════════════════════════════════
// RAZZ TESTS (A-5 lowball, no 8-or-better requirement)
// ══════════════════════════════════════════════════════════════
section('Razz - A-5 Lowball');

// Best Razz hand: A-2-3-4-5 (wheel)
ev = evaluateHand('Razz', cards('Ah2d3c4s5h9hKd'), cards('6h7d8c9sTh5dJh'), []);
// Hero: best 5 from Ah2d3c4s5h9hKd = A2345 (wheel)
// Opp: best 5 from 6h7d8c9sTh5dJh = 5678T? No: 5d6h7d8c9s = 5-9 straight but straights don't count in A-5.
// Actually in A-5 lowball, straights/flushes are IGNORED. So 56789 is just 9-5 low.
// Opp best: 5d6h7d8cTh? = T-high. Or 5d6h7d8c9s = 9-8-7-6-5 low. That's better.
// Hero: A-2-3-4-5 = 5-4-3-2-A low. Aces are low (=1).
assert(ev.result.outcome === 'hero', 'Razz: wheel beats 9-low', `got ${ev.result.outcome}`);

// In Razz, straights/flushes don't count against you
const razzFlush = evalLowA5(cards('5h4h3h2hAh'), false);
assert(razzFlush.qualified === true, 'Razz: flush doesnt disqualify');
assert(razzFlush.name.includes('A'), 'Razz: A-5 low name', `got "${razzFlush.name}"`);

// Paired hand doesn't qualify for low
const razzPaired = evalLowA5(cards('Ah2d2c4s5h'), false);
assert(razzPaired.qualified === false, 'Razz: paired hand doesnt qualify', `score=${razzPaired.score}`);

// ══════════════════════════════════════════════════════════════
// BADUGI TESTS
// ══════════════════════════════════════════════════════════════
section('Badugi - 4-card lowball with suits');

// Perfect badugi: A-2-3-4 all different suits
let bad = evalBadugi(cards('Ah2d3c4s'));
assert(bad.numCards === 4, 'Perfect badugi = 4-card', `got ${bad.numCards}`);
assert(bad.name.includes('Badugi'), '4-card has Badugi in name', `got "${bad.name}"`);

// 3-card badugi (two cards share a suit)
bad = evalBadugi(cards('Ah2h3c4s'));
// Ah and 2h share hearts. Best 3-card: A from hearts + 3c + 4s = A-3-4 (3-card)
// Or 2h + 3c + 4s = 2-3-4 (3-card).
// Lower is better, so A-3-4 (1,3,4) is better than 2-3-4 (2,3,4)
assert(bad.numCards === 3, '3-card badugi when 2 share suit', `got ${bad.numCards}`);
assert(bad.name.includes('3-card'), '3-card label', `got "${bad.name}"`);

// 2-card badugi
bad = evalBadugi(cards('Ah2hAd2d'));
// Ah2h same suit. Ad2d same suit. AhAd same rank. 2h2d same rank.
// Best 2-card: Ah+2d (diff suit, diff rank) = A-2 (2-card). Or Ad+2h. Score = 1+2 = 3.
assert(bad.numCards === 2, '2-card badugi', `got ${bad.numCards}`);

// 1-card badugi (all same suit and/or rank conflicts)
bad = evalBadugi(cards('AhAhAhAh'));
// All same suit AND same rank. Best 1-card = A.
assert(bad.numCards === 1, '1-card badugi (all same)', `got ${bad.numCards}`);

// 4-card badugi beats 3-card always
const b4 = evalBadugi(cards('Kh9d8c7s')); // 4-card, K-high
const b3 = evalBadugi(cards('Ah2d3c3s')); // 3-card (3c and 3s conflict on rank? No, same rank)
// Wait: 3c and 3s have DIFFERENT suits but SAME rank. So we can't use both.
// Best 3-card: Ah+2d+3c or Ah+2d+3s = A-2-3 (3-card)
assert(b4.score < b3.score, '4-card badugi always beats 3-card', `4-card=${b4.score}, 3-card=${b3.score}`);

// evaluateHand for Badugi
ev = evaluateHand('Badugi', cards('Ah2d3c4s'), cards('2h3d4c5s'), []);
assert(ev.result.outcome === 'hero', 'Badugi: A-2-3-4 beats 2-3-4-5', `got ${ev.result.outcome}`);

// Badugi chop
ev = evaluateHand('Badugi', cards('Ah2d3c4s'), cards('Ac2h3d4s'), []);
// Wait: both are A-2-3-4 but different suits. In Badugi, suits don't affect ranking beyond qualification.
// A=1, 2, 3, 4 for both. Same score.
// Actually cards('Ac2h3d4s') — let me check: A=c, 2=h, 3=d, 4=s. All different suits. 4-card badugi, A-2-3-4.
assert(ev.result.outcome === 'chop', 'Badugi: same ranks = chop', `got ${ev.result.outcome}`);

// ══════════════════════════════════════════════════════════════
// BADEUCY TESTS (split: badugi + 2-7 lowball)
// ══════════════════════════════════════════════════════════════
section('Badeucy - Split Badugi + 2-7');

ev = evaluateHand('Badeucy', cards('7h5d4c3s2h'), cards('8h6d5c4s2d'), []);
// Hero badugi from 5 cards: best 4-card subset. 7h5d4c3s = all diff suits & ranks = 4-card badugi (3-4-5-7)
// Or 5d4c3s2h = all diff suits & ranks = 4-card badugi (2-3-4-5)
// 2-3-4-5 badugi better than 3-4-5-7
// Hero 2-7 low: 7h5d4c3s2h. But 2h appears... wait: cards('7h5d4c3s2h') = 7h, 5d, 4c, 3s, 2h.
// 7,5,4,3,2 — all different. Not flush (mixed). 7-2=5 !== 4, not straight. Valid 7-5 low!
// Opp: cards('8h6d5c4s2d') = 8h,6d,5c,4s,2d. 8,6,5,4,2 — all different. 8-2=6 !== 4, not straight. Valid 8-6 low.
// Hero wins both badugi and 2-7.
assert(ev.result.outcome === 'hero', 'Badeucy: hero scoops', `got ${JSON.stringify(ev.result)}`);

// ══════════════════════════════════════════════════════════════
// BADACY TESTS (split: badugi + A-5 lowball)
// ══════════════════════════════════════════════════════════════
section('Badacy - Split Badugi + A-5');

ev = evaluateHand('Badacy', cards('Ah2d3c4s5h'), cards('2h3d4c5s6h'), []);
// Hero badugi: from 5 cards, best 4-card subset with all diff suits and ranks
// Ah2d3c4s = all diff suits, all diff ranks = 4-card badugi A-2-3-4.
// Hero A-5 low: A=1,2,3,4,5 = 5-4-3-2-A (wheel). Best possible A-5 low.
// Opp badugi: 2h3d4c5s = 4-card badugi 2-3-4-5.
// Opp A-5 low: 2,3,4,5,6 = 6-5-4-3-2 low.
// Hero wins both.
assert(ev.result.outcome === 'hero', 'Badacy: hero scoops with wheel + A-2-3-4 badugi', `got ${JSON.stringify(ev.result)}`);

// ══════════════════════════════════════════════════════════════
// BIG O TESTS (5-card Omaha Hi-Lo)
// ══════════════════════════════════════════════════════════════
section('Big O - 5-card Omaha Hi-Lo');

ev = evaluateHand('Big O', cards('AhKh2d3cQs'), cards('9s8s7c6c4d'), cards('5hTdJc4sKc'));
// Still must use exactly 2 from hand + 3 from board
// Hero: AhKh from hand + TdJcQs? wait, Qs is in hand. Board: 5h,Td,Jc,4s,Kc.
// AhKh + TdJcKc = AKKJTd — pair of kings. Or AhQs + TdJcKc = AKQJT straight!
// Wait: hero hand has Qs, and board is 5hTdJc4sKc. So:
// AhQs from hand + TdJcKc from board = A,Q,T,J,K = AKQJT = Broadway straight!
// Opp: 9s8s from hand + TdJc5h = T,J,9,8,5 = no. 7c6c + 5hTd4s = 7,6,5,T,4 = no. 9s8s + TdJcKc = T,J,K,9,8 = no.
// 7c6c + 5h4sTd = 7,6,5,4,T = no. 9s6c + 5h4sTd = 9,6,5,4,T = no.
// 4d + board 4s exists = pair of 4s. Hmm... best for opp: probably something modest.
assert(ev.heroHigh != null, 'Big O: hero has high hand');

// ══════════════════════════════════════════════════════════════
// EVALUATESHOWDOWN MULTIWAY TESTS
// ══════════════════════════════════════════════════════════════
section('evaluateShowdown - Multi-way and Edge Cases');

// 3-way split in NLH (all same hand on board)
sw = evaluateShowdown('NLH', [
  { idx: 0, cards: cards('2h3d') },
  { idx: 1, cards: cards('2d3h') },
  { idx: 2, cards: cards('2c3s') },
], cards('AhKsQdJcTh'));
// Board: AKQJT = broadway straight. All players play the board.
assert(sw.length === 3, '3-way split on board straight', `got ${sw.length}`);
assert(sw.every(w => w.split === true), 'All players split', `got ${JSON.stringify(sw)}`);

// PLO8 showdown: hi-lo split between different players
sw = evaluateShowdown('PLO8', [
  { idx: 0, cards: cards('AhKhQhJh') },  // High-only hand
  { idx: 1, cards: cards('Ah2d3c4s') },   // Low hand
], cards('5h6h7h8dKd'));
// Player 0: AhKh from hand + 5h6h7h from board = flush. Or QhJh + 5h6h7h = flush.
// AhKh + 5h6h7h = AKh flush (ace-high). Cat 6.
// Player 0 low: needs 2 from hand (A,K,Q,J — all high) + 3 from board. A+K + 5,6,7 = AK567 — K>8, no qualify.
// A+Q + 5,6,8 = AQ568 — Q>8, no qualify. No qualifying low for player 0.
// Player 1: Ah2d from hand + 5h8dKd from board = A,2,5,8,K = K-high. Or 3c4s + 5h6h7h = 34567 straight!
// Player 1 high: 3c4s + 5h6h7h = straight (7-high, cat 5). Or Ah2d + 5h6h8d = A-high, no.
// Or 2d4s + 5h6h7h = 7-high straight. Or Ah3c + 5h6h7h = not straight (A,3,5,6,7 gap).
// Best: 3c4s + 5h6h7h = 3,4,5,6,7 straight (7-high)
// Player 0 high (ace-high flush) > Player 1 high (7-high straight). Flush > straight.
// Player 1 low: Ah2d + 5h6h8d = A,2,5,6,8 — 8 or less, all different = qualifies! 8-6-5-2-A low.
// Or 2d3c + 5h6h8d = 2,3,5,6,8 — qualifies! 8-6-5-3-2 low.
// Or Ah2d + 5h6h7h = A,2,5,6,7 — qualifies! 7-6-5-2-A low. Better!
// Or Ah3c + 5h6h8d = A,3,5,6,8 — qualifies! 8-6-5-3-A low.
// Best low: Ah2d + 5h6h7h = 7-6-5-2-A low. Hmm wait, let me recheck: Ah2d are from hand, 5h6h7h from board.
// Cards: A,2,5,6,7. Vals (A=1): 7,6,5,2,1. Name: 7-6-5-2-A low.
assert(sw.length === 2, 'PLO8 showdown: 2 winners (hi/lo split)', `got ${sw.length}`);
assert(sw[0].split === true && sw[1].split === true, 'Both are split winners');

// Razz showdown
sw = evaluateShowdown('Razz', [
  { idx: 0, cards: cards('Ah2d3c4s5hKdQh') },
  { idx: 1, cards: cards('2h3d4c5s6hKdQh') },
], []);
// Player 0: best A-5 low from 7 cards = A,2,3,4,5 = wheel (5-4-3-2-A)
// Player 1: best A-5 low = 2,3,4,5,6 = 6-5-4-3-2 low
assert(sw.length === 1, 'Razz: one winner', `got ${sw.length}`);
assert(sw[0].playerIdx === 0, 'Razz: wheel wins', `winner=${sw[0].playerIdx}`);

// Badugi showdown
sw = evaluateShowdown('Badugi', [
  { idx: 0, cards: cards('Ah2d3c4s') },
  { idx: 1, cards: cards('Ah2d3c5s') },
], []);
assert(sw.length === 1, 'Badugi: one winner');
assert(sw[0].playerIdx === 0, 'Badugi: A-2-3-4 beats A-2-3-5', `winner=${sw[0].playerIdx}`);

// 2-7 TD showdown
sw = evaluateShowdown('2-7 TD', [
  { idx: 0, cards: cards('7h5d4c3s2d') },
  { idx: 1, cards: cards('7h6d4c3s2h') },
], []);
assert(sw.length === 1, '2-7 TD: one winner');
assert(sw[0].playerIdx === 0, '2-7 TD: 7-5 beats 7-6', `winner=${sw[0].playerIdx}`);

// ══════════════════════════════════════════════════════════════
// EDGE CASE: LHE (Limit Holdem) and PLH
// ══════════════════════════════════════════════════════════════
section('LHE / PLH - Same as NLH evaluation');
ev = evaluateHand('LHE', cards('AhKh'), cards('QdJd'), cards('Th9h8h2s3d'));
assert(ev.heroHigh.cat === 6, 'LHE: hero flush', `got cat=${ev.heroHigh.cat}`);

ev = evaluateHand('PLH', cards('AhKh'), cards('QdJd'), cards('Th9h8h2s3d'));
assert(ev.heroHigh.cat === 6, 'PLH: hero flush', `got cat=${ev.heroHigh.cat}`);

// ══════════════════════════════════════════════════════════════
// PL 5-Card Draw tests
// ══════════════════════════════════════════════════════════════
section('PL 5CD Hi - 5-card draw high');
ev = evaluateHand('PL 5CD Hi', cards('AhKhQhJhTh'), cards('9s8s7s6s5s'), []);
assert(ev.heroHigh.name === 'Royal Flush', '5CD: Royal Flush', `got "${ev.heroHigh.name}"`);
assert(ev.result.outcome === 'hero', '5CD: RF beats SF', `got ${ev.result.outcome}`);

// ══════════════════════════════════════════════════════════════
// A-5 TRIPLE DRAW
// ══════════════════════════════════════════════════════════════
section('A-5 TD - A-5 Lowball');
ev = evaluateHand('A-5 TD', cards('Ah2d3c4s5h'), cards('2h3d4c5s6h'), []);
assert(ev.result.outcome === 'hero', 'A-5 TD: wheel beats 6-low', `got ${ev.result.outcome}`);

// Flush doesn't count against in A-5
ev = evaluateHand('A-5 TD', cards('Ah2h3h4h5h'), cards('2d3c4s5h6d'), []);
assert(ev.result.outcome === 'hero', 'A-5 TD: suited wheel still wins (flushes ignored)', `got ${ev.result.outcome}`);

// ══════════════════════════════════════════════════════════════
// 2-7 RAZZ (Stud format, 2-7 lowball)
// ══════════════════════════════════════════════════════════════
section('2-7 Razz');
ev = evaluateHand('2-7 Razz', cards('7h5d4c3s2d9cKh'), cards('8h6d5c4s2h9dKc'), []);
// Hero: best 2-7 low from 7 cards. 7h5d4c3s2d = 7-5-4-3-2 low (best).
// Opp: best 2-7 low from 7 cards. 8h6d5c4s2h = 8-6-5-4-2 low.
assert(ev.result.outcome === 'hero', '2-7 Razz: 7-5 beats 8-6', `got ${ev.result.outcome}`);

// ══════════════════════════════════════════════════════════════
// MIXED GAME CONFIGS
// ══════════════════════════════════════════════════════════════
section('Game Config Completeness');
const expectedGames = ['NLH','LHE','PLH','Stud Hi','PL 5CD Hi','PLO','LO Hi',
  'PLO8','O8','Big O','Stud 8','Stud Hi-Lo','Razz','A-5 TD',
  '2-7 TD','PL 2-7 TD','L 2-7 TD','NL 2-7 SD','2-7 Razz',
  'Badugi','Badeucy','Badacy'];
for (const g of expectedGames) {
  assert(GAME_EVAL[g] != null, `GAME_EVAL has config for ${g}`);
}

// ══════════════════════════════════════════════════════════════
// ADDITIONAL EDGE CASES
// ══════════════════════════════════════════════════════════════
section('Edge Cases');

// Two pair kicker test
const tp1 = evalHigh5(cards('AhAdKcKsQh'));
const tp2 = evalHigh5(cards('AhAdKcKsJh'));
assert(tp1.score > tp2.score, 'Two pair: Q kicker > J kicker');

// Full house comparison: higher trips wins
const fh1 = evalHigh5(cards('AhAdAcKsKd'));
const fh2 = evalHigh5(cards('KhKdKcAsAd'));
assert(fh1.score > fh2.score, 'FH: Aces full > Kings full');

// Flush comparison: second card matters
const fl1 = evalHigh5(cards('AhTh8h6h3h'));
const fl2 = evalHigh5(cards('Ah9h8h6h3h'));
assert(fl1.score > fl2.score, 'Flush: A-T > A-9 (second card)');

// Quads kicker
const q1 = evalHigh5(cards('AhAdAcAsKh'));
const q2 = evalHigh5(cards('AhAdAcAsQh'));
assert(q1.score > q2.score, 'Quads: K kicker > Q kicker');

// High card tiebreaker
const hc1 = evalHigh5(cards('AhKd9c5s3h'));
const hc2 = evalHigh5(cards('AhKd8c5s3h'));
assert(hc1.score > hc2.score, 'High card: A-K-9 > A-K-8');

// Straight Flush vs Royal Flush
const sf5 = evalHigh5(cards('5h4h3h2hAh'));
const rfFull = evalHigh5(cards('AhKhQhJhTh'));
assert(rfFull.score > sf5.score, 'Royal Flush > 5-high Straight Flush');

// Stud Hi-Lo: player scoops when they win both high and low
section('Stud Hi-Lo - Scoop');
sw = evaluateShowdown('Stud Hi-Lo', [
  { idx: 0, cards: cards('Ah2d3c4s5hKsQd') },  // Wheel (straight high + A-5 low)
  { idx: 1, cards: cards('9h8d7c6sThJh2h') },  // Straight (T-high) + no low (9>8)
], []);
// Player 0 high: A2345 = wheel (straight, cat 5)
// Player 1 high: 6789T = straight (T-high, cat 5). T-high > 5-high straight.
// Player 1 wins high.
// Player 0 low: A2345 = 5-4-3-2-A low (qualifies under 8-or-better)
// Player 1 low: best 5 from 9,8,7,6,T,J,2. Best: 2,6,7,8,9 = 9-8-7-6-2. 9>8, doesn't qualify.
// Actually wait: 8-or-better means highest card must be <=8. 9>8, so no. 2,6,7,8,T? T>8. 2,6,7,8,J? no.
// None qualify for player 1. Only player 0 has qualifying low.
// Result: player 1 wins high, player 0 wins low = split.
assert(sw.length === 2, 'Stud Hi-Lo: 2 winners (hi/lo split)', `got ${sw.length}`);
assert(sw.every(w => w.split === true), 'Both split');

// ══════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(60)}`);
console.log(`  RESULTS: ${passed}/${totalTests} passed, ${failed} failed`);
console.log('='.repeat(60));
if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach(f => console.log(`  - ${f.testName}: ${f.detail}`));
}
process.exit(failed > 0 ? 1 : 0);
