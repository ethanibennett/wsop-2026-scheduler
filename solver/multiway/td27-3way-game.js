// ── 2-7 Triple Draw — 3-way, fixed-limit, 8-max entry economics ──────────────
// The DRAW-game sibling of razz3-game.js / stud8-3way-game.js. Same generic
// interface the multiway CFR (mccfr3.js) consumes — but a BLIND game (SB/BB +
// button) with private DRAWS instead of a stud ante/bring-in with upcards.
//
// The point of this module is the "full-ring entry" layer: solved uniform-deal
// it yields per-position pre-draw open/call/3-bet ranges (extract-cfr-entry.js),
// the missing piece for a GTO-Wizard-style 2-7 product.
//
// BUILD ORDER (verified piece by piece — engines must be RIGHT):
//   increment 1 (THIS FILE so far): deck/deal + 3-way 2-7 low showdown + utility.
//   increment 2: the blind/position betting tree (reuses razz3's proven close/
//                reopen logic — including the bring-in fix's acted-at-post rule).
//   increment 3: the draw phase (private discards, public counts) + abstraction.
//   increment 4: train + derive entry ranges.
const { makeRng, cardFromStr, cardStr, rankOf, suitOf } = require('../engine/cards');
const { score27 } = require('../eval/low27');
const { bucket27, chooseKeep27 } = require('../games/triple-draw-27');

const NSEAT = 3;
const SB = 1, BB = 2;                 // blinds (small-bet units)
const SMALL_BET = 2, BIG_BET = 4;     // fixed limit: small streets 0-1, big 2-3
const CAP = 4;                        // 4-bet cap per round
const HAND = 5;                       // 5-card draw
// 8-max entry economics: dead money from the folded field beyond our NSEAT seats.
// Blinds are LIVE money for the seats that hold them; the overlay is the extra
// dead chips a full ring drags in (limps/blinds of folded seats). Parameterized.
const DEFAULT_DEAD = 3;

function betSize(street) { return street < 2 ? SMALL_BET : BIG_BET; }
const clone = s => ({
  ...s,
  hands: s.hands.map(h => h.slice()),
  contrib: s.contrib.slice(),
  folded: s.folded.slice(),
  acted: s.acted.slice(),
  drawCounts: s.drawCounts.map(d => d.slice()),
  discards: s.discards.map(d => d.slice()),
  deck: s.deck.slice(),
  log: s.log.slice(),
});

function liveSeats(s) { const o = []; for (let i = 0; i < NSEAT; i++) if (!s.folded[i]) o.push(i); return o; }

// 3-way whole-pot 2-7 low: lowest score27 among live seats wins; ties split.
// deadPot is external money → utilities do NOT sum to zero (general-sum), matching
// the razz3/stud8-3way convention.
function utility(s, deadPot) {
  const live = liveSeats(s);
  const pot = (deadPot || 0) + s.contrib.reduce((a, b) => a + b, 0);
  let winners;
  if (live.length === 1) winners = live;
  else {
    const scores = live.map(p => score27(s.hands[p]));
    const best = Math.min(...scores);
    winners = live.filter((p, i) => scores[i] === best);
  }
  const share = 1 / winners.length;
  const out = [];
  for (let p = 0; p < NSEAT; p++) out.push((winners.includes(p) ? share * pot : 0) - s.contrib[p]);
  return out;
}

