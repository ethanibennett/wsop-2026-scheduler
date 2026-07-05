// ── razz3 — FULL 13-rank 3-player razz ("8-max economics, ≤3 in a hand") ──
// The production scale-up of the feasibility spike (microrazz3). This is the
// REAL razz game — full 52-card deck, the exact razz.js ace-to-five eval, the
// ownBucket abstraction ported from games/razz-game.js (v2: the hole-aware
// earlyLowTier H-tier is appended on 3rd/4th street, imported from that file) —
// but played by THREE seats with the proven multiway mechanics from
// microrazz3 (re-opening raises, fold-to-2-way collapse, dead-money overlay,
// whole-pot-low showdown). The 2-player games/razz-game.js is left UNTOUCHED
// (a grind + trainer are live on it); this is a self-contained sibling.
//
// FRAMING: "8-max economics, ≤3 players in a hand." Real razz is 8-handed on
// 3rd street, but by later streets a contested pot is almost always ≤3-way.
// We model the 3 seats that took a card past 3rd, seed the pot with the DEAD
// ANTES of all 8 seats (the overlay that makes the game general-sum), and bias
// the root deal by a per-seat positional ENTERING-RANGE PRIOR (a placeholder
// tight full-ring continuation range — real hand data replaces it later).
//
// ── The coarsening the spike prescribed (to hit ~1–3M reached infosets) ──
//   (1) BETTING CAP 2  (opts.cap, default 2) — the single biggest lever. The
//       2-player game uses cap 4; at 3 seats each raise re-opens to TWO other
//       seats, so cap 4 explodes the per-street action tree. Cap 2 keeps the
//       multiway betting subtree tractable with no strategic loss that matters
//       for a blueprint (3-bet-capped razz is already deep multiway).
//   (2) UNORDERED opponent-board pair — a seat sees TWO opponents' boards. We
//       summarize each opponent with oppBucket (from razz-game.js) and then
//       store the pair UNORDERED (sorted). 26 single-opp buckets → 26²=676
//       ordered → 351 unordered pairs. ZERO information loss (which physical
//       seat holds which board is not decision-relevant in symmetric razz),
//       exactly halving the opponent dimension.
//   (3) (optional) coarsen the OPPONENT bucket — opts.coarseOpp collapses
//       oppBucket to a 3-level low-strength summary if the count still runs
//       hot. Off by default; the L1 opp bucket already ≈8 values.
//
// Everything else (ownBucket up to 63, the razz eval, bring-in = highest
// upcard, lowest-board-acts-first from 4th on, per-street exact history) is the
// SAME abstraction the 2-player blueprint uses — so this shares the trusted
// razz strategic axis.

const { shuffledDeck, cardStr, rankOf, suitOf, lowRankOf } = require('../engine/cards');
const { bestLowRazz } = require('../eval/razz');
// v2 hole-aware early-street tier — imported from the SHIPPED 2-player fix
// (games/razz-game.js earlyLowTier: coarse H0-H5 low-strength tier from
// distinct ace-low ranks <=8 + a wheel cut). Same function, one source of
// truth. HU ship gates: best-response 3.509 → 1.424 chips/hand.
const { earlyLowTier } = require('../games/razz-game');

const ANTE = 1, BRING = 2, SMALL = 4, BIG = 8;
const DEFAULT_CAP = 2;        // ← the spike GO target (2-player razz uses 4)
const DEFAULT_ANTES = 8;      // ← 8-max dead-money overlay (user upgraded 6→8)
const NSEAT = 3;
const STREET_NAMES = ['3rd Street', '4th Street', '5th Street', '6th Street', '7th Street'];

function betSize(street) { return street < 2 ? SMALL : BIG; }

function lowRankCount(cards) {
  const seen = {};
  for (const c of cards) seen[lowRankOf(c)] = 1;
  return Object.keys(seen).length;
}

// ── razz board value (LOWER = better). Ported verbatim from razz-game.js. ──
function razzBoardValue(up) {
  const lr = up.map(lowRankOf).sort((a, b) => b - a);
  const counts = {};
  for (const r of lr) counts[r] = (counts[r] || 0) + 1;
  let dup = 0;
  for (const r of Object.keys(counts)) dup += counts[r] - 1;
  let v = dup;
  for (const r of lr) v = v * 15 + r;
  return v;
}

