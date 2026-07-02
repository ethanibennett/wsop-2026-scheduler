// ── Badugi DRAW-TRANSITION JS<->Python parity harness (M2a) ──
//
// Extends badugi-parity.js from the M1 single betting round to the M2a DRAW
// BOUNDARY. For K seeded deals it drives badugi-game.js through a full one-draw
// sequence (pre-draw check/call close -> OOP draws -> IP draws -> replacement
// chance) and records, for BOTH seats, the exact draw MECHANICS the Python draw
// resolver (resolve_draw2.py) must reproduce:
//
//   • drawOrder      — [firstToDraw, secondToDraw] == [1, 0] (OOP/BB draws first)
//   • for each seat p:
//       predraw      — the 4-card hand before the draw
//       count        — the abstraction draw count k = drawOptions()-chosen count
//       keep         — cfg.chooseKeep(predraw, k): the kept subset (order-sensitive)
//       discards     — predraw \ keep (the dead cards)
//       replaced     — the k replacement cards popped off the seeded deck
//       pool         — the UNSEEN deck the replacement is legally drawn from at
//                      the moment this seat draws: 52 − (both current hands) −
//                      (both seats' discards SO FAR). The replacement MUST be a
//                      subset of this pool (shared-deck legality).
//       postdraw     — the resulting 4-card hand after replacement
//   • drawOptions    — cfg.drawOptions(predraw) for each seat's predraw hand
//
// The Python checker (badugi_draw_parity_check.py) recomputes choose_keep /
// draw_options INDEPENDENTLY and verifies keep/discard/count parity, that the
// replacement is drawn from the correct unseen pool, and the draw order — 0
// mismatches over K deals == the draw transition is rule-identical across the
// JS state machine and the Python resolver.
//
// Usage:
//   node solver/games/badugi-draw-parity.js --deals 2000 --seed 7 --out <file>
//   node solver/games/badugi-draw-parity.js --self

const fs = require('fs');
const path = require('path');
const { makeRng, cardStr } = require('../engine/cards');
const game = require('./badugi-game');

const FULL_DECK = [];
for (let c = 0; c < 52; c++) FULL_DECK.push(cardStr(c));

// Drive ONE deal from a fresh hand through the whole draw boundary, recording
// the draw mechanics for both seats. Pre-draw we close the round with a plain
// check/call line (button calls, BB checks) so the draw always fires; the draw
// COUNTS themselves come from cfg.drawOptions sampled with rng (the abstraction).
function sampleDraw(rng) {
  let s = game.newHand(rng);
  const preHands = [s.hands[0].slice(), s.hands[1].slice()];

  // close the pre-draw betting round: button calls, BB checks -> phase 'draw'.
  s = game.applyAction(s, 'c');
  s = game.applyAction(s, 'k');
  if (s.phase !== 'draw') throw new Error('expected draw phase after c/k');

  const drawOrder = [];
  const seats = {};

  // walk the draw: OOP (seat 1) draws first, then IP (seat 0), with a chance
  // (replacement) node between/after each real draw.
  let guard = 0;
  while (s.phase === 'draw' || s.phase === 'chance') {
    if (++guard > 20) throw new Error('draw loop guard');
    if (s.phase === 'chance') {
      s = game.sampleChance(s, rng);   // pops replacements off the seeded deck
      continue;
    }
    const p = s.toAct;
    drawOrder.push(p);
    const predraw = s.hands[p].slice();
    // the unseen pool AT THIS MOMENT: 52 − both current hands − discards so far.
    const seen = new Set([...s.hands[0], ...s.hands[1],
                          ...s.discards[0], ...s.discards[1]].map(cardStr));
    const pool = FULL_DECK.filter(c => !seen.has(c));
    // sample an abstraction draw count for this seat
    const opts = game.cfg.drawOptions(predraw);
    const k = opts[Math.floor(rng() * opts.length)];
    const keep = k > 0 ? game.cfg.chooseKeep(predraw, k) : predraw.slice();
    const before = s.hands[p].slice();

    s = game.applyAction(s, 'd' + k);
    // if k>0 the next node is 'chance'; resolve it now to read the replacement.
    let postdraw, replaced;
    if (k > 0) {
      const keepHand = s.hands[p].slice();          // applyAction('d'+k) left keep
      const keepStrs = new Set(keepHand.map(cardStr));
      s = game.sampleChance(s, rng);                // pops k replacements
      postdraw = s.hands[p].slice();
      replaced = postdraw.filter(c => !keepStrs.has(cardStr(c)));  // drawn cards
    } else {
      postdraw = s.hands[p].slice();
      replaced = [];
    }
    const keepStrs = new Set(keep.map(cardStr));
    const discards = before.filter(c => !keepStrs.has(cardStr(c)));

    seats[p] = {
      predraw: predraw.map(cardStr),
      count: k,
      keep: keep.map(cardStr),
      discards: discards.map(cardStr),
      replaced: replaced.map(cardStr),
      pool,                                          // legal unseen deck (strings)
      postdraw: postdraw.map(cardStr),
      drawOptions: opts.slice(),
    };
  }

  return { drawOrder, seats };
}

function generate(deals, seed) {
  const rng = makeRng(seed);
  const out = [];
  for (let i = 0; i < deals; i++) out.push(sampleDraw(rng));
  return out;
}

// JS-only self-consistency: OOP (1) always draws first, IP (0) second; every
// replacement is a subset of the recorded unseen pool; keep is a subset of the
// pre-draw hand; count == handSize − keep.length.
function selfCheck(deals, seed) {
  const data = generate(deals, seed);
  let bad = 0;
  for (const d of data) {
    if (d.drawOrder[0] !== 1 || d.drawOrder[1] !== 0) { bad++; continue; }
    for (const p of [0, 1]) {
      const t = d.seats[p];
      const poolSet = new Set(t.pool);
      if (!t.replaced.every(c => poolSet.has(c))) { bad++; break; }
      const preSet = new Set(t.predraw);
      if (!t.keep.every(c => preSet.has(c))) { bad++; break; }
      if (t.count !== 4 - t.keep.length) { bad++; break; }
    }
  }
  console.log(`draw self-check: ${data.length} deals, ${bad} mismatches`);
  return bad === 0;
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
  if (args.includes('--self')) {
    const ok = selfCheck(parseInt(get('--deals', '2000'), 10),
                         parseInt(get('--seed', '7'), 10));
    process.exit(ok ? 0 : 1);
  }
  const deals = parseInt(get('--deals', '2000'), 10);
  const seed = parseInt(get('--seed', '7'), 10);
  const out = get('--out', path.join(__dirname, '..', '..', 'scratch-badugi-draw-parity.json'));
  const data = generate(deals, seed);
  fs.writeFileSync(out, JSON.stringify({ deals, seed, cases: data }));
  console.log(`wrote ${data.length} draw deals -> ${out}`);
}

if (require.main === module) main();

module.exports = { generate, sampleDraw };
