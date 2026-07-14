// td27-3way-game correctness gates — increment 1 (deal + 3-way 2-7 low showdown).
// Run: node solver/multiway/td27-3way-game.test.js
const { makeRng, cardFromStr } = require('../engine/cards');
const { score27 } = require('../eval/low27');
const G = require('./td27-3way-game');

let PASS = 0, FAIL = 0;
const ok = (c, m) => { if (c) PASS++; else { FAIL++; console.error('  FAIL:', m); } };
const approx = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const parse5 = str => str.trim().split(/\s+/).map(cardFromStr);

// Build a terminal SHOWDOWN state directly from hand strings.
function showdown(hands, { contrib = [10, 10, 10], folded = [false, false, false] } = {}) {
  return { hands: hands.map((h, p) => (folded[p] ? [] : parse5(h))), folded: folded.slice(), contrib: contrib.slice() };
}

console.log('— GATE 1: 3-way 2-7 low showdown (lowest wins; cross-check score27) —');
{
  // seat 0 = nut 7-low; seat 1 = 8-low; seat 2 = a pair (terrible).
  const s = showdown(['7h 5d 4c 3s 2h', '8c 6d 4h 3d 2s', '9h 9d 5c 4s 3h'], { contrib: [10, 10, 10] });
  const u = G.utility(s, 0);
  ok(u[0] > 0 && u[1] < 0 && u[2] < 0, `nut 7-low scoops (u=${u.map(x => x.toFixed(1))})`);
  // direct cross-check: seat 0 has the min score27
  const sc = [0, 1, 2].map(p => score27(s.hands[p]));
  ok(sc[0] === Math.min(...sc), `seat 0 is the lowest score27 (${sc})`);
  ok(approx(u[0], 30 - 10), `scooper wins the whole 30 pot net +20 (got ${u[0]})`);
}

console.log('— GATE 2: ties split; folded seats excluded —');
{
  // seats 0 & 1 identical 7-low (different suits), seat 2 worse → 0 & 1 split.
  const s = showdown(['7h 5d 4c 3s 2h', '7s 5h 4d 3c 2d', 'Kh Qd Jc 9s 8h'], { contrib: [10, 10, 10] });
  const u = G.utility(s, 0);
  ok(approx(u[0], u[1]) && u[0] > 0 && u[2] < 0, `two nut 7s split (u=${u.map(x => x.toFixed(1))})`);
  ok(approx(u[0], 15 - 10), `each winner gets half of 30 (net +5), got ${u[0]}`);
  // seat 2 folded → not eligible even with a "better" board it can't have
  const s2 = showdown(['9h 8d 7c 5s 4h', 'Kc Qd Jh Ts 9c', '2h 3d 4c 5s 7h'], { folded: [false, false, true] });
  const u2 = G.utility(s2, 0);
  ok(u2[0] > 0 && u2[2] < 0, `folded seat 2 wins nothing though it "holds" the nut (u=${u2.map(x => x.toFixed(1))})`);
}

console.log('— GATE 3: chip conservation — sum(utility) === deadPot —');
{
  const rng = makeRng(7);
  let worst = 0;
  for (let t = 0; t < 400; t++) {
    const st = G.deal(rng, { button: t % 3 });
    // random contributions + a random dead overlay; play to a random showdown
    const contrib = [2 + Math.floor(rng() * 8), 2 + Math.floor(rng() * 8), 2 + Math.floor(rng() * 8)];
    const folded = [rng() < 0.2, rng() < 0.2, false]; // seat 2 always live so a live seat exists
    const dead = Math.floor(rng() * 6);
    const s = { hands: st.hands, folded, contrib };
    const u = G.utility(s, dead);
    worst = Math.max(worst, Math.abs(u.reduce((a, b) => a + b, 0) - dead));
  }
  ok(worst < 1e-9, `sum(utility) === deadPot across 400 random showdowns (worst dev ${worst.toExponential(2)})`);
}

