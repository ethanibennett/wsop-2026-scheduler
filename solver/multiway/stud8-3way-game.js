// ── stud8-3way — FULL Stud Hi/Lo 8-or-better, 3 players ("8-max economics") ──
// The hi/lo sibling of razz3-game.js. Same 3-player multiway MECHANICS
// (re-opening raises, fold-to-2-way collapse, dead-money overlay, biased root
// deal with real card removal) driven by the SAME game-object interface the
// game-agnostic trainer (mccfr3.js) and CLI (train3.js) consume — so both drive
// this UNCHANGED. The 2-player games/stud8-game.js is left UNTOUCHED.
//
// What differs from razz3 (the whole point — these are stud8's rules, mirroring
// games/stud8-game.js, NOT razz's):
//   • SHOWDOWN is a HI/LO 8-or-better SPLIT over the live seats: the HIGH half
//     to best bestHi7 (split on ties); the LOW half to best qualifying bestLo8
//     (≤8, split on ties); NO qualifying low → the high winner scoops the whole
//     pot; a seat winning both halves scoops. This is exactly equity.multiwayShare
//     generalized to per-seat shares (verified against it in the test).
//   • BRING-IN = the LOWEST door card (games/stud8-game.js), the MIRROR of razz
//     (highest). Ace plays HIGH; suit c<d<h<s breaks an exact tie.
//   • FIRST TO ACT on 4th+ = the HIGHEST showing board (games/stud8-game.js), the
//     MIRROR of razz (lowest/best-low board).
//   • BUCKETING is hi/lo-aware (adapted from games/stud8-game.js's ownBucket):
//     pair class (incl. aces + big pairs) × distinct-low count × ace × flush ×
//     made-low quality — distinguishes made-low draws, big pairs, and junk.
//
// Everything else — the betting tree (bring-in/complete, small/big bets, CAP,
// re-opening raises, fold-to-2-way), the dead-ante overlay, the foldedBurn real
// card removal, the positional door prior + UNIFORM_PRIORS, the infosetKey shape
// (own bucket + UNORDERED live-opponent board pair + per-street exact history +
// quantized pot + positional flags) — is the SAME proven machinery as razz3, so
// this shares the trainer/measure/parallel stack byte-for-byte.

const { shuffledDeck, rankOf, suitOf, lowRankOf } = require('../engine/cards');
const { bestHi7, bestLo8, lowRankCount } = require('../eval/stud8');

const ANTE = 1, BRING = 2, SMALL = 4, BIG = 8;
const DEFAULT_CAP = 2;        // ← same GO target as razz3 (2-player stud8 uses 4)
const DEFAULT_ANTES = 8;      // ← 8-max dead-money overlay
const NSEAT = 3;
const STREET_NAMES = ['3rd Street', '4th Street', '5th Street', '6th Street', '7th Street'];

function betSize(street) { return street < 2 ? SMALL : BIG; }

// ── stud8 board value (HIGHER = stronger poker fragment). Ported VERBATIM from
// games/stud8-game.js boardValue: groups by count then rank (ace high), suit of
// the single highest card breaks an exact tie. Used for first-to-act (4th+): the
// HIGHEST board acts first (mirror of razz's lowest-board).
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
  let hi = up[0];
  for (const c of up) if (rankOf(c) > rankOf(hi) || (rankOf(c) === rankOf(hi) && suitOf(c) > suitOf(hi))) hi = c;
  return v * 4 + suitOf(hi);
}

// Door "lowness" for bring-in (LOWER = brings in). Single 3rd-street upcard, ace
// HIGH (rankOf), suit c<d<h<s breaks an exact tie (lower suit brings in). Mirror
// of razz's razzBoardValue-max bring-in. Returns rank*4+suit so the min over
// seats is the lowest card, suit-tiebroken — matching games/stud8-game.js.
function doorBringInValue(card) { return rankOf(card) * 4 + suitOf(card); }

