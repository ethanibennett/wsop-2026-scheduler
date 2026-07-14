// ── 2-7 Triple Draw (heads-up fixed limit) ──────────────────
// Draw-aware abstraction. Hands are classified by what they DRAW TO,
// not by the made-hand evaluator (which mislabels an unpaired
// four-low-plus-a-high hand like 2-3-4-5-K as "pat" when it is really a
// premium one-card draw). Buckets:
//   M<hi><2nd>      — pat made 8-or-better low (e.g. M75 = 7-5 low)
//   D<n>k<top><d?><x?><p?>
//                   — a draw: <n> = cards drawn (1-4) keeping the low
//                     cards, <top> = highest LOW card kept (0 = none),
//                     d = holds a deuce (the premium card), x = straight
//                     danger (4 consecutive lows), p = currently a rough
//                     made 9/T low that may also stand pat.
// The discard heuristic keeps the lowest distinct low cards; the draw
// COUNT in each bucket is the count the solver actually takes, so a
// "1-card draw to a 9" no longer exists — that hand is a 2-card draw to
// the cards underneath, and is bucketed/labeled as such.

const { rankOf, RANK_CHARS } = require('../engine/cards');
const { score27 } = require('../eval/low27');
const { makeDrawGame } = require('./draw-game');

const CAT_BASE = Math.pow(15, 5);

// Distinct "keepable" low ranks (2..8), ascending.
function lowRanks(hand) {
  return [...new Set(hand.map(rankOf).filter(r => r <= 8))].sort((a, b) => a - b);
}

function bucket(hand) {
  const ranks = hand.map(rankOf);
  const top = Math.max(...ranks);
  const cat = Math.floor(score27(hand) / CAT_BASE);

  // Pat made 8-or-better low (no pair/straight/flush, high card <= 8).
  if (cat === 0 && top <= 8) {
    const desc = [...new Set(ranks)].sort((a, b) => b - a);
    return 'M' + desc[0] + desc[1]; // M75 = 7-5 low, M86 = 8-6 low
  }

  // Otherwise a draw: keep the low cards, draw the rest.
  const lows = lowRanks(hand);
  const L = lows.length;
  let draw = 5 - L;
  if (draw <= 0) draw = 1; // 5 distinct lows but a straight: break one
  if (draw > 4) draw = 4;
  const topLow = L > 0 ? lows[L - 1] : 0;
  const deuce = (L > 0 && lows[0] === 2) ? 'd' : '';
  let srisk = '';
  for (let i = 0; i + 3 < L; i++) if (lows[i + 3] - lows[i] === 3) { srisk = 'x'; break; }
  // A rough made 9/10-high low can also stand pat (street-dependent choice).
  const patable = (cat === 0 && top <= 10) ? 'p' : '';
  return `D${draw}k${topLow}${deuce}${srisk}${patable}`;
}

// Best 4-card keep when BREAKING a made low by drawing one: maximize improving
// outs (ranks that beat the current made hand — score27 penalizes straights/
// flushes, so they don't count), tie-broken by the strongest achievable draw.
// "Triple the Gold" Ep 1: breaking pat 8-7-5-4-3, keep the 8 (break the 7) for ~8
// outs, NOT keep 7-5-4-3 (break the 8) which is a 4-out straight-prone draw. Naive
// keep-lowest picks the inferior break; this picks the coach's.
function breakBest(hand) {
  const orig = score27(hand);
  const inHand = new Set(hand);
  let best = null;
  for (let i = 0; i < hand.length; i++) {
    const keep = hand.filter((_, j) => j !== i);
    const bestByRank = {};
    for (let c = 0; c < 52; c++) {
      if (inHand.has(c)) continue;
      const sc = score27(keep.concat([c]));
      const r = rankOf(c);
      if (bestByRank[r] === undefined || sc < bestByRank[r]) bestByRank[r] = sc;
    }
    let outs = 0, bestScore = Infinity;
    for (const r in bestByRank) if (bestByRank[r] < orig) { outs++; if (bestByRank[r] < bestScore) bestScore = bestByRank[r]; }
    if (!best || outs > best.outs || (outs === best.outs && bestScore < best.bestScore)) best = { keep, outs, bestScore };
  }
  return best.keep;
}