// Fresh 52-card deck (ints), Fisher-Yates by the game rng.
function freshDeck(rng) {
  const d = []; for (let c = 0; c < 52; c++) d.push(c);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

// Deal 5 private cards to each of NSEAT seats; button rotates via opts.button.
// Blinds posted by SB/BB seats (3-handed: button=UTG pre-draw, SB, BB).
function deal(rng, opts = {}) {
  const deck = freshDeck(rng);
  const hands = [[], [], []];
  for (let r = 0; r < HAND; r++) for (let p = 0; p < NSEAT; p++) hands[p].push(deck.pop());
  const button = opts.button || 0;             // seat with the button
  const sb = (button + 1) % NSEAT, bb = (button + 2) % NSEAT;
  const contrib = [0, 0, 0];
  contrib[sb] = SB; contrib[bb] = BB;
  return {
    hands, deck, button, sb, bb,
    street: 0, phase: 'bet',
    toAct: button,                             // 3-handed: button acts first pre-draw
    bets: 1,                                    // the BB counts as the standing bet
    contrib, folded: [false, false, false],
    acted: [false, false, false], lastAgg: bb,
    drawCounts: [[], [], []], discards: [[], [], []],
    hist: '', curSeq: '', log: [],
  };
}

// ── makeGame: the interface mccfr3 / train3 consume ──────────────────────────
// increment 2: the blind/position BETTING tree. Draw phase + abstraction are
// increment 3 (a legalActions/applyAction 'draw' branch); until then the game is
// exercised through a single betting street by the tests below.
function makeGame(opts = {}) {
  const deadPot = opts.dead != null ? opts.dead : DEFAULT_DEAD;
  const CAPv = opts.cap != null ? opts.cap : CAP;

  const _high = s => { let h = 0; for (let i = 0; i < NSEAT; i++) if (!s.folded[i]) h = Math.max(h, s.contrib[i]); return h; };
  const _nextLive = (s, from) => { for (let k = 1; k <= NSEAT; k++) { const c = (from + k) % NSEAT; if (!s.folded[c]) return c; } return from; };
  const _firstLive = (s, from) => { for (let k = 0; k < NSEAT; k++) { const c = (from + k) % NSEAT; if (!s.folded[c]) return c; } return from; };

  // Round closes when every live seat has acted since the last aggression AND all
  // are matched to the high. Then: draw (streets 0-2) or showdown (after street 3).
  // NOTE (blind game): the blinds are NOT marked acted at post, so when action
  // limps to the BB it faces 0 and gets a live check/raise option — the CORRECT
  // opposite of the stud bring-in (which gets no option). See razz3 bring-in fix.
  function closeOrAdvance(n, p) {
    const live = liveSeats(n);
    if (live.length === 1) { n.phase = 'showdown'; return; }
    const high = _high(n);
    const allActed = live.every(i => n.acted[i]);
    const allMatched = live.every(i => n.contrib[i] === high);
    if (allActed && allMatched) {
      if (n.street === 3) { n.phase = 'showdown'; return; }
      n.phase = 'draw';
      n.toAct = _firstLive(n, n.sb);   // OOP (first live from SB) draws first
      return;
    }
    n.toAct = _nextLive(n, p);
  }

  const game = {
    id: 'td27-3', NSEAT, deadPot, cap: CAPv,
    newHand: (rng) => deal(rng, opts),
    liveSeats,
    isTerminal: s => liveSeats(s).length === 1 || s.phase === 'showdown',
    isChance: s => s.phase === 'drawDeal',   // private card replacement (increment 3)
    utility: s => utility(s, deadPot),
    currentPlayer: s => s.toAct,
    _closeOrAdvance: closeOrAdvance, _high, _nextLive, _firstLive,   // exposed for tests

    legalActions(s) {
      if (s.phase === 'draw') throw new Error('draw-phase legalActions: increment 3');
      const p = s.toAct;
      const facing = _high(s) - s.contrib[p];
      if (facing > 0) { const a = ['f', 'c']; if (s.bets < CAPv) a.push('r'); return a; }
      const a = ['k']; if (s.bets < CAPv) a.push('b'); return a;
    },

    applyAction(s, a) {
      const n = clone(s);
      const p = n.toAct;
      const high = _high(n);
      const facing = high - n.contrib[p];
      n.acted[p] = true;
      n.hist += a; n.curSeq += a;
      if (a === 'f') { n.folded[p] = true; n.log.push({ p, a: 'folds' }); closeOrAdvance(n, p); return n; }
      if (a === 'c' || a === 'k') {
        n.contrib[p] += Math.max(0, facing);
        n.log.push({ p, a: a === 'k' ? 'checks' : 'calls' });
        closeOrAdvance(n, p);
        return n;
      }
      // bet / raise — RE-OPENS action to every other live seat.
      n.contrib[p] = high + betSize(n.street);
      n.bets++;
      n.lastAgg = p;
      n.acted = [false, false, false]; n.acted[p] = true;
      n.log.push({ p, a: n.bets <= 1 ? `bets ${betSize(n.street)}` : `raises to ${n.contrib[p]}` });
      n.toAct = _nextLive(n, p);
      return n;
    },
  };
  return game;
}

module.exports = {
  NSEAT, SB, BB, SMALL_BET, BIG_BET, CAP, HAND, DEFAULT_DEAD, betSize,
  clone, liveSeats, utility, freshDeck, deal, makeGame, score27, bucket27, chooseKeep27,
};
