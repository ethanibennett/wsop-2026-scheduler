// Foundations for the derived entry range (design wf_583effdb):
//   (1) economics.potAndCost — the threshold E* read from razz3-game.js rulebook.
//   (2) equity.multiwayShare — the EV-exact k-way split share.
// Run: node solver/entry/entry-core.test.js
const { potAndCost } = require('./economics');
const { multiwayShare } = require('../equity');
const { cardFromStr } = require('../engine/cards');

const H = s => s.trim().split(/\s+/).map(cardFromStr);
let pass = 0, fail = 0;
function ok(name, cond, got) { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}  got=${got}`); } }
const near = (a, b) => Math.abs(a - b) < 1e-9;

// ── economics: the threshold is derived from the rulebook, not tuned ──
ok('E*(m=3,open)=0.20 (locks to utility() pot=20)', near(potAndCost({ m: 3, action: 'open' }).eStar, 0.20), potAndCost({ m: 3, action: 'open' }).eStar);
ok('E*(m=3,bringin)=0.10 (discounted, BRING posted)', near(potAndCost({ m: 3, action: 'bringin' }).eStar, 0.10), potAndCost({ m: 3, action: 'bringin' }).eStar);
ok('E*(m=2,open)=0.25 (smaller pot, higher bar)', near(potAndCost({ m: 2, action: 'open' }).eStar, 0.25), potAndCost({ m: 2, action: 'open' }).eStar);
// ante sensitivity: MORE dead money => LOWER bar => wider range, with zero re-tuning
ok('more antes widens (E*@8 < E*@6)', potAndCost({ m: 3, antes: 8 }).eStar < potAndCost({ m: 3, antes: 6 }).eStar,
  `${potAndCost({ m: 3, antes: 8 }).eStar} vs ${potAndCost({ m: 3, antes: 6 }).eStar}`);

// ── multiwayShare: razz (low-only) ──
// hero wheel vs a 6-low and a rough low (3-way): hero best low -> share 1.0
ok('razz 3-way: wheel scoops the low',
  near(multiwayShare('razz', H('As 2h 3d 4c 5s Kh Qd'), [H('2c 3h 4d 5c 6h 7s 8c'), H('6s 7h 8d 9c Th Js Qc')]), 1.0),
  multiwayShare('razz', H('As 2h 3d 4c 5s Kh Qd'), [H('2c 3h 4d 5c 6h 7s 8c'), H('6s 7h 8d 9c Th Js Qc')]));
// two wheels tie heads-up -> 0.5
ok('razz 2-way: tied wheels split',
  near(multiwayShare('razz', H('As 2h 3d 4c 5s Kh Qd'), [H('Ac 2s 3h 4d 5c Ks Qh')]), 0.5),
  multiwayShare('razz', H('As 2h 3d 4c 5s Kh Qd'), [H('Ac 2s 3h 4d 5c Ks Qh')]));

// ── multiwayShare: stud8 (hi/lo split) ──
// hero straight-flush wheel scoops (best hi AND best lo) -> 1.0
ok('stud8: SF wheel scoops',
  near(multiwayShare('stud8', H('As 2s 3s 4s 5s Kh Qd'), [H('Kc Kd Kh Qc Qh 9c 8d'), H('7c 8h 9d Tc Jh 6s 5c')]), 1.0),
  multiwayShare('stud8', H('As 2s 3s 4s 5s Kh Qd'), [H('Kc Kd Kh Qc Qh 9c 8d'), H('7c 8h 9d Tc Jh 6s 5c')]));
// hero wins LOW only (wheel low, weak hi) vs a set that wins HI, no other low -> 0.5
ok('stud8 2-way: low-only hero gets half',
  near(multiwayShare('stud8', H('As 2h 3d 4c 5s Kh Qd'), [H('Kc Kd Ks 9h 9d 7c 8s')]), 0.5),
  multiwayShare('stud8', H('As 2h 3d 4c 5s Kh Qd'), [H('Kc Kd Ks 9h 9d 7c 8s')]));
// nobody qualifies for low -> high winner scoops the whole pot (hero best hi) -> 1.0
ok('stud8: no qualifying low -> hi scoops',
  near(multiwayShare('stud8', H('Kh Kd Ks Qh Qd 9c 8s'), [H('Ac Ad Qc Jh Th 9d 8h'), H('Jc Jd Ts 9s 8c 7d 6h')]), 1.0),
  multiwayShare('stud8', H('Kh Kd Ks Qh Qd 9c 8s'), [H('Ac Ad Qc Jh Th 9d 8h'), H('Jc Jd Ts 9s 8c 7d 6h')]));

console.log(`\nentry-core: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
