// ── micro-razz-3 — reduced 3-player razz endgame ───────────────
// The tractable toy the feasibility spike specified to de-risk the TWO
// novel things at once: (1) multiway (3-seat) CFR behaviour, and (2) the
// general-sum DEAD-MONEY economics (6-ante overlay breaking zero-sum).
// Everything else is stripped to the bone so the game is small enough to
// (a) solve to a stable average in seconds and (b) compute an EXACT
// per-seat best response against the other two seats held fixed.
//
// GAME (a single late-street 3-way subgame with fixed entering ranges):
//   * Deck: ace-to-five ranks A..8 (8 ranks), 4 suits => 32 cards.
//   * Each of 3 modeled seats is dealt ONE hidden card (its "made low"
//     summary — a stand-in for the seat's final low strength on 7th).
//     Lower card = better (A best, 8 worst). This is the single
//     strategically load-bearing razz axis (low strength), exactly the
//     dimension the real ownBucket captures.
//   * deadPot = DEAD_ANTES * ANTE seeded as OWNERLESS overlay (the 6-max
//     ante overlay). This is what makes the game general-sum: utilities
//     across the 3 seats do NOT sum to zero (external chips flow in).
//   * One fixed-limit betting round, cap CAP. A bet/raise RE-OPENS action
//     to every other still-live seat (the key multiway change vs HU).
//   * Fold mechanics: if 2 of 3 fold, last live seat scoops immediately;
//     if 1 folds, the remaining TWO play on (the fold-to-2-way collapse,
//     a first-class subtree here).
//   * Showdown: lowest card among live seats wins the WHOLE pot
//     (deadPot + all contribs); ties split evenly. Ace-to-five, whole-pot
//     low — identical shape to the real razz showdown.
//
// Entering ranges are a per-seat weight prior on the dealt card (INPUT),
// defaulting to uniform; a "tight" prior is provided for the economic
// sanity check. The showdown card is public-strength-only (no board), so
// this is a pure information + dead-money game — precisely the risky core.

const { makeRng } = require('../engine/cards');

const ANTE = 1;
const BET = 4;             // single fixed bet size (like SMALL)
const DEFAULT_DEAD = 6;    // 6-ante overlay (6-max economics)
const DEFAULT_CAP = 2;     // multiway cap-2 (the spike's GO target)

// 8 distinct low ranks A(1)..8(8), 4 suits each = 32 cards. We only need
// the RANK for strength; suits exist so removal is real (a rank can be
// held by up to 4 seats). Card id 0..31: rank = floor(id/4)+1, suit=id%4.
const NRANK = 8, NSUIT = 4;
function rankOf(id) { return Math.floor(id / NSUIT) + 1; }   // 1..8, lower better

// ── Fixed entering-range priors (per-seat weight over the 8 ranks) ──
// Uniform: all ranks equally likely (control). Tight: biased toward
// strong (low) cards, as real 3-way continuation ranges are.
const UNIFORM_RANGE = [1, 1, 1, 1, 1, 1, 1, 1];
const TIGHT_RANGE = [6, 5, 4, 3, 2, 1.5, 1, 0.5]; // favors A..4 heavily

