// td27 blueprint spot-query helper — for comparing course principles to the solver.
// Given a hand (+ optional opponent hand + line to reach a node), returns the trained
// td27 blueprint's action frequencies at each decision node it passes through.
// HU fixed-limit: seat 0 = button/SB (acts first pre-draw), seat 1 = BB (draws first).
const { GAMES } = require('./games');
const play = require('./draw-trainer/play');
const game = GAMES.td27;
const bp = require('./strategies/td27.json');
const { bucket27, chooseKeep27 } = require('./games/triple-draw-27');

// Query: hand strings for both seats + a line of {actor,action} to reach the node(s).
// Returns each decision's {seat, kind, street, acts, probs, key}.
function query(heroHand, oppHand, line, opts = {}) {
  const cards = { hands: [heroHand, oppHand || ['Ts', 'Js', 'Qs', 'Kd', 'Ac']], future: opts.future || [] };
  const rec = play.buildHandRecord(cards, line, { game, heroSeat: 0, blueprint: bp });
  return rec.decisions.map(d => ({
    seat: d.actor, kind: d.kind, street: d.street, phase: d.phase,
    acts: d.acts, probs: (d.gtoProbs || []).map(p => +p.toFixed(3)),
    trained: d.gtoTrained, key: d.key,
  }));
}

function fmt(hand) { return hand.join(' '); }
function pct(probs, acts, a) { const i = acts.indexOf(a); return i < 0 ? 0 : Math.round(probs[i] * 100); }

if (require.main === module) {
  // Smoke test: a few representative spots.
  const spots = [
    { name: 'pat 7 (2-3-4-5-7), button first-in pre-draw', hero: ['2h', '3d', '4c', '5s', '7h'], line: [{ actor: 0, action: 'r' }] },
    { name: 'smooth 1-card draw to a 7 (2-3-4-7 + K), button pre-draw', hero: ['2h', '3d', '4c', '7s', 'Kd'], line: [{ actor: 0, action: 'r' }] },
    { name: 'rough draw (2-3-8 + T,Q), button pre-draw', hero: ['2h', '3d', '8c', 'Ts', 'Qd'], line: [{ actor: 0, action: 'r' }] },
    { name: 'trash (9-T-J-Q-K), button pre-draw', hero: ['9h', 'Td', 'Jc', 'Qs', 'Kd'], line: [{ actor: 0, action: 'r' }] },
  ];
  for (const s of spots) {
    const d = query(s.hero, null, s.line)[0];
    console.log(`\n${s.name}`);
    console.log(`  hand ${fmt(s.hero)}  bucket=${bucket27(s.hero.map(c => require('./engine/cards').cardFromStr(c)))}`);
    if (!d) { console.log('  (no decision)'); continue; }
    const parts = d.acts.map((a, i) => `${a} ${Math.round(d.probs[i] * 100)}%`);
    console.log(`  street ${d.street} ${d.kind} node: ${parts.join('  ')}  ${d.trained ? '' : '(UNTRAINED key→uniform)'}`);
  }
}

module.exports = { query, pct, bucket27, chooseKeep27 };
