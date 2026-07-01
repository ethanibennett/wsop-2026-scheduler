// ── Badugi JS<->Python parity harness (generator + JS-side oracle) ──
//
// The DRAW-game analogue of razz-parity.js. Generates K seeded badugi deals — a
// full 8-card assignment (4 cards per seat) plus a set of sampled betting
// decision nodes reached by walking the JS draw betting tree (badugi-game.js) —
// and serializes them to JSON. For every deal the JS oracle records the four
// quantities BOTH languages must agree on:
//
//   • firstActor   — first-to-act seat in the (M1 single) betting round. In the
//                    draw game position is fixed by the blinds: the button/SB
//                    (seat 0) acts first pre-draw. (Not board-derived like razz.)
//   • drawOrder    — [firstToDraw, secondToDraw]: OOP/BB (seat 1) draws first,
//                    the button (seat 0) draws second (draw-game.js).
//   • nodes[]      — { path, legal, toAct } : at each sampled betting node, the
//                    token path that reaches it + the legal-action set + seat.
//   • showdown     — winner of the badugi showdown (0 / 1 / -1 split), via the
//                    JS badugi eval on the full 4-card hands.
//
// The Python checker (badugi_parity_check.py) imports resolve_draw.py +
// eval_badugi.py and recomputes all four INDEPENDENTLY, then diffs. The betting
// tree is shared verbatim in spirit between JS and Python, so any seat-order /
// showdown / legal-action / draw-order divergence is a real rule bug.
//
// Usage:
//   node solver/games/badugi-parity.js --deals 2000 --seed 1 --out <file.json>
//   node solver/games/badugi-parity.js --self        # JS-only consistency check

const fs = require('fs');
const path = require('path');
const { makeRng, shuffledDeck, cardStr } = require('../engine/cards');
const { badugiScore } = require('../eval/badugi');
const game = require('./badugi-game');

// Walk ONE betting round from a fresh hand, sampling actions with `rng`, and
// collect the decision nodes (where >1 action exists) along the path taken,
// recording the token path + legal set + acting seat. We stop at the first
// street boundary (phase leaves 'bet') — M1 is the single-round subgame.
function sampleDeal(rng) {
  const s0 = game.newHand(rng);
  const hands = [s0.hands[0].slice(), s0.hands[1].slice()];

  // firstActor of the betting round + the draw order are fixed by the blinds.
  const firstActor = s0.toAct;                 // button/SB (seat 0) pre-draw
  // draw order: after the round closes, phase becomes 'draw' with toAct = OOP.
  // We derive it structurally from the game rather than hard-coding.
  const drawOrder = deriveDrawOrder(s0);

  const nodes = [];
  let s = s0;
  let path = [];
  let guard = 0;
  while (!game.isTerminal(s) && s.phase === 'bet') {
    if (++guard > 50) break;
    const acts = game.legalActions(s);
    if (acts.length > 1) {
      nodes.push({ path: path.slice(), legal: acts.slice(), toAct: s.toAct });
    }
    let idx = Math.floor(rng() * acts.length);
    // don't fold too eagerly, so we exercise deeper betting lines
    if (acts[idx] === 'f' && rng() < 0.7 && acts.length > 1) idx = (idx + 1) % acts.length;
    const a = acts[idx];
    path.push(a);
    s = game.applyAction(s, a);
  }

  // showdown winner from the JS badugi eval on the full 4-card hands.
  const a = badugiScore(hands[0]), b = badugiScore(hands[1]);
  const winner = a < b ? 0 : a > b ? 1 : -1;

  return {
    hands: [hands[0].map(cardStr), hands[1].map(cardStr)],
    firstActor,
    drawOrder,
    nodes,
    showdown: winner,
  };
}

// Structurally derive who draws first / second by driving the game to the draw
// phase down a check/check line (no rng): OOP (BB) draws first, button second.
function deriveDrawOrder(s0) {
  let s = s0;
  // pre-draw both check/call to close the round: button calls, BB checks.
  s = game.applyAction(s, 'c'); // button calls the BB
  s = game.applyAction(s, 'k'); // BB checks -> round closes, phase 'draw'
  const first = s.toAct;         // OOP draws first
  // apply a pat draw for the first drawer to see who's next
  const s2 = game.applyAction(s, 'd0');
  const second = s2.toAct;
  return [first, second];
}

function generate(deals, seed) {
  const rng = makeRng(seed);
  const out = [];
  for (let i = 0; i < deals; i++) out.push(sampleDeal(rng));
  return out;
}

// JS-only self-consistency: first actor is always the button (seat 0) pre-draw,
// and the draw order is always [1, 0] (OOP first), by the fixed-limit rules.
function selfCheck(deals, seed) {
  const data = generate(deals, seed);
  let bad = 0;
  for (const d of data) {
    if (d.firstActor !== 0) { bad++; continue; }
    if (d.drawOrder[0] !== 1 || d.drawOrder[1] !== 0) { bad++; }
  }
  console.log(`self-check: ${data.length} deals, ${bad} seat-order mismatches`);
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
  const out = get('--out', path.join(__dirname, '..', '..', 'scratch-badugi-parity.json'));
  const data = generate(deals, seed);
  fs.writeFileSync(out, JSON.stringify({ deals, seed, cases: data }));
  console.log(`wrote ${data.length} deals -> ${out}`);
}

if (require.main === module) main();

module.exports = { generate, sampleDeal };
