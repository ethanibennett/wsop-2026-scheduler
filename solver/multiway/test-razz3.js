#!/usr/bin/env node
// ── Self-tests for the 3-player razz3 solver ───────────────────────────────
// Standalone (NOT wired into solver/tests/run-tests.js, which iterates the
// 2-player GAMES map and asserts ZERO-SUM — razz3 is deliberately general-sum).
// Run: node solver/multiway/test-razz3.js
//
// Covers: full-game rules invariants (termination, cap, matched-at-showdown,
// utility sums to deadPot), the fold-to-2-way collapse, and the ground-truth
// gate — sampled exploitability is a valid LOWER bound vs exact BR on the
// reduced razz3, and a broken (uniform) strategy is clearly MORE exploitable.

const assert = require('assert');
const { makeRng } = require('../engine/cards');
const { MCCFR3Trainer } = require('./mccfr3');
const { makeGame } = require('./razz3-game');
const { makeReduced } = require('./razz3-reduced');
const { exactExploit, sampledExploit } = require('./measure3');

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`  ok  ${name}`); } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); } }

console.log('— razz3 full-game rules invariants —');
test('full razz3: random playouts terminate, cap holds, utility sums to deadPot', () => {
  const g = makeGame();
  const rng = makeRng(42);
  for (let i = 0; i < 8000; i++) {
    let s = g.newHand(rng), steps = 0, maxBets = 0;
    while (!g.isTerminal(s)) {
      assert(++steps < 300, 'terminates');
      if (g.isChance(s)) { s = g.sampleChance(s, rng); continue; }
      maxBets = Math.max(maxBets, s.bets);
      const acts = g.legalActions(s);
      assert(acts.length >= 1, 'actions available');
      assert(!s.folded[s.toAct], 'acting seat is live');
      const key = g.infosetKey(s);
      assert(typeof key === 'string' && key.length > 0, 'infoset key');
      s = g.applyAction(s, acts[Math.floor(rng() * acts.length)]);
    }
    assert(maxBets <= g.CAP, `cap ${g.CAP} held (saw ${maxBets})`);
    const live = g.liveSeats(s);
    if (live.length > 1) {
      const high = Math.max(...live.map(p => s.contrib[p]));
      for (const p of live) assert(s.contrib[p] === high, 'showdown contributions matched');
    }
    const u = g.utility(s);
    assert(Math.abs(u.reduce((a, b) => a + b, 0) - g.deadPot) < 1e-6, 'utility sums to deadPot (general-sum overlay)');
  }
});

test('fold-to-2-way collapse: after one seat folds, exactly two seats play on', () => {
  const g = makeGame();
  const rng = makeRng(7);
  let sawCollapse = false;
  for (let i = 0; i < 2000 && !sawCollapse; i++) {
    let s = g.newHand(rng);
    while (!g.isTerminal(s)) {
      if (g.isChance(s)) { s = g.sampleChance(s, rng); continue; }
      const acts = g.legalActions(s);
      // prefer fold if available to drive a collapse
      const a = acts.includes('f') && i % 3 === 0 ? 'f' : acts[Math.floor(rng() * acts.length)];
      s = g.applyAction(s, a);
      if (g.liveSeats(s).length === 2 && !g.isTerminal(s)) {
        sawCollapse = true;
        // the surviving two must continue to be dealt / act
        const key = g.infosetKey(s);
        assert(/n2/.test(key), 'infoset key reflects 2 live seats');
      }
    }
  }
  assert(sawCollapse, 'observed a fold-to-2-way subgame');
});

test('antes param drives deadPot ((antes-3)*ante); default 8 → 5', () => {
  assert(makeGame().deadPot === 5, 'default 8 antes → 5 dead');
  assert(makeGame({ antes: 6 }).deadPot === 3, '6 antes → 3 dead');
  assert(makeGame({ antes: 3 }).deadPot === 0, '3 antes (all live) → 0 dead');
});

