// ── stud8-3way-game correctness gates ─────────────────────────────────────
// Run: node solver/multiway/stud8-3way-game.test.js
// Gates (each fails LOUD if broken — the deliverable is only trustworthy if all
// pass):
//   (1) zero-sum / chip conservation (sum of the 3 utilities === deadPot; === 0
//       when there is no dead-money overlay);
//   (2) hi/lo 8-or-better split correctness, cross-checked against eval/stud8
//       directly AND against equity.multiwayShare for seat 0 (hand-picked spots
//       + many random showdowns);
//   (3) deal validity (no duplicate/leaked cards, correct per-street counts,
//       UNIFORM_PRIORS flattens the door-rank distribution);
//   (4) bring-in (lowest door) & first-actor (highest board) match the stud8
//       rule, cross-checked against solver/games/stud8-game.js.

const { makeRng, cardFromStr, cardStr, lowRankOf, rankOf, suitOf } = require('../engine/cards');
const { bestHi7, bestLo8 } = require('../eval/stud8');
const { multiwayShare } = require('../equity');
const stud8_2p = require('../games/stud8-game'); // ground-truth 2-player rules
const {
  makeGame, boardValue, doorBringInValue, DEFAULT_PRIORS, UNIFORM_PRIORS,
} = require('./stud8-3way-game');

let PASS = 0, FAIL = 0;
function ok(cond, msg) { if (cond) { PASS++; } else { FAIL++; console.error('  FAIL:', msg); } }
function approx(a, b, eps = 1e-9) { return Math.abs(a - b) < eps; }
function parse7(str) { return str.trim().split(/\s+/).map(cardFromStr); }

// Build a terminal SHOWDOWN state directly from hand strings (all 7 cards in
// `down`; the evaluator reads down.concat(up), so the up/down split is
// irrelevant to the showdown value). folded[] marks non-live seats.
function showdown(hands, { contrib = [10, 10, 10], deadPot = 0, folded = [false, false, false] } = {}) {
  return {
    down: hands.map((h, p) => (folded[p] ? [] : parse7(h))),
    up: [[], [], []],
    folded: folded.slice(),
    contrib: contrib.slice(),
    deadPot,
    phase: 'showdown',
  };
}
// Fraction-of-pot share seat p actually received (invert payoff = share*pot - contrib).
function shareOf(game, s, p) {
  const pot = s.deadPot + s.contrib.reduce((a, b) => a + b, 0);
  return (game.utility(s)[p] + s.contrib[p]) / pot;
}

// ══ GATE 1: zero-sum / chip conservation ═══════════════════════════════════
console.log('GATE 1 — zero-sum / chip conservation');
function randomPlayout(game, rng) {
  let s = game.newHand(rng);
  let guard = 0;
  while (!game.isTerminal(s) && guard++ < 2000) {
    if (game.isChance(s)) { s = game.sampleChance(s, rng); continue; }
    const acts = game.legalActions(s);
    s = game.applyAction(s, acts[Math.floor(rng() * acts.length)]);
  }
  return s;
}
for (const antes of [3, 8]) {              // antes=3 → deadPot 0 (true zero-sum)
  const game = makeGame({ antes });
  const rng = makeRng(0xC0FFEE ^ antes);
  let worst = 0, showdowns = 0, folds = 0, anyNaN = false;
  for (let i = 0; i < 4000; i++) {
    const s = randomPlayout(game, rng);
    if (game.liveSeats(s).length === 1) folds++; else showdowns++;
    const u = game.utility(s);
    if (u.some(x => !Number.isFinite(x))) anyNaN = true;
    worst = Math.max(worst, Math.abs(u[0] + u[1] + u[2] - game.deadPot));
  }
  ok(!anyNaN, `antes=${antes}: all utilities finite`);
  ok(worst < 1e-9, `antes=${antes}: sum(util)===deadPot(${game.deadPot}) over 4000 hands (max dev ${worst.toExponential(2)})`);
  console.log(`  antes=${antes} deadPot=${game.deadPot}: ${showdowns} showdowns, ${folds} fold-outs, sum-dev ${worst.toExponential(2)}`);
}
// Explicit: with no overlay the game is strictly zero-sum.
{
  const game = makeGame({ antes: 3 });
  ok(game.deadPot === 0, 'antes=3 → deadPot === 0 (strict zero-sum config)');
}

// ══ GATE 2: hi/lo split correctness ════════════════════════════════════════
console.log('GATE 2 — hi/lo 8-or-better split correctness');
const G = makeGame({ antes: 3 }); // deadPot 0 so shares are transparent

