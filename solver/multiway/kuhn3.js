// ── 3-player Kuhn poker — engine-validation game ───────────────
// Isolates the ENGINE change (3-seat external-sampling CFR) from razz.
// Standard 3-player Kuhn: 4-card deck {0,1,2,3}, each player antes 1, one
// card each, a single bet size of 1. Betting order is seat 0,1,2. A "bet"
// (b) after all checks, or facing a bet each later player calls (c) or
// folds (f). Highest card among non-folded players wins the pot.
//
// 3-player Kuhn is the canonical multiway-CFR test bed (Abou Risk & Szafron
// 2010): it is general-sum-ish across seats (though here zero-sum overall),
// has NO unique equilibrium, but CFR reliably drives per-seat regret down
// to a low-regret profile. We use it purely to confirm the mccfr3 engine:
// per-seat regret must fall and the average strategy must stabilize.
//
// Encoding of hist (chars): each char is one action in seat order, action
// set {p(check), b(bet), c(call), f(fold)}. Round 1 is the check/bet
// round; if someone bets, remaining players call/fold in order.

const CARDS = ['0', '1', '2', '3'];

// Enumerate whose turn it is and whether the hand is over from hist.
// Returns { done, toAct, contribList, folded, aggressor } given hist.
function replay(hist) {
  // contrib beyond the ante; folded set; who has bet.
  const inFor = [1, 1, 1];        // ante
  const folded = [false, false, false];
  let pot = 3;
  let curBet = 0;                 // highest extra put in (0 or 1)
  const put = [0, 0, 0];          // extra beyond ante
  // Walk hist char by char in the natural action order.
  // We reconstruct the acting sequence.
  let order = [0, 1, 2];
  let idx = 0;
  let betOpen = false;
  let toActQueue = [0, 1, 2];
  // Simpler: simulate.
  let seatPtr = 0;
  const live = () => [0, 1, 2].filter(s => !folded[s]);
  let i = 0;
  // Phase 1: no bet yet — go around 0,1,2 with p/b until a bet or all check.
  let actor = 0;
  let betBy = -1;
  let toCall = [];
  while (i < hist.length) {
    const a = hist[i];
    if (!betOpen) {
      if (a === 'p') { actor = (actor + 1) % 3; }
      else if (a === 'b') { put[actor] = 1; pot += 1; curBet = 1; betOpen = true; betBy = actor;
        // remaining players after actor, wrapping, excluding actor
        toCall = [];
        for (let k = 1; k <= 2; k++) toCall.push((actor + k) % 3);
        actor = toCall.shift();
      }
    } else {
      if (a === 'c') { put[actor] = 1; pot += 1; }
      else if (a === 'f') { folded[actor] = true; }
      actor = toCall.length ? toCall.shift() : -1;
    }
    i++;
  }
  return { put, pot, folded, betOpen, betBy, actor, betClosed: betOpen && actor === -1 };
}

const game = {
  id: 'kuhn3',
  name: '3-Player Kuhn',

  newHand(rng) {
    const deck = [0, 1, 2, 3];
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    return { cards: [deck[0], deck[1], deck[2]], hist: '' };
  },
  dealt(c0, c1, c2) { return { cards: [c0, c1, c2], hist: '' }; },

  _state(s) { return replay(s.hist); },

  isTerminal(s) {
    const r = replay(s.hist);
    // Over if the pre-bet round completed with all checks (hist='ppp'),
    // or a bet round closed (betClosed), or only one player remains.
    if (s.hist === 'ppp') return true;
    if (r.betClosed) return true;
    const liveCount = r.folded.filter(f => !f).length;
    if (r.betOpen && liveCount === 1) return true;
    return false;
  },

  utility(s) {
    const r = replay(s.hist);
    const pot = r.pot;
    const contrib = r.put.map((x, i) => x + 1); // extra + ante
    const live = [0, 1, 2].filter(i => !r.folded[i]);
    let winner;
    if (live.length === 1) winner = live[0];
    else winner = live.reduce((best, i) => (s.cards[i] > s.cards[best] ? i : best), live[0]);
    return [0, 1, 2].map(i => (i === winner ? pot - contrib[i] : -contrib[i]));
  },

  isChance() { return false; },
  sampleChance(s) { return s; },

  currentPlayer(s) {
    const r = replay(s.hist);
    if (!r.betOpen) {
      // pre-bet round: actor index = number of p/b so far mod 3, but stop
      // once a bet opens (handled below). Count leading p's.
      return s.hist.length % 3;
    }
    return r.actor;
  },

  legalActions(s) {
    const r = replay(s.hist);
    if (!r.betOpen) return ['p', 'b'];
    return ['c', 'f'];
  },

  applyAction(s, a) { return { cards: s.cards, hist: s.hist + a }; },

  infosetKey(s) {
    const p = this.currentPlayer(s);
    return 'P' + p + ':' + CARDS[s.cards[p]] + ':' + s.hist;
  },
};

module.exports = game;
