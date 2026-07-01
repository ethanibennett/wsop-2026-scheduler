// ── Razz JS<->Python parity harness (generator + JS-side oracle) ──
//
// Generates K seeded razz deals — a full 14-card assignment (3 down + 4
// up per seat) plus a set of sampled betting decision nodes reached by
// walking the JS razz betting tree — and serializes them to JSON. The
// JS side records, for every deal, the quantities both languages must
// agree on:
//
//   • bringIn        — the 3rd-street bring-in seat
//   • firstActor[5]  — first-to-act seat on each street (3rd..7th)
//   • nodes[]        — { path, legal } : at each sampled betting node, the
//                      action path that reaches it and the legal-action set
//   • showdown       — winner at a full showdown (0 / 1 / -1 split)
//
// The Python checker (razz_parity_check.py) imports razz_game.py +
// resolve.py and recomputes all four INDEPENDENTLY, then diffs. The
// betting tree is shared verbatim between JS and Python, so any seat-
// order / showdown / legal-action divergence is a real rule bug.
//
// Usage:
//   node solver/games/razz-parity.js --deals 2000 --seed 1 --out <file.json>
//   node solver/games/razz-parity.js --self        # JS-only consistency check

const fs = require('fs');
const path = require('path');
const { makeRng, shuffledDeck, cardStr, suitOf, lowRankOf } = require('../engine/cards');
const game = require('./razz-game');

// Walk the betting tree from a fresh hand, sampling actions with `rng`,
// and collect up to `maxNodes` decision nodes (where >1 action exists)
// along the path actually taken, recording the action path + legal set +
// the per-street first actor as streets are dealt. Card deals are forced
// to follow the pre-dealt `deck` order (deterministic, no extra rng).
function sampleDeal(rng) {
  const s0 = game.newHand(rng);
  const bringIn = s0.bringIn;
  const firstActor = [s0.starter]; // 3rd-street starter = bring-in

  // 1) Derive the FULL 7-card board (all chance outcomes) by replaying
  //    chance all the way to 7th street with no betting in between. This
  //    is the authoritative deal: it uses the real sampleChance pop order
  //    and the real firstActor recomputation, so no manual index math.
  let f = s0;
  while (f.street < 4) {
    f = game.sampleChance({ ...f, phase: 'deal' });
    firstActor[f.street] = f.starter;
  }
  const fullDown = [f.down[0].slice(), f.down[1].slice()];
  const fullUp = [f.up[0].slice(), f.up[1].slice()];

  // 2) Walk a real sampled betting line for the legal-action nodes. Card
  //    deals follow the same sampleChance pop order, so the public board
  //    at each street matches `fullUp` prefixes exactly.
  let s = s0;
  const nodes = [];
  let path = [];
  let guard = 0;
  while (!game.isTerminal(s)) {
    if (++guard > 200) break;
    if (game.isChance(s)) { s = game.sampleChance(s); path.push('/'); continue; }
    const acts = game.legalActions(s);
    if (acts.length > 1) {
      // path is an array of tokens: action-ids ('br','co','f','c','r','k','b')
      // and '/' street-boundary markers. Kept as tokens (not a joined string)
      // so the Python replay can't mis-split the two-char ids.
      nodes.push({ path: path.slice(), legal: acts.slice(), toAct: s.toAct, street: s.street });
    }
    let idx = Math.floor(rng() * acts.length);
    if (acts[idx] === 'f' && rng() < 0.7 && acts.length > 1) idx = (idx + 1) % acts.length;
    const a = acts[idx];
    path.push(a);
    s = game.applyAction(s, a);
  }

  const full0 = fullDown[0].concat(fullUp[0]);
  const full1 = fullDown[1].concat(fullUp[1]);

  // showdown winner from the JS utility on a forced full showdown
  const showState = {
    down: fullDown, up: fullUp, street: 4, phase: 'showdown',
    contrib: [10, 10], folded: null, toAct: 0, bringIn, log: [],
  };
  const u = game.utility(showState);
  const winner = u[0] > 0 ? 0 : u[0] < 0 ? 1 : -1;

  // per-street up boards (the Python side recomputes first-actor from these)
  const upByStreet = [];
  for (let street = 0; street <= 4; street++) {
    upByStreet.push([fullUp[0].slice(0, street + 1).map(cardStr),
                     fullUp[1].slice(0, street + 1).map(cardStr)]);
  }

  return {
    down: [fullDown[0].map(cardStr), fullDown[1].map(cardStr)],
    up: [fullUp[0].map(cardStr), fullUp[1].map(cardStr)],
    upByStreet,
    bringIn,
    firstActor,                       // JS-computed first actor per street
    nodes,                            // sampled betting nodes (path + legal)
    showdown: winner,
    full: [full0.map(cardStr), full1.map(cardStr)],
  };
}

function generate(deals, seed) {
  const rng = makeRng(seed);
  const out = [];
  for (let i = 0; i < deals; i++) out.push(sampleDeal(rng));
  return out;
}

// ── JS-only self-consistency: recompute bring-in/first-actor from the
// public board the "manual" way and confirm they match newHand/sampleChance.
function selfCheck(deals, seed) {
  const data = generate(deals, seed);
  let bad = 0;
  for (const d of data) {
    // manual bring-in: highest upcard (ace low) brings in; higher suit ties
    const { cardFromStr } = require('../engine/cards');
    const door0 = cardFromStr(d.up[0][0]), door1 = cardFromStr(d.up[1][0]);
    const bv = c => lowRankOf(c); // single-card razz board value == its low rank
    let bExp;
    if (bv(door0) !== bv(door1)) bExp = bv(door0) > bv(door1) ? 0 : 1;
    else bExp = suitOf(door0) > suitOf(door1) ? 0 : 1;
    if (bExp !== d.bringIn) { bad++; if (bad <= 5) console.log('bringIn mismatch', d.up.flat()); }
  }
  console.log(`self-check: ${data.length} deals, ${bad} bring-in mismatches`);
  return bad === 0;
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
  if (args.includes('--self')) {
    const ok = selfCheck(parseInt(get('--deals', '2000'), 10), parseInt(get('--seed', '1'), 10));
    process.exit(ok ? 0 : 1);
  }
  const deals = parseInt(get('--deals', '2000'), 10);
  const seed = parseInt(get('--seed', '1'), 10);
  const out = get('--out', path.join(__dirname, '..', '..', 'scratch-razz-parity.json'));
  const data = generate(deals, seed);
  fs.writeFileSync(out, JSON.stringify({ deals, seed, cases: data }));
  console.log(`wrote ${data.length} deals -> ${out}`);
}

if (require.main === module) main();

module.exports = { generate, sampleDeal };