test('coarse-opp reduces the opponent dimension in the infoset key', () => {
  const g = makeGame({ coarseOpp: true });
  const rng = makeRng(3);
  const keys = new Set();
  for (let i = 0; i < 3000; i++) { let s = g.newHand(rng); while (!g.isTerminal(s)) { if (g.isChance(s)) { s = g.sampleChance(s, rng); continue; } keys.add(g.infosetKey(s)); const a = g.legalActions(s); s = g.applyAction(s, a[Math.floor(rng() * a.length)]); } }
  const gFull = makeGame({ coarseOpp: false });
  const keysF = new Set();
  for (let i = 0; i < 3000; i++) { let s = gFull.newHand(rng); while (!gFull.isTerminal(s)) { if (gFull.isChance(s)) { s = gFull.sampleChance(s, rng); continue; } keysF.add(gFull.infosetKey(s)); const a = gFull.legalActions(s); s = gFull.applyAction(s, a[Math.floor(rng() * a.length)]); } }
  assert(keys.size < keysF.size, `coarse (${keys.size}) < full (${keysF.size})`);
});

console.log('— multiway CFR converges on the reduced razz3 (exact-BR ground truth) —');
test('exact per-seat exploitability FALLS sharply from the untrained baseline', () => {
  // NOTE: 3-player general-sum CFR has no equilibrium-convergence guarantee
  // (the mccfr3 header states this plainly); the honest signal is a SHARP drop
  // from the untrained profile toward a low, roughly-stable level — not
  // monotone descent to zero. We assert exactly that.
  const g = makeReduced({ ranks: 6, cap: 2, dead: 5 });
  const t = new MCCFR3Trainer(g);
  const rng = makeRng(123);
  // untrained baseline: uniform strategy over the reachable infosets
  t.train(300, rng);
  const uni = {}; for (const [k, n] of Object.entries(t.averageStrategy())) uni[k] = { a: n.a, p: n.a.map(() => 1 / n.a.length) };
  const base = exactExploit(g, uni).reduce((a, e) => a + e.exploit, 0);
  t.train(39700, rng);
  const late = exactExploit(g, t.averageStrategy()).reduce((a, e) => a + e.exploit, 0);
  assert(late < base * 0.5, `exploitability falls sharply (${base.toFixed(3)} → ${late.toFixed(3)})`);
  assert(late < 2.0, `settles at a low total exploitability (${late.toFixed(3)})`);
});

console.log('— sampled exploitability meter is a valid lower bound —');
test('sampled <= exact (+MC noise) AND broken-uniform is clearly more exploitable', () => {
  const g = makeReduced({ ranks: 6, cap: 2, dead: 5 });
  const t = new MCCFR3Trainer(g);
  t.train(80000, makeRng(123));
  const avg = t.averageStrategy();
  const exact = exactExploit(g, avg);
  const samp = sampledExploit(g, avg, { hands: 12000, buildHands: 12000, seed: 5, margin: 0.02 });
  for (let i = 0; i < 3; i++) assert(samp[i].exploit <= exact[i].exploit + 0.15, `seat ${i}: sampled ${samp[i].exploit.toFixed(3)} <= exact ${exact[i].exploit.toFixed(3)} + noise`);
  for (const s of samp) assert(s.exploit >= 0, 'non-negative lower bound');
  const uni = {}; for (const k of Object.keys(avg)) uni[k] = { a: avg[k].a, p: avg[k].a.map(() => 1 / avg[k].a.length) };
  const sampBroken = sampledExploit(g, uni, { hands: 12000, buildHands: 12000, seed: 5, margin: 0.02 }).reduce((a, e) => a + e.exploit, 0);
  const sampBP = samp.reduce((a, e) => a + e.exploit, 0);
  assert(sampBroken > sampBP + 1.0, `broken uniform (${sampBroken.toFixed(2)}) >> blueprint (${sampBP.toFixed(2)})`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
