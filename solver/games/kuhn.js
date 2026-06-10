// ── Kuhn poker — engine validation game ─────────────────────
// 3-card deck (J,Q,K), 1 chip ante, single bet of 1. The Nash
// equilibrium and game value (-1/18 for player 0) are known in
// closed form, which makes this ideal for verifying the MCCFR
// engine converges correctly. Not exposed in the trainer UI.

const CARDS = ['J', 'Q', 'K'];

const game = {
  id: 'kuhn',
  name: 'Kuhn Poker',

  newHand(rng) {
    const deck = [0, 1, 2];
    const i = Math.floor(rng() * 3);
    const c0 = deck.splice(i, 1)[0];
    const c1 = deck[Math.floor(rng() * 2)];
    return { cards: [c0, c1], hist: '' };
  },

  // deal both cards explicitly (used by the exact-EV test)
  dealt(c0, c1) { return { cards: [c0, c1], hist: '' }; },

  isTerminal(s) {
    const h = s.hist;
    return h === 'pp' || h === 'bc' || h === 'bf' || h === 'pbc' || h === 'pbf';
  },

  utility(s) {
    const h = s.hist;
    const win0 = s.cards[0] > s.cards[1];
    if (h === 'bf') return [1, -1];
    if (h === 'pbf') return [-1, 1];
    const amt = (h === 'pp') ? 1 : 2;
    return win0 ? [amt, -amt] : [-amt, amt];
  },

  isChance() { return false; },
  sampleChance(s) { return s; },

  currentPlayer(s) { return s.hist.length % 2; },

  legalActions(s) {
    return s.hist.endsWith('b') ? ['c', 'f'] : ['p', 'b'];
  },

  applyAction(s, a) {
    return { cards: s.cards, hist: s.hist + a };
  },

  infosetKey(s) {
    const p = this.currentPlayer(s);
    return CARDS[s.cards[p]] + ':' + s.hist;
  },
};

module.exports = game;