// ── ownBucket — ported VERBATIM from games/razz-game.js (up to 63 values). ──
// pairClass(4) × lowRankCount(1..5) × aceFlag(2) × madeLowFlag(4) but only the
// reachable combinations occur; the 2-player blueprint counts ≤63.
function ownBucketCards(cards) {
  const counts = {};
  for (const c of cards) { const r = lowRankOf(c); counts[r] = (counts[r] || 0) + 1; }
  const groups = Object.keys(counts)
    .map(r => ({ r: parseInt(r, 10), n: counts[r] }))
    .sort((a, b) => (b.n - a.n) || (b.r - a.r));

  let pairCls = '-';
  if (groups[0].n >= 3) pairCls = 'T';
  else if (groups[0].n === 2 && groups[1] && groups[1].n === 2) pairCls = '2';
  else if (groups[0].n === 2) pairCls = groups[0].r <= 8 ? 'p' : 'P';

  const L = Math.min(5, lowRankCount(cards));
  const aceFlag = cards.some(c => lowRankOf(c) === 1) ? 'a' : '';

  let lowFlag = '';
  const lo = bestLowRazz(cards);
  if (lo < Math.pow(15, 5)) {
    const hiRank = Math.floor(lo / Math.pow(15, 4)) % 15;
    lowFlag = hiRank <= 6 ? 'Ls' : (hiRank <= 8 ? 'Lm' : 'Lw');
  }
  return `${pairCls}${L}${aceFlag}${lowFlag}`;
}

// ── oppBucket — ported VERBATIM from games/razz-game.js (single opponent). ──
function oppBucketUp(up) {
  const L = lowRankCount(up);
  const counts = {};
  let paired = '';
  for (const c of up) { const r = lowRankOf(c); counts[r] = (counts[r] || 0) + 1; if (counts[r] >= 2) paired = 'P'; }
  const aceUp = up.some(c => lowRankOf(c) === 1) ? 'a' : '';
  const big = up.some(c => lowRankOf(c) >= 9) ? 'h' : '';
  return `${L}${paired}${aceUp}${big}`;
}

// Optional coarse opponent summary (3 levels) — only if opts.coarseOpp set.
function oppCoarseUp(up) {
  const L = lowRankCount(up);
  const paired = (() => { const c = {}; for (const x of up) { const r = lowRankOf(x); c[r] = (c[r] || 0) + 1; if (c[r] >= 2) return true; } return false; })();
  if (paired) return 'w';            // paired board = weak
  return L >= 3 ? 's' : 'm';         // ≥3 distinct lows = strong, else mid
}

