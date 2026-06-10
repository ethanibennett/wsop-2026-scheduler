// ── Card utilities for CFR solvers ─────────────────────────
// Cards are integers 0..51: (rank-2)*4 + suit, rank 2..14 (A=14), suit c/d/h/s.
// String form matches app conventions: 'Ah' = Ace of hearts.

const SUITS = ['c', 'd', 'h', 's'];
const RANK_CHARS = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'T',11:'J',12:'Q',13:'K',14:'A' };
const CHAR_RANKS = {};
Object.keys(RANK_CHARS).forEach(r => { CHAR_RANKS[RANK_CHARS[r]] = parseInt(r, 10); });

function rankOf(c) { return Math.floor(c / 4) + 2; }       // 2..14, ace high
function suitOf(c) { return c % 4; }
// Ace-to-five style rank (ace low): A=1, 2=2 ... K=13
function lowRankOf(c) { const r = rankOf(c); return r === 14 ? 1 : r; }

function cardStr(c) { return RANK_CHARS[rankOf(c)] + SUITS[suitOf(c)]; }
function cardFromStr(s) { return (CHAR_RANKS[s[0].toUpperCase()] - 2) * 4 + SUITS.indexOf(s[1].toLowerCase()); }
function cardsStr(cards) { return cards.map(cardStr).join(' '); }

function makeDeck() {
  const d = [];
  for (let c = 0; c < 52; c++) d.push(c);
  return d;
}

// Deterministic, seedable PRNG (mulberry32)
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function shuffledDeck(rng) { return shuffle(makeDeck(), rng); }

module.exports = {
  SUITS, RANK_CHARS, rankOf, suitOf, lowRankOf,
  cardStr, cardFromStr, cardsStr, makeDeck, makeRng, shuffle, shuffledDeck,
};