// (a) a scooper (wheel = straight for hi + nut low) vs two no-low big pairs.
{
  const hands = [
    'As 2c 3d 4h 5s 9h Th',  // 5-high straight (hi) + A-2-3-4-5 nut low
    'Kh Kd Qc Js 9c 4d 2h',  // pair of kings, no straight/flush, {2,4} → no low
    'Qh Qs Jd Tc 8h 4c 2d',  // pair of queens, no straight/flush, {2,4,8} → no low
  ];
  const s = showdown(hands);
  ok(approx(shareOf(G, s, 0), 1), 'scoop: wheel takes whole pot (share 1.0)');
  ok(approx(shareOf(G, s, 1), 0) && approx(shareOf(G, s, 2), 0), 'scoop: losers get 0');
  ok(approx(shareOf(G, s, 0), multiwayShare('stud8', parse7(hands[0]), [parse7(hands[1]), parse7(hands[2])])), 'scoop: seat0 share === multiwayShare');
  // cross-check the eval directly: only seat0 qualifies for low, seat0 wins hi
  ok(bestLo8(parse7(hands[1])) === null && bestLo8(parse7(hands[2])) === null && bestLo8(parse7(hands[0])) !== null, 'scoop: eval confirms only seat0 has a low');
}

// (b) hi-only hand vs a low-qualifier (heads-up in a 3-way) → ~half each.
{
  const hands = [
    'Ah Ad Kc Ks Qs Jh 9h',  // aces-up two pair (hi), no 5-card low
    '2c 3c 4d 5h 7s 8h Tc',  // 7-5-4-3-2 low (lo), loses hi
    'xx',                    // seat2 folded
  ];
  const s = showdown(hands, { folded: [false, false, true] });
  ok(approx(shareOf(G, s, 0), 0.5), 'hi-only vs low-qualifier: hi hand gets half');
  ok(approx(shareOf(G, s, 1), 0.5), 'hi-only vs low-qualifier: low hand gets half');
  ok(approx(shareOf(G, s, 0), multiwayShare('stud8', parse7(hands[0]), [parse7(hands[1])])), 'split: seat0 share === multiwayShare');
  const hi0 = bestHi7(parse7(hands[0])), hi1 = bestHi7(parse7(hands[1]));
  ok(hi0 > hi1 && bestLo8(parse7(hands[0])) === null && bestLo8(parse7(hands[1])) !== null, 'split: eval confirms seat0 wins hi, seat1 owns the only low');
}

// (c) NO qualifying low anywhere → the hi winner scoops the whole pot.
{
  const hands = [
    'Ah Ad As Kc Kd 9c 7d',  // aces full of kings (best hi), {A,7} → no low
    'Qh Qc Jd 9s 7h 5c 3d',  // pair of queens, no straight/flush, {3,5,7} → no low
    'Kh Jh Ts 8c 6d 4s 2h',  // king high, no straight/flush, {2,4,6,8} → no low
  ];
  for (const h of hands) ok(bestLo8(parse7(h)) === null, 'no-low: eval confirms hand has no qualifying low');
  const s = showdown(hands);
  ok(approx(shareOf(G, s, 0), 1), 'no-low: best hi (aces) scoops whole pot');
  ok(approx(shareOf(G, s, 1), 0) && approx(shareOf(G, s, 2), 0), 'no-low: others get 0');
  ok(approx(shareOf(G, s, 0), multiwayShare('stud8', parse7(hands[0]), [parse7(hands[1]), parse7(hands[2])])), 'no-low: seat0 share === multiwayShare');
}

// (d) a 3-way tie for both halves → each seat gets exactly 1/3.
{
  const hands = [
    'As 2c 3d 4h 5s Kc Qd',  // 5-high straight + wheel
    'Ac 2d 3h 4s 5c Kd Qh',  // identical strength, different suits
    'Ad 2h 3s 4c 5d Kh Qs',
  ];
  const s = showdown(hands);
  for (let p = 0; p < 3; p++) ok(approx(shareOf(G, s, p), 1 / 3), `3-way tie: seat${p} gets 1/3`);
  ok(approx(shareOf(G, s, 0), multiwayShare('stud8', parse7(hands[0]), [parse7(hands[1]), parse7(hands[2])])), '3-way tie: seat0 share === multiwayShare');
}

// (e) many RANDOM 3-live showdowns: seat0's share must ALWAYS equal
// equity.multiwayShare, and the 3 shares must sum to exactly 1.
{
  const rng = makeRng(20260711);
  let bad = 0, checked = 0;
  for (let i = 0; i < 5000; i++) {
    const deck = []; for (let c = 0; c < 52; c++) deck.push(c);
    for (let k = deck.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); const t = deck[k]; deck[k] = deck[j]; deck[j] = t; }
    const hands = [deck.slice(0, 7), deck.slice(7, 14), deck.slice(14, 21)];
    const s = { down: hands.map(h => h.slice()), up: [[], [], []], folded: [false, false, false], contrib: [10, 10, 10], deadPot: 0, phase: 'showdown' };
    const sh = [0, 1, 2].map(p => shareOf(G, s, p));
    const want0 = multiwayShare('stud8', hands[0], [hands[1], hands[2]]);
    if (!approx(sh[0], want0) || !approx(sh[0] + sh[1] + sh[2], 1)) bad++;
    checked++;
  }
  ok(bad === 0, `random showdowns: seat0 share === multiwayShare AND shares sum to 1 (${checked} hands, ${bad} mismatches)`);
}