// ── Positional entering-range priors (placeholder heuristic) ──────────────
// Per-seat weight over the SEAT'S 3rd-street door-card low-rank (1..13,
// ace-low). Real razz 3rd-street continuation is tight and door-dependent:
// you continue almost always with a low door, rarely with a paint door, and
// tighter out of position. These are stand-ins biasing the root deal; real
// hand data will replace them. Index i = door low-rank (i+1). Seat 0 is
// modeled as the tightest (earliest / bring-in-ish), seat 2 the widest.
// LOWER door rank = better = higher weight.
function positionalPrior(tightness) {
  // tightness in [0,1]; 0 = loosest, 1 = tightest. Weight = base^rank with a
  // paint cliff (ranks ≥9 heavily discounted) that steepens with tightness.
  const w = [];
  for (let r = 1; r <= 13; r++) {
    let x = Math.pow(1 - 0.55 * tightness, r - 1); // geometric decay in door rank
    if (r >= 9) x *= (1 - 0.85 * tightness);       // paint cliff
    if (r >= 11) x *= (1 - 0.9 * tightness);
    w.push(Math.max(1e-4, x));
  }
  return w;
}
// Default per-seat tightness: seat0 tightest → seat2 loosest.
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

  // deadPot = (ANTES - NSEAT) leftover antes from the folded seats, PLUS the
  // NSEAT live antes are already in each seat's contrib. So the OWNERLESS
  // overlay is (ANTES - NSEAT) * ANTE. With 8 antes and 3 live seats → 5 dead.
  const deadPot = (ANTES - NSEAT) * ANTE;

  // Per-seat CDF over door low-rank 1..13 for the biased root deal.
  const priorCdf = priors.map(w => {
    const tot = w.reduce((a, b) => a + b, 0);
    const c = []; let s = 0;
    for (let i = 0; i < 13; i++) { s += w[i] / tot; c.push(s); }
    return c;
  });

  // Which live seat brings in: HIGHEST upcard (worst razz board). Suit breaks
  // an exact tie (higher suit brings in), mirroring the 2-player rule.
  function bringInSeat(up) {
    let best = -1, bi = 0;
    for (let p = 0; p < NSEAT; p++) {
      const v = razzBoardValue(up[p]);
      if (v > best || (v === best && suitOf(up[p][0]) > suitOf(up[bi][0]))) { best = v; bi = p; }
    }
    return bi;
  }

  // From 4th street on, the LOWEST (best) razz board among LIVE seats acts
  // first; lower seat index wins ties (no suit tiebreak).
  function firstActorLive(up, folded) {
    let best = Infinity, bi = -1;
    for (let p = 0; p < NSEAT; p++) {
      if (folded[p]) continue;
      const v = razzBoardValue(up[p]);
      if (v < best) { best = v; bi = p; }
    }
    return bi;
  }

  // Deal 3rd street with REAL card removal for all 8 seats: draw the 5 folded
  // seats' door+downs from the same deck so removal is faithful, but only the
  // 3 modeled seats' cards are kept. The modeled seats' DOOR ranks are biased
  // by the positional prior via rejection sampling against the live deck.
  function newHand(rng) {
    const deck = shuffledDeck(rng);
    let idx = 0;
    // Burn the 5 folded seats' 3rd-street cards (3 each: 2 down + 1 up) — real
    // removal (17 cards) so the modeled seats' unseen space is correct. We do
    // NOT bias folded seats; they represent the field that already left.
    const foldedBurn = (ANTES - NSEAT) * 3;
    const foldedCards = deck.slice(0, foldedBurn);
    idx = foldedBurn;

    // Deal the 3 modeled seats. To respect the positional prior on the DOOR
    // (up) card while keeping true removal, we pull cards for each seat and, if
    // the seat's door rank is rejected by its prior, we swap the door with a
    // later deck card (rejection against the remaining deck). Bounded attempts.
    const down = [[], [], []];
    const up = [[], [], []];
    const used = new Set(foldedCards);
    function takeAt(i) { const c = deck[i]; return c; }
    let scan = idx;
    for (let p = 0; p < NSEAT; p++) {
      // two down cards (unbiased)
      down[p] = [deck[scan++], deck[scan++]];
      // door card: accept with prob prior[rank]/maxPrior via rejection over the
      // remaining deck (bounded 40 tries → fall back to next card).
      const cdf = priorCdf[p];
      let doorCard = null;
      for (let tries = 0; tries < 40 && scan < deck.length; tries++) {
        const cand = deck[scan];
        const lr = lowRankOf(cand);            // 1..13
        // acceptance prob proportional to prior weight at this rank
        const wAccept = (cdf[lr - 1] - (lr > 1 ? cdf[lr - 2] : 0)); // marginal prob mass
        if (rng() < wAccept * 13) { doorCard = cand; scan++; break; }
        // rejected: rotate this card to the end region (skip it) and try next
        scan++;
      }
      if (doorCard == null) doorCard = deck[scan++];
      up[p] = [doorCard];
    }
    for (const arr of down) for (const c of arr) used.add(c);
    for (const arr of up) for (const c of arr) used.add(c);

    // Remaining live deck (for streets 4..7): everything not dealt/burned.
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
    id: 'razz3',
    name: 'razz-3 (full 13-rank, 8-max economics)',
    CAP, ANTES, deadPot, priors, coarseOpp, NSEAT,

    newHand,
    liveSeats,

    isTerminal(s) {
      if (liveSeats(s).length === 1) return true;     // 2 folded → scoop
      return s.phase === 'showdown';
    },

    // Whole-pot low over live seats; ties split. deadPot is external money →
    // utilities do NOT sum to zero (general-sum, as the spike requires).
    utility(s) {
      const live = liveSeats(s);
      const pot = s.deadPot + s.contrib.reduce((a, b) => a + b, 0);
      let winners;
      if (live.length === 1) winners = live;
      else {
        const scores = live.map(p => bestLowRazz(allCards(s, p)));
        const best = Math.min(...scores);
        winners = live.filter((p, i) => scores[i] === best);
      }
      const share = 1 / winners.length;
      const out = [];
      for (let p = 0; p < NSEAT; p++) out.push((winners.includes(p) ? share * pot : 0) - s.contrib[p]);
      return out;
    },

    isChance(s) { return s.phase === 'deal'; },

    sampleChance(s) {
      const n = clone(s);
      n.deck = n.deck.slice();
      n.street++;
      const faceUp = n.street <= 3; // 7th street dealt down
      // Deal one card to each LIVE seat (folded seats get nothing). Card
      // removal is already correct — deck excludes all dealt+burned cards.
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
      n.toAct = firstActorLive(n.up, n.folded);
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
      // Round closes when every live seat has acted since the last aggression
      // AND all live seats have matched the high contribution.
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
    // Own bucket + UNORDERED pair of live-opponent boards + per-street exact
    // history + quantized pot + positional flags. Folded opponents drop out of
    // the pair (their board is dead), so the opponent dimension shrinks as the
    // pot narrows to 2-way — the fold-to-2-way collapse is reflected in the key.
    infosetKey(s) {
      const p = s.toAct;
      const potBin = Math.min(12, Math.round((s.contrib[0] + s.contrib[1] + s.contrib[2] + s.deadPot) / (2 * SMALL)));
      const first = s.starter === p ? 1 : 0;
      // v2 own-bucket: on 3rd/4th street (streets 0-1) append the hole-aware
      // H-tier so 2-3-4 and J-Q-K no longer share an infoset; 5th+ unchanged
      // (byte-identical v1 keys). Mirrors games/razz-game.js ownBucketV2.
      const mine = allCards(s, p);
      let own = ownBucketCards(mine);
      if (s.street <= 1) own += `H${earlyLowTier(mine)}`;
      // opponent board summaries for LIVE opponents only, sorted (unordered).
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
  };
  return game;
}

module.exports = {
  makeGame,
  razzBoardValue,
  ownBucketCards,
  oppBucketUp,
  positionalPrior,
  DEFAULT_PRIORS,
  UNIFORM_PRIORS,
  ANTE, BRING, SMALL, BIG, DEFAULT_CAP, DEFAULT_ANTES,
};
