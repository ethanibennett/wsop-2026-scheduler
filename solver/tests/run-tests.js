#!/usr/bin/env node
// ── Solver test suite ───────────────────────────────────────
// Run: node solver/tests/run-tests.js
// Covers: evaluators, engine convergence on Kuhn poker (known Nash
// value), and rules/zero-sum invariants for all three games.

const assert = require('assert');
const { cardFromStr, makeRng } = require('../engine/cards');
const { score27 } = require('../eval/low27');
const { badugiScore } = require('../eval/badugi');
const { score5hi, bestHi7, bestLo8 } = require('../eval/stud8');
const { MCCFRTrainer } = require('../engine/mccfr');
const kuhn = require('../games/kuhn');
const { GAMES } = require('../games');
const { generateSpot } = require('../spot');
const { playHand } = require('../playout');
const { explainStep, potOdds } = require('../explain');
const { exactKuhnExploitability } = require('../exploitability');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
function h(str) { return str.split(' ').map(cardFromStr); }

console.log('— 2-7 lowball evaluator —');
test('7-5-4-3-2 is the nuts', () => {
  const best = score27(h('7h 5d 4c 3s 2h'));
  assert(best < score27(h('7h 6d 4c 3s 2h')), 'beats 7-6-4-3-2');
  assert(best < score27(h('8h 5d 4c 3s 2h')), 'beats 8-5-4-3-2');
});
test('straights count against you', () => {
  // 2-3-4-5-6 straight loses to a jack-high no-pair hand
  assert(score27(h('6h 5d 4c 3s 2h')) > score27(h('Jh 8d 6c 4s 2h')));
});
test('flushes count against you', () => {
  assert(score27(h('8h 5h 4h 3h 2h')) > score27(h('Jh 8d 6c 4s 2h')));
});
test('aces are high (A-2-3-4-5 is not a straight, just ace-high)', () => {
  const a2345 = score27(h('Ah 2d 3c 4s 5h'));
  assert(a2345 > score27(h('Kh 8d 6c 4s 2h')), 'worse than king-high');
  assert(a2345 < score27(h('2h 2d 3c 4s 5h')), 'better than a pair');
});
test('pairs beat straights/flushes but lose to any no-pair', () => {
  const pair = score27(h('2h 2d 4c 5s 7h'));
  assert(pair > score27(h('Ah Kd Qc Js 9h')), 'loses to AKQJ9');
  assert(pair < score27(h('6h 5d 4c 3s 2h')), 'beats a straight');
});

console.log('— Badugi evaluator —');
test('A-2-3-4 rainbow is the nuts', () => {
  const nuts = badugiScore(h('Ah 2d 3c 4s'));
  assert(nuts < badugiScore(h('Ah 2d 3c 5s')));
  assert(nuts < badugiScore(h('2h 3d 4c 5s')));
});
test('any 4-card badugi beats any 3-card hand', () => {
  assert(badugiScore(h('Kh Qd Jc Ts')) < badugiScore(h('Ah 2d 3c 4c')));
});
test('paired/suited cards reduce to 3-card hands', () => {
  // Ah 2d 3c 3s -> best is A23 three-card; beats A24 three-card (4h pairs nothing but 4d suits with 2d)
  assert(badugiScore(h('Ah 2d 3c 3s')) < badugiScore(h('Ah 2d 4d Kd')));
});
test('3-card hands compare by high card', () => {
  assert(badugiScore(h('Ah 2d 4c 4s')) < badugiScore(h('Ah 2d 5c 5s')));
});

