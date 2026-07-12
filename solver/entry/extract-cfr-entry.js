// Read the DERIVED 3rd-street entry range off a converged razz3 blueprint.
// P(enter | own-bucket) = reach-weighted (1 - P(fold)) over the street-0 infosets
// that HAVE a fold option (the voluntary entry decisions; the forced bring-in seat
// gets ['br','co'] and can't fold, so it's excluded). Maps an exact 3-card hand ->
// its street-0 own-bucket -> P(enter). Point this at razz3-uniform.json once the
// uniform-deal grind converges (the biased razz3.json validates the MECHANICS only —
// its values reflect the hand-tuned deal). See DERIVATION_SPEC.md.
const fs = require('fs');
const { ownBucketCards } = require('../multiway/razz3-game');
const { earlyLowTier } = require('../games/razz-game');
const { cardFromStr } = require('../engine/cards');

const parse = h => { const c = []; for (let i = 0; i < h.length; i += 2) c.push(cardFromStr(h.slice(i, i + 2))); return c; };
// street-0 own bucket = razz3 ownBucketCards + the hole-aware H-tier (infosetKey appends it on streets 0-1)
const bucketOf = cards => ownBucketCards(cards) + 'H' + earlyLowTier(cards);

function extract(blueprintPath) {
  const bp = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
  const map = bp.strategy || bp.infosets || bp;   // infoset map (meta lives separately / lacks '|')
  const acc = new Map();                           // bucket -> {enter, tot}
  let n0 = 0, nVol = 0;
  for (const key of Object.keys(map)) {
    if (key[0] !== '0' || key.indexOf('|') < 0) continue; // street-0 infosets only
    n0++;
    const node = map[key];
    const a = node.a, p = node.p, m = node.m || 1;
    if (!a || !p) continue;
    const fi = a.indexOf('f');
    if (fi < 0) continue;                          // forced bring-in (br/co) — not voluntary
    nVol++;
    const bucket = key.split('|')[4];
    const pEnter = 1 - p[fi];
    let e = acc.get(bucket); if (!e) { e = { enter: 0, tot: 0 }; acc.set(bucket, e); }
    e.enter += m * pEnter; e.tot += m;
  }
  const table = new Map();
  for (const [b, e] of acc) table.set(b, e.tot > 0 ? e.enter / e.tot : null);
  return { table, meta: bp.meta || {}, n0, nVol };
}

const pEnterHand = (table, handStr) => table.get(bucketOf(parse(handStr)));

module.exports = { extract, bucketOf, pEnterHand, parse };

// ── CLI: node solver/entry/extract-cfr-entry.js [blueprint.json] ──
if (require.main === module) {
  const path = process.argv[2] || 'solver/strategies/razz3.json';
  const { table, meta, n0, nVol } = extract(path);
  console.log(`blueprint: ${path}  (uniform=${meta.uniform}, iters=${meta.iters}, cap=${meta.cap})`);
  console.log(`street-0 infosets: ${n0}  | with a voluntary fold/enter decision: ${nVol}  | distinct buckets: ${table.size}`);
  const gates = ['As2h3d', '2c3h4d', 'Ah2c4d', '5s4d3c', '6s5d4c', '8s7d5c', '8s6d4c', '2c2h5d', '3c3h6d', 'Ac5d8s', 'KsQd9c', 'KdJh8c', 'Qs9h4d'];
  console.log('\nhand      bucket        P(enter)');
  for (const h of gates) {
    const v = pEnterHand(table, h);
    console.log(`  ${h.padEnd(8)} ${bucketOf(parse(h)).padEnd(10)} ${v == null ? '— (unseen bucket)' : v.toFixed(3)}`);
  }
}
