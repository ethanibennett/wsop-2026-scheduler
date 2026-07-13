// ── Razz (ace-to-five lowball stud, heads-up fixed limit) ───
// Chips: ante 1, bring-in 2, small bet 4 (3rd/4th st), big bet 8
// (5th-7th). Streets indexed 0..4 = 3rd..7th. Betting is IDENTICAL to
// Stud 8 (same tree, cap, deal layout); only three GameSpec seams differ
// (mirror solver/neural/razz_game.py):
//
//   1. bring-in  — the HIGHEST upcard brings in (ace plays LOW, so it
//      never brings in; higher suit breaks an exact-rank tie). Inverts
//      stud8's lowest-card bring-in.
//   2. first act — from 4th street on, the LOWEST (best) razz board acts
//      first (seat 0 wins ties, no suit tiebreak). Inverts stud8's
//      best-high-board-acts-first.
//   3. showdown  — the lowest ace-to-five low wins the WHOLE pot; no
//      hi/lo split, no 8-or-better qualifier; equal lows split.
//
// Straights and flushes never count; pairs hurt; the nut low is the
// wheel 5-4-3-2-A. Abstraction: own bucket = pair class + distinct-low-
// rank count + ace/made-low flags; opponent bucket = visible board
// features. Betting history is kept exactly for the current street.

const { shuffledDeck, cardStr, rankOf, suitOf, lowRankOf } = require('../engine/cards');
const { bestLowRazz } = require('../eval/razz');

const ANTE = 1, BRING = 2, SMALL = 4, BIG = 8, CAP = 4;
const STREET_NAMES = ['3rd Street', '4th Street', '5th Street', '6th Street', '7th Street'];

function betSize(street) { return street < 2 ? SMALL : BIG; }

// Distinct low-rank count among `cards` (ace-low ranks 1..13). Used in
// the abstraction buckets (how many cards can extend a low).
function lowRankCount(cards) {
  const seen = {};
  for (const c of cards) seen[lowRankOf(c)] = 1;
  return Object.keys(seen).length;
}

// Partial-board strength for the razz seat-order rules; LOWER = better
// (lower) low. Mirrors razz_board_value (razz_game.py:28-40): sort ace-
// low ranks high->low, count duplicates, set v = #duplicates then fold
// each rank in via v*15+r. Any pair is strictly worse than any no-pair
// board (the dup term dominates); among no-pair boards a higher top card
// is worse. NO suit tiebreak (suit only matters for the 3rd-st bring-in).
function razzBoardValue(up) {
  const lr = up.map(lowRankOf).sort((a, b) => b - a); // ace-low ranks, high->low
  const counts = {};
  for (const r of lr) counts[r] = (counts[r] || 0) + 1;
  let dup = 0;
  for (const r of Object.keys(counts)) dup += counts[r] - 1;
  let v = dup; // no-pair (dup=0) is best
  for (const r of lr) v = v * 15 + r;
  return v;
}