// Keep the (5 - drawCount) lowest distinct ranks (then lowest dups) — EXCEPT when
// breaking a made 8-or-better low by one (only reachable via manual discard
// control, since drawOptions pats these), where breakBest picks the outs-max card.
function chooseKeep(hand, drawCount) {
  if (drawCount === 1) {
    const ranks = hand.map(rankOf);
    if (Math.floor(score27(hand) / CAT_BASE) === 0 && Math.max(...ranks) <= 8) return breakBest(hand);
  }
  const keepN = hand.length - drawCount;
  const sorted = hand.slice().sort((a, b) => rankOf(a) - rankOf(b));
  const keep = [], seen = new Set();
  for (const c of sorted) {
    if (keep.length >= keepN) break;
    if (!seen.has(rankOf(c))) { keep.push(c); seen.add(rankOf(c)); }
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
  const ranks = hand.map(rankOf);
  const top = Math.max(...ranks);
  const cat = Math.floor(score27(hand) / CAT_BASE);
  if (cat === 0 && top <= 8) return [0]; // pat the made low
  let natural = 5 - new Set(ranks.filter(r => r <= 8)).size;
  if (natural <= 0) natural = 1;
  if (natural > 4) natural = 4;
  return [...new Set([0, natural])].sort((a, b) => a - b); // 0 = pat/snow
}

function describeHand(hand) {
  const ranks = hand.map(rankOf).sort((a, b) => b - a);
  const top = ranks[0];
  const cat = Math.floor(score27(hand) / CAT_BASE);
  if (cat === 0 && top <= 8) return `${RANK_CHARS[ranks[0]]}-${RANK_CHARS[ranks[1]]} low (pat)`;
  const lows = lowRanks(hand);
  const draw = Math.min(4, Math.max(1, 5 - lows.length));
  const deuce = lows[0] === 2 ? ' with a deuce' : '';
  if (cat === 0 && top <= 10) return `${RANK_CHARS[top]}-high low — pat or ${draw}-card draw${deuce}`;
  if (lows.length === 0) return `no low cards (${draw}-card draw)`;
  const tgt = lows[lows.length - 1] <= 7 ? 'a 7' : 'an 8';
  return `${draw}-card draw to ${tgt}${deuce}`;
}

// At SHOWDOWN the hand is FINAL — describe the MADE 5-card hand, not the draw it
// used to be. Q-7-4-3-2 is a made queen-low, NOT "a 1-card draw to a 7".
function describeMade(hand) {
  const ranks = hand.map(rankOf);
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.keys(counts).map(r => ({ r: +r, n: counts[r] })).sort((a, b) => (b.n - a.n) || (b.r - a.r));
  const cat = Math.floor(score27(hand) / CAT_BASE);
  const desc = ranks.slice().sort((a, b) => b - a); // high → low
  if (cat === 0) return `${RANK_CHARS[desc[0]]}-${RANK_CHARS[desc[1]]} low`; // "7-5 low", "Q-7 low"
  if (cat === 1) return `a pair of ${RANK_CHARS[groups[0].r]}s`;
  if (cat === 2) return `two pair, ${RANK_CHARS[groups[0].r]}s & ${RANK_CHARS[groups[1].r]}s`;
  if (cat === 3) return `trip ${RANK_CHARS[groups[0].r]}s`;
  if (cat === 4) return `${RANK_CHARS[desc[0]]}-high straight`;
  if (cat === 5) return `${RANK_CHARS[desc[0]]}-high flush`;
  if (cat === 6) return `a full house`;
  if (cat === 7) return `quad ${RANK_CHARS[groups[0].r]}s`;
  return `a straight flush`;
}

// ── v2 abstraction (course-derived, 2026-07-14) ──────────────────────────────
// Three gaps the "Triple the Gold" course-vs-solver sweep surfaced, addressed
// here as an OPT-IN abstraction so the v1 blueprint is untouched until v2 is
// LBR-validated and swapped:
//   (#4) the v1 draw bucket can't tell 2-6-7 from 2-3-7 (same D2k7d) — v2 adds a
//        SMOOTHNESS tier from the 2nd-highest kept low.
//   (#5) the v1 bucket keys on DISTINCT lows, so it overvalues a paired holding
//        (3-3-2-8 == 2-3-8) — v2 adds a paired-low ('q') flag.
//   (#1) v1 always pats a made 8-low (drawOptions [0]); the course breaks rough
//        8-7s — v2 offers [0,1] for 8-7-x lows (chooseKeep's breakBest picks the
//        card). Smoother 8s / 7-lows still pat.
// chooseKeep is SHARED with v1 (its breakBest already handles the 8-7 break); the
// draw-2-off-open-ender + straight-aware-draw-keep changes (#2,#3) are deferred to
// v3 because they alter the training discard and need their own validation.
function bucketV2(hand) {
  const ranks = hand.map(rankOf);
  const cat = Math.floor(score27(hand) / CAT_BASE);
  const top = Math.max(...ranks);
  if (cat === 0 && top <= 8) {
    const desc = [...new Set(ranks)].sort((a, b) => b - a);
    return 'M' + desc[0] + desc[1]; // made ≤8 low already encodes its top two
  }
  const lows = lowRanks(hand);
  const L = lows.length;
  let draw = 5 - L;
  if (draw <= 0) draw = 1;
  if (draw > 4) draw = 4;
  const topLow = L > 0 ? lows[L - 1] : 0;
  const deuce = (L > 0 && lows[0] === 2) ? 'd' : '';
  // smoothness split ONLY on 2-card draws (where 2-3-7 vs 2-6-7 lives), 2 tiers —
  // applying it to every street/draw multiplies the infoset count super-linearly.
  let sm = '';
  if (draw === 2 && L >= 2) { const second = lows[L - 2]; sm = second <= 4 ? '' : 'r'; }
  // a paired LOW card is a dead duplicate — fewer effective outs
  const lc = {}; for (const r of ranks) if (r <= 8) lc[r] = (lc[r] || 0) + 1;
  const pair = Object.values(lc).some(n => n >= 2) ? 'q' : '';
  let srisk = '';
  for (let i = 0; i + 3 < L; i++) if (lows[i + 3] - lows[i] === 3) { srisk = 'x'; break; }
  const patable = (cat === 0 && top <= 10) ? 'p' : '';
  return `D${draw}k${topLow}${sm}${deuce}${pair}${srisk}${patable}`;
}

function drawOptionsV2(hand) {
  const ranks = hand.map(rankOf);
  const top = Math.max(...ranks);
  const cat = Math.floor(score27(hand) / CAT_BASE);
  if (cat === 0 && top <= 8) {
    const desc = [...new Set(ranks)].sort((a, b) => b - a);
    if (desc[0] === 8 && desc[1] === 7) return [0, 1]; // rough 8-7 low: pat OR break one
    return [0];                                        // smoother made lows just pat
  }
  let natural = 5 - new Set(ranks.filter(r => r <= 8)).size;
  if (natural <= 0) natural = 1;
  if (natural > 4) natural = 4;
  return [...new Set([0, natural])].sort((a, b) => a - b);
}

module.exports = makeDrawGame({
  id: 'td27',
  name: '2-7 Triple Draw',
  handSize: 5,
  compare(h0, h1) {
    const a = score27(h0), b = score27(h1);
    return a < b ? 1 : a > b ? -1 : 0;
  },
  bucket,
  chooseKeep,
  drawOptions,
  describeHand,
  describeMade,
});

// Opt-in v2 abstraction variant (same game rules + eval + discard, finer bucket +
// break-8 option). Train with `--game td27v2`; LBR-validate vs td27 before swap.
module.exports.v2 = makeDrawGame({
  id: 'td27v2',
  name: '2-7 Triple Draw (v2 abstraction)',
  handSize: 5,
  compare(h0, h1) {
    const a = score27(h0), b = score27(h1);
    return a < b ? 1 : a > b ? -1 : 0;
  },
  bucket: bucketV2,
  chooseKeep,
  drawOptions: drawOptionsV2,
  describeHand,
  describeMade,
});

module.exports.bucket27 = bucket;
module.exports.chooseKeep27 = chooseKeep;
module.exports.describeMade27 = describeMade;
module.exports.bucketV2 = bucketV2;
module.exports.drawOptionsV2 = drawOptionsV2;