console.log('— GATE 4: deal validity — 15 distinct cards, blinds posted —');
{
  const rng = makeRng(99);
  let bad = 0, blindsOk = 0;
  for (let t = 0; t < 200; t++) {
    const s = G.deal(rng, { button: t % 3 });
    const seen = new Set();
    for (let p = 0; p < 3; p++) { ok(s.hands[p].length === 5, 'each seat 5 cards'); for (const c of s.hands[p]) seen.add(c); }
    if (seen.size !== 15) bad++;
    if (s.contrib[s.sb] === G.SB && s.contrib[s.bb] === G.BB && s.contrib[s.button] === 0) blindsOk++;
  }
  ok(bad === 0, `no duplicate cards across 3 hands in 200 deals (bad=${bad})`);
  ok(blindsOk === 200, `SB/BB posted, button unposted, every deal (${blindsOk}/200)`);
}

console.log('— GATE 5: BB keeps its live option when limped to (blind game ≠ stud bring-in) —');
{
  const g = G.makeGame({ dead: 3, cap: 4 });
  let s = g.newHand(makeRng(3)); // default button 0: btn=0, sb=1, bb=2
  const btn = s.button, sb = s.sb, bb = s.bb;
  ok(s.toAct === btn, `button acts first pre-draw (toAct=${s.toAct}, btn=${btn})`);
  s = g.applyAction(s, 'c');                 // button limps
  ok(s.toAct === sb, `action to SB after button limp`);
  const sbActs = g.legalActions(s);
  ok(sbActs.includes('f') && sbActs.includes('c') && !sbActs.includes('k'),
    `SB faces the BB overlay — f/c/r, NO free check (got ${sbActs})`);
  s = g.applyAction(s, 'c');                 // SB completes
  ok(s.toAct === bb, `action limps to the BB`);
  const bbActs = g.legalActions(s);
  ok(bbActs.includes('k') && bbActs.includes('b') && !bbActs.includes('f'),
    `BB gets its LIVE OPTION — check or raise (got ${bbActs})`);
  // branch A: BB checks → round closes to the draw
  const closed = g.applyAction(s, 'k');
  ok(closed.phase === 'draw', `BB check closes the pre-draw round → draw phase (phase=${closed.phase})`);
  // branch B: BB raises → reopens action, BB not last to act
  const reopened = g.applyAction(s, 'b');
  ok(reopened.phase === 'bet' && reopened.toAct !== bb && reopened.bets === 2,
    `BB raise REOPENS the round (phase=${reopened.phase} toAct=${reopened.toAct} bets=${reopened.bets})`);
}

console.log('— GATE 6: fold-out ends the hand; chip conservation holds —');
{
  const g = G.makeGame({ dead: 3 });
  let s = g.newHand(makeRng(5));
  const bb = s.bb;
  s = g.applyAction(s, 'f');   // button open-folds
  s = g.applyAction(s, 'f');   // SB folds → BB alone
  ok(g.isTerminal(s), `two folds → terminal (only BB live)`);
  const u = g.utility(s);
  ok(u[bb] > 0, `BB wins the dead money + blinds (u[bb]=${u[bb].toFixed(1)})`);
  ok(approx(u.reduce((a, b) => a + b, 0), 3), `sum(utility) === deadPot 3 (got ${u.reduce((a, b) => a + b, 0)})`);
}

console.log('— GATE 7: 4-bet cap closes raising —');
{
  const g = G.makeGame({ dead: 3, cap: 4 });
  let s = g.newHand(makeRng(9));
  // button raise, SB reraise, BB reraise → bets hits cap 4; next actor cannot raise
  s = g.applyAction(s, 'r'); ok(s.bets === 2, `bets=2 after button raise`);
  s = g.applyAction(s, 'r'); ok(s.bets === 3, `bets=3`);
  s = g.applyAction(s, 'r'); ok(s.bets === 4, `bets=4 (cap)`);
  const capped = g.legalActions(s);
  ok(capped.includes('c') && !capped.includes('r'), `at the cap: call/fold only, no raise (got ${capped})`);
}

console.log(`\n${PASS} passed, ${FAIL} failed`);
process.exit(FAIL ? 1 : 0);