console.log('— Stud8 evaluators —');
test('hi: wheel straight, flush > straight, full house ordering', () => {
  assert(score5hi(h('Ah 2d 3c 4s 5h')) > score5hi(h('Ah Kd Qc Js 9h')), 'wheel beats high card');
  assert(score5hi(h('9h 7h 5h 3h 2h')) > score5hi(h('9h 8d 7c 6s 5h')), 'flush beats straight');
  assert(score5hi(h('3h 3d 3c 2s 2h')) > score5hi(h('Ah Kh Qh Jh 2h')), 'boat beats flush');
});
test('best 5 of 7 hi', () => {
  const two = bestHi7(h('Ah Ad Kc Ks 2h 3d 4c'));
  const trips = bestHi7(h('Ah Ad Ac Ks 2h 3d 4c'));
  assert(trips > two);
});
test('lo: 8-or-better qualification', () => {
  assert(bestLo8(h('Ah 2d 3c 4s 5h Kd Kc')) !== null, 'wheel low qualifies');
  assert(bestLo8(h('Ah 2d 3c 4s 9h Kd Kc')) === null, 'four low cards do not qualify');
  assert(bestLo8(h('Ah 2d 2c 4s 5h 8d Kc')) !== null, 'pairs do not block the low');
  assert(bestLo8(h('Ah 2d 3c 4s 5h 6d 7c')) < bestLo8(h('8h 2d 3c 4s 5h Kd Kc')), '5-high low beats 8-high low');
});
test('lo: straights/flushes do not count against the low', () => {
  assert(bestLo8(h('Ah 2h 3h 4h 5h Kd Kc')) !== null);
});

console.log('— MCCFR engine: Kuhn poker convergence —');
test('converges to the known game value (-1/18 for first player)', () => {
  const trainer = new MCCFRTrainer(kuhn);
  trainer.train(150000, makeRng(7));
  const avg = trainer.averageStrategy();
  // exact expected value under the average strategy, all 6 deals equally likely
  function walk(state) {
    if (kuhn.isTerminal(state)) return kuhn.utility(state)[0];
    const acts = kuhn.legalActions(state);
    const node = avg[kuhn.infosetKey(state)];
    let ev = 0;
    for (let i = 0; i < acts.length; i++) {
      const p = node ? node.p[i] : 1 / acts.length;
      if (p > 0) ev += p * walk(kuhn.applyAction(state, acts[i]));
    }
    return ev;
  }
  let total = 0, deals = 0;
  for (let c0 = 0; c0 < 3; c0++) for (let c1 = 0; c1 < 3; c1++) {
    if (c0 === c1) continue;
    total += walk(kuhn.dealt(c0, c1)); deals++;
  }
  const value = total / deals;
  const target = -1 / 18;
  assert(Math.abs(value - target) < 0.012, `game value ${value.toFixed(4)} vs ${target.toFixed(4)}`);
});
test('always bets with a King when checked to (Kuhn equilibrium property)', () => {
  const trainer = new MCCFRTrainer(kuhn);
  trainer.train(150000, makeRng(11));
  const avg = trainer.averageStrategy();
  const node = avg['K:p']; // player 1 holds K, player 0 checked
  assert(node, 'infoset visited');
  const betProb = node.p[node.a.indexOf('b')];
  assert(betProb > 0.95, `bet prob ${betProb}`);
});