// From 4th street on, the lowest (best) razz board acts first; seat 0
// wins board-value ties (razz_first_actor, razz_game.py:43-45).
function firstActor(up0, up1) {
  return razzBoardValue(up0) <= razzBoardValue(up1) ? 0 : 1;
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

// Own-hand abstraction bucket. Deliberately COARSE (more iterations per
// infoset, smaller table). Razz has a single strategic dimension — low
// strength — so the bucket captures pair penalty, low-rank breadth, the
// best made low, and an ace flag.
function ownBucket(s, p) {
  const cards = allCards(s, p);
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

  // Made-low strength: bucket the best five-card low's high card (the
  // leading rank of a no-pair low) into strong(<=6)/mid(7-8)/weak.
  let lowFlag = '';
  const lo = bestLowRazz(cards);
  if (lo < Math.pow(15, 5)) { // category 0 (no pair) -> a real "made" low
    const hiRank = Math.floor(lo / Math.pow(15, 4)) % 15;
    lowFlag = hiRank <= 6 ? 'Ls' : (hiRank <= 8 ? 'Lm' : 'Lw');
  }
  return `${pairCls}${L}${aceFlag}${lowFlag}`;
}

// ── v2 bucket (hole-aware early streets) — the SHIPPED default ───────
// The v1 bucket above is HOLE-BLIND on 3rd/4th street: `L` counts
// DISTINCT ranks (not low ones) and lowFlag is a constant 'Ls' below 5
// cards (bestLowRazz's <5-card score never reaches the 15^4 digit, so
// hiRank decodes to 0), so 2-3-4 and J-Q-K both read '-3Ls' and the
// v1 blueprint completed ~flat across hole strength. v2 appends a
// COARSE low-strength tier on 3rd/4th street only (streets where the
// v1 made-low flag is dead); from 5th street on v2 == v1 byte-for-byte.
//
//   n8 = # DISTINCT ace-low ranks <= 8 (cards that play toward a low)
//   tier 0: n8 >= 4                       (4th st only: four to an 8)
//   tier 1: n8 == 3, 3rd-lowest rank <= 5 (three wheel-range cards)
//   tier 2: n8 == 3                       (three to an 8-low)
//   tier 3: n8 == 2                       (two low + brick/pair)
//   tier 4: n8 == 1
//   tier 5: n8 == 0                       (e.g. J-Q-K)
//
// Monotone: a strictly lower holding never gets a higher tier. <= 6
// values on <= 3,300 early-street keys keeps the infoset blowup tiny.
// SHIPPED 2026-07-05: the DEFAULT export now uses this bucket, paired
// with strategies/razz.json retrained on v2 keys (2M iters, 80,404
// infosets, best-response LBR 1.424 ± 0.241 vs v1's 3.509 ± 0.304 by
// the same lbr-stud meter/seed). The old hole-blind variant survives as
// `module.exports.v1` + strategies/razz.frozen-v1.json for provenance.
function earlyLowTier(cards) {
  const seen = {};
  for (const c of cards) seen[lowRankOf(c)] = 1;
  const ranks = Object.keys(seen).map(Number).sort((a, b) => a - b);
  const n8 = ranks.filter(r => r <= 8).length;
  if (n8 >= 4) return 0;
  if (n8 === 3) return ranks[2] <= 5 ? 1 : 2;
  return 5 - n8; // 3 / 4 / 5 for n8 = 2 / 1 / 0
}

function ownBucketV2(s, p) {
  const base = ownBucket(s, p);
  if (s.street > 1) return base; // 5th st on: identical to v1
  return `${base}H${earlyLowTier(allCards(s, p))}`;
}

// Opponent visible-board bucket
function oppBucket(s, p) {
  const up = s.up[1 - p];
  const L = lowRankCount(up);
  const counts = {};
  let paired = '';
  for (const c of up) { const r = lowRankOf(c); counts[r] = (counts[r] || 0) + 1; if (counts[r] >= 2) paired = 'P'; }
  const aceUp = up.some(c => lowRankOf(c) === 1) ? 'a' : '';
  // # of "high" (bad-for-razz) board cards: ranks 9..13 (ace-low).
  const big = up.some(c => lowRankOf(c) >= 9) ? 'h' : '';
  return `${L}${paired}${aceUp}${big}`;
}

function endStreet(s) {
  if (s.street === 4) { s.phase = 'showdown'; return; }
  s.phase = 'deal';
  s.hist += '/';
}

// Best-low label for the viewer. Decodes bestLowRazz's base-15 score:
// the leading digit is the category (0 = no pair), the remaining digits
// are the grouped ranks (high group first). With <5 cards the score has
// `n` rank digits; with >=5 it has 5 plus the category digit.
function ownBucketLabel(s, p) {
  const cards = allCards(s, p);
  const n = Math.min(5, cards.length);
  const lo = bestLowRazz(cards);
  // peel off `n` rank digits, then whatever remains is the category
  const ranks = [];
  let v = lo;
  for (let i = 0; i < n; i++) { ranks.unshift(v % 15); v = Math.floor(v / 15); }
  const cat = v; // 0 = no pair
  if (cat > 0) return `paired (${lowLabel(ranks[ranks.length - 1])} high)`;
  return ranks.map(lowLabel).join('-') + ' low';
}

function lowLabel(r) {
  if (r === 1) return 'A';
  if (r === 10) return 'T';
  if (r === 11) return 'J';
  if (r === 12) return 'Q';
  if (r === 13) return 'K';
  return String(r);
}

const game = {
  id: 'razz',
  name: 'Razz',

  newHand(rng) {
    const deck = shuffledDeck(rng);
    const down = [[deck[0], deck[1]], [deck[2], deck[3]]];
    const up = [[deck[4]], [deck[5]]];
    // HIGHEST upcard brings in; ace plays low (never brings in). Higher
    // suit breaks an exact-rank tie (razz_bring_in, razz_game.py:48-54).
    const v0 = razzBoardValue(up[0]), v1 = razzBoardValue(up[1]);
    let bringIn;
    if (v0 !== v1) bringIn = v0 > v1 ? 0 : 1;
    else bringIn = suitOf(up[0][0]) > suitOf(up[1][0]) ? 0 : 1;
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
    // Whole pot to the LOWEST ace-to-five low; equal lows split. No
    // hi/lo split, no qualifier (razz_share, razz_game.py:57-65).
    const lo0 = bestLowRazz(allCards(s, 0)), lo1 = bestLowRazz(allCards(s, 1));
    const share0 = lo0 < lo1 ? 1 : lo0 > lo1 ? 0 : 0.5;
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
    // Lowest (best) razz board acts first; seat 0 wins ties.
    n.toAct = firstActor(n.up[0], n.up[1]);
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
      // The forced bring-in COUNTS as the bring-in's action. If everyone merely
      // CALLS it (no completion), the round closes to 4th — the bring-in does
      // NOT get a live check/raise option (stud, unlike a hold'em big blind).
      n.acted[p] = true;
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
      else n.toAct = 1 - p; // other seat hasn't acted yet (e.g. a check on 4th+) — pass to them
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
  // hand/board information lives in the buckets. Own-bucket is the v2
  // hole-aware bucket (H-tier on 3rd/4th street) — MUST match the keys
  // in strategies/razz.json (v2-trained). The frozen v1 key lives on
  // `gameV1` below.
  infosetKey(s) {
    const p = s.toAct;
    const potBin = Math.min(12, Math.round((s.contrib[0] + s.contrib[1]) / (2 * SMALL)));
    const first = s.starter === p ? 1 : 0;
    return `${s.street}|p${potBin}|${s.curSeq}|f${first}|${ownBucketV2(s, p)}|o${oppBucket(s, p)}|b${s.bringIn === p ? 1 : 0}`;
  },

  actionLabel(a, s) {
    if (a === 'br') return `Bring-in ${BRING}`;
    if (a === 'co') return `Complete to ${SMALL}`;
    if (a === 'f') return 'Fold';
    if (a === 'k') return 'Check';
    if (a === 'c') return `Call ${s.contrib[1 - s.toAct] - s.contrib[s.toAct]}`;
    // Opening voluntary full bet: on 3rd street this completes the bring-in;
    // on 4th–7th it is just a bet.
    if (s.bets === 0) return s.street === 0 ? `Complete to ${betSize(s.street)}` : `Bet ${betSize(s.street)}`;
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

  // Full-information view (both hands shown) for the self-play viewer.
  viewAll(s) {
    return {
      street: s.street,
      streetName: STREET_NAMES[s.street],
      phase: s.phase,
      pot: s.contrib[0] + s.contrib[1],
      contrib: s.contrib.slice(),
      toAct: s.toAct,
      players: [0, 1].map(p => ({
        position: s.bringIn === p ? 'Bring-in' : 'Other',
        down: s.down[p].map(cardStr),
        up: s.up[p].map(cardStr),
        handLabel: ownBucketLabel(s, p),
      })),
      log: s.log.map(e => ({ who: e.p === -1 ? 'Dealer' : (e.p === 0 ? 'P1' : 'P2'), what: e.a })),
    };
  },

  // Terminal summary for the self-play viewer. Razz has a single winner
  // (best low) and no scoop/split distinction beyond a tie. To stay
  // byte-compatible with the stud8-shaped viewer, the single low winner
  // is mapped onto both hiWinner and loWinner (and scoop=true).
  result(s) {
    const c = [allCards(s, 0), allCards(s, 1)];
    const players = [0, 1].map(p => ({
      down: s.down[p].map(cardStr),
      up: s.up[p].map(cardStr),
      hi: ownBucketLabel(s, p),
      lo: ownBucketLabel(s, p),
    }));
    if (s.folded !== null) {
      const winner = 1 - s.folded;
      return { type: 'fold', hiWinner: winner, loWinner: winner, scoop: true,
        profit: s.contrib[s.folded], pot: s.contrib[0] + s.contrib[1], players };
    }
    const lo0 = bestLowRazz(c[0]), lo1 = bestLowRazz(c[1]);
    const winner = lo0 < lo1 ? 0 : lo0 > lo1 ? 1 : -1; // -1 = split
    const scoop = winner >= 0;
    return { type: 'showdown', hiWinner: winner, loWinner: winner, scoop,
      pot: s.contrib[0] + s.contrib[1], players };
  },
};

// ── Variant bindings ────────────────────────────────────────────────
// The DEFAULT export (`game`, id 'razz') carries the SHIPPED v2
// hole-aware infosetKey and pairs with strategies/razz.json. Both must
// always flip together: a blueprint's keys and the module that
// generates lookup keys for the trainer/grader/playout are one unit.
//
// `gameV1` (id 'razzv1') keeps the pre-2026-07-05 hole-blind key,
// byte-identical to what strategies/razz.frozen-v1.json was trained
// on — for LBR re-verification / A-B comparisons only, never the app.
//
// `gameV2` (id 'razzv2') is the same v2 key under the opt-in training
// id that produced the blueprint (strategies/razzv2.json provenance);
// kept so `--game razzv2` meter/training runs keep resolving.
const gameV1 = Object.assign({}, game, {
  id: 'razzv1',
  name: 'Razz (v1 hole-blind bucket, frozen)',
  infosetKey(s) {
    const p = s.toAct;
    const potBin = Math.min(12, Math.round((s.contrib[0] + s.contrib[1]) / (2 * SMALL)));
    const first = s.starter === p ? 1 : 0;
    return `${s.street}|p${potBin}|${s.curSeq}|f${first}|${ownBucket(s, p)}|o${oppBucket(s, p)}|b${s.bringIn === p ? 1 : 0}`;
  },
});

const gameV2 = Object.assign({}, game, {
  id: 'razzv2',
  name: 'Razz (v2 hole-aware bucket)',
  // infosetKey inherited from `game` — the default IS the v2 key now.
});

module.exports = game;
module.exports.razzBoardValue = razzBoardValue;
module.exports.firstActor = firstActor;
module.exports.v1 = gameV1;
module.exports.v2 = gameV2;
// Exposed for bucket-abstraction tests/validation (not used by the engine).
module.exports.ownBucket = ownBucket;
module.exports.ownBucketV2 = ownBucketV2;
module.exports.earlyLowTier = earlyLowTier;