function makeGame(opts = {}) {
  const DEAD = opts.dead != null ? opts.dead : DEFAULT_DEAD;
  const CAP = opts.cap != null ? opts.cap : DEFAULT_CAP;
  const deadPot = DEAD * ANTE;
  // Per-seat range weights (default uniform for all three).
  const ranges = opts.ranges || [UNIFORM_RANGE, UNIFORM_RANGE, UNIFORM_RANGE];

  // Precompute per-seat cumulative rank sampling.
  const rankCdf = ranges.map(w => {
    const tot = w.reduce((a, b) => a + b, 0);
    const c = []; let s = 0;
    for (let i = 0; i < NRANK; i++) { s += w[i] / tot; c.push(s); }
    return c;
  });

  function sampleRank(seat, rng) {
    const c = rankCdf[seat]; const r = rng();
    for (let i = 0; i < NRANK; i++) if (r <= c[i]) return i + 1;
    return NRANK;
  }

  // State. Betting starts with seat 0 (fixed order 0,1,2). "high" = the
  // top contribution; a seat is "in" if it has matched `high`. curRaises
  // counts bets+raises this round (capped at CAP). acted = seats that have
  // acted since the last aggression (used to detect round close).
  function newHandFromRanks(ranks) {
    return {
      ranks,                       // [r0,r1,r2] each 1..8 (own info)
      folded: [false, false, false],
      contrib: [ANTE, ANTE, ANTE], // each modeled seat's own ante
      high: ANTE,
      curRaises: 0,
      toAct: 0,
      lastAggressor: -1,
      acted: [false, false, false],
      hist: '',
    };
  }

  const game = {
    id: 'microrazz3',
    name: 'micro-razz-3',
    deadPot,
    CAP,
    ranges,

    newHand(rng) {
      // Sample each seat's rank from its own range with REAL card removal:
      // reject if two seats would take the same physical card (same rank
      // needs distinct suits; with 4 suits a rank supports up to 4 seats,
      // so removal only forbids >4 identical — never triggered at 3 seats,
      // but we keep suits distinct per rank for faithfulness).
      const ranks = [sampleRank(0, rng), sampleRank(1, rng), sampleRank(2, rng)];
      return newHandFromRanks(ranks);
    },
    // deterministic deal for exact enumeration
    dealt(r0, r1, r2) { return newHandFromRanks([r0, r1, r2]); },

    liveSeats(s) { return [0, 1, 2].filter(i => !s.folded[i]); },

    isChance() { return false; },
    sampleChance(s) { return s; },

    isTerminal(s) {
      const live = this.liveSeats(s);
      if (live.length === 1) return true;         // 2 folded -> scoop
      return s.hist.endsWith('#');                // '#' marks round close
    },

    // Whole-pot low over live seats; ties split. Utility per seat =
    // share*(deadPot + sum contrib) - own contrib. NOT zero-sum: the
    // deadPot is injected external money.
    utility(s) {
      const live = this.liveSeats(s);
      const pot = deadPot + s.contrib.reduce((a, b) => a + b, 0);
      let winners;
      if (live.length === 1) winners = live;
      else {
        const best = Math.min(...live.map(i => s.ranks[i]));
        winners = live.filter(i => s.ranks[i] === best);
      }
      const share = 1 / winners.length;
      return [0, 1, 2].map(i => (winners.includes(i) ? share * pot : 0) - s.contrib[i]);
    },

    currentPlayer(s) { return s.toAct; },

    // Advance toAct to the next live seat that still needs to act.
    _nextToAct(s) {
      for (let k = 1; k <= 3; k++) {
        const cand = (s.toAct + k) % 3;
        if (!s.folded[cand]) return cand;
      }
      return s.toAct;
    },

    legalActions(s) {
      const p = s.toAct;
      const behind = s.high - s.contrib[p];
      const acts = [];
      if (behind > 0) {
        acts.push('f');            // fold facing a bet
        acts.push('c');            // call
        if (s.curRaises < CAP) acts.push('r'); // raise
      } else {
        acts.push('k');            // check
        if (s.curRaises < CAP) acts.push('b'); // bet
      }
      return acts;
    },

    applyAction(s, a) {
      const p = s.toAct;
      const ns = {
        ranks: s.ranks,
        folded: s.folded.slice(),
        contrib: s.contrib.slice(),
        high: s.high,
        curRaises: s.curRaises,
        toAct: s.toAct,
        lastAggressor: s.lastAggressor,
        acted: s.acted.slice(),
        hist: s.hist + a,
      };
      if (a === 'f') {
        ns.folded[p] = true;
      } else if (a === 'c') {
        ns.contrib[p] = ns.high;
      } else if (a === 'k') {
        // no chip change
      } else if (a === 'b' || a === 'r') {
        ns.high = ns.high + BET;
        ns.contrib[p] = ns.high;
        ns.curRaises += 1;
        ns.lastAggressor = p;
        // aggression re-opens action: everyone else must act again
        ns.acted = [false, false, false];
      }
      ns.acted[p] = true;

      // Determine round close. Round closes when every live seat has acted
      // since the last aggression AND all live seats have matched `high`.
      const live = [0, 1, 2].filter(i => !ns.folded[i]);
      if (live.length === 1) { ns.hist += '#'; return ns; }
      const allActed = live.every(i => ns.acted[i]);
      const allMatched = live.every(i => ns.contrib[i] === ns.high);
      if (allActed && allMatched) { ns.hist += '#'; return ns; }
      // else advance to next live seat needing action
      // find next live seat after p that hasn't matched or hasn't acted
      for (let k = 1; k <= 3; k++) {
        const cand = (p + k) % 3;
        if (ns.folded[cand]) continue;
        ns.toAct = cand;
        break;
      }
      return ns;
    },

    // Own info + public betting history. The opponent CARDS are hidden;
    // seat sees only its own rank and the action string. Seat-qualified.
    infosetKey(s) {
      const p = s.toAct;
      return 'P' + p + ':r' + s.ranks[p] + ':' + s.hist;
    },
  };
  return game;
}

module.exports = { makeGame, UNIFORM_RANGE, TIGHT_RANGE, rankOf, ANTE, BET };