// ══ GATE 3: deal validity ══════════════════════════════════════════════════
console.log('GATE 3 — deal validity');
{
  const game = makeGame({ antes: 8 }); // foldedBurn = (8-3)*3 = 15
  const rng = makeRng(424242);
  let dupErr = 0, leakErr = 0, deckDup = 0, countErr = 0;
  for (let i = 0; i < 3000; i++) {
    const s = game.newHand(rng);
    const dealt = [];
    for (let p = 0; p < 3; p++) { dealt.push(...s.down[p], ...s.up[p]); }
    const dealtSet = new Set(dealt);
    if (dealtSet.size !== dealt.length) dupErr++;          // no dup among dealt
    if (dealt.length !== 9) countErr++;                    // 3 seats × (2 down + 1 up)
    for (const c of dealt) if (s.deck.includes(c)) leakErr++; // dealt cards not in live deck
    if (new Set(s.deck).size !== s.deck.length) deckDup++;  // live deck internally distinct
    if (s.deck.length !== 52 - 15 - 9) countErr++;          // 28 live cards remain
  }
  ok(dupErr === 0, 'newHand: no duplicate card among the 9 dealt (3000 deals)');
  ok(leakErr === 0, 'newHand: no dealt card leaks into the live deck');
  ok(deckDup === 0, 'newHand: live deck has no internal duplicates');
  ok(countErr === 0, 'newHand: 9 dealt + 28 live (15 burned) every deal');
}
// Per-street counts through a full deal-out (no folds) + global disjointness.
{
  const game = makeGame({ antes: 8 });
  const rng = makeRng(9001);
  let countErr = 0, dupErr = 0;
  for (let i = 0; i < 500; i++) {
    let s = game.newHand(rng);
    const expect = [3, 4, 5, 6, 7];
    // advance chance through every street (all seats stay in: never fold)
    for (let street = 0; street <= 4; street++) {
      for (let p = 0; p < 3; p++) if (s.down[p].length + s.up[p].length !== expect[street]) countErr++;
      if (street < 4) { s.phase = 'deal'; s = game.sampleChance(s); }
    }
    // all cards across seats + remaining deck are distinct (burned 15 simply absent)
    const all = [];
    for (let p = 0; p < 3; p++) all.push(...s.down[p], ...s.up[p]);
    all.push(...s.deck);
    if (new Set(all).size !== all.length) dupErr++;
    if (all.length !== 52 - 15) countErr++; // 21 dealt + 16 live remain, 15 burned
  }
  ok(countErr === 0, 'sampleChance: 3→4→5→6→7 cards/seat, totals reconcile to 52-15');
  ok(dupErr === 0, 'sampleChance: no duplicate card across all seats + live deck at 7th');
}
// UNIFORM_PRIORS flattens the door low-rank distribution vs DEFAULT_PRIORS.
{
  function doorStats(priors, seed) {
    const game = makeGame({ antes: 8, priors });
    const rng = makeRng(seed);
    const hist = new Array(14).fill(0); let n = 0, sum = 0;
    for (let i = 0; i < 20000; i++) {
      const s = game.newHand(rng);
      for (let p = 0; p < 3; p++) { const lr = lowRankOf(s.up[p][0]); hist[lr]++; sum += lr; n++; }
    }
    return { mean: sum / n, hist, n };
  }
  const uni = doorStats(UNIFORM_PRIORS, 111);
  const def = doorStats(DEFAULT_PRIORS, 222);
  // uniform door ≈ unbiased expectation (~7 over ranks 1..13); biased default
  // is skewed toward low ranks (much smaller mean).
  ok(uni.mean > 6.3 && uni.mean < 7.7, `UNIFORM_PRIORS door mean ≈ 7 (got ${uni.mean.toFixed(2)})`);
  ok(def.mean < 5.0, `DEFAULT_PRIORS door mean skewed low (got ${def.mean.toFixed(2)})`);
  ok(uni.mean - def.mean > 1.5, `uniform flatter than default by a clear margin (${(uni.mean - def.mean).toFixed(2)})`);
  // flatness: uniform's biggest and smallest rank bins are within ~2x.
  const bins = uni.hist.slice(1, 14);
  const flat = Math.max(...bins) / Math.min(...bins);
  ok(flat < 1.6, `UNIFORM_PRIORS bins roughly equal (max/min ratio ${flat.toFixed(2)})`);
  console.log(`  door mean: uniform ${uni.mean.toFixed(2)} vs default ${def.mean.toFixed(2)}; uniform bin ratio ${flat.toFixed(2)}`);
}

