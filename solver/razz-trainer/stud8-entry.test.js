// Unit test for the stud8 hi/lo full-ring 3rd-street ENTRY model
// (grade.js stud8EntryTier + entryPrior stud8 branch). The 32 labeled examples
// come from the design workflow wf_6261eb65 (3 angles -> synthesis -> 4-lens
// adversarial critique -> finalize). Run: node solver/razz-trainer/stud8-entry.test.js
const { cardFromStr } = require('../engine/cards');
const { stud8EntryTier, STUD8_ENTRY_W, entryPrior } = require('./grade');

function parse(hand) {
  const cards = [];
  for (let i = 0; i < hand.length; i += 2) cards.push(cardFromStr(hand.slice(i, i + 2)));
  return cards;
}

// [hand, expectedTier] — 32 labeled examples spanning premium -> trash.
const CASES = [
  ['AhAsAd', 0], ['As2h3s', 0], ['Ac2c3c', 0], ['2d4d6d', 0], ['6s5s4s', 0],
  ['5c4c3c', 0], ['AcAd7h', 0],
  ['KsKh2c', 1], ['QsQh3d', 1], ['Ah4d8s', 1], ['7d6s5c', 1], ['9c8c7c', 1],
  ['Ac2cKc', 1], ['Ah2hKh', 1],
  ['8h7d5c', 2], ['JsJc4d', 2], ['Ad2hKc', 2], ['Ac2d2s', 2], ['Ah5hQh', 2],
  ['KcQc9c', 3], ['KcJc9c', 3], ['TsTd8h', 3], ['KsQhJd', 3], ['Th9d8c', 3], ['9h8d7c', 3],
  ['Ad5cKh', 4], ['Qs7h2d', 4], ['Jh7c2s', 4], ['8c8dAh', 4], ['2c2d3h', 4], ['AhTh9c', 4],
  ['Kd9h4c', 5],
];

let pass = 0, fail = 0;
for (const [hand, wantTier] of CASES) {
  const cards = parse(hand);
  const gotTier = stud8EntryTier(cards);
  if (gotTier === wantTier) { pass++; }
  else { fail++; console.log(`  FAIL ${hand}: got tier ${gotTier} (w=${STUD8_ENTRY_W[gotTier]}), want ${wantTier} (w=${STUD8_ENTRY_W[wantTier]})`); }
}
console.log(`stud8EntryTier: ${pass}/${CASES.length} labeled examples reproduce`);

// entryPrior wiring: 3rd-street (door + 2 hole) must return STUD8_ENTRY_W[tier].
const G = { id: 'stud8' };
let wpass = 0, wfail = 0;
for (const [hand, wantTier] of CASES) {
  const [door, h1, h2] = parse(hand);
  const got = entryPrior(G, door, [h1, h2]);
  const want = STUD8_ENTRY_W[wantTier];
  if (Math.abs(got - want) < 1e-9) wpass++;
  else { wfail++; console.log(`  FAIL entryPrior ${hand}: got ${got}, want ${want}`); }
}
console.log(`entryPrior 3rd-street: ${wpass}/${CASES.length} weights match`);

// 7th-street max-over-decomposition: a premium 2-hole + a junk river must keep
// the premium weight (best legit hole pairing wins). Ac,2c + hole; river = Kd junk.
// combo = [2c(hole), Ac(hole), Kd(river)] with door 3c -> best start = 3c-2c-Ac = wheel three-flush T0=1.0
const seven = entryPrior(G, cardFromStr('3c'), [cardFromStr('2c'), cardFromStr('Ac'), cardFromStr('Kd')]);
const sevenOk = Math.abs(seven - 1.0) < 1e-9;
console.log(`entryPrior 7th-street max-decomp (Ac2c3c + Kd river): ${seven} ${sevenOk ? 'OK (T0 kept)' : 'FAIL want 1.0'}`);

// razz path untouched (regression): a razz game id must still use earlyLowTier, not stud8.
const razzUnaffected = entryPrior({ id: 'razz' }, cardFromStr('Ah'), [cardFromStr('2d'), cardFromStr('3c')]);
console.log(`entryPrior razz path still active: ${razzUnaffected} (should be a razz weight, not undefined)`);

// non-stud/razz games must be a no-op (weight 1).
const noop = entryPrior({ id: 'td27' }, cardFromStr('Ah'), [cardFromStr('2d'), cardFromStr('3c')]);
console.log(`entryPrior non-stud noop: ${noop} ${noop === 1 ? 'OK' : 'FAIL want 1'}`);

const allOk = fail === 0 && wfail === 0 && sevenOk && noop === 1 && razzUnaffected != null;
console.log(allOk ? '\nALL STUD8 ENTRY TESTS PASS' : '\nSTUD8 ENTRY TESTS FAILED');
process.exit(allOk ? 0 : 1);