// ── ownBucket — hi/lo-aware, adapted VERBATIM from games/stud8-game.js. ──
// pairCls (-/T/2/A/p/P) × distinct-low count (0..4) × ace × flush × made-low
// quality (Ls ≤6 / Lw 7-8). Distinguishes made-low draws (L high / lowFlag),
// big pairs (P, A), and junk (- with low L). `street` sets the flush threshold
// (3 suited on 3rd/4th, 4 on 5th+), matching the 2-player game.
function ownBucketCards(cards, street) {
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

  const L = Math.min(4, lowRankCount(cards));
  const suits = [0, 0, 0, 0];
  for (const c of cards) suits[suitOf(c)]++;
  const flushFlag = Math.max(...suits) >= (street < 2 ? 3 : 4) ? 'f' : '';
  const aceFlag = cards.some(c => rankOf(c) === 14) ? 'a' : '';

  let lowFlag = '';
  const lo = bestLo8(cards);
  if (lo !== null) lowFlag = Math.floor(lo / Math.pow(15, 4)) <= 6 ? 'Ls' : 'Lw';
  return `${pairCls}${L}${aceFlag}${flushFlag}${lowFlag}`;
}

// ── oppBucket — single opponent's visible board. Ported VERBATIM from
// games/stud8-game.js oppBucket. ──
function oppBucketUp(up) {
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

// Optional coarse opponent summary (3 opaque levels) — only if opts.coarseOpp
// set (a memory-pressure fallback, off by default). Labels are arbitrary bucket
// ids: 'w' = paired board, 's' = ≥3 distinct lows, 'm' = otherwise.
function oppCoarseUp(up) {
  const paired = (() => { const c = {}; for (const x of up) { const r = rankOf(x); c[r] = (c[r] || 0) + 1; if (c[r] >= 2) return true; } return false; })();
  if (paired) return 'w';
  return lowRankCount(up) >= 3 ? 's' : 'm';
}

// ── Positional entering-range priors (placeholder heuristic) ──────────────
// Same mechanism as razz3: a per-seat weight over the SEAT'S 3rd-street door
// low-rank (1..13, ace low). A placeholder biasing the root deal — real hand
// data / the entry-derivation fixed-point replaces it. LOWER door rank = more
// weight (low cards continue). Real stud8 also continues split big pairs, but
// this stand-in is intentionally coarse; UNIFORM_PRIORS turns it off entirely.
function positionalPrior(tightness) {
  const w = [];
  for (let r = 1; r <= 13; r++) {
    let x = Math.pow(1 - 0.55 * tightness, r - 1); // geometric decay in door rank
    if (r >= 9) x *= (1 - 0.85 * tightness);        // paint cliff
    if (r >= 11) x *= (1 - 0.9 * tightness);
    w.push(Math.max(1e-4, x));
  }
  return w;
}
const DEFAULT_PRIORS = [positionalPrior(0.85), positionalPrior(0.7), positionalPrior(0.5)];
const UNIFORM_PRIORS = [Array(13).fill(1), Array(13).fill(1), Array(13).fill(1)];

function clone(s) {
  return {
    deck: s.deck,
    down: [s.down[0].slice(), s.down[1].slice(), s.down[2].slice()],
    up: [s.up[0].slice(), s.up[1].slice(), s.up[2].slice()],
    street: s.street,
    phase: s.phase,
    toAct: s.toAct,
    bets: s.bets,
    base: s.base,
    contrib: s.contrib.slice(),
    acted: s.acted.slice(),
    folded: s.folded.slice(),
    bringIn: s.bringIn,
    lastAgg: s.lastAgg,
    hist: s.hist,
    curSeq: s.curSeq,
    starter: s.starter,
    deadPot: s.deadPot,
    log: s.log.slice(),
  };
}

function allCards(s, p) { return s.down[p].concat(s.up[p]); }

function makeGame(opts = {}) {
  const CAP = opts.cap != null ? opts.cap : DEFAULT_CAP;
  const ANTES = opts.antes != null ? opts.antes : DEFAULT_ANTES;
  const priors = opts.priors || DEFAULT_PRIORS;
  const coarseOpp = !!opts.coarseOpp;
  const oppSummary = coarseOpp ? oppCoarseUp : oppBucketUp;

  // OWNERLESS dead-money overlay = (ANTES - NSEAT) leftover antes from the folded
  // seats (the NSEAT live antes are already in each seat's contrib). 8 antes, 3
  // live → 5 dead. This makes the 3-seat game general-sum (utilities sum to the
  // dead overlay, not 0 — chips are conserved: the surplus is exactly this).
  const deadPot = (ANTES - NSEAT) * ANTE;

  // Per-seat CDF over door low-rank 1..13 for the biased root deal.
  const priorCdf = priors.map(w => {
    const tot = w.reduce((a, b) => a + b, 0);
    const c = []; let s = 0;
    for (let i = 0; i < 13; i++) { s += w[i] / tot; c.push(s); }
    return c;
  });

  // Which live seat brings in: LOWEST door card (mirror of razz). Suit c<d<h<s
  // breaks an exact tie (lower suit brings in), lower seat index breaks a full
  // tie (impossible with distinct cards). games/stud8-game.js rule.
  function bringInSeat(up) {
    let best = Infinity, bi = 0;
    for (let p = 0; p < NSEAT; p++) {
      const v = doorBringInValue(up[p][0]);
      if (v < best) { best = v; bi = p; }
    }
    return bi;
  }

  // From 4th street on, the HIGHEST (strongest) showing board among LIVE seats
  // acts first (mirror of razz). boardValue's suit tiebreak makes exact ties
  // across distinct boards essentially impossible; lower seat index breaks any.
  function firstActorLive(up, folded) {
    let best = -Infinity, bi = -1;
    for (let p = 0; p < NSEAT; p++) {
      if (folded[p]) continue;
      const v = boardValue(up[p]);
      if (v > best) { best = v; bi = p; }
    }
    return bi;
  }

  // Deal 3rd street with REAL card removal for all 8 seats (foldedBurn), then
  // deal the 3 modeled seats, biasing each DOOR card by its positional prior via
  // bounded rejection sampling against the live deck. Identical structure to
  // razz3.newHand — reused verbatim (the deal is game-agnostic).
  function newHand(rng) {
    const deck = shuffledDeck(rng);
    // Burn the 5 folded seats' 3rd-street cards (3 each: 2 down + 1 up) — faithful
    // removal so the modeled seats' unseen space is correct. Folded seats are the
    // field that already left; they are NOT biased.
    const foldedBurn = (ANTES - NSEAT) * 3;
    const foldedCards = deck.slice(0, foldedBurn);
    let scan = foldedBurn;

    const down = [[], [], []];
    const up = [[], [], []];
    const used = new Set(foldedCards);
    for (let p = 0; p < NSEAT; p++) {
      down[p] = [deck[scan++], deck[scan++]];  // two down cards (unbiased)
      const cdf = priorCdf[p];
      let doorCard = null;
      for (let tries = 0; tries < 40 && scan < deck.length; tries++) {
        const cand = deck[scan];
        const lr = lowRankOf(cand);            // 1..13
        const wAccept = (cdf[lr - 1] - (lr > 1 ? cdf[lr - 2] : 0)); // marginal prob mass
        if (rng() < wAccept * 13) { doorCard = cand; scan++; break; }
        scan++;
      }
      if (doorCard == null) doorCard = deck[scan++];
      up[p] = [doorCard];
    }
    for (const arr of down) for (const c of arr) used.add(c);
    for (const arr of up) for (const c of arr) used.add(c);

    // Remaining live deck (streets 4..7): everything not dealt/burned.
    const live = [];
    for (let i = 0; i < deck.length; i++) if (!used.has(deck[i])) live.push(deck[i]);

    const bi = bringInSeat(up);
    return {
      deck: live,
      down, up,
      street: 0,
      phase: 'bet',
      toAct: bi,
      bets: 0,
      base: ANTE,
      contrib: [ANTE, ANTE, ANTE],
      acted: [false, false, false],
      folded: [false, false, false],
      bringIn: bi,
      lastAgg: -1,
      hist: '',
      curSeq: '',
      starter: bi,
      deadPot,
      log: [],
    };
  }

  function liveSeats(s) { const o = []; for (let p = 0; p < NSEAT; p++) if (!s.folded[p]) o.push(p); return o; }

  const game = {
    id: 'stud83',
    name: 'stud8-3 (full hi/lo 8-or-better, 8-max economics)',
    CAP, ANTES, deadPot, priors, coarseOpp, NSEAT,

    newHand,
    liveSeats,

    isTerminal(s) {
      if (liveSeats(s).length === 1) return true;     // 2 folded → scoop
      return s.phase === 'showdown';
    },

    // HI/LO 8-or-better split over the live seats. deadPot is external money, so
    // utilities sum to deadPot (general-sum), NOT 0 — chips are conserved (the
    // surplus is exactly the dead antes). A seat's share equals
    // equity.multiwayShare('stud8', seatCards, [otherLiveCards...]) (verified).
    utility(s) {
      const live = liveSeats(s);
      const pot = s.deadPot + s.contrib.reduce((a, b) => a + b, 0);
      const shares = [0, 0, 0];
      if (live.length === 1) {
        shares[live[0]] = 1;
      } else {
        const hi = {}, lo = {};
        for (const p of live) { const cs = allCards(s, p); hi[p] = bestHi7(cs); lo[p] = bestLo8(cs); }
        const maxHi = Math.max(...live.map(p => hi[p]));
        const hiWinners = live.filter(p => hi[p] === maxHi);
        const quals = live.filter(p => lo[p] !== null);
        if (quals.length === 0) {
          // no qualifying low → the high winner(s) scoop the whole pot
          for (const p of hiWinners) shares[p] += 1 / hiWinners.length;
        } else {
          const minLo = Math.min(...quals.map(p => lo[p]));
          const loWinners = quals.filter(p => lo[p] === minLo);
          for (const p of hiWinners) shares[p] += 0.5 / hiWinners.length;
          for (const p of loWinners) shares[p] += 0.5 / loWinners.length;
        }
      }
      const out = [];
      for (let p = 0; p < NSEAT; p++) out.push(shares[p] * pot - s.contrib[p]);
      return out;
    },

    isChance(s) { return s.phase === 'deal'; },

    sampleChance(s) {
      const n = clone(s);
      n.deck = n.deck.slice();
      n.street++;
      const faceUp = n.street <= 3; // 7th street dealt down
      for (let p = 0; p < NSEAT; p++) {
        if (n.folded[p]) continue;
        const c = n.deck.pop();
        if (faceUp) n.up[p].push(c); else n.down[p].push(c);
      }
      n.phase = 'bet';
      n.bets = 0;
      n.base = n.contrib[n.starter];
      n.acted = [false, false, false];
      n.lastAgg = -1;
      n.toAct = firstActorLive(n.up, n.folded);   // HIGHEST board acts first
      n.starter = n.toAct;
      n.curSeq = '';
      n.log.push({ p: -1, a: STREET_NAMES[n.street] + ' dealt' });
      return n;
    },

    currentPlayer(s) { return s.toAct; },

    legalActions(s) {
      if (s.street === 0 && s.hist === '') return ['br', 'co']; // forced open (bring-in seat)
      const p = s.toAct;
      const facing = s.contrib.reduce((m, c, i) => (i !== p && !s.folded[i] ? Math.max(m, c) : m), 0) - s.contrib[p];
      if (facing > 0) {
        const acts = ['f', 'c'];
        if (s.bets < CAP) acts.push('r');
        return acts;
      }
      const acts = ['k'];
      if (s.bets < CAP) acts.push('b');
      return acts;
    },

    _high(s) { let h = 0; for (let i = 0; i < NSEAT; i++) if (!s.folded[i]) h = Math.max(h, s.contrib[i]); return h; },

    _nextLive(s, from) {
      for (let k = 1; k <= NSEAT; k++) { const c = (from + k) % NSEAT; if (!s.folded[c]) return c; }
      return from;
    },

    _closeOrAdvance(n, p) {
      const live = [];
      for (let i = 0; i < NSEAT; i++) if (!n.folded[i]) live.push(i);
      if (live.length === 1) { n.phase = 'showdown'; return; }
      const high = this._high(n);
      const allActed = live.every(i => n.acted[i]);
      const allMatched = live.every(i => n.contrib[i] === high);
      if (allActed && allMatched) {
        if (n.street === 4) n.phase = 'showdown';
        else { n.phase = 'deal'; n.hist += '/'; }
        return;
      }
      n.toAct = this._nextLive(n, p);
    },

    applyAction(s, a) {
      const n = clone(s);
      const p = n.toAct;
      const high = this._high(n);
      const facing = high - n.contrib[p];

      if (a === 'br') {
        n.contrib[p] = n.base + BRING;
        n.hist += 'i'; n.curSeq += 'i';
        n.log.push({ p, a: `brings in for ${BRING}` });
        n.toAct = this._nextLive(n, p);
        return n;
      }
      if (a === 'co') {
        n.contrib[p] = n.base + SMALL;
        n.bets = 1; n.acted[p] = true;
        n.lastAgg = p;
        n.acted = [false, false, false]; n.acted[p] = true; // completion re-opens
        n.hist += 'o'; n.curSeq += 'o';
        n.log.push({ p, a: `completes to ${SMALL}` });
        n.toAct = this._nextLive(n, p);
        return n;
      }

      n.acted[p] = true;
      n.hist += a; n.curSeq += a;

      if (a === 'f') {
        n.folded[p] = true;
        n.log.push({ p, a: 'folds' });
        this._closeOrAdvance(n, p);
        return n;
      }
      if (a === 'c' || a === 'k') {
        n.contrib[p] += Math.max(0, facing);
        n.log.push({ p, a: a === 'k' ? 'checks' : 'calls' });
        this._closeOrAdvance(n, p);
        return n;
      }
      // bet / raise — RE-OPENS action to every other live seat.
      if (n.bets === 0) n.contrib[p] = n.base + betSize(n.street);
      else n.contrib[p] = high + betSize(n.street);
      n.bets++;
      n.lastAgg = p;
      n.acted = [false, false, false]; n.acted[p] = true;
      n.log.push({ p, a: n.bets === 1 ? `bets ${betSize(n.street)}` : `raises to ${n.contrib[p] - n.base}` });
      n.toAct = this._nextLive(n, p);
      return n;
    },

    // ── Infoset key ─────────────────────────────────────────────────────
    // Own hi/lo bucket + UNORDERED pair of LIVE-opponent boards + per-street
    // exact history + quantized pot + positional flags. Same shape as razz3's
    // key (trainer-compatible). Folded opponents drop from the pair (their board
    // is dead), so the opponent dimension shrinks as the pot narrows to 2-way.
    infosetKey(s) {
      const p = s.toAct;
      const potBin = Math.min(12, Math.round((s.contrib[0] + s.contrib[1] + s.contrib[2] + s.deadPot) / (2 * SMALL)));
      const first = s.starter === p ? 1 : 0;
      const own = ownBucketCards(allCards(s, p), s.street);
      const opps = [];
      for (let q = 0; q < NSEAT; q++) if (q !== p && !s.folded[q]) opps.push(oppSummary(s.up[q]));
      opps.sort();
      const oStr = opps.join('&');
      const bring = s.bringIn === p ? 1 : 0;
      const nlive = this.liveSeats(s).length;
      return `${s.street}|p${potBin}|${s.curSeq}|f${first}|${own}|o${oStr}|n${nlive}|b${bring}`;
    },

    actionLabel(a, s) {
      if (a === 'br') return `Bring-in ${BRING}`;
      if (a === 'co') return `Complete to ${SMALL}`;
      if (a === 'f') return 'Fold';
      if (a === 'k') return 'Check';
      const p = s.toAct; const high = this._high(s);
      if (a === 'c') return `Call ${Math.max(0, high - s.contrib[p])}`;
      if (s.bets === 0) return s.street === 0 ? `Complete to ${betSize(s.street)}` : `Bet ${betSize(s.street)}`;
      return `Raise ${betSize(s.street)}`;
    },

    // Exposed for tests / tools.
    _bringInSeat: bringInSeat,
    _firstActorLive: firstActorLive,
  };
  return game;
}

module.exports = {
  makeGame,
  boardValue,
  doorBringInValue,
  ownBucketCards,
  oppBucketUp,
  positionalPrior,
  DEFAULT_PRIORS,
  UNIFORM_PRIORS,
  ANTE, BRING, SMALL, BIG, DEFAULT_CAP, DEFAULT_ANTES, NSEAT,
};