console.log('— Game rules invariants —');
for (const [id, game] of Object.entries(GAMES)) {
  test(`${id}: random playouts are zero-sum with sane states`, () => {
    const rng = makeRng(42);
    for (let i = 0; i < 2000; i++) {
      let s = game.newHand(rng);
      let steps = 0;
      while (!game.isTerminal(s)) {
        assert(++steps < 200, 'playout terminates');
        if (game.isChance(s)) { s = game.sampleChance(s, rng); continue; }
        const acts = game.legalActions(s);
        assert(acts.length >= 1, 'actions available');
        const key = game.infosetKey(s);
        assert(typeof key === 'string' && key.length > 0, 'infoset key');
        for (const a of acts) assert(typeof game.actionLabel(a, s) === 'string');
        s = game.applyAction(s, acts[Math.floor(rng() * acts.length)]);
      }
      const [u0, u1] = game.utility(s);
      assert(Math.abs(u0 + u1) < 1e-9, `zero-sum (${u0}, ${u1})`);
    }
  });
  test(`${id}: short MCCFR training run produces a strategy`, () => {
    const trainer = new MCCFRTrainer(game);
    trainer.train(300, makeRng(5));
    const avg = trainer.averageStrategy();
    assert(Object.keys(avg).length > 50, `infosets: ${Object.keys(avg).length}`);
    for (const node of Object.values(avg)) {
      const sum = node.p.reduce((a, b) => a + b, 0);
      assert(Math.abs(sum - 1) < 0.01, 'probs normalized');
    }
  });
  test(`${id}: spot generator returns a playable quiz spot`, () => {
    const trainer = new MCCFRTrainer(game);
    trainer.train(200, makeRng(9));
    const avg = trainer.averageStrategy();
    const spot = generateSpot(game, avg, makeRng(3));
    assert(spot, 'spot generated');
    assert(spot.actions.length > 1, 'multiple actions');
    assert(spot.description.heroCards.length > 0, 'hero cards present');
    const sum = spot.actions.reduce((a, x) => a + x.prob, 0);
    assert(Math.abs(sum - 1) < 0.02, 'strategy normalized');
  });
  test(`${id}: self-play produces steps with valid explain lines`, () => {
    const trainer = new MCCFRTrainer(game);
    trainer.train(200, makeRng(9));
    const avg = trainer.averageStrategy();
    const p = playHand(game, avg, makeRng(4));
    assert(p.steps.length >= 1, 'at least one decision');
    for (const st of p.steps) {
      assert(typeof st.explain === 'string' && st.explain.length > 10, 'explain present');
      assert(st.chosen && st.actions.some(a => a.id === st.chosen), 'chosen valid');
    }
    assert(p.result && p.result.type, 'result present');
  });
}

console.log('— Explain lines —');
test('pot odds: 4 to call into 20 needs ~17% equity', () => {
  assert.strictEqual(potOdds(20, 4), 17);
  assert.strictEqual(potOdds(6, 4), 40);
});
test('facing a bet produces a pot-odds sentence', () => {
  const step = {
    kind: 'bet', actor: 0, pot: 20, contrib: [8, 12],
    players: [{ handLabel: '7-5 low' }, { handLabel: 'x' }],
    actions: [{ id: 'f', label: 'Fold', prob: 0.05 }, { id: 'c', label: 'Call 4', prob: 0.15 }, { id: 'r', label: 'Raise to 16', prob: 0.80 }],
  };
  const line = explainStep(step, false);
  assert(/needs ~17% equity/.test(line), 'has pot odds: ' + line);
  assert(/7-5 low/.test(line), 'has hand');
});
test('snow draw is flagged as a bluff', () => {
  const step = {
    kind: 'draw', actor: 1, pot: 8, contrib: [4, 4],
    players: [{ handLabel: 'x' }, { handLabel: '3-card 9' }],
    actions: [{ id: 'd0', label: 'Stand Pat', prob: 0.05 }, { id: 'd2', label: 'Draw 2', prob: 0.95 }],
  };
  const line = explainStep(step, false);
  assert(/draws 2/.test(line), 'describes the draw: ' + line);
  assert(/snow/.test(line), 'flags the snow: ' + line);
});

console.log('— Exploitability meter —');
test('exact Kuhn best response: a converged strategy is ~0 exploitable', () => {
  const trainer = new MCCFRTrainer(kuhn);
  trainer.train(120000, makeRng(7));
  const e = exactKuhnExploitability(trainer.averageStrategy());
  assert(e.exploitability < 0.01, `trained exploitability ${e.exploitability}`);
});
test('exact Kuhn: a uniform strategy is clearly exploitable', () => {
  const trainer = new MCCFRTrainer(kuhn);
  trainer.train(500, makeRng(1));
  const avg = trainer.averageStrategy();
  const uniform = {};
  for (const k of Object.keys(avg)) uniform[k] = { a: avg[k].a, p: avg[k].a.map(() => 1 / avg[k].a.length) };
  const e = exactKuhnExploitability(uniform);
  assert(e.exploitability > 0.1, `uniform exploitability ${e.exploitability}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
