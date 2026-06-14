// ── Heads-up fixed-limit triple-draw game factory ───────────
// Shared structure for 2-7 Triple Draw and Badugi:
//   blinds 1/2 (small bet = 2, big bet = 4), four betting rounds,
//   three draws, 4-bet cap per round. Player 0 = button/SB (acts
//   first pre-draw), player 1 = BB (acts first after each draw and
//   draws first).
//
// A config supplies the game-specific parts:
//   handSize        5 (2-7) or 4 (badugi)
//   compare(h0,h1)  -> 1 if h0 wins, -1 if h1 wins, 0 tie
//   bucket(hand, street, phase) -> abstraction key for the hand
//   chooseKeep(hand, drawCount) -> cards to keep (discard heuristic)
//   drawOptions(hand) -> draw counts worth considering (incl. 0 = pat)
//   describeHand(hand) -> short human label for the trainer UI

const { shuffledDeck, cardStr } = require('../engine/cards');

const SMALL_BET = 2, BIG_BET = 4, CAP = 4;

function betSize(street) { return street < 2 ? SMALL_BET : BIG_BET; }

function makeDrawGame(cfg) {
  const HS = cfg.handSize;

  function clone(s) {
    return {
      deck: s.deck,            // only replaced (never mutated) by sampleChance
      hands: [s.hands[0].slice(), s.hands[1].slice()],
      street: s.street,
      phase: s.phase,
      toAct: s.toAct,
      bets: s.bets,
      contrib: s.contrib.slice(),
      acted: s.acted.slice(),
      folded: s.folded,
      hist: s.hist,
      curSeq: s.curSeq,
      pendingDraw: s.pendingDraw,
      drawCounts: [s.drawCounts[0].slice(), s.drawCounts[1].slice()],
      log: s.log.slice(),
    };
  }

  function endBettingRound(s) {
    if (s.street === 3) { s.phase = 'showdown'; return; }
    s.phase = 'draw';
    s.toAct = 1; // OOP draws first
    s.hist += '/';
  }

  const game = {
    id: cfg.id,
    name: cfg.name,
    cfg,

    newHand(rng) {
      const deck = shuffledDeck(rng);
      const hands = [deck.slice(0, HS), deck.slice(HS, HS * 2)];
      return {
        deck: deck.slice(HS * 2),
        hands,
        street: 0,
        phase: 'bet',
        toAct: 0,          // button/SB first pre-draw
        bets: 1,           // BB counts as the first bet
        contrib: [1, 2],   // SB 1, BB 2
        acted: [false, false],
        folded: null,
        hist: '',
        curSeq: '',
        pendingDraw: null,
        drawCounts: [[], []],
        log: [],
      };
    },

    isTerminal(s) { return s.phase === 'showdown' || s.folded !== null; },

    utility(s) {
      if (s.folded === 0) return [-s.contrib[0], s.contrib[0]];
      if (s.folded === 1) return [s.contrib[1], -s.contrib[1]];
      const cmp = cfg.compare(s.hands[0], s.hands[1]);
      if (cmp > 0) return [s.contrib[1], -s.contrib[1]];
      if (cmp < 0) return [-s.contrib[0], s.contrib[0]];
      return [0, 0];
    },

    isChance(s) { return s.phase === 'chance'; },

    sampleChance(s, rng) {
      // Deck was shuffled at deal time; replacements come off the top.
      const n = clone(s);
      const { player, count } = n.pendingDraw;
      n.deck = n.deck.slice(); // copy-on-write
      for (let i = 0; i < count; i++) n.hands[player].push(n.deck.pop());
      n.pendingDraw = null;
      if (player === 1) {
        n.phase = 'draw';
        n.toAct = 0; // button draws second
      } else {
        // both players have drawn — next betting round
        n.street++;
        n.phase = 'bet';
        n.toAct = 1;
        n.bets = 0;
        n.acted = [false, false];
        n.hist += '/';
        n.curSeq = '';
      }
      void rng; // replacement order fixed by the shuffle; rng unused here
      return n;
    },

    currentPlayer(s) { return s.toAct; },

    legalActions(s) {
      if (s.phase === 'draw') {
        // Only the strategically meaningful draw counts (snow / natural
        // draw / break). Exploring all counts at every draw node blows
        // the traversal tree up by ~64x for no strategic benefit.
        return cfg.drawOptions(s.hands[s.toAct]).map(k => 'd' + k);
      }
      const facing = s.contrib[1 - s.toAct] - s.contrib[s.toAct];
      if (facing > 0) {
        const acts = ['f', 'c'];
        if (s.bets < CAP) acts.push('r');
        return acts;
      }
      const acts = ['k'];
      if (s.bets < CAP) acts.push('b');
      return acts;
    },

    applyAction(s, a) {
      const n = clone(s);
      const p = n.toAct;

      if (a[0] === 'd') {
        const k = parseInt(a[1], 10);
        n.drawCounts[p].push(k);
        if (k > 0) {
          const keep = cfg.chooseKeep(n.hands[p], k);
          n.hands[p] = keep.slice();
          n.pendingDraw = { player: p, count: k };
          n.phase = 'chance';
        } else if (p === 1) {
          n.phase = 'draw';
          n.toAct = 0;
        } else {
          n.street++;
          n.phase = 'bet';
          n.toAct = 1;
          n.bets = 0;
          n.acted = [false, false];
          n.hist += '/';
          n.curSeq = '';
        }
        n.hist += 'd' + k;
        n.log.push({ p, a: k === 0 ? 'stands pat' : `draws ${k}` });
        return n;
      }

      n.acted[p] = true;
      n.hist += a;
      n.curSeq += a;
      const facing = n.contrib[1 - p] - n.contrib[p];

      if (a === 'f') {
        n.folded = p;
        n.log.push({ p, a: 'folds' });
        return n;
      }
      if (a === 'c' || a === 'k') {
        n.contrib[p] += facing; // facing = 0 for a check
        n.log.push({ p, a: a === 'k' ? 'checks' : 'calls' });
        if (n.acted[1 - p]) endBettingRound(n);
        else n.toAct = 1 - p; // pre-draw limp: BB still has the option
        return n;
      }
      // bet or raise
      n.contrib[p] = n.contrib[1 - p] + betSize(n.street);
      n.bets++;
      n.log.push({ p, a: facing > 0 || s.bets > 0 ? 'raises' : 'bets' });
      n.toAct = 1 - p;
      return n;
    },

    // Abstraction: exact action sequence for the current street only;
    // earlier streets are summarized by a quantized pot size plus the
    // public draw counts (opponent's full draw history, own most
    // recent draw). Keeping full histories explodes the infoset space
    // past available memory and starves each node of visits.
    infosetKey(s) {
      const p = s.toAct;
      const phase = s.phase === 'draw' ? 'D' : 'B';
      const pot = s.contrib[0] + s.contrib[1];
      const potBin = Math.min(12, Math.round(pot / (2 * SMALL_BET)));
      const od = s.drawCounts[1 - p].slice(-2).join('');
      const md = s.drawCounts[p].length ? s.drawCounts[p][s.drawCounts[p].length - 1] : '-';
      return `${s.street}${phase}|p${potBin}|${s.curSeq}|o${od}|m${md}|${cfg.bucket(s.hands[p], s.street, s.phase)}`;
    },

    actionLabel(a, s) {
      if (a === 'd0') return 'Stand Pat';
      if (a[0] === 'd') return `Draw ${a[1]}`;
      if (a === 'f') return 'Fold';
      if (a === 'k') return 'Check';
      if (a === 'c') {
        const facing = s.contrib[1 - s.toAct] - s.contrib[s.toAct];
        return `Call ${facing}`;
      }
      const target = s.contrib[1 - s.toAct] + betSize(s.street);
      return s.bets > 0 ? `Raise to ${target}` : `Bet ${betSize(s.street)}`;
    },

    // Trainer-facing view of the state from the current player's seat
    describe(s) {
      const p = s.toAct;
      const streetNames = ['Pre-draw', 'After 1st draw', 'After 2nd draw', 'After 3rd draw'];
      return {
        seat: p,
        position: p === 0 ? 'Button (SB)' : 'Big Blind',
        street: s.street,
        streetName: s.phase === 'draw'
          ? `Draw ${s.street + 1}` : streetNames[s.street],
        phase: s.phase,
        heroCards: s.hands[p].map(cardStr),
        handLabel: cfg.describeHand(s.hands[p]),
        pot: s.contrib[0] + s.contrib[1],
        toCall: Math.max(0, s.contrib[1 - p] - s.contrib[p]),
        betSize: betSize(s.street),
        myDraws: s.drawCounts[p],
        oppDraws: s.drawCounts[1 - p],
        log: s.log.map(e => ({ who: e.p === p ? 'Hero' : 'Opponent', what: e.a })),
      };
    },

    // Full-information view (both hands shown) for the self-play viewer.
    viewAll(s) {
      const streetNames = ['Pre-draw', 'After 1st draw', 'After 2nd draw', 'After 3rd draw'];
      return {
        street: s.street,
        streetName: s.phase === 'draw' ? `Draw ${s.street + 1}` : streetNames[s.street],
        phase: s.phase,
        pot: s.contrib[0] + s.contrib[1],
        contrib: s.contrib.slice(),
        toAct: s.toAct,
        players: [0, 1].map(p => ({
          position: p === 0 ? 'Button (SB)' : 'Big Blind',
          cards: s.hands[p].map(cardStr),
          handLabel: cfg.describeHand(s.hands[p]),
          draws: s.drawCounts[p].slice(),
        })),
        log: s.log.map(e => ({ who: e.p === 0 ? 'Button' : 'BB', what: e.a })),
      };
    },

    // Terminal summary for the self-play viewer
    result(s) {
      const labels = [0, 1].map(p => ({
        cards: s.hands[p].map(cardStr),
        label: cfg.describeHand(s.hands[p]),
      }));
      if (s.folded !== null) {
        const winner = 1 - s.folded;
        return { type: 'fold', winner, profit: s.contrib[s.folded], pot: s.contrib[0] + s.contrib[1], players: labels };
      }
      const cmp = cfg.compare(s.hands[0], s.hands[1]);
      const winner = cmp > 0 ? 0 : cmp < 0 ? 1 : -1;
      return { type: 'showdown', winner, profit: winner < 0 ? 0 : s.contrib[1 - winner], pot: s.contrib[0] + s.contrib[1], players: labels };
    },
  };

  return game;
}

module.exports = { makeDrawGame, SMALL_BET, BIG_BET };