// ══ GATE 4: bring-in (lowest door) & first-actor (highest board) ═══════════
console.log('GATE 4 — bring-in & first-actor (mirror of razz, matches stud8-game.js)');
const game4 = makeGame({ antes: 3 });
// (a) boardValue ported verbatim from the 2-player module — identical on random boards.
{
  const rng = makeRng(7);
  let diff = 0;
  for (let i = 0; i < 3000; i++) {
    const deck = []; for (let c = 0; c < 52; c++) deck.push(c);
    for (let k = deck.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); const t = deck[k]; deck[k] = deck[j]; deck[j] = t; }
    const nUp = 1 + Math.floor(rng() * 4);
    const up = deck.slice(0, nUp);
    if (boardValue(up) !== stud8_2p.boardValue(up)) diff++;
  }
  ok(diff === 0, 'boardValue matches solver/games/stud8-game.js exactly (3000 boards)');
}
// (b) bring-in = LOWEST door (ace HIGH); 2-seat reduction matches 2-player rule.
{
  // hand-picked: ace door does NOT bring in (ace plays high)
  ok(game4._bringInSeat([[cardFromStr('Ac')], [cardFromStr('3d')], [cardFromStr('5h')]]) === 1, 'bring-in: the deuce/trey brings in, NOT the ace (ace is high)');
  // suit tiebreak: equal ranks → lowest suit (c<d<h<s) brings in
  ok(game4._bringInSeat([[cardFromStr('5d')], [cardFromStr('5c')], [cardFromStr('9h')]]) === 1, 'bring-in: equal ranks broken by lowest suit');
  // lowest overall
  ok(game4._bringInSeat([[cardFromStr('Ts')], [cardFromStr('7d')], [cardFromStr('2c')]]) === 2, 'bring-in: lowest door card brings in');
  // cross-check the 2-seat reduction against the 2-player newHand rule
  const rng = makeRng(55);
  let diff = 0;
  for (let i = 0; i < 3000; i++) {
    const deck = []; for (let c = 0; c < 52; c++) deck.push(c);
    for (let k = deck.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); const t = deck[k]; deck[k] = deck[j]; deck[j] = t; }
    const d0 = deck[0], d1 = deck[1];
    const r0 = rankOf(d0), r1 = rankOf(d1);
    const want2p = (r0 < r1 || (r0 === r1 && suitOf(d0) < suitOf(d1))) ? 0 : 1; // stud8-game.js
    // give seat2 a card that can never be lowest so the 3-way reduces to 2p
    const got = game4._bringInSeat([[d0], [d1], [cardFromStr('As')]]);
    const gotReduced = got === 2 ? -1 : got; // As never brings in
    if (gotReduced !== want2p) diff++;
  }
  ok(diff === 0, 'bring-in: 2-seat reduction === 2-player stud8-game rule (3000 boards)');
}
// (c) first-actor on 4th+ = HIGHEST board; 2-seat reduction matches 2-player rule.
{
  // constructed: a paired board acts before two unpaired boards
  const boards = [[cardFromStr('7c'), cardFromStr('2d')], [cardFromStr('9h'), cardFromStr('9s')], [cardFromStr('Ah'), cardFromStr('5c')]];
  ok(game4._firstActorLive(boards, [false, false, false]) === 1, 'first-actor: the pair (99) acts first');
  // folded seats are skipped
  ok(game4._firstActorLive(boards, [false, true, false]) !== 1, 'first-actor: a folded (paired) seat is skipped');
  // cross-check the 2-seat reduction against the 2-player sampleChance rule
  const rng = makeRng(88);
  let diff = 0;
  for (let i = 0; i < 3000; i++) {
    const deck = []; for (let c = 0; c < 52; c++) deck.push(c);
    for (let k = deck.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); const t = deck[k]; deck[k] = deck[j]; deck[j] = t; }
    const b0 = deck.slice(0, 2), b1 = deck.slice(2, 4);
    const want2p = boardValue(b0) >= boardValue(b1) ? 0 : 1; // stud8-game.js sampleChance
    const got = game4._firstActorLive([b0, b1, deck.slice(4, 6)], [false, false, true]); // seat2 folded
    if (got !== want2p) diff++;
  }
  ok(diff === 0, 'first-actor: 2-seat reduction === 2-player stud8-game rule (3000 boards)');
}

console.log(`\n${FAIL === 0 ? 'ALL GATES PASS' : 'GATES FAILED'} — ${PASS} checks passed, ${FAIL} failed`);
process.exit(FAIL === 0 ? 0 : 1);
