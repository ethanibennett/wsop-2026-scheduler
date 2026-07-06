// ── grade7-tract — tractability probe for the 3-seat 7th-street grade ────────
// The 3-way showdown is O(H^3) in the per-seat holding count H (times a small
// constant for the deal-free betting tree, cap-2). This measures resolver wall-
// clock vs H so we can state how small the support must be to grade in seconds
// in pure node.
//
// Run: node solver/multiway/grade7-tract.js   (or: node grade7.js --tract)

const { grade7th, perSeatBR } = require('./grade7');
const { makeDeck, cardStr } = require('../engine/cards');

// Build a spot with H random distinct 3-downcard holdings per seat, all disjoint
// from the public boards. Deterministic given a seed.
function makeSpotH(H, seed) {
  let a = (seed >>> 0) || 1;
  const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const up = [
    ['2c', '4d', '5h', '7s'],
    ['3c', '6d', '8h', '9s'],
    ['Ac', 'Td', 'Jh', 'Qs'],
  ];
  const usedStr = new Set(up.flat());
  const deck = makeDeck().map(cardStr).filter(c => !usedStr.has(c));
  function drawHolding() {
    // sample 3 distinct cards NOT in used set; (does not enforce cross-seat
    // disjointness here — the resolver enforces removal at enumeration, so some
    // triples drop; that is realistic).
    const pool = deck.slice();
    const out = [];
    for (let k = 0; k < 3; k++) { const i = Math.floor(rnd() * pool.length); out.push(pool.splice(i, 1)[0]); }
    return out;
  }
  const ranges = [[], [], []];
  for (let p = 0; p < 3; p++) {
    const seen = new Set();
    while (ranges[p].length < H) {
      const h = drawHolding().sort();
      const key = h.join('');
      if (seen.has(key)) continue;
      seen.add(key);
      ranges[p].push({ down: h, w: 1 });
    }
  }
  const spec = { cap: 2, antes: 8, up, down: [ranges[0][0].down, ranges[1][0].down, ranges[2][0].down], contrib: [8, 8, 8], deadPot: 5, folded: [false, false, false] };
  return { spec, ranges };
}

function timeIt(fn) { const t = Date.now(); const r = fn(); return { ms: Date.now() - t, r }; }

function run() {
  console.log('H  | rawTriples | removalTriples | grade7th(ms) | perSeatBR(ms) | total(ms)');
  console.log('---+------------+----------------+--------------+---------------+---------');
  const profile = {}; // uniform profile (timing is profile-independent to first order)
  for (const H of [2, 4, 6, 8, 10, 12, 15, 20, 25, 30]) {
    const { spec, ranges } = makeSpotH(H, 12345 + H);
    let g, b;
    try {
      g = timeIt(() => grade7th(spec, ranges, profile, { hero: 0 }));
      b = timeIt(() => perSeatBR(spec, ranges, profile));
    } catch (e) { console.log(`${String(H).padStart(2)} | (error: ${e.message})`); continue; }
    const raw = H * H * H;
    const removal = g.r.tripleCount;
    console.log(`${String(H).padStart(2)} | ${String(raw).padStart(10)} | ${String(removal).padStart(14)} | ${String(g.ms).padStart(12)} | ${String(b.ms).padStart(13)} | ${g.ms + b.ms}`);
  }
  console.log('\nNotes: grade7th enumerates hero-holdings × opp1 × opp2 (O(H^3)) once per');
  console.log('hero root action; perSeatBR enumerates the SAME joint support 3× (one per');
  console.log('seat) with an 8-sweep BR. "seconds in node" = the largest H whose total');
  console.log('column stays under ~1000ms above.');
}

module.exports = { run, makeSpotH };
if (require.main === module) run();
