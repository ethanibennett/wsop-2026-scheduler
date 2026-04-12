    var { useState, useEffect, useMemo, useCallback, useRef } = React;
    const { createPortal } = ReactDOM;

    // Compute a player's current hand in draw games after applying discards/draws up to a given street.
    // Returns the card notation string with discarded cards removed and new cards added.
    function computeDrawHand(originalCards, draws, upToStreetIdx) {
      if (!originalCards) return '';
      var current = originalCards;
      for (var si = 0; si <= upToStreetIdx; si++) {
        if (!draws || !draws[si]) continue;
        var draw = draws[si];
        if (!draw || draw.discarded === 0) continue;
        if (draw.discardedCards) {
          // Remove specific discarded cards from current hand
          var discarded = parseCardNotation(draw.discardedCards);
          var currentParsed = parseCardNotation(current);
          var remaining = [];
          var discardSet = {};
          discarded.forEach(function(c) { discardSet[c.rank + c.suit] = (discardSet[c.rank + c.suit] || 0) + 1; });
          currentParsed.forEach(function(c) {
            var key = c.rank + c.suit;
            if (discardSet[key] && discardSet[key] > 0) { discardSet[key]--; }
            else { remaining.push(c); }
          });
          // Build string from remaining cards
          current = remaining.map(function(c) { return c.rank + c.suit; }).join('');
        } else {
          // No specific cards: just trim from the end
          var parsed = parseCardNotation(current);
          var keep = Math.max(0, parsed.length - draw.discarded);
          current = parsed.slice(0, keep).map(function(c) { return c.rank + c.suit; }).join('');
        }
        // Add new cards
        if (draw.newCards) {
          current += draw.newCards;
        }
      }
      return current;
    }

    // Get all draw entries for a specific player across streets, indexed by street
    function getPlayerDrawsByStreet(hand, playerIdx) {
      var result = {};
      hand.streets.forEach(function(s, si) {
        if (!s.draws) return;
        var d = s.draws.find(function(d) { return d.player === playerIdx; });
        if (d) result[si] = d;
      });
      return result;
    }

    function getGameCategory(gameType) {
      const cfg = HAND_CONFIG[gameType];
      if (!cfg) return 'community';
      if (gameType === 'OFC') return 'ofc';
      if (cfg.isStud) return 'stud';
      if (cfg.hasBoard) return 'community';
      // Draw games
      if (['2-7 TD', 'PL 2-7 TD', 'L 2-7 TD', 'A-5 TD', 'Badeucy', 'Badacy'].includes(gameType)) return 'draw_triple';
      if (['NL 2-7 SD', 'PL 5CD Hi'].includes(gameType)) return 'draw_single';
      if (gameType === 'Badugi') return 'draw_triple'; // Badugi is triple draw
      // Check for custom draw config
      if (!cfg.hasBoard && !cfg.isStud) {
        const customDef = STREET_DEFS['custom_' + gameType];
        if (customDef && customDef.streets.length > 3) return 'draw_triple';
        if (customDef && customDef.streets.length <= 3) return 'draw_single';
      }
      return 'community';
    }

    function getStreetDef(gameType) {
      // Check for custom street def first
      const customDef = STREET_DEFS['custom_' + gameType];
      if (customDef) return customDef;
      return STREET_DEFS[getGameCategory(gameType)] || STREET_DEFS.community;
    }

    // Position labels based on player count
    // Preflop action order: early positions → late positions → blinds
    function getPositionLabels(numPlayers) {
      if (numPlayers <= 2) return ['BTN/SB', 'BB'];
      if (numPlayers === 3) return ['BTN', 'SB', 'BB'];
      // 4–10 players: early→late positions, then BTN, SB, BB last
      var middle = ['UTG', 'UTG+1', 'MP1', 'MP2', 'LJ', 'HJ', 'CO'];
      var need = numPlayers - 3;
      var picked = middle.slice(Math.max(0, middle.length - need));
      return picked.concat(['BTN', 'SB', 'BB']);
    }

    // Action order: preflop starts at UTG (index 3+), postflop starts at SB (index 1)
    // Position layout from getPositionLabels: [BTN(0), SB(1), BB(2), UTG(3), ...]
    // Heads-up: [BTN/SB(0), BB(1)] — preflop BTN/SB acts first
    function getActionOrder(players, isPreflop, studInfo) {
      var n = players.length;
      if (n <= 0) return [];
      var indices = [];

      // Stud games: action order determined by visible cards
      if (studInfo && studInfo.isStud) {
        var startIdx = studInfo.is3rdStreet ? studInfo.bringInIdx : studInfo.bestBoardIdx;
        if (startIdx >= 0) {
          for (var i = 0; i < n; i++) {
            indices.push((startIdx + i) % n);
          }
          return indices;
        }
        // Fallback: seat order
        for (var i = 0; i < n; i++) indices.push(i);
        return indices;
      }

      // Position layout: [early...late, BTN, SB, BB]
      // BTN = n-3, SB = n-2, BB = n-1 (for 4+ players)
      var btnIdx = n <= 3 ? 0 : n - 3;
      var sbIdx = n <= 3 ? (n <= 2 ? 0 : 1) : n - 2;
      var bbIdx = n <= 2 ? 1 : n - 1;

      if (n === 2) {
        // Heads-up: preflop BTN/SB first, postflop BB first
        indices = isPreflop ? [0, 1] : [1, 0];
      } else if (isPreflop) {
        // Preflop: UTG first (seat 0), then around to BB (last seat)
        for (var i = 0; i < n; i++) indices.push(i);
      } else {
        // Postflop: SB first, then BB, then early positions through BTN
        indices.push(sbIdx);
        indices.push(bbIdx);
        for (var i = 0; i < btnIdx; i++) indices.push(i);
        indices.push(btnIdx);
      }
      return indices.filter(function(i) { return i < n; });
    }

    // Find bring-in player for stud 3rd street (lowest/highest door card)
    function findStudBringIn(hand, isRazz) {
      var heroIdx = hand.heroIdx != null ? hand.heroIdx : 0;
      var oppCards = (hand.streets[0] && hand.streets[0].cards.opponents) || [];
      var heroCards = parseCardNotation((hand.streets[0] && hand.streets[0].cards.hero) || '');
      // Bring-in goes to the WORST door card:
      // Stud Hi/8: lowest rank = worst (2♣ brings it in). Suit tiebreak: clubs < diamonds < hearts < spades
      // Razz: highest rank = worst (K♠ brings it in). Suit tiebreak: spades > hearts > diamonds > clubs
      // We assign each card a "badness" score — higher = more likely to bring in
      var rankBadness = isRazz
        ? { 'A': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8, 'T': 9, 'J': 10, 'Q': 11, 'K': 12 }
        : { 'A': 0, 'K': 1, 'Q': 2, 'J': 3, 'T': 4, '9': 5, '8': 6, '7': 7, '6': 8, '5': 9, '4': 10, '3': 11, '2': 12 };
      var suitBadness = isRazz
        ? { 'c': 0, 'd': 1, 'h': 2, 's': 3 }  // spades worst for razz
        : { 's': 0, 'h': 1, 'd': 2, 'c': 3 };  // clubs worst for stud hi

      var worstIdx = -1;
      var worstRank = -1;
      var worstSuit = -1;
      for (var pi = 0; pi < hand.players.length; pi++) {
        var doorCard;
        if (pi === heroIdx) {
          doorCard = heroCards.length >= 3 ? heroCards[2] : null;
        } else {
          var oppSlot = pi < heroIdx ? pi : pi - 1;
          var oCards = parseCardNotation(oppCards[oppSlot] || '');
          doorCard = oCards.length ? oCards[0] : null;
        }
        if (!doorCard || doorCard.suit === 'x') continue;
        var rv = rankBadness[doorCard.rank] || 0;
        var sv = suitBadness[doorCard.suit] || 0;
        // Higher badness = worse card = more likely to bring in
        if (worstIdx === -1 || rv > worstRank || (rv === worstRank && sv > worstSuit)) {
          worstIdx = pi;
          worstRank = rv;
          worstSuit = sv;
        }
      }
      return worstIdx;
    }

    // Score a visible stud board by poker hand ranking
    // Returns a comparable number: higher = better high hand, lower = better low hand
    function scoreStudBoard(cards) {
      var rankValues = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
      if (!cards.length) return 0;

      // Count rank frequencies
      var counts = {};
      cards.forEach(function(c) {
        var r = rankValues[c.rank] || 0;
        counts[r] = (counts[r] || 0) + 1;
      });

      var pairs = [], trips = [], quads = [], kickers = [];
      Object.keys(counts).forEach(function(r) {
        var rv = parseInt(r);
        if (counts[r] === 4) quads.push(rv);
        else if (counts[r] === 3) trips.push(rv);
        else if (counts[r] === 2) pairs.push(rv);
        else kickers.push(rv);
      });
      pairs.sort(function(a, b) { return b - a; });
      trips.sort(function(a, b) { return b - a; });
      kickers.sort(function(a, b) { return b - a; });

      // Score: hand_category * 1000000 + tiebreaker
      // Categories: 7=quads, 6=full house, 5=trips, 4=two pair, 3=one pair, 1=high card
      // (Straights/flushes not relevant for visible board ranking in stud)
      var score = 0;
      if (quads.length) {
        score = 7000000 + quads[0] * 100;
      } else if (trips.length && pairs.length) {
        score = 6000000 + trips[0] * 100 + pairs[0];
      } else if (trips.length) {
        score = 5000000 + trips[0] * 100;
      } else if (pairs.length >= 2) {
        score = 4000000 + pairs[0] * 100 + pairs[1];
      } else if (pairs.length === 1) {
        score = 3000000 + pairs[0] * 100 + (kickers[0] || 0);
      } else {
        // High card: sort descending
        var allRanks = Object.keys(counts).map(Number).sort(function(a, b) { return b - a; });
        score = 1000000;
        for (var i = 0; i < allRanks.length; i++) {
          score += allRanks[i] * Math.pow(100, 4 - i);
        }
      }
      return score;
    }

    // Find best visible board for stud streets 4-7 (only upcards: door card + 4th-6th street)
    function findStudBestBoard(hand, streetIdx, foldedSet, isLowGame) {
      var heroIdx = hand.heroIdx != null ? hand.heroIdx : 0;
      // Only consider upcards: street 0 door card + streets 1-3 (4th-6th).
      // Street 4 (7th) is face-down, never included.
      var maxVisibleStreet = Math.min(streetIdx, 3);

      var bestIdx = -1;
      var bestScore = isLowGame ? Infinity : -Infinity;
      for (var pi = 0; pi < hand.players.length; pi++) {
        if (foldedSet.has(pi)) continue;
        var visible = [];
        for (var si = 0; si <= maxVisibleStreet; si++) {
          if (pi === heroIdx) {
            var hCards = parseCardNotation((hand.streets[si] && hand.streets[si].cards.hero) || '');
            // Street 0: only the door card (index 2) is face-up
            if (si === 0 && hCards.length >= 3) visible.push(hCards[2]);
            // Streets 1-3 (4th-6th): all cards are face-up
            if (si > 0) hCards.forEach(function(c) { if (c.suit !== 'x') visible.push(c); });
          } else {
            var oppSlot = pi < heroIdx ? pi : pi - 1;
            var oCards = parseCardNotation(((hand.streets[si] && hand.streets[si].cards.opponents) || [])[oppSlot] || '');
            oCards.forEach(function(c) { if (c.suit !== 'x') visible.push(c); });
          }
        }
        var score = scoreStudBoard(visible);
        if (isLowGame ? score < bestScore : score > bestScore) {
          bestIdx = pi;
          bestScore = score;
        }
      }
      return bestIdx;
    }

    // Detect if any active player shows an open pair on 4th street (stud games).
    // In limit stud, when an open pair is showing on 4th street, the big bet
    // may optionally be used instead of the small bet.
    // Returns true if any player's door card (street 0, card index 2 for hero,
    // or the single visible card for opponents) matches their 4th street card.
    function studHasOpenPairOn4th(hand) {
      if (!hand.streets || !hand.streets[0] || !hand.streets[1]) return false;
      var heroIdx = hand.heroIdx != null ? hand.heroIdx : 0;
      var numPlayers = hand.players.length;
      for (var pi = 0; pi < numPlayers; pi++) {
        var doorCard = null;
        var fourthCard = null;
        if (pi === heroIdx) {
          var s0Cards = parseCardNotation((hand.streets[0] && hand.streets[0].cards.hero) || '');
          var s1Cards = parseCardNotation((hand.streets[1] && hand.streets[1].cards.hero) || '');
          // Door card is index 2 (3rd card dealt) in the hero's 3rd street cards
          doorCard = s0Cards.length >= 3 ? s0Cards[2] : null;
          // 4th street card is the first card on street 1
          fourthCard = s1Cards.length >= 1 ? s1Cards[0] : null;
        } else {
          var oppSlot = pi < heroIdx ? pi : pi - 1;
          var s0Opp = parseCardNotation(((hand.streets[0] && hand.streets[0].cards.opponents) || [])[oppSlot] || '');
          var s1Opp = parseCardNotation(((hand.streets[1] && hand.streets[1].cards.opponents) || [])[oppSlot] || '');
          // Opponent door card is the single visible card on 3rd street
          doorCard = s0Opp.length >= 1 ? s0Opp[0] : null;
          fourthCard = s1Opp.length >= 1 ? s1Opp[0] : null;
        }
        if (doorCard && fourthCard && doorCard.suit !== 'x' && fourthCard.suit !== 'x' && doorCard.rank === fourthCard.rank) {
          return true;
        }
      }
      return false;
    }

    function formatChipAmount(val) {
      if (!val && val !== 0) return '';
      const n = Number(val);
      if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
      return String(n);
    }

    // Chip denomination breakdown for visual chip stacks
    var CHIP_DENOMS = [
      { value: 25000, color: '#14b8a6' },
      { value: 5000,  color: '#f97316' },
      { value: 1000,  color: '#eab308' },
      { value: 500,   color: '#7c3aed' },
      { value: 100,   color: '#1a1a2e' },
      { value: 25,    color: '#22c55e' },
    ];
    function getChipBreakdown(amount) {
      var chips = [];
      var remaining = Math.abs(Number(amount) || 0);
      for (var i = 0; i < CHIP_DENOMS.length && chips.length < 5; i++) {
        var d = CHIP_DENOMS[i];
        while (remaining >= d.value && chips.length < 5) {
          chips.push(d.color);
          remaining -= d.value;
        }
      }
      if (chips.length === 0) chips.push('#22c55e');
      return chips;
    }

    function ChipStack({ amount }) {
      var chips = getChipBreakdown(amount);
      return React.createElement('div', {
        className: 'chip-stack-visual',
        style: { display:'inline-flex', flexDirection:'column-reverse', alignItems:'center', marginRight:'3px', verticalAlign:'middle' }
      }, chips.map(function(color, i) {
        return React.createElement('div', {
          key: i,
          className: 'chip-disc',
          style: {
            width: '12px',
            height: '4px',
            borderRadius: '50%',
            background: color,
            border: '0.5px solid rgba(255,255,255,0.35)',
            marginTop: i === 0 ? 0 : '-2px',
            boxShadow: '0 1px 1px rgba(0,0,0,0.3)',
            position: 'relative',
            zIndex: chips.length - i,
          }
        });
      }));
    }

    var DEFAULT_OPP_NAMES = ['Jason Blodgett', 'Keith McCormack', 'Alex Charron', 'Kevin DiPasquale', 'Cristian Gutierrez', 'Derek Nold', 'Anthony Hall', 'Aidan Long'];

    function getStudPositionLabels(numPlayers) {
      return Array.from({ length: numPlayers }, function(_, i) { return 'Seat ' + (i + 1); });
    }

    function createEmptyHand(gameType, heroName) {
      const streetDef = getStreetDef(gameType);
      const gameCfg = HAND_CONFIG[gameType] || HAND_CONFIG_DEFAULT;
      // OFC: 2-3 players, no blinds/positions
      if (gameType === 'OFC') {
        const numPlayers = 2;
        return {
          gameType,
          players: Array.from({ length: numPlayers }, function(_, i) {
            return { name: i === 0 ? (heroName || 'Hero') : (DEFAULT_OPP_NAMES[i - 1] || 'Opp ' + i), position: i === 0 ? 'BTN' : 'BB', startingStack: 0 };
          }),
          blinds: { sb: 0, bb: 0, ante: 0 },
          streets: streetDef.streets.map((name, i) => ({
            name,
            cards: { hero: '', opponents: [''], board: '' },
            actions: [],
            draws: [],
          })),
          ofcRows: {
            0: { top: '', middle: '', bottom: '' },
            1: { top: '', middle: '', bottom: '' },
          },
          heroIdx: 0,
          result: null,
        };
      }
      const numPlayers = gameCfg.isStud ? 8 : 6;
      const positions = gameCfg.isStud ? getStudPositionLabels(numPlayers) : getPositionLabels(numPlayers);
      const defaultAnte = (gameCfg.hasBoard && !gameCfg.isStud) ? 200 : 0;
      return {
        gameType,
        players: Array.from({ length: numPlayers }, function(_, i) {
          return { name: i === 0 ? (heroName || 'Hero') : (DEFAULT_OPP_NAMES[i - 1] || 'Opp ' + i), position: positions[i] || '', startingStack: 50000 };
        }),
        blinds: { sb: 100, bb: 200, ante: defaultAnte },
        streets: streetDef.streets.map((name, i) => ({
          name,
          cards: {
            hero: '',
            opponents: Array.from({ length: numPlayers - 1 }, function() { return ''; }),
            board: '',
          },
          actions: [],
          draws: [],
        })),
        heroIdx: 0,
        result: null,
      };
    }

    // Calculate pot and stacks from hand data up to a given street+action
    function calcPotsAndStacks(hand, upToStreet, upToAction) {
      const blinds = hand.blinds || { sb: 0, bb: 0, ante: 0 };
      const stacks = hand.players.map(p => p.startingStack);
      const category = getGameCategory(hand.gameType);
      const isBBante = category !== 'stud' && (blinds.ante || 0) > 0;

      if (!isBBante) {
        // Per-player ante (stud games)
        stacks.forEach((_, i) => { stacks[i] -= (blinds.ante || 0); });
      }
      let pot = isBBante ? 0 : hand.players.length * (blinds.ante || 0);

      // Post blinds on first street
      if (hand.streets.length > 0 && hand.streets[0].actions) {
        if (category !== 'stud') {
          // SB and BB
          const sbIdx = hand.players.findIndex(p => p.position === 'SB' || p.position === 'BTN/SB');
          const bbIdx = hand.players.findIndex(p => p.position === 'BB');
          if (sbIdx >= 0) { stacks[sbIdx] -= (blinds.sb || 0); pot += (blinds.sb || 0); }
          if (bbIdx >= 0) {
            stacks[bbIdx] -= (blinds.bb || 0); pot += (blinds.bb || 0);
            // BB ante: BB posts an additional ante amount
            if (isBBante) { stacks[bbIdx] -= (blinds.ante || 0); pot += (blinds.ante || 0); }
          }
        }
      }

      const folded = new Set();
      for (let si = 0; si <= upToStreet && si < hand.streets.length; si++) {
        const street = hand.streets[si];
        const maxAction = si === upToStreet ? upToAction : (street.actions ? street.actions.length - 1 : -1);
        for (let ai = 0; ai <= maxAction && street.actions && ai < street.actions.length; ai++) {
          const act = street.actions[ai];
          if (act.action === 'fold') { folded.add(act.player); continue; }
          if (act.amount && act.amount > 0) {
            stacks[act.player] -= act.amount;
            pot += act.amount;
          }
        }
      }
      return { stacks, pot, folded };
    }

    // ── Hand Replayer Entry Sub-component ──
    function HandReplayerEntry({ hand, setHand, onDone, onCancel }) {
      const [currentStreetIdx, setCurrentStreetIdx] = useState(0);
      const [actionAmount, setActionAmount] = useState('');
      const gameCfg = HAND_CONFIG[hand.gameType] || HAND_CONFIG_DEFAULT;
      const streetDef = getStreetDef(hand.gameType);
      const category = getGameCategory(hand.gameType);
      const currentStreet = hand.streets[currentStreetIdx] || hand.streets[0];

      const updateStreet = (streetIdx, updater) => {
        setHand(prev => {
          const next = { ...prev, streets: prev.streets.map((s, i) => i === streetIdx ? updater({ ...s }) : s) };
          return next;
        });
      };

      // Compute betting context for current street
      const bettingContext = useMemo(() => {
        const street = hand.streets[currentStreetIdx];
        const actions = street ? (street.actions || []) : [];
        const betting = gameCfg.betting || 'nl';
        const blinds = hand.blinds || {};
        const sb = blinds.sb || 0;
        const bb = blinds.bb || 0;
        const ante = blinds.ante || 0;

        // Fixed limit: small bet = bb, big bet = 2*bb
        // Stud 4th street exception: if any player shows an open pair, the big bet may be used
        const isSmallBetStreet = (gameCfg.flSmallStreets || []).includes(currentStreetIdx);
        const stud4thOpenPair = gameCfg.isStud && currentStreetIdx === 1 && studHasOpenPairOn4th(hand);
        const fixedBet = betting === 'fl' ? ((isSmallBetStreet && !stud4thOpenPair) ? (bb || 100) : (bb || 100) * 2) : 0;
        const raiseCap = gameCfg.raiseCap || 4;

        // Track current bet level and raise count
        // NOTE: amounts in actions are INCREMENTS (chips added), not totals.
        // playerContrib tracks total committed this street for each player.
        var maxBet = 0;          // highest total any player has committed this street
        var raiseCount = 0;
        var isBBanteCtx = category !== 'stud' && ante > 0;
        var totalPot = isBBanteCtx ? 0 : ante * hand.players.length;
        var playerContrib = {};  // total chips committed this street, per player

        // On preflop, SB and BB are implicit — find by position, not hardcoded index
        if (currentStreetIdx === 0 && (gameCfg.hasBoard || !gameCfg.isStud)) {
          var sbIdx = hand.players.findIndex(function(p) { return p.position === 'SB' || p.position === 'BTN/SB'; });
          var bbIdx = hand.players.findIndex(function(p) { return p.position === 'BB'; });
          if (sbIdx >= 0) playerContrib[sbIdx] = sb;
          if (bbIdx >= 0) playerContrib[bbIdx] = bb;
          maxBet = bb;
          totalPot += sb + bb;
          // BB ante: BB posts additional ante (dead money, not a bet)
          if (isBBanteCtx) totalPot += ante;
          raiseCount = 0;
        }

        for (var i = 0; i < actions.length; i++) {
          var act = actions[i];
          var prevContrib = playerContrib[act.player] || 0;
          if (act.action === 'fold') continue;
          if (act.action === 'bet' || act.action === 'raise' || act.action === 'call' || act.action === 'all-in') {
            // act.amount is the INCREMENT (additional chips put in)
            playerContrib[act.player] = prevContrib + (act.amount || 0);
            totalPot += (act.amount || 0);
            if (playerContrib[act.player] > maxBet) {
              maxBet = playerContrib[act.player];
            }
            if (act.action === 'bet') raiseCount = 1;
            else if (act.action === 'raise') raiseCount++;
            else if (act.action === 'all-in' && playerContrib[act.player] > maxBet) raiseCount++;
          } else if (act.action === 'bring-in') {
            playerContrib[act.player] = act.amount || 0;
            totalPot += (act.amount || 0);
            if (playerContrib[act.player] > maxBet) maxBet = playerContrib[act.player];
          }
        }

        // Determine which player is next
        const foldedPlayers = new Set(actions.filter(a => a.action === 'fold').map(a => a.player));
        const activePlayers = hand.players.map((_, i) => i).filter(i => !foldedPlayers.has(i));
        const nextPlayer = activePlayers[actions.length % activePlayers.length] || 0;
        const nextPlayerInvested = playerContrib[nextPlayer] || 0;
        const facingBet = maxBet > nextPlayerInvested;
        const callAmount = Math.max(maxBet - nextPlayerInvested, 0);

        // Limit: fixed raise amount
        var raiseToAmount = 0;
        var betAmount = 0;
        var potRaiseAmount = 0;
        var potRaiseIncrement = 0;
        var canRaise = true;

        if (betting === 'fl') {
          betAmount = fixedBet;
          raiseToAmount = maxBet + fixedBet;
          canRaise = raiseCount < raiseCap;
        } else if (betting === 'pl') {
          // ── Pot-limit max raise: the "trail" formula ──
          // The maximum raise in pot-limit is calculated as:
          //   1. Player calls (adding callAmount to pot)
          //   2. Pot after calling = totalPot + callAmount
          //   3. Player can then raise BY (pot after calling)
          //   4. Total raise-to = maxBet + (pot after calling)
          //   5. Increment = callAmount + (pot after calling)
          //
          // Equivalently using the dealer's "trail" shortcut:
          //   Trail = totalPot - maxBet (dead money: pot minus the live bet)
          //   Max raise-to = 3 × maxBet + trail = 2 × maxBet + totalPot
          //   Max raise increment = max raise-to - nextPlayerInvested
          //
          // For an opening bet (maxBet = 0): max bet = totalPot
          var potAfterCall = totalPot + callAmount;
          potRaiseAmount = maxBet + potAfterCall;         // raise TO this total
          potRaiseIncrement = potRaiseAmount - nextPlayerInvested; // chips to add
          betAmount = totalPot;                           // opening bet max = pot
          raiseToAmount = potRaiseAmount;
        } else {
          // No-limit: any amount
          betAmount = 0;
          raiseToAmount = 0;
        }

        return {
          betting, facingBet, currentBet: maxBet, callAmount, raiseCount, raiseCap,
          fixedBet, betAmount, raiseToAmount, potRaiseAmount, potRaiseIncrement, canRaise,
          nextPlayer, totalPot, nextPlayerInvested
        };
      }, [hand, currentStreetIdx, gameCfg]);

      const addAction = (action) => {
        var ctx = bettingContext;
        var amount = 0;

        if (action === 'bet') {
          var rawBet = ctx.betting === 'fl' ? ctx.fixedBet : (Number(actionAmount) || 0);
          // Pot-limit: cap bet at pot size
          if (ctx.betting === 'pl') rawBet = Math.min(rawBet, ctx.betAmount);
          amount = rawBet;
        } else if (action === 'raise') {
          if (ctx.betting === 'fl') {
            // Fixed limit: increment = raise-to minus what player already has in
            amount = ctx.raiseToAmount - ctx.nextPlayerInvested;
          } else {
            // NL/PL: user types the raise-to total, convert to increment
            var typedTotal = Number(actionAmount) || 0;
            // Pot-limit: cap at pot-raise-to
            if (ctx.betting === 'pl') typedTotal = Math.min(typedTotal, ctx.potRaiseAmount);
            amount = typedTotal - ctx.nextPlayerInvested;
          }
        } else if (action === 'call') {
          amount = ctx.callAmount;
        }

        if (amount < 0) amount = 0;

        updateStreet(currentStreetIdx, s => {
          const actions = [...(s.actions || []), { player: ctx.nextPlayer, action, amount }];
          return { ...s, actions };
        });
        setActionAmount('');
      };

      const removeLastAction = () => {
        updateStreet(currentStreetIdx, s => {
          const actions = [...(s.actions || [])];
          actions.pop();
          return { ...s, actions };
        });
      };

      const updatePlayerField = (idx, field, value) => {
        setHand(prev => {
          const players = prev.players.map((p, i) => i === idx ? { ...p, [field]: field === 'startingStack' ? (Number(value) || 0) : value } : p);
          return { ...prev, players };
        });
      };

      const setNumPlayers = (n) => {
        setHand(prev => {
          const positions = getPositionLabels(n);
          const players = Array.from({ length: n }, (_, i) => {
            if (prev.players[i]) return { ...prev.players[i], position: positions[i] || '' };
            return { name: i === 0 ? 'Hero' : 'Opp ' + i, position: positions[i] || '', startingStack: prev.players[0]?.startingStack || 50000 };
          });
          // Update streets to have opponent card slots
          const streets = prev.streets.map(s => ({
            ...s,
            cards: { ...s.cards, opponents: Array.from({ length: n - 1 }, (_, j) => s.cards.opponents[j] || '') }
          }));
          return { ...prev, players, streets };
        });
      };

      const updateHeroCards = (streetIdx, val) => {
        updateStreet(streetIdx, s => ({ ...s, cards: { ...s.cards, hero: val } }));
      };
      const updateBoardCards = (streetIdx, val) => {
        updateStreet(streetIdx, s => ({ ...s, cards: { ...s.cards, board: val } }));
      };
      const updateOpponentCards = (streetIdx, oppIdx, val) => {
        updateStreet(streetIdx, s => {
          const opponents = [...s.cards.opponents];
          opponents[oppIdx] = val;
          return { ...s, cards: { ...s.cards, opponents } };
        });
      };
      const updateDrawDiscard = (streetIdx, playerIdx, val) => {
        updateStreet(streetIdx, s => {
          const draws = [...(s.draws || [])];
          const existing = draws.findIndex(d => d.player === playerIdx);
          if (existing >= 0) draws[existing] = { ...draws[existing], discarded: Number(val) || 0 };
          else draws.push({ player: playerIdx, discarded: Number(val) || 0, discardedCards: '', newCards: '' });
          return { ...s, draws };
        });
      };
      const updateDrawField = (streetIdx, playerIdx, field, val) => {
        updateStreet(streetIdx, s => {
          const draws = [...(s.draws || [])];
          const existing = draws.findIndex(d => d.player === playerIdx);
          if (existing >= 0) draws[existing] = { ...draws[existing], [field]: val };
          else {
            var entry = { player: playerIdx, discarded: 0, discardedCards: '', newCards: '' };
            entry[field] = val;
            draws.push(entry);
          }
          return { ...s, draws };
        });
      };

      // Compute pot so far
      const { pot: currentPot } = calcPotsAndStacks(hand, currentStreetIdx, (currentStreet.actions || []).length - 1);

      return (
        <div className="replayer-entry">
          {/* Step 1: Game type is already selected */}
          <div className="replayer-section">
            <div className="replayer-section-title">Players & Blinds</div>
            <div className="replayer-row" style={{marginBottom:'8px'}}>
              <div className="replayer-field" style={{flex:'0 0 70px'}}>
                <label>Players</label>
                <select value={hand.players.length} onChange={e => setNumPlayers(Number(e.target.value))}>
                  {[2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="replayer-field">
                <label>SB</label>
                <input type="text" inputMode="decimal" value={(hand.blinds || {}).sb || ''} onChange={e => setHand(prev => ({ ...prev, blinds: { ...(prev.blinds || {}), sb: Number(e.target.value) || 0 } }))} />
              </div>
              <div className="replayer-field">
                <label>BB</label>
                <input type="text" inputMode="decimal" value={(hand.blinds || {}).bb || ''} onChange={e => setHand(prev => ({ ...prev, blinds: { ...(prev.blinds || {}), bb: Number(e.target.value) || 0 } }))} />
              </div>
              <div className="replayer-field">
                <label>{category === 'stud' ? 'Ante' : 'BB Ante'}</label>
                <input type="text" inputMode="decimal" value={(hand.blinds || {}).ante || ''} onChange={e => setHand(prev => ({ ...prev, blinds: { ...(prev.blinds || {}), ante: Number(e.target.value) || 0 } }))} />
              </div>
            </div>
            {hand.players.map((p, i) => (
              <div key={i} className="replayer-player-row">
                <span className="replayer-player-pos">{p.position}</span>
                <div className="replayer-field" style={{flex:'0 0 80px'}}>
                  <input type="text" value={p.name} onChange={e => updatePlayerField(i, 'name', e.target.value)} placeholder="Name" />
                </div>
                <div className="replayer-field" style={{flex:'0 0 80px'}}>
                  <input type="text" inputMode="decimal" value={p.startingStack} onChange={e => updatePlayerField(i, 'startingStack', e.target.value)} placeholder="Stack" />
                </div>
              </div>
            ))}
          </div>

          {/* Street tabs */}
          <div className="live-update-tabs">
            {hand.streets.map((s, i) => (
              <button key={i} className={currentStreetIdx === i ? 'active' : ''} onClick={() => setCurrentStreetIdx(i)}>
                {s.name}
              </button>
            ))}
          </div>

          {/* Current street entry */}
          <div className="replayer-street">
            <div className="replayer-street-header">
              <span className="replayer-street-name">{currentStreet.name}</span>
              <span className="replayer-street-pot">Pot: {formatChipAmount(currentPot)}</span>
            </div>

            {/* Card entry */}
            <div className="replayer-field" style={{marginBottom:'6px'}}>
              <label>Hero Cards</label>
              <input type="text" placeholder={gameCfg.heroPlaceholder ? dualPlaceholder(gameCfg.heroPlaceholder) : 'AhKd'}
                value={currentStreet.cards.hero}
                onChange={e => updateHeroCards(currentStreetIdx, e.target.value)} />
              <CardRow text={currentStreet.cards.hero} stud={gameCfg.isStud} max={gameCfg.heroCards} />
            </div>

            {category === 'community' && currentStreetIdx > 0 && (
              <div className="replayer-field" style={{marginBottom:'6px'}}>
                <label>Board ({currentStreet.name})</label>
                <input type="text" placeholder={gameCfg.boardPlaceholder || 'Qh7d2c'}
                  value={currentStreet.cards.board}
                  onChange={e => updateBoardCards(currentStreetIdx, e.target.value)} />
                <CardRow text={currentStreet.cards.board} max={streetDef.boardCards[currentStreetIdx]} />
              </div>
            )}

            {hand.players.slice(1).map((p, oi) => (
              <div key={oi} className="replayer-field" style={{marginBottom:'4px'}}>
                <label>{p.name} Cards</label>
                <input type="text" placeholder={gameCfg.heroPlaceholder ? dualPlaceholder(gameCfg.heroPlaceholder) : 'XxXx'}
                  value={(currentStreet.cards.opponents || [])[oi] || ''}
                  onChange={e => updateOpponentCards(currentStreetIdx, oi, e.target.value)} />
                <CardRow text={(currentStreet.cards.opponents || [])[oi] || ''} stud={gameCfg.isStud} max={gameCfg.heroCards}
                  placeholderCount={!(currentStreet.cards.opponents || [])[oi] ? gameCfg.heroCards : 0} />
              </div>
            ))}

            {/* Draw game discard entry */}
            {(category === 'draw_triple' || category === 'draw_single') && currentStreetIdx > 0 && (
              <div className="replayer-draw-section">
                <div className="replayer-draw-label">
                  {currentStreet.name || ('Draw ' + currentStreetIdx)} -- Discards & Draws
                </div>
                {hand.players.map((p, pi) => {
                  const draw = (currentStreet.draws || []).find(d => d.player === pi);
                  const discardCount = draw ? draw.discarded : 0;
                  const isPatText = discardCount === 0 && draw ? ' (Stand Pat)' : '';
                  return (
                    <div key={pi} className="replayer-draw-player-block" style={{marginBottom:'6px',padding:'4px 0',borderBottom:'1px solid var(--border)'}}>
                      <div className="replayer-row" style={{marginBottom:'2px',alignItems:'center'}}>
                        <span style={{fontSize:'0.65rem',color:'var(--text-muted)',minWidth:'55px',fontWeight:600}}>{p.name}{isPatText}</span>
                        <div className="replayer-field" style={{flex:'0 0 45px'}}>
                          <label style={{fontSize:'0.55rem'}}>Discard</label>
                          <input type="number" min="0" max={gameCfg.heroCards || 5} value={draw ? draw.discarded : ''}
                            onChange={e => updateDrawDiscard(currentStreetIdx, pi, e.target.value)}
                            placeholder="0" />
                        </div>
                      </div>
                      {discardCount > 0 && (
                        <div className="replayer-row" style={{marginTop:'2px',gap:'4px'}}>
                          <div className="replayer-field" style={{flex:1}}>
                            <label style={{fontSize:'0.55rem'}}>Discarded Cards</label>
                            <input type="text" placeholder={'e.g. 7h3c' + (discardCount > 2 ? '9d' : '')}
                              value={(draw && draw.discardedCards) || ''}
                              onChange={e => updateDrawField(currentStreetIdx, pi, 'discardedCards', e.target.value)} />
                            {(draw && draw.discardedCards) && <CardRow text={draw.discardedCards} max={discardCount} />}
                          </div>
                          <div className="replayer-field" style={{flex:1}}>
                            <label style={{fontSize:'0.55rem'}}>New Cards</label>
                            <input type="text" placeholder={'e.g. Ah5s' + (discardCount > 2 ? 'Kd' : '')}
                              value={(draw && draw.newCards) || ''}
                              onChange={e => updateDrawField(currentStreetIdx, pi, 'newCards', e.target.value)} />
                            {(draw && draw.newCards) && <CardRow text={draw.newCards} max={discardCount} />}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Actions */}
            <div className="replayer-action-list">
              {(currentStreet.actions || []).map((act, ai) => (
                <div key={ai} className="replayer-action-item">
                  <span className="replayer-action-player">{hand.players[act.player]?.name || '?'}</span>
                  <span className={`replayer-action-type ${act.action}`}>{act.action}</span>
                  {act.amount > 0 && <span className="replayer-action-amount">{formatChipAmount(act.amount)}</span>}
                  <span className="replayer-action-remove" onClick={() => {
                    if (ai === (currentStreet.actions || []).length - 1) removeLastAction();
                  }}>&times;</span>
                </div>
              ))}
            </div>

            {/* Amount input — only for NL and PL when betting/raising */}
            {bettingContext.betting !== 'fl' && (
              <div className="replayer-row" style={{marginTop:'6px',gap:'4px'}}>
                <div className="replayer-field" style={{flex:'0 0 80px'}}>
                  <input type="text" inputMode="decimal"
                    placeholder={bettingContext.betting === 'pl'
                      ? (bettingContext.facingBet ? 'Raise to (max ' + formatChipAmount(bettingContext.potRaiseAmount) + ')' : 'Bet (max ' + formatChipAmount(bettingContext.betAmount) + ')')
                      : 'Amount'}
                    value={actionAmount}
                    onChange={e => setActionAmount(e.target.value)} />
                </div>
                {bettingContext.betting === 'pl' && (
                  <button style={{fontSize:'0.6rem',padding:'2px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer'}}
                    onClick={() => setActionAmount(String(bettingContext.facingBet ? bettingContext.potRaiseAmount : bettingContext.betAmount))}>{bettingContext.facingBet ? 'Pot Raise' : 'Pot Bet'}</button>
                )}
              </div>
            )}
            <div className="replayer-action-btns">
              {bettingContext.facingBet ? (
                <>
                  <button className="action-fold" onClick={() => addAction('fold')}>Fold</button>
                  <button className="action-call" onClick={() => addAction('call')}>
                    Call {formatChipAmount(bettingContext.callAmount)}
                  </button>
                  {bettingContext.canRaise && (
                    <button className="action-raise" onClick={() => addAction('raise')}>
                      {bettingContext.betting === 'fl'
                        ? 'Raise to ' + formatChipAmount(bettingContext.raiseToAmount)
                        : 'Raise'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button onClick={() => addAction('check')}>Check</button>
                  <button className="action-bet" onClick={() => addAction('bet')}>
                    {bettingContext.betting === 'fl'
                      ? 'Bet ' + formatChipAmount(bettingContext.fixedBet)
                      : 'Bet'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Result / Winner entry */}
          <div className="replayer-section">
            <div className="replayer-section-title">Result (optional)</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:'4px'}}>
              {hand.players.map((p, pi) => {
                const winners = hand.result?.winners || [];
                const isWinner = winners.some(w => w.playerIdx === pi && !w.split);
                const isSplit = winners.some(w => w.playerIdx === pi && w.split);
                return (
                  <button key={pi} style={{
                    padding:'4px 10px',borderRadius:'6px',border:'1px solid',cursor:'pointer',
                    fontFamily:"'Univers Condensed','Univers',sans-serif",fontSize:'0.68rem',transition:'all 0.15s',
                    background: isWinner ? 'rgba(74,222,128,0.15)' : isSplit ? 'rgba(250,204,21,0.15)' : 'transparent',
                    borderColor: isWinner ? '#4ade80' : isSplit ? '#facc15' : 'var(--border)',
                    color: isWinner ? '#4ade80' : isSplit ? '#facc15' : 'var(--text-muted)',
                  }} onClick={() => {
                    setHand(prev => {
                      const prevWinners = prev.result?.winners || [];
                      const existing = prevWinners.find(w => w.playerIdx === pi);
                      let newWinners;
                      if (!existing) {
                        // Not selected -> winner
                        newWinners = [...prevWinners, { playerIdx: pi, split: false, label: '' }];
                      } else if (!existing.split) {
                        // Winner -> split
                        newWinners = prevWinners.map(w => w.playerIdx === pi ? { ...w, split: true } : w);
                      } else {
                        // Split -> remove
                        newWinners = prevWinners.filter(w => w.playerIdx !== pi);
                      }
                      return { ...prev, result: { ...prev.result, winners: newWinners } };
                    });
                  }}>
                    {p.name} {isWinner ? '(Win)' : isSplit ? '(Split)' : ''}
                  </button>
                );
              })}
            </div>
            <div style={{fontSize:'0.55rem',color:'var(--text-muted)',marginTop:'4px',fontFamily:"'Univers Condensed','Univers',sans-serif"}}>
              Tap to cycle: none → win → split → none
            </div>
          </div>

          {/* Bottom actions */}
          <div style={{display:'flex',gap:'6px',justifyContent:'flex-end'}}>
            <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={() => onDone(hand)}>Save & Replay</button>
          </div>
        </div>
      );
    }

    // ── Replayer Settings Helpers ──
    var REPLAYER_THEMES = [
      { id: 'default', label: 'Default' },
      { id: 'casino-royale', label: 'Casino Royale' },
      { id: 'neon-vegas', label: 'Neon Vegas' },
      { id: 'vintage', label: 'Vintage' },
      { id: 'minimalist', label: 'Minimalist' },
      { id: 'high-stakes', label: 'High Stakes' },
    ];


    var REPLAYER_CARD_BACKS = [
      { id: 'default', label: 'Default' },
      { id: 'classic', label: 'Classic Blue' },
      { id: 'casino-red', label: 'Casino Red' },
      { id: 'black-diamond', label: 'Black Diamond' },
      { id: 'bicycle', label: 'Bicycle' },
      { id: 'custom', label: 'Custom Color' },
    ];
    var REPLAYER_TABLE_SHAPES = [
      { id: 'oval', label: 'Oval' },
      { id: 'round', label: 'Round' },
      { id: 'octagon', label: 'Octagon' },
    ];

    function useReplayerSetting(key, defaultVal) {
      var fullKey = 'replayer' + key;
      var _s = useState(function() {
        var stored = localStorage.getItem(fullKey);
        if (stored === null) return defaultVal;
        if (defaultVal === true || defaultVal === false) return stored === 'true';
        return stored;
      });
      var val = _s[0], setVal = _s[1];
      var update = useCallback(function(v) {
        setVal(v);
        localStorage.setItem(fullKey, String(v));
      }, [fullKey]);
      return [val, update];
    }

    // Generate commentary text for current action
    function generateCommentary(hand, streetIdx, actionIdx, pot, stacks) {
      var street = hand.streets[streetIdx];
      if (!street) return 'The hand begins...';
      var streetName = street.name || 'Preflop';
      var category = getGameCategory(hand.gameType);
      var isDrawStreet = (category === 'draw_triple' || category === 'draw_single') && streetIdx > 0;
      if (actionIdx < 0) {
        // Stud street introductions
        if (category === 'stud') {
          var _ante = (hand.blinds || {}).ante || 0;
          if (streetIdx === 0) {
            var doorInfo = '';
            var _isRazz = hand.gameType === 'Razz' || hand.gameType === '2-7 Razz';
            var _biIdx = findStudBringIn(hand, _isRazz);
            if (_biIdx >= 0 && hand.players[_biIdx]) {
              var biPlayer = hand.players[_biIdx];
              var _hi = hand.heroIdx != null ? hand.heroIdx : 0;
              var _dc = '';
              if (_biIdx === _hi) {
                var _hc = parseCardNotation((hand.streets[0] && hand.streets[0].cards.hero) || '');
                if (_hc.length >= 3) _dc = _hc[2].rank + _hc[2].suit;
              } else {
                var _os = _biIdx < _hi ? _biIdx : _biIdx - 1;
                var _oc = parseCardNotation(((hand.streets[0] && hand.streets[0].cards.opponents) || [])[_os] || '');
                if (_oc.length >= 1) _dc = _oc[0].rank + _oc[0].suit;
              }
              var _SW = {h:'hearts',d:'diamonds',c:'clubs',s:'spades'};
              var _RW = {'A':'Ace','K':'King','Q':'Queen','J':'Jack','T':'Ten','9':'Nine','8':'Eight','7':'Seven','6':'Six','5':'Five','4':'Four','3':'Three','2':'Two'};
              if (_dc && _dc.length >= 2) {
                doorInfo = ' ' + biPlayer.name + ' shows the ' + (_RW[_dc[0]]||_dc[0]) + ' of ' + (_SW[_dc[1]]||_dc[1]) + ' as the door card and has the bring-in.';
              } else {
                doorInfo = ' ' + biPlayer.name + ' has the bring-in.';
              }
            }
            return hand.players.length + ' players ante ' + formatChipAmount(_ante) + '. Cards are dealt \u2014 two down, one up.' + doorInfo;
          }
          if (streetIdx === 4) return '7th Street: a final card is dealt face down to each remaining player. The pot stands at ' + formatChipAmount(pot) + '.';
          return streetName + ': a card is dealt face up to each remaining player. The pot stands at ' + formatChipAmount(pot) + '.';
        }
        if (streetIdx === 0) return 'Cards are dealt. ' + hand.players.length + ' players at the table. Blinds are ' + formatChipAmount((hand.blinds || {}).sb || 0) + '/' + formatChipAmount((hand.blinds || {}).bb || 0) + '.';
        // Draw street commentary
        if (isDrawStreet && street.draws && street.draws.length > 0) {
          var drawParts = street.draws.map(function(d) {
            var pName = hand.players[d.player] ? hand.players[d.player].name : '?';
            if (d.discarded === 0) return pName + ' stands pat';
            return pName + ' discards ' + d.discarded;
          });
          return streetName + '. ' + drawParts.join('. ') + '. The pot is ' + formatChipAmount(pot) + '.';
        }
        return streetName + ' is dealt. The pot stands at ' + formatChipAmount(pot) + '.';
      }
      var actions = street.actions || [];
      if (actionIdx >= actions.length) return '';
      var act = actions[actionIdx];
      var player = hand.players[act.player];
      var name = player ? player.name : 'Unknown';
      var pos = player ? player.position : '';
      var posStr = pos ? ' from the ' + pos : '';
      switch (act.action) {
        case 'fold': return name + posStr + ' releases their hand into the muck.';
        case 'check': return name + posStr + ' taps the table. Check.';
        case 'call': return name + posStr + ' makes the call for ' + formatChipAmount(act.amount) + '.';
        case 'bet':
          // In stud, after a bring-in, the first full bet is a "complete"
          if (category === 'stud' && streetIdx === 0) {
            var _hasBringIn = actions.slice(0, actionIdx).some(function(a) { return a.action === 'bring-in'; });
            var _priorBets = actions.slice(0, actionIdx).filter(function(a) { return a.action === 'bet' || a.action === 'raise'; }).length;
            if (_hasBringIn && _priorBets === 0) {
              return name + posStr + ' completes to ' + formatChipAmount(act.amount) + '.';
            }
          }
          return name + posStr + ' leads out with a bet of ' + formatChipAmount(act.amount) + ' into a ' + formatChipAmount(pot - act.amount) + ' pot.';
        case 'raise': return name + posStr + ' fires a raise to ' + formatChipAmount(act.amount) + '! The pot swells to ' + formatChipAmount(pot) + '.';
        case 'all-in': return name + posStr + ' moves ALL IN for ' + formatChipAmount(act.amount) + '! A pivotal moment at the table.';
        case 'bring-in': return name + posStr + ' posts the bring-in of ' + formatChipAmount(act.amount) + '.';
        default: return name + ' acts (' + act.action + ').';
      }
    }

    // Calculate approximate hand strength (0-100) based on hand rank
    function calcHandStrength(heroCards, boardCards, gameType) {
      if (!heroCards || heroCards.length < 2) return null;
      var gameCfg = HAND_CONFIG[gameType] || HAND_CONFIG_DEFAULT;
      var gameEval = GAME_EVAL[gameType];
      if (!gameEval) return null;
      var hCards = parseCardNotation(heroCards).filter(function(c) { return c.suit !== 'x'; });
      var bCards = boardCards ? parseCardNotation(boardCards).filter(function(c) { return c.suit !== 'x'; }) : [];
      if (hCards.length < 2) return null;
      // For preflop, use a simple ranking based on card values
      if (bCards.length === 0) {
        var r1 = '23456789TJQKA'.indexOf(hCards[0].rank);
        var r2 = hCards.length > 1 ? '23456789TJQKA'.indexOf(hCards[1].rank) : 0;
        var suited = hCards.length > 1 && hCards[0].suit === hCards[1].suit;
        var paired = hCards.length > 1 && hCards[0].rank === hCards[1].rank;
        var base = (r1 + r2) / 24 * 60;
        if (paired) base = 50 + (r1 / 12) * 50;
        if (suited) base += 8;
        if (Math.abs(r1 - r2) <= 2 && !paired) base += 5;
        return Math.min(100, Math.max(5, Math.round(base)));
      }
      // Post-flop: evaluate the hand and rank it
      try {
        var allCards = hCards.concat(bCards);
        var ev;
        if (gameEval.method === 'omaha') {
          ev = bestOmahaHigh(hCards, bCards);
        } else {
          ev = bestHighHand(allCards);
        }
        if (!ev) return 30;
        // Map hand ranks to strength percentages
        var rankMap = { 'High Card': 15, 'Pair': 30, 'Two Pair': 45, 'Three of a Kind': 55,
          'Straight': 65, 'Flush': 75, 'Full House': 82, 'Four of a Kind': 92,
          'Straight Flush': 97, 'Royal Flush': 100 };
        var baseStr = 30;
        for (var k in rankMap) {
          if (ev.name && ev.name.indexOf(k) >= 0) { baseStr = rankMap[k]; break; }
        }
        // Adjust by kicker quality
        var topRank = Math.max(r1 || 0, r2 || 0);
        baseStr += (topRank / 12) * 5;
        return Math.min(100, Math.max(5, Math.round(baseStr)));
      } catch (e) { return 30; }
    }

    // Get color for hand strength
    function getStrengthColor(pct) {
      if (pct >= 75) return '#4ade80';
      if (pct >= 50) return '#facc15';
      if (pct >= 25) return '#f59e0b';
      return '#ef4444';
    }

    // Calculate SPR (stack-to-pot ratio) for the hero at the start of a street
    function calcSPR(hand, streetIdx) {
      if (streetIdx <= 0) return null;
      var prevStreet = hand.streets[streetIdx - 1];
      var prevActionCount = prevStreet && prevStreet.actions ? prevStreet.actions.length - 1 : -1;
      var result = calcPotsAndStacks(hand, streetIdx - 1, prevActionCount);
      if (result.pot <= 0) return null;
      var heroIdx = hand.heroIdx != null ? hand.heroIdx : 0;
      var heroStack = result.stacks[heroIdx];
      if (heroStack <= 0) return null;
      return (heroStack / result.pot).toFixed(1);
    }

    // Calculate bet sizing as fraction of pot
    function getBetSizingLabel(betAmount, potBeforeBet) {
      if (!betAmount || betAmount <= 0 || potBeforeBet <= 0) return null;
      var ratio = betAmount / potBeforeBet;
      if (ratio <= 0.28) return 'min';
      if (ratio <= 0.38) return '1/3 pot';
      if (ratio <= 0.55) return '1/2 pot';
      if (ratio <= 0.7) return '2/3 pot';
      if (ratio <= 0.85) return '3/4 pot';
      if (ratio <= 1.15) return 'pot';
      if (ratio <= 1.6) return '1.5x pot';
      if (ratio <= 2.2) return '2x pot';
      if (ratio <= 3.2) return '3x pot';
      return 'overbet';
    }

    // Estimate hand range based on player actions in the hand
    function estimateRange(hand, playerIdx, upToStreet, upToAction) {
      var dominated = false;
      var hasRaise = false;
      var has3bet = false;
      var hasCall = false;
      var hasLimp = false;
      var raiseCount = 0;
      for (var si = 0; si <= upToStreet && si < hand.streets.length; si++) {
        var maxAi = si === upToStreet ? upToAction : ((hand.streets[si].actions || []).length - 1);
        var streetRaiseCount = 0;
        for (var ai = 0; ai <= maxAi && ai < (hand.streets[si].actions || []).length; ai++) {
          var act = hand.streets[si].actions[ai];
          if (act.player !== playerIdx) {
            if (act.action === 'raise' || act.action === 'bet') streetRaiseCount++;
            continue;
          }
          if (act.action === 'raise' || act.action === 'all-in') {
            hasRaise = true;
            raiseCount++;
            if (streetRaiseCount >= 1) has3bet = true;
          }
          if (act.action === 'call') {
            hasCall = true;
            if (si === 0 && streetRaiseCount === 0) hasLimp = true;
          }
          if (act.action === 'fold') dominated = true;
        }
      }
      if (dominated) return null;
      if (has3bet || raiseCount >= 2) return { label: 'Strong', cls: 'replayer-range-strong' };
      if (hasRaise) return { label: 'Medium+', cls: 'replayer-range-medium' };
      if (hasLimp) return { label: 'Speculative', cls: 'replayer-range-speculative' };
      if (hasCall) return { label: 'Medium', cls: 'replayer-range-passive' };
      return null;
    }

    // Calculate equity at showdown via hand strength comparison
    function calcShowdownEquity(hand, heroCardsStr, opponentCardsArr, boardCardsStr, gameCfg, gameEval, folded, replayHeroIdx) {
      if (!gameEval) return null;
      var bCards = boardCardsStr ? parseCardNotation(boardCardsStr).filter(function(c) { return c.suit !== 'x'; }) : [];
      var getScore = function(holeStr) {
        try {
          var hole = parseCardNotation(holeStr).filter(function(c) { return c.suit !== 'x'; });
          if (hole.length < 2) return 0;
          var all = hole.concat(bCards);
          var ev;
          if (gameEval.type === 'low') {
            ev = gameEval.lowType === 'a5' ? bestLowA5Hand(all, false) : bestLow27Hand(all);
            return ev && ev.score < Infinity ? (1e9 - ev.score) : 0;
          }
          if (gameEval.type === 'hilo') {
            var hiEv = gameEval.method === 'omaha' ? bestOmahaHigh(hole, bCards) : bestHighHand(all);
            var loEv = gameEval.method === 'omaha' ? bestOmahaLow(hole, bCards) : bestLowA5Hand(all, true);
            var hiScore = hiEv && hiEv.score ? hiEv.score : 0;
            var loScore = loEv && loEv.qualified ? (1e9 - loEv.score) : 0;
            return hiScore + loScore;
          }
          if (gameEval.method === 'omaha') {
            ev = bestOmahaHigh(hole, bCards);
          } else {
            ev = bestHighHand(all);
          }
          return ev && ev.score ? ev.score : 0;
        } catch (e) { return 0; }
      };
      var activePlayers = [];
      hand.players.forEach(function(p, pi) { if (!folded.has(pi)) activePlayers.push(pi); });
      if (activePlayers.length < 2) return null;
      var scores = {};
      activePlayers.forEach(function(pi) {
        var cards = pi === replayHeroIdx ? heroCardsStr : (opponentCardsArr[pi] || '');
        if (!cards || cards === 'MUCK') { scores[pi] = 0; return; }
        scores[pi] = getScore(cards);
      });
      var totalScore = 0;
      activePlayers.forEach(function(pi) { totalScore += Math.max(scores[pi] || 0, 1); });
      var equities = {};
      activePlayers.forEach(function(pi) {
        equities[pi] = Math.round((Math.max(scores[pi] || 0, 1) / totalScore) * 100);
      });
      return equities;
    }

    // Get the street color class for timeline dots
    function getStreetColorClass(streetName) {
      if (!streetName) return 'street-preflop';
      var lower = streetName.toLowerCase();
      if (lower === 'flop' || lower === '3rd street') return 'street-flop';
      if (lower === 'turn' || lower === '4th street') return 'street-turn';
      if (lower === 'river' || lower === '5th street' || lower === '6th street' || lower === '7th street') return 'street-river';
      return 'street-preflop';
    }

    // Calculate pot before a specific action on a street
    function calcPotBeforeAction(hand, streetIdx, actionIdx) {
      if (actionIdx < 0) return calcPotsAndStacks(hand, streetIdx, -1).pot;
      return calcPotsAndStacks(hand, streetIdx, actionIdx - 1).pot;
    }

    // Pot chip visual breakdown
    function PotChipVisual({ amount }) {
      var chips = getChipBreakdown(amount);
      // Group chips by color into stacks
      var stacks = [];
      var current = null;
      chips.forEach(function(color) {
        if (current && current.color === color) { current.count++; }
        else { current = { color: color, count: 1 }; stacks.push(current); }
      });
      return React.createElement('div', { className: 'replayer-pot-chips' },
        stacks.slice(0, 5).map(function(stack, i) {
          return React.createElement('div', { key: i, className: 'replayer-pot-chip-stack' },
            Array.from({ length: Math.min(stack.count, 6) }, function(_, j) {
              return React.createElement('div', { key: j, className: 'replayer-pot-chip-disc',
                style: { background: stack.color } });
            })
          );
        })
      );
    }

    // Placeholder player stats
    var PLAYER_STATS_DATA = {};
    function getPlayerStats(name) {
      if (PLAYER_STATS_DATA[name]) return PLAYER_STATS_DATA[name];
      // Generate random but consistent stats based on name hash
      var hash = 0;
      for (var i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash = Math.abs(hash);
      var vpip = 15 + (hash % 35);
      var pfr = Math.max(5, vpip - 5 - (hash % 15));
      var ag = 1 + ((hash % 30) / 10);
      PLAYER_STATS_DATA[name] = { vpip: vpip, pfr: pfr, ag: ag.toFixed(1) };
      return PLAYER_STATS_DATA[name];
    }

    // Replayer Settings Panel Component
    function ReplayerSettingsPanel({ onClose, settings, onUpdate }) {
      return ReactDOM.createPortal(
        React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'replayer-settings-backdrop', onClick: onClose }),
          React.createElement('div', { className: 'replayer-settings-panel' },
            React.createElement('div', { className: 'replayer-settings-header' },
              React.createElement('span', null, 'Replayer Settings'),
              React.createElement('button', { className: 'replayer-settings-close', onClick: onClose }, '\u00D7')
            ),
            // TABLE section
            React.createElement('div', { className: 'replayer-settings-group' },
              React.createElement('div', { className: 'replayer-settings-group-title' }, 'Table'),
              React.createElement('div', { className: 'replayer-settings-row', style: { flexDirection: 'column', alignItems: 'flex-start', gap: '6px' } },
                React.createElement('div', { className: 'replayer-settings-label' }, 'Theme'),
                React.createElement('div', { className: 'replayer-settings-pills' },
                  REPLAYER_THEMES.map(function(t) {
                    return React.createElement('button', {
                      key: t.id, className: 'replayer-settings-pill' + (settings.theme === t.id ? ' active' : ''),
                      onClick: function() { onUpdate('theme', t.id); }
                    }, t.label);
                  })
                )
              ),
              React.createElement('div', { className: 'replayer-settings-row', style: { flexDirection: 'column', alignItems: 'flex-start', gap: '6px', marginTop: '8px' } },
                React.createElement('div', { className: 'replayer-settings-label' }, 'Table Shape'),
                React.createElement('div', { className: 'replayer-settings-pills' },
                  REPLAYER_TABLE_SHAPES.map(function(s) {
                    return React.createElement('button', {
                      key: s.id, className: 'replayer-settings-pill' + (settings.tableShape === s.id ? ' active' : ''),
                      onClick: function() { onUpdate('tableShape', s.id); }
                    }, s.label);
                  })
                )
              ),
              settings.theme === 'default' && React.createElement('div', { className: 'replayer-settings-row', style: { flexDirection: 'column', alignItems: 'flex-start', gap: '6px', marginTop: '8px' } },
                React.createElement('div', { className: 'replayer-settings-label' }, 'Felt Color'),
                React.createElement('div', { style: { display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' } },
                  [
                    { name: 'Lavender', color: '#6b5b8a' },
                    { name: 'Classic Green', color: '#2d5a27' },
                    { name: 'Blue', color: '#1a3a5c' },
                    { name: 'Red', color: '#5a1a1a' },
                    { name: 'Purple', color: '#3d1a5a' },
                    { name: 'Black', color: '#1a1a1a' },
                  ].map(function(fc) {
                    return React.createElement('button', {
                      key: fc.color,
                      className: 'felt-color-swatch' + (settings.feltColor === fc.color ? ' active' : ''),
                      style: { background: fc.color },
                      title: fc.name,
                      onClick: function() { onUpdate('feltColor', fc.color); },
                    });
                  }),
                  React.createElement('input', {
                    type: 'color', value: settings.feltColor,
                    onChange: function(e) { onUpdate('feltColor', e.target.value); },
                    style: { width: '24px', height: '24px', border: 'none', cursor: 'pointer', borderRadius: '4px', marginLeft: '4px' },
                    title: 'Custom color'
                  })
                )
              )
            ),
            // CARDS section
            React.createElement('div', { className: 'replayer-settings-group' },
              React.createElement('div', { className: 'replayer-settings-group-title' }, 'Cards'),
              React.createElement('div', { className: 'replayer-settings-row', style: { flexDirection: 'column', alignItems: 'flex-start', gap: '6px' } },
                React.createElement('div', { className: 'replayer-settings-label' }, 'Card Back Design'),
                React.createElement('div', { className: 'replayer-settings-pills' },
                  REPLAYER_CARD_BACKS.map(function(cb) {
                    return React.createElement('button', {
                      key: cb.id, className: 'replayer-settings-pill' + (settings.cardBack === cb.id ? ' active' : ''),
                      onClick: function() { onUpdate('cardBack', cb.id); }
                    }, cb.label);
                  })
                )
              ),
              settings.cardBack === 'custom' && React.createElement('div', { className: 'replayer-settings-row', style: { marginTop: '8px' } },
                React.createElement('div', { className: 'replayer-settings-label' }, 'Custom Card Back Color'),
                React.createElement('input', {
                  type: 'color', value: settings.cardBackColor,
                  onChange: function(e) { onUpdate('cardBackColor', e.target.value); },
                  style: { width: '32px', height: '24px', border: 'none', cursor: 'pointer', borderRadius: '4px' }
                })
              ),
              React.createElement('div', { className: 'replayer-settings-row', style: { marginTop: '6px' } },
                React.createElement('div', null,
                  React.createElement('div', { className: 'replayer-settings-label' }, '4-Color Deck'),
                  React.createElement('div', { className: 'replayer-settings-sublabel' }, 'Diamonds=blue, Clubs=green')
                ),
                React.createElement('button', {
                  className: 'replayer-settings-toggle' + (settings.fourColorDeck ? ' on' : ''),
                  onClick: function() { onUpdate('fourColorDeck', !settings.fourColorDeck); }
                })
              ),
              React.createElement('div', { className: 'replayer-settings-row', style: { flexDirection: 'column', alignItems: 'flex-start', gap: '6px', marginTop: '8px' } },
                React.createElement('div', { className: 'replayer-settings-label' }, 'Card Front Style'),
                React.createElement('div', { className: 'replayer-settings-pills' },
                  [{ id: 'default', label: 'Standard' }, { id: 'classic', label: 'Classic' }].map(function(ct) {
                    return React.createElement('button', {
                      key: ct.id, className: 'replayer-settings-pill' + (settings.cardTheme === ct.id ? ' active' : ''),
                      onClick: function() { onUpdate('cardTheme', ct.id); }
                    }, ct.label);
                  })
                )
              ),
              React.createElement('div', { className: 'replayer-settings-row', style: { marginTop: '8px' } },
                React.createElement('div', { className: 'replayer-settings-label' }, 'Splay Hole Cards'),
                React.createElement('button', {
                  className: 'replayer-settings-toggle' + (settings.cardSplay ? ' on' : ''),
                  onClick: function() { onUpdate('cardSplay', !settings.cardSplay); }
                })
              ),
              React.createElement('div', { className: 'replayer-settings-row', style: { marginTop: '8px' } },
                React.createElement('div', { className: 'replayer-settings-label' }, 'Rail Light Strip'),
                React.createElement('button', {
                  className: 'replayer-settings-toggle' + (settings.lightStrip ? ' on' : ''),
                  onClick: function() { onUpdate('lightStrip', !settings.lightStrip); }
                })
              )
            ),
            // DISPLAY section
            React.createElement('div', { className: 'replayer-settings-group' },
              React.createElement('div', { className: 'replayer-settings-group-title' }, 'Display'),
              [
                { key: 'showChipStacks', label: 'Pot Chip Stacks', sub: 'Visual chip stacks in pot area' },
                { key: 'showHandStrength', label: 'Hand Strength Meter', sub: 'Gauge showing relative hand strength' },
                { key: 'showPotOdds', label: 'Pot Odds', sub: 'Show pot odds when facing a bet' },
                { key: 'showCommentary', label: 'Commentator Mode', sub: 'Auto-generated play-by-play text' },
                { key: 'showTimeline', label: 'Action Timeline', sub: 'Clickable dots showing all actions' },
                { key: 'showPlayerStats', label: 'Player Stats', sub: 'VPIP/PFR overlay on seats' },
                { key: 'showNutsHighlight', label: 'Highlight the Nuts', sub: 'Glow when holding the best hand' },
              ].map(function(opt) {
                return React.createElement('div', { key: opt.key, className: 'replayer-settings-row' },
                  React.createElement('div', null,
                    React.createElement('div', { className: 'replayer-settings-label' }, opt.label),
                    React.createElement('div', { className: 'replayer-settings-sublabel' }, opt.sub)
                  ),
                  React.createElement('button', {
                    className: 'replayer-settings-toggle' + (settings[opt.key] ? ' on' : ''),
                    onClick: function() { onUpdate(opt.key, !settings[opt.key]); }
                  })
                );
              })
            ),
            // ANIMATION section
            React.createElement('div', { className: 'replayer-settings-group' },
              React.createElement('div', { className: 'replayer-settings-group-title' }, 'Animation'),
              [
                { key: 'animateDeal', label: 'Deal Animation', sub: 'Cards slide in when dealt' },
                { key: 'animateChips', label: 'Chip Animation', sub: 'Chips slide from player to pot' },
                { key: 'animateBoard', label: 'Board Flip', sub: 'Board cards flip face-up' },
                { key: 'animateWinner', label: 'Winner Effects', sub: 'Bounce and glow on winning hand' },
              ].map(function(opt) {
                return React.createElement('div', { key: opt.key, className: 'replayer-settings-row' },
                  React.createElement('div', null,
                    React.createElement('div', { className: 'replayer-settings-label' }, opt.label),
                    React.createElement('div', { className: 'replayer-settings-sublabel' }, opt.sub)
                  ),
                  React.createElement('button', {
                    className: 'replayer-settings-toggle' + (settings[opt.key] ? ' on' : ''),
                    onClick: function() { onUpdate(opt.key, !settings[opt.key]); }
                  })
                );
              })
            ),
            // SOUND section
            React.createElement('div', { className: 'replayer-settings-group' },
              React.createElement('div', { className: 'replayer-settings-group-title' }, 'Sound (Coming Soon)'),
              [
                { key: 'soundDeal', label: 'Card Deal Sound' },
                { key: 'soundChips', label: 'Chip Sound' },
                { key: 'soundFold', label: 'Fold Sound' },
                { key: 'soundAllIn', label: 'All-In Sound' },
              ].map(function(opt) {
                return React.createElement('div', { key: opt.key, className: 'replayer-settings-row', style: { opacity: 0.4 } },
                  React.createElement('div', { className: 'replayer-settings-label' }, opt.label),
                  React.createElement('button', { className: 'replayer-settings-toggle', disabled: true })
                );
              })
            )
          )
        ),
        document.body
      );
    }

    // ── Hand Replayer Replay Sub-component ──
    function HandReplayerReplay({ hand, onEdit, onBack, cardSplay }) {
      const [streetIdx, setStreetIdx] = useState(0);
      const [actionIdx, setActionIdx] = useState(-1); // -1 = show street cards only
      const [playing, setPlaying] = useState(false);
      const [speed, setSpeed] = useState(1000); // ms per action
      const [showResult, setShowResult] = useState(false);
      const [hiloAnimate, setHiloAnimate] = useState(false);
      const [isLandscape, setIsLandscape] = useState(() => window.matchMedia('(orientation: landscape)').matches);
      useEffect(function() {
        var mql = window.matchMedia('(orientation: landscape)');
        var handler = function(e) { setIsLandscape(e.matches); };
        mql.addEventListener('change', handler);
        return function() { mql.removeEventListener('change', handler); };
      }, []);
      const [feltColor, setFeltColor] = useState(() => localStorage.getItem('replayerFeltColor') || '#6b5b8a');
      const [cardTheme, setCardTheme] = useState(() => localStorage.getItem('replayerCardTheme') || 'default');
      const playTimerRef = useRef(null);
      const [showSettings, setShowSettings] = useState(false);
      const [showFeltPicker, setShowFeltPicker] = useState(false);
      const prevStreetRef = useRef(0);
      // All replayer settings
      var _theme = useReplayerSetting('Theme', 'default');
      var _tableShape = useReplayerSetting('TableShape', 'oval');
      var _cardBack = useReplayerSetting('CardBack', 'default');
      var _cardBackColor = useReplayerSetting('CardBackColor', '#1a3a6e');
      var _fourColor = useReplayerSetting('FourColorDeck', false);
      var _showChipStacks = useReplayerSetting('ShowChipStacks', false);
      var _showHandStrength = useReplayerSetting('ShowHandStrength', false);
      var _showPotOdds = useReplayerSetting('ShowPotOdds', false);
      var _showCommentary = useReplayerSetting('ShowCommentary', false);
      const [shareLinkCopied, setShareLinkCopied] = useState(false);
      const copyShareLink = useCallback(() => {
        if (!window.encodeHand) return;
        try {
          var shorthand = window.encodeHand(hand);
          if (!shorthand) return;
          var url = window.location.origin + '/#h/' + encodeURIComponent(shorthand);
          navigator.clipboard.writeText(url).then(() => {
            setShareLinkCopied(true);
            setTimeout(() => setShareLinkCopied(false), 2000);
          });
        } catch (e) { console.error('Failed to generate share link:', e); }
      }, [hand]);
      var _showTimeline = useReplayerSetting('ShowTimeline', true);
      var _showPlayerStats = useReplayerSetting('ShowPlayerStats', false);
      var _showNuts = useReplayerSetting('ShowNutsHighlight', false);
      var _showSPR = useReplayerSetting('ShowSPR', false);
      var _showBetSizing = useReplayerSetting('ShowBetSizing', false);
      var _showRanges = useReplayerSetting('ShowRanges', false);
      var _showChipDelta = useReplayerSetting('ShowChipDelta', false);
      var _showEquity = useReplayerSetting('ShowEquity', false);
      var _cardSplay = useReplayerSetting('CardSplay', true);
      var _lightStrip = useReplayerSetting('LightStrip', false);
      var _animDeal = useReplayerSetting('AnimateDeal', true);
      var _animChips = useReplayerSetting('AnimateChips', true);
      var _animBoard = useReplayerSetting('AnimateBoard', true);
      var _animWinner = useReplayerSetting('AnimateWinner', true);
      var rSettings = {
        theme: _theme[0], tableShape: _tableShape[0], feltColor: feltColor,
        cardBack: _cardBack[0], cardBackColor: _cardBackColor[0], fourColorDeck: _fourColor[0],
        showChipStacks: _showChipStacks[0], showHandStrength: _showHandStrength[0],
        showPotOdds: _showPotOdds[0], showCommentary: _showCommentary[0],
        showTimeline: _showTimeline[0], showPlayerStats: _showPlayerStats[0],
        showNutsHighlight: _showNuts[0],
        showSPR: _showSPR[0], showBetSizing: _showBetSizing[0],
        showRanges: _showRanges[0], showChipDelta: _showChipDelta[0],
        showEquity: _showEquity[0],
        animateDeal: _animDeal[0], animateChips: _animChips[0],
        animateBoard: _animBoard[0], animateWinner: _animWinner[0],
        cardTheme: cardTheme,
        cardSplay: _cardSplay[0],
        lightStrip: _lightStrip[0],
      };
      var rSetters = {
        theme: _theme[1], tableShape: _tableShape[1], feltColor: function(v) { setFeltColor(v); localStorage.setItem('replayerFeltColor', v); },
        cardBack: _cardBack[1], cardBackColor: _cardBackColor[1], fourColorDeck: _fourColor[1],
        showChipStacks: _showChipStacks[1], showHandStrength: _showHandStrength[1],
        showPotOdds: _showPotOdds[1], showCommentary: _showCommentary[1],
        showTimeline: _showTimeline[1], showPlayerStats: _showPlayerStats[1],
        showNutsHighlight: _showNuts[1],
        showSPR: _showSPR[1], showBetSizing: _showBetSizing[1],
        showRanges: _showRanges[1], showChipDelta: _showChipDelta[1],
        showEquity: _showEquity[1],
        animateDeal: _animDeal[1], animateChips: _animChips[1],
        animateBoard: _animBoard[1], animateWinner: _animWinner[1],
        cardTheme: function(v) { setCardTheme(v); localStorage.setItem('replayerCardTheme', v); },
        cardSplay: _cardSplay[1],
        lightStrip: _lightStrip[1],
      };
      var handleSettingsUpdate = function(key, val) {
        if (rSetters[key]) rSetters[key](val);
      };
      // Animation state tracking
      const [animFolded, setAnimFolded] = useState(new Set()); // seats currently fold-animating
      const [animStreetTransition, setAnimStreetTransition] = useState(false);
      const [animStreetLabel, setAnimStreetLabel] = useState(false);
      const [animShowdown, setAnimShowdown] = useState(false); // showdown flip active
      const [flyingChips, setFlyingChips] = useState([]); // {id, x0, y0, x1, y1, toWinner}
      const [animPotCollect, setAnimPotCollect] = useState(false);
      const prevActionIdxRef = useRef(-1);
      const prevShowResultRef = useRef(false);
      const tableRef = useRef(null);

      // Track street changes for animations
      useEffect(function() {
        if (prevStreetRef.current !== streetIdx && streetIdx > 0) {
          // Street changed — trigger transition
          setAnimStreetTransition(true);
          setAnimStreetLabel(true);
          var t1 = setTimeout(function() { setAnimStreetTransition(false); }, 500);
          var t2 = setTimeout(function() { setAnimStreetLabel(false); }, 450);
          return function() { clearTimeout(t1); clearTimeout(t2); };
        }
      }, [streetIdx]);
      useEffect(function() { prevStreetRef.current = streetIdx; }, [streetIdx]);

      // Fold, showdown, and street-clear effects are placed after currentActions is declared (below)

      // Flying chip helper
      var spawnFlyingChips = useCallback(function(fromPct, toPct, count, toWinner) {
        if (!tableRef.current) return;
        var rect = tableRef.current.getBoundingClientRect();
        var chips = [];
        for (var i = 0; i < Math.min(count, 5); i++) {
          chips.push({
            id: Date.now() + '-' + i,
            x0: (fromPct[0] / 100) * rect.width,
            y0: (fromPct[1] / 100) * rect.height,
            x1: (toPct[0] / 100) * rect.width,
            y1: (toPct[1] / 100) * rect.height,
            delay: i * 60,
            toWinner: !!toWinner,
          });
        }
        setFlyingChips(function(prev) { return prev.concat(chips); });
        setTimeout(function() { setFlyingChips([]); }, 700);
      }, []);

      // Determine board animation class based on which street just appeared
      var getBoardAnimClass = function() {
        if (!rSettings.animateBoard || prevStreetRef.current === streetIdx) return '';
        var boardLen = 0;
        for (var si = 0; si <= streetIdx && si < hand.streets.length; si++) {
          if (hand.streets[si].cards.board) boardLen += parseCardNotation(hand.streets[si].cards.board).length;
        }
        if (boardLen <= 3 && streetIdx > 0) return ' animate-board-flop';
        if (boardLen === 4) return ' animate-board-turn';
        if (boardLen === 5) return ' animate-board-river';
        return '';
      };

      const gameCfg = HAND_CONFIG[hand.gameType] || HAND_CONFIG_DEFAULT;
      const category = getGameCategory(hand.gameType);
      const streetDef = getStreetDef(hand.gameType);
      const gameEval = GAME_EVAL[hand.gameType];
      const isHiLo = gameEval && (gameEval.type === 'hilo' || gameEval.type === 'split-badugi');

      const totalStreets = hand.streets.length;
      const currentStreet = hand.streets[streetIdx];
      const currentActions = currentStreet?.actions || [];

      // Detect fold actions and trigger fold animation
      useEffect(function() {
        if (actionIdx < 0) { prevActionIdxRef.current = actionIdx; return; }
        var actions = currentActions;
        if (actionIdx >= 0 && actionIdx < actions.length) {
          var act = actions[actionIdx];
          if (act && act.action === 'fold' && rSettings.animateDeal) {
            setAnimFolded(function(prev) { var n = new Set(prev); n.add(act.player); return n; });
            setTimeout(function() {
              setAnimFolded(function(prev) { var n = new Set(prev); n.delete(act.player); return n; });
            }, 450);
          }
        }
        prevActionIdxRef.current = actionIdx;
      }, [actionIdx, currentActions, rSettings.animateDeal]);

      // Clear fold animations on street change
      useEffect(function() { setAnimFolded(new Set()); }, [streetIdx]);

      // Showdown flip animation
      useEffect(function() {
        if (showResult && !prevShowResultRef.current && rSettings.animateDeal) {
          setAnimShowdown(true);
          setTimeout(function() { setAnimShowdown(false); }, 600);
        }
        prevShowResultRef.current = showResult;
      }, [showResult, rSettings.animateDeal]);

      // Build cumulative board cards up to current street
      const boardCards = useMemo(() => {
        if (category !== 'community') return '';
        let board = '';
        for (let si = 0; si <= streetIdx && si < hand.streets.length; si++) {
          if (hand.streets[si].cards.board) board += hand.streets[si].cards.board;
        }
        return board;
      }, [hand, streetIdx, category]);

      // Build cumulative hero/opponent cards for stud and draw games
      const isDrawGame = category === 'draw_triple' || category === 'draw_single';

      const replayHeroIdx = hand.heroIdx != null ? hand.heroIdx : 0;

      const heroCards = useMemo(() => {
        if (category === 'stud') {
          let cards = '';
          for (let si = 0; si <= streetIdx; si++) {
            if (hand.streets[si]?.cards.hero) cards += hand.streets[si].cards.hero;
          }
          return cards;
        }
        if (isDrawGame) {
          // Apply draws to hero's initial hand up to current street
          var base = hand.streets[0]?.cards.hero || '';
          var heroDraws = getPlayerDrawsByStreet(hand, replayHeroIdx);
          // Only apply draws for streets we've passed (current street's draw happens at start of that street)
          return computeDrawHand(base, heroDraws, streetIdx - 1);
        }
        return hand.streets[0]?.cards.hero || '';
      }, [hand, streetIdx, category, isDrawGame, replayHeroIdx]);

      const opponentCards = useMemo(() => {
        // Build a card string for each player index (excluding hero)
        // opponents array is indexed by "slot" = player index with hero removed
        return hand.players.map((_, pi) => {
          if (pi === replayHeroIdx) return null; // hero, skip
          var oppSlot = pi > replayHeroIdx ? pi - 1 : pi;
          if (category === 'stud') {
            let cards = '';
            for (let si = 0; si <= streetIdx; si++) {
              if (hand.streets[si]?.cards.opponents?.[oppSlot]) cards += hand.streets[si].cards.opponents[oppSlot];
            }
            return cards;
          }
          if (isDrawGame) {
            var base = hand.streets[0]?.cards.opponents?.[oppSlot] || '';
            var oppDraws = getPlayerDrawsByStreet(hand, pi);
            return computeDrawHand(base, oppDraws, streetIdx - 1);
          }
          return hand.streets[0]?.cards.opponents?.[oppSlot] || '';
        });
      }, [hand, streetIdx, category, replayHeroIdx, isDrawGame]);

      // Calculate current pot and stacks (stacks update per action, pot display updates per street)
      const { stacks, pot, folded } = useMemo(() => {
        return calcPotsAndStacks(hand, streetIdx, actionIdx);
      }, [hand, streetIdx, actionIdx]);

      // Display pot only updates at street start (action closed on previous street)
      const displayPot = useMemo(() => {
        return calcPotsAndStacks(hand, streetIdx, -1).pot;
      }, [hand, streetIdx]);

      // Current action display per player
      const playerLastAction = useMemo(() => {
        const result = {};
        for (let ai = 0; ai <= actionIdx && ai < currentActions.length; ai++) {
          const act = currentActions[ai];
          result[act.player] = act;
        }
        return result;
      }, [currentActions, actionIdx]);

      // Evaluate final hand result
      const evalResult = useMemo(() => {
        // Manual result from hand.result (for custom games or overrides)
        if (showResult && hand.result && hand.result.winners) {
          return hand.result.winners.map(w => {
            var pName = w.playerIdx === replayHeroIdx ? 'Hero' : (hand.players[w.playerIdx]?.name || 'Player');
            // Evaluate the winning hand name
            var winHandName = '';
            var pCards = w.playerIdx === replayHeroIdx ? heroCards : (opponentCards[w.playerIdx] || '');
            if (pCards && pCards !== 'MUCK') {
              var cfg = GAME_EVAL[hand.gameType];
              if (cfg) {
                var parsed = parseCardNotation(pCards).filter(function(c) { return c.suit !== 'x'; });
                var board = category === 'community' ? parseCardNotation(boardCards).filter(function(c) { return c.suit !== 'x'; }) : [];
                var ev = null;
                if (cfg.type === 'high' || cfg.type === 'hilo') {
                  ev = cfg.method === 'omaha' ? bestOmahaHigh(parsed, board) : bestHighHand(parsed.concat(board));
                } else if (cfg.type === 'low') {
                  ev = cfg.lowType === 'a5' ? bestLowA5Hand(parsed.concat(board), false) : bestLow27Hand(parsed.concat(board));
                } else if (cfg.type === 'badugi') {
                  ev = bestBadugiHand(parsed);
                }
                if (ev) winHandName = ev.name;
              }
            }
            var label = w.label || (pName + ' wins' + (winHandName ? ', ' + winHandName : ''));
            return {
              index: w.playerIdx,
              result: {
                outcome: w.playerIdx === replayHeroIdx ? 'hero' : (w.split ? 'split' : 'opponent'),
                text: label,
                color: w.split ? 'yellow' : (w.playerIdx === replayHeroIdx ? 'green' : 'red'),
              },
            };
          });
        }
        if (!showResult || !gameEval) return null;
        const hCards = parseCardNotation(heroCards);
        const bCards = gameCfg.hasBoard ? parseCardNotation(boardCards) : [];
        if (gameCfg.hasBoard && bCards.length < 3) return null;
        if (hCards.length < (gameCfg.isStud ? 5 : gameCfg.heroCards)) return null;

        const boardSuits = new Set(bCards.map(c => c.suit));
        const usedKeys = bCards.map(c => c.rank + c.suit);
        let hEval;
        if (gameCfg.isStud) {
          hEval = hCards.filter(c => c.suit !== 'x');
        } else {
          hEval = assignNeutralSuits(hCards, usedKeys, boardSuits);
        }
        hEval.forEach(c => { if (c.suit !== 'x') usedKeys.push(c.rank + c.suit); });

        const results = [];
        for (let pi = 0; pi < opponentCards.length; pi++) {
          if (pi === replayHeroIdx) continue; // skip hero
          if (folded.has(pi)) continue;
          if (!opponentCards[pi]) continue;
          const oRaw = parseCardNotation(opponentCards[pi]);
          if (oRaw.length < (gameCfg.isStud ? 5 : gameCfg.heroCards)) continue;
          let oEval;
          if (gameCfg.isStud) {
            oEval = oRaw.filter(c => c.suit !== 'x');
          } else {
            oEval = assignNeutralSuits(oRaw, usedKeys, boardSuits);
          }
          const ev = evaluateHand(hand.gameType, hEval, oEval, bCards);
          if (ev && ev.result) results.push({ index: pi, ...ev });
          oEval.forEach(c => { if (c.suit !== 'x') usedKeys.push(c.rank + c.suit); });
        }
        return results.length ? results : null;
      }, [showResult, hand, heroCards, opponentCards, boardCards, gameCfg, gameEval, folded]);

      // Navigation
      const canGoForward = streetIdx < totalStreets - 1 || actionIdx < currentActions.length - 1 || !showResult;
      const canGoBack = streetIdx > 0 || actionIdx >= 0 || showResult;

      const stepForward = useCallback(() => {
        if (actionIdx < currentActions.length - 1) {
          setActionIdx(a => a + 1);
        } else if (streetIdx < totalStreets - 1) {
          setStreetIdx(s => s + 1);
          setActionIdx(-1);
        } else if (!showResult) {
          setShowResult(true);
          if (isHiLo) {
            setTimeout(() => setHiloAnimate(true), 100);
          }
        } else {
          setPlaying(false);
        }
      }, [actionIdx, currentActions.length, streetIdx, totalStreets, showResult, isHiLo]);

      const stepBack = useCallback(() => {
        if (showResult) {
          setShowResult(false);
          setHiloAnimate(false);
        } else if (actionIdx >= 0) {
          setActionIdx(a => a - 1);
        } else if (streetIdx > 0) {
          const prevStreet = hand.streets[streetIdx - 1];
          setStreetIdx(s => s - 1);
          setActionIdx((prevStreet?.actions?.length || 0) - 1);
        }
      }, [actionIdx, streetIdx, showResult, hand]);

      const goToStart = () => { setStreetIdx(0); setActionIdx(-1); setShowResult(false); setHiloAnimate(false); };
      const goToEnd = () => {
        const lastStreet = hand.streets.length - 1;
        setStreetIdx(lastStreet);
        setActionIdx((hand.streets[lastStreet]?.actions?.length || 0) - 1);
      };

      // Auto-play with animation-aware timing
      useEffect(() => {
        if (playing) {
          // Base speed from setting, add extra time for animations
          var animExtra = rSettings.animateDeal ? Math.max(200, speed * 0.3) : 0;
          var effectiveSpeed = speed + animExtra;
          playTimerRef.current = setInterval(() => {
            stepForward();
          }, effectiveSpeed);
        }
        return () => { if (playTimerRef.current) clearInterval(playTimerRef.current); };
      }, [playing, speed, stepForward, rSettings.animateDeal]);

      // Stop playing when we reach the end
      useEffect(() => {
        if (showResult && playing) setPlaying(false);
      }, [showResult, playing]);

      // Keyboard shortcuts: arrows, space, Home, End
      useEffect(function() {
        var handler = function(e) {
          // Skip if user is typing in an input/textarea
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
          if (e.key === 'ArrowRight') { e.preventDefault(); stepForward(); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); stepBack(); }
          else if (e.key === ' ') { e.preventDefault(); setPlaying(function(p) { return !p; }); }
          else if (e.key === 'Home') { e.preventDefault(); goToStart(); }
          else if (e.key === 'End') { e.preventDefault(); goToEnd(); }
        };
        window.addEventListener('keydown', handler);
        return function() { window.removeEventListener('keydown', handler); };
      }, [stepForward, stepBack]);

      // Determine winner styling for seats
      const getPlayerSeatClass = (playerIdx) => {
        if (folded.has(playerIdx)) return 'folded';
        if (showResult) {
          // Manual result check first
          const manualWinners = hand.result?.winners;
          if (manualWinners && manualWinners.length > 0) {
            const entry = manualWinners.find(w => w.playerIdx === playerIdx);
            if (entry) return entry.split ? 'split' : 'winner';
            return manualWinners.length > 0 ? 'loser' : '';
          }
          // Auto-eval result
          if (evalResult) {
            if (playerIdx === replayHeroIdx) {
              const heroWins = evalResult.some(r => r.result.outcome === 'hero');
              const heroLoses = evalResult.some(r => r.result.outcome === 'opponent');
              const heroSplits = evalResult.some(r => r.result.outcome === 'split');
              if (heroWins && !heroLoses) return 'winner';
              if (heroLoses && !heroWins) return 'loser';
              if (heroSplits) return 'split';
            } else {
              const oppResult = evalResult.find(r => r.index === playerIdx);
              if (oppResult) {
                if (oppResult.result.outcome === 'opponent') return 'winner';
                if (oppResult.result.outcome === 'hero') return 'loser';
                if (oppResult.result.outcome === 'split') return 'split';
              }
            }
          }
        }
        return '';
      };

      const getPlayerHandName = (playerIdx, useShort) => {
        if (!showResult) return null;
        if (folded.has(playerIdx)) return null;
        const pCards = playerIdx === replayHeroIdx ? heroCards : (opponentCards[playerIdx] || '');
        if (!pCards) return null;
        const cfg = GAME_EVAL[hand.gameType];
        if (!cfg) return null;
        const parsed = parseCardNotation(pCards).filter(c => c.suit !== 'x');
        if (parsed.length < (gameCfg.heroCards || 2)) return null;
        const board = category === 'community' ? parseCardNotation(boardCards).filter(c => c.suit !== 'x') : [];

        if (cfg.type === 'hilo') {
          // Evaluate both high and low
          var hiEv = cfg.method === 'omaha' ? bestOmahaHigh(parsed, board) : bestHighHand(parsed.concat(board));
          var loEv;
          if (cfg.method === 'omaha') {
            loEv = bestOmahaLow(parsed, board);
          } else {
            loEv = bestLowA5Hand(parsed.concat(board), true); // 8-or-better for hilo
          }
          var parts = [];
          if (hiEv) parts.push('Hi: ' + (useShort ? (hiEv.shortName || hiEv.name) : hiEv.name));
          if (loEv && loEv.qualified !== false && loEv.name) {
            parts.push('Lo: ' + loEv.name);
          }
          return parts.length ? parts.join('\n') : null;
        }

        let ev = null;
        if (cfg.type === 'high') {
          ev = cfg.method === 'omaha' ? bestOmahaHigh(parsed, board) : bestHighHand(parsed.concat(board));
        } else if (cfg.type === 'low') {
          ev = cfg.lowType === 'a5' ? bestLowA5Hand(parsed.concat(board), false) : bestLow27Hand(parsed.concat(board));
        } else if (cfg.type === 'badugi') {
          ev = bestBadugiHand(parsed);
        }
        if (!ev) return null;
        return useShort ? (ev.shortName || ev.name) : ev.name;
      };

      // Share as image
      const shareReplayImage = async () => {
        const allCardNotations = [heroCards, boardCards, ...opponentCards].filter(Boolean);
        const allCards = allCardNotations.flatMap(n => parseCardNotation(n));
        try {
          const images = await loadCardImages(allCards);
          const outW = 1080, outH = 1080;
          const canvas = document.createElement('canvas');
          canvas.width = outW; canvas.height = outH;
          const ctx = canvas.getContext('2d');

          // Dark gradient background
          const grad = ctx.createLinearGradient(0, 0, 0, outH);
          grad.addColorStop(0, '#1a1a2e');
          grad.addColorStop(1, '#0f0f1a');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, outW, outH);

          // Felt texture
          ctx.strokeStyle = 'rgba(34,197,94,0.08)';
          ctx.lineWidth = 1;
          for (let y = 0; y < outH; y += 40) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(outW, y); ctx.stroke();
          }

          // Title
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 36px Univers Condensed, Univers, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(hand.gameType + ' Hand', outW / 2, 60);

          // Blinds
          ctx.font = '22px Univers Condensed, Univers, sans-serif';
          ctx.fillStyle = '#888888';
          var _bl = hand.blinds || {};
          ctx.fillText('Blinds ' + formatChipAmount(_bl.sb || 0) + '/' + formatChipAmount(_bl.bb || 0) + (_bl.ante ? ' (' + formatChipAmount(_bl.ante) + ')' : ''), outW / 2, 95);

          // Board cards (community games)
          let yPos = 140;
          if (category === 'community' && boardCards) {
            const bCards = parseCardNotation(boardCards);
            const cw = 70, ch = 98, gap = 8;
            const totalW = bCards.length * cw + (bCards.length - 1) * gap;
            let cx = (outW - totalW) / 2;
            ctx.font = '16px Univers Condensed, Univers, sans-serif';
            ctx.fillStyle = '#666666';
            ctx.fillText('BOARD', outW / 2, yPos);
            yPos += 14;
            for (const c of bCards) {
              const key = c.rank + c.suit;
              const img = images.get(key);
              if (img) { ctx.drawImage(img, cx, yPos, cw, ch); }
              else { ctx.fillStyle = '#333'; ctx.fillRect(cx, yPos, cw, ch); ctx.fillStyle = '#666'; ctx.font = '24px Univers Condensed'; ctx.textAlign = 'center'; ctx.fillText('?', cx + cw/2, yPos + ch/2 + 8); }
              cx += cw + gap;
            }
            yPos += ch + 20;
          }

          // Pot
          ctx.textAlign = 'center';
          ctx.font = 'bold 28px Univers Condensed, Univers, sans-serif';
          ctx.fillStyle = '#facc15';
          ctx.fillText('POT: ' + formatChipAmount(pot), outW / 2, yPos + 10);
          yPos += 50;

          // Players
          const cw = 50, ch = 70;
          hand.players.forEach((p, pi) => {
            const cards = pi === replayHeroIdx ? heroCards : (opponentCards[pi] || '');
            const parsed = parseCardNotation(cards);
            const isFolded = folded.has(pi);
            const seatClass = getPlayerSeatClass(pi);
            const handName = getPlayerHandName(pi);

            ctx.globalAlpha = isFolded ? 0.3 : 1;

            // Player name + stack
            ctx.font = 'bold 20px Univers Condensed, Univers, sans-serif';
            ctx.fillStyle = seatClass === 'winner' ? '#4ade80' : seatClass === 'loser' ? '#f87171' : '#ffffff';
            ctx.textAlign = 'left';
            const px = 80;
            ctx.fillText(p.name + ' (' + p.position + ')', px, yPos);
            ctx.font = '16px Univers Condensed, Univers, sans-serif';
            ctx.fillStyle = '#888888';
            ctx.fillText(formatChipAmount(stacks[pi]), px + 300, yPos);

            // Cards
            let cardX = px;
            yPos += 8;
            for (const c of parsed) {
              const key = c.rank + c.suit;
              const img = images.get(key);
              if (c.suit === 'x') {
                ctx.fillStyle = '#444';
                ctx.fillRect(cardX, yPos, cw, ch);
                ctx.fillStyle = '#888';
                ctx.font = '20px Univers Condensed';
                ctx.textAlign = 'center';
                ctx.fillText('?', cardX + cw/2, yPos + ch/2 + 6);
                ctx.textAlign = 'left';
              } else if (img) {
                ctx.drawImage(img, cardX, yPos, cw, ch);
              }
              cardX += cw + 4;
            }

            // Hand name
            if (handName) {
              ctx.font = '16px Univers Condensed, Univers, sans-serif';
              ctx.fillStyle = seatClass === 'winner' ? '#4ade80' : '#f87171';
              ctx.textAlign = 'left';
              ctx.fillText(handName, cardX + 12, yPos + ch / 2 + 4);
            }

            yPos += ch + 16;
            ctx.globalAlpha = 1;
          });

          // Result
          if (showResult && evalResult) {
            ctx.font = 'bold 24px Univers Condensed, Univers, sans-serif';
            ctx.textAlign = 'center';
            const rText = evalResult.map(r => r.result.text).join(' | ');
            const rColor = evalResult[0]?.result.color === 'green' ? '#4ade80' : evalResult[0]?.result.color === 'red' ? '#f87171' : '#facc15';
            ctx.fillStyle = rColor;
            ctx.fillText(rText, outW / 2, Math.min(yPos + 20, outH - 60));
          }

          // Watermark
          ctx.font = '14px Univers Condensed, Univers, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.textAlign = 'right';
          ctx.fillText('futurega.me', outW - 20, outH - 20);

          const dataUrl = canvas.toDataURL('image/png');
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], 'hand-replay.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
          } else {
            const a = document.createElement('a');
            a.href = dataUrl; a.download = 'hand-replay.png'; a.click();
          }
        } catch (e) { console.error('Share replay error:', e); }
      };

      var themeClass = rSettings.theme !== 'default' ? ' theme-' + rSettings.theme : '';
      var shapeClass = rSettings.tableShape !== 'oval' ? ' shape-' + rSettings.tableShape : '';
      var fourColorClass = rSettings.fourColorDeck ? ' four-color-deck' : '';
      var boardAnimClass = getBoardAnimClass();

      // ── OFC Replay View ──
      if (hand.gameType === 'OFC') {
        var ofcRows = hand.ofcRows || {};
        var ofcStreetDef = getStreetDef('OFC');
        var ofcStreetNames = ofcStreetDef.streets;
        // Determine how many cards to show per row based on current street
        // Street 0 = Initial (5 cards placed), streets 1-8 = cards 6-13
        var ofcCardsShownPerPlayer = function(pi) {
          var pr = ofcRows[pi] || { top: '', middle: '', bottom: '' };
          var topCards = parseCardNotation(pr.top || '').filter(function(c) { return c.suit !== 'x'; });
          var midCards = parseCardNotation(pr.middle || '').filter(function(c) { return c.suit !== 'x'; });
          var botCards = parseCardNotation(pr.bottom || '').filter(function(c) { return c.suit !== 'x'; });
          var totalCards = topCards.length + midCards.length + botCards.length;
          var cardsToShow = streetIdx === 0 ? Math.min(5, totalCards) : Math.min(5 + streetIdx, totalCards);
          // Show cards proportionally across rows up to cardsToShow
          var shown = { top: '', middle: '', bottom: '' };
          var remaining = cardsToShow;
          // Show bottom first, then middle, then top (fill from bottom up, which is how OFC is typically played)
          var botShow = Math.min(botCards.length, remaining);
          shown.bottom = botCards.slice(0, botShow).map(function(c) { return c.rank + c.suit; }).join('');
          remaining -= botShow;
          var midShow = Math.min(midCards.length, remaining);
          shown.middle = midCards.slice(0, midShow).map(function(c) { return c.rank + c.suit; }).join('');
          remaining -= midShow;
          var topShow = Math.min(topCards.length, remaining);
          shown.top = topCards.slice(0, topShow).map(function(c) { return c.rank + c.suit; }).join('');
          return shown;
        };
        var ofcTotalStreets = ofcStreetNames.length;
        return (
          <div className="replayer-replay ofc-replay">
            {showSettings && <ReplayerSettingsPanel onClose={function() { setShowSettings(false); }} settings={rSettings} onUpdate={handleSettingsUpdate} />}
            <div className="ofc-replay-board">
              {hand.players.map(function(p, pi) {
                var shownCards = ofcCardsShownPerPlayer(pi);
                var pr = ofcRows[pi] || { top: '', middle: '', bottom: '' };
                var isHero = pi === (hand.heroIdx || 0);
                return (
                  <div key={pi} className={'ofc-replay-player' + (isHero ? ' ofc-hero' : '')}>
                    <div className="ofc-replay-player-name">{p.name}</div>
                    <div className="ofc-replay-rows">
                      <div className="ofc-replay-row ofc-replay-row-top">
                        <div className="ofc-replay-row-label">Top</div>
                        <CardRow text={showResult ? pr.top : shownCards.top} max={3} placeholderCount={3} cardTheme={rSettings.cardTheme} />
                      </div>
                      <div className="ofc-replay-row ofc-replay-row-middle">
                        <div className="ofc-replay-row-label">Middle</div>
                        <CardRow text={showResult ? pr.middle : shownCards.middle} max={5} placeholderCount={5} cardTheme={rSettings.cardTheme} />
                      </div>
                      <div className="ofc-replay-row ofc-replay-row-bottom">
                        <div className="ofc-replay-row-label">Bottom</div>
                        <CardRow text={showResult ? pr.bottom : shownCards.bottom} max={5} placeholderCount={5} cardTheme={rSettings.cardTheme} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Street indicator */}
            <div className="ofc-street-indicator">
              <span className="ofc-street-name">{ofcStreetNames[streetIdx] || 'Final'}</span>
              <span className="ofc-street-count">{streetIdx + 1} / {ofcTotalStreets}</span>
            </div>
            {/* Controls */}
            <div className="replayer-controls" style={{marginTop:'8px'}}>
              <button className="btn btn-ghost btn-sm" disabled={streetIdx === 0 && !showResult} onClick={function() {
                if (showResult) { setShowResult(false); }
                else if (streetIdx > 0) { setStreetIdx(streetIdx - 1); }
              }}>Prev</button>
              <button className="btn btn-ghost btn-sm" disabled={showResult} onClick={function() {
                if (streetIdx < ofcTotalStreets - 1) { setStreetIdx(streetIdx + 1); }
                else { setShowResult(true); }
              }}>Next</button>
              <button className="btn btn-ghost btn-sm" onClick={function() { setShowResult(!showResult); }}>
                {showResult ? 'Hide All' : 'Show All'}
              </button>
            </div>
            <div style={{display:'flex',gap:'6px',justifyContent:'space-between',marginTop:'12px'}}>
              <button className="btn btn-ghost btn-sm" onClick={onBack}>Back to List</button>
              <div style={{display:'flex',gap:'6px'}}>
                <button className="btn btn-ghost btn-sm" onClick={copyShareLink} title="Copy share link">
                  {shareLinkCopied ? 'Copied!' : 'Share Link'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={function() { setShowSettings(!showSettings); }}>Settings</button>
                <button className="btn btn-primary btn-sm" onClick={onEdit}>Edit</button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className={'replayer-replay' + fourColorClass}>
          {showSettings && <ReplayerSettingsPanel onClose={function() { setShowSettings(false); }} settings={rSettings} onUpdate={handleSettingsUpdate} />}
          {/* Table visualization */}
          <div ref={tableRef} className={'replayer-table' + themeClass + ''}>
            {/* Felt oval */}
            <div className="replayer-table-rail" style={{'--rail-color': feltColor}} />
            {rSettings.lightStrip && <div className="replayer-light-strip" style={{'--strip-color': feltColor}} />}
            <div className={'replayer-table-felt' + shapeClass} style={rSettings.theme === 'default' ? {
              background: 'radial-gradient(ellipse at 50% 50%, ' + feltColor + ' 0%, ' + feltColor + 'dd 60%, ' + feltColor + 'aa 100%)',
              borderColor: feltColor + 'cc',
            } : {}}
              onTouchStart={function(e) {
                var timer = setTimeout(function() { setShowFeltPicker(true); }, 600);
                e.currentTarget._lpTimer = timer;
              }}
              onTouchEnd={function(e) { clearTimeout(e.currentTarget._lpTimer); }}
              onTouchMove={function(e) { clearTimeout(e.currentTarget._lpTimer); }}
              onMouseDown={function(e) {
                var timer = setTimeout(function() { setShowFeltPicker(true); }, 600);
                e.currentTarget._lpTimer = timer;
              }}
              onMouseUp={function(e) { clearTimeout(e.currentTarget._lpTimer); }}
              onMouseLeave={function(e) { clearTimeout(e.currentTarget._lpTimer); }}
            />
            {showFeltPicker && <div className="felt-picker-overlay" onClick={function() { setShowFeltPicker(false); }}>
              <div className="felt-picker-popup" onClick={function(e) { e.stopPropagation(); }}>
                <div style={{fontSize:'0.7rem',fontFamily:"'Univers Condensed','Univers',sans-serif",textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'8px',color:'var(--text-muted)'}}>Felt Color</div>
                <div style={{display:'flex',gap:'8px',flexWrap:'wrap',justifyContent:'center'}}>
                  {[{c:'#2d5a27',n:'Green'},{c:'#1a3a5c',n:'Blue'},{c:'#5a1a1a',n:'Red'},{c:'#6b5b8a',n:'Purple'},{c:'#1a1a2e',n:'Navy'},{c:'#3d3d3d',n:'Charcoal'}].map(function(fc) {
                    return <div key={fc.c} title={fc.n} onClick={function() { rSetters.feltColor(fc.c); }}
                      style={{width:32,height:32,borderRadius:'50%',background:fc.c,cursor:'pointer',
                        border: feltColor === fc.c ? '2px solid var(--accent)' : '2px solid rgba(255,255,255,0.2)',
                        boxShadow: feltColor === fc.c ? '0 0 0 2px var(--accent)' : 'none'}} />;
                  })}
                </div>
                <input type="color" value={feltColor} onChange={function(e) { rSetters.feltColor(e.target.value); }}
                  style={{marginTop:'8px',width:'100%',height:'28px',border:'none',background:'transparent',cursor:'pointer'}} />
              </div>
            </div>}

            {/* Street + pot + board centered on table */}
            {(() => {
              var isSplitResult = showResult && hand.result && hand.result.winners && hand.result.winners.some(function(w) { return w.split; });
              var splitCount = isSplitResult ? hand.result.winners.filter(function(w) { return w.split; }).length : 0;
              if (isSplitResult && splitCount >= 2) {
                var splitAmt = Math.floor(pot / splitCount);
                var _isHiLo = isHiLo && hand.result.winners.some(function(w) { return w.label; });
                return <div className="replayer-pot-display replayer-split-pot">
                  <div className="replayer-pot-label">{_isHiLo ? 'Hi/Lo Split' : 'Split Pot'}</div>
                  <div className="replayer-split-circles">
                    {hand.result.winners.filter(function(w) { return w.split; }).slice(0, 3).map(function(w, i) {
                      var pName = hand.players[w.playerIdx] ? hand.players[w.playerIdx].name : '?';
                      var shortLabel = '';
                      if (w.label) {
                        // Extract just the Hi/Lo part from label like "Name wins Hi: ..., Lo: ..."
                        var hiMatch = w.label.match(/Hi:\s*([^,]+)/);
                        var loMatch = w.label.match(/Lo:\s*(.+)/);
                        if (hiMatch) shortLabel = 'Hi';
                        if (loMatch) shortLabel = shortLabel ? 'Hi+Lo' : 'Lo';
                      }
                      return <div key={i} className="replayer-split-circle" style={{
                        marginLeft: i > 0 ? '-8px' : 0, zIndex: splitCount - i,
                      }} title={w.label || ''}>
                        {shortLabel ? <span style={{fontSize:'0.45rem',display:'block',lineHeight:1}}>{shortLabel}</span> : null}
                        {formatChipAmount(splitAmt)}
                      </div>;
                    })}
                  </div>
                </div>;
              }
              return <div className="replayer-pot-display">
                <div className="replayer-pot-label">Pot</div>
                {rSettings.showChipStacks && displayPot > 0 && <PotChipVisual amount={displayPot} />}
                {formatChipAmount(displayPot)}
              </div>;
            })()}
            {category === 'community' && (
              <div className={'replayer-board-area' + boardAnimClass}>
                {(() => {
                  var parsed = parseCardNotation(boardCards);
                  if (parsed.length === 0) return null;
                  var renderCard = function(c, i) {
                    if (c.suit === 'x') return <div key={c.rank+c.suit+'_'+i} className="card-unknown" />;
                    if (cardTheme === 'classic') {
                      var isRed = c.suit === 'h' || c.suit === 'd';
                      var suitSymbol = {h:'\u2665',d:'\u2666',c:'\u2663',s:'\u2660'}[c.suit] || '';
                      return <div key={c.rank+c.suit+'_'+i} className={'card-classic' + (isRed ? ' card-classic-red' : ' card-classic-dark')}>
                        <span className="card-classic-rank">{c.rank.toUpperCase()}</span>
                        <span className="card-classic-suit">{suitSymbol}</span>
                      </div>;
                    }
                    var boardCardDir = '/cards/';
                    return <img key={c.rank+c.suit+'_'+i} className="card-img"
                      src={boardCardDir + 'cards_gui_' + c.rank + c.suit + '.svg'}
                      alt={c.rank+c.suit} loading="eager" />;
                  };
                  return <div className="card-row replayer-board-spaced">
                    {parsed.map(function(c,i) { return renderCard(c,i); })}
                  </div>;
                })()}
              </div>
            )}
            <div style={{position:'absolute',left:'50%',top:'57%',transform:'translate(-50%,-50%)',zIndex:1,opacity:0.1,pointerEvents:'none',fontFamily:"'Libre Baskerville',Georgia,serif",fontWeight:700,color:'#fff',letterSpacing:'-0.05em',whiteSpace:'nowrap',fontSize:'1.06rem'}}>futurega.me</div>

            {/* Player seats + dealer button positioned around the oval */}
            {(() => {
              const n = hand.players.length;
              // Layouts: hero always alone at bottom center (index = Math.floor(n/2))
              // Seats go clockwise: top → right → bottom (hero) → left
              const layouts = {
                2:  [[50,6],[50,94]],
                3:  [[35,6],[50,94],[65,6]],
                4:  [[50,6],[82,50],[50,94],[18,50]],
                5:  [[35,6],[82,50],[50,94],[18,50],[65,6]],
                6:  [[50,6],[82,32],[82,68],[50,94],[18,68],[18,32]],
                7:  [[35,6],[82,32],[82,68],[50,94],[18,68],[18,32],[65,6]],
                8:  [[50,6],[82,24],[82,50],[82,76],[50,94],[18,76],[18,50],[18,24]],
                9:  [[35,6],[82,24],[82,50],[82,76],[50,94],[18,76],[18,50],[18,24],[65,6]],
                10: [[30,6],[50,6],[82,24],[82,50],[82,76],[50,94],[18,76],[18,50],[18,24],[70,6]],
              };
              const rawSeats = layouts[Math.min(Math.max(n, 2), 10)] || layouts[6];

              // Rotate so hero is always at the bottom-center seat
              const bottomIdx = Math.floor(n / 2);
              const rotation = (bottomIdx - replayHeroIdx + n) % n;
              const seats = rawSeats.map((_, i) => rawSeats[(i + rotation) % n]);

              const seatEls = hand.players.map((p, pi) => {
                const pos = seats[pi] || [50, 50];
                const rawCards = pi === replayHeroIdx ? heroCards : (opponentCards[pi] || '');
                const cards = (pi === replayHeroIdx || showResult) ? (rawCards === 'MUCK' ? '' : rawCards) : '';
                const seatClass = getPlayerSeatClass(pi);
                const isMucked = showResult && rawCards === 'MUCK';
                const lastAct = playerLastAction[pi];
                const handName = getPlayerHandName(pi, true);
                const align = '';

                var dealAnimClass = '';
                var isHero = pi === replayHeroIdx;
                var heroClass = dealAnimClass && isHero ? ' is-hero' : '';
                var foldAnimClass = animFolded.has(pi) ? ' anim-fold' : '';
                var showdownClass = '';
                // Compute deal direction from dealer button to this seat
                var dealStyle = {};
                if (dealAnimClass) {
                  var btnI = hand.players.findIndex(function(pp) { return pp.position === 'BTN' || pp.position === 'D'; });
                  var btnP = btnI >= 0 && seats[btnI] ? seats[btnI] : [50, 50];
                  var dx = (btnP[0] - pos[0]) * 2.5;
                  var dy = (btnP[1] - pos[1]) * 2.5;
                  dealStyle['--deal-dx'] = dx + 'px';
                  dealStyle['--deal-dy'] = dy + 'px';
                  dealStyle['--deal-seat-delay'] = (pi * 100) + 'ms';
                }
                // Compute muck direction for fold animation (toward center)
                var muckStyle = {};
                if (foldAnimClass) {
                  var mdx = (50 - pos[0]) * 1.5;
                  var mdy = (50 - pos[1]) * 0.8;
                  var mrot = mdx > 0 ? -12 : 12;
                  muckStyle['--muck-dx'] = mdx + 'px';
                  muckStyle['--muck-dy'] = mdy + 'px';
                  muckStyle['--muck-rot'] = mrot + 'deg';
                }
                return (
                  <div key={pi} className={`replayer-seat ${seatClass}${isMucked ? ' mucked' : ''}${align}${foldAnimClass}`}
                    style={Object.assign({left: pos[0] + '%', top: pos[1] + '%'}, muckStyle)}>
                    <div className={`replayer-seat-cards${dealAnimClass}${heroClass}${showdownClass} ${isHiLo && showResult && !folded.has(pi) ? 'replayer-hilo-high' + (hiloAnimate ? ' animate' : '') : ''}`}
                      style={dealStyle}>
                      <CardRow text={cards} stud={gameCfg.isStud} max={gameCfg.heroCards}
                        placeholderCount={!cards && !folded.has(pi) ? gameCfg.heroCards : 0}
                        splay={rSettings.cardSplay ? (gameCfg.heroCards <= 2 ? 12.5 : gameCfg.heroCards <= 4 ? 15 : gameCfg.heroCards <= 5 ? 18 : 22) : 0}
                        cardTheme={cardTheme} />
                    </div>
                    <div className="replayer-seat-info">
                      {rSettings.showPlayerStats && (
                        <div className="replayer-player-stats">
                          {(() => { var st = getPlayerStats(p.name); return st.vpip + '/' + st.pfr + '/' + st.ag; })()}
                        </div>
                      )}
                      <div className="replayer-seat-name">
                        {p.name}
                      </div>
                      <div className="replayer-seat-stack">{formatChipAmount(stacks[pi])}</div>
                    </div>
                    {lastAct && (() => {
                      var actText = lastAct.action;
                      var badgeClass = 'action-' + actText;
                      if (actText === 'raise' && lastAct.amount && lastAct.amount >= stacks[pi] + (lastAct.amount || 0)) badgeClass = 'action-allin';
                      if (!actText) return null;
                      var label = actText;
                      if (lastAct.amount) label += ' ' + formatChipAmount(lastAct.amount);
                      return <div className={'replayer-action-badge-outer ' + badgeClass}>{label}</div>;
                    })()}
                    {handName && (
                      <div className="replayer-seat-hand-name">{handName}</div>
                    )}
                  </div>
                );
              });

              // Bet chips on the felt — positioned relative to each seat
              // Bottom seats: above cards, centered. Top seats: below info box, centered.
              // Side seats: toward middle of felt, vertically centered on cards.
              const betChips = hand.players.map((p, pi) => {
                const lastAct = playerLastAction[pi];
                if (!lastAct || !lastAct.amount) return null;
                const pos = seats[pi] || [50, 50];
                const isBottom = pos[1] >= 70;
                const isTop = pos[1] <= 15;
                const isLeft = pos[0] <= 20;
                const isRight = pos[0] >= 80;
                var chipX, chipY;
                if (isBottom) {
                  // Above the cards, centered on seat
                  chipX = pos[0];
                  chipY = pos[1] - 14;
                } else if (isTop) {
                  // Below the info box, centered on seat
                  chipX = pos[0];
                  chipY = pos[1] + 10;
                } else if (isLeft) {
                  // To the right, vertically centered on cards area
                  chipX = pos[0] + 25;
                  chipY = pos[1] - 7;
                } else if (isRight) {
                  // To the left, vertically centered on cards area
                  chipX = pos[0] - 25;
                  chipY = pos[1] - 7;
                } else {
                  // Fallback: toward center
                  chipX = pos[0] + (50 - pos[0]) * 0.35;
                  chipY = pos[1] + (50 - pos[1]) * 0.35;
                }
                // Compute chip slide direction from seat toward chip position
                var chipStartDx = (pos[0] - chipX) * 3;
                var chipStartDy = (pos[1] - chipY) * 3;
                var chipStyle = {left: chipX + '%', top: chipY + '%'};
                if (rSettings.animateChips) {
                  chipStyle['--chip-start-dx'] = chipStartDx + 'px';
                  chipStyle['--chip-start-dy'] = chipStartDy + 'px';
                }
                return (
                  <div key={'bet-' + pi} className={'replayer-bet-chip' + (rSettings.animateChips ? ' animate-chips' : '')}
                    style={chipStyle}>
                    <ChipStack amount={lastAct.amount} />
                    {formatChipAmount(lastAct.amount)}
                  </div>
                );
              }).filter(Boolean);

              // Dealer button — inner corner of BTN seat box (except bottom seats)
              const btnIdx = hand.players.findIndex(p => p.position === 'BTN' || p.position === 'D');
              let dealerEl = null;
              if (btnIdx >= 0) {
                const btnPos = seats[btnIdx] || [50, 50];
                const isBottom = btnPos[1] >= 70;
                var dealerStyle;
                if (isBottom) {
                  // Bottom seats: offset toward center like before
                  const dx = (50 - btnPos[0]) * 0.12;
                  const dy = (50 - btnPos[1]) * 0.12;
                  dealerStyle = {left: (btnPos[0] + dx) + '%', top: (btnPos[1] + dy) + '%', transform: 'translate(-50%, -50%)'};
                } else {
                  // Inner corner of the seat box
                  const isTop = btnPos[1] <= 15;
                  const isLeft = btnPos[0] <= 20;
                  const isRight = btnPos[0] >= 80;
                  var ox = 0, oy = 0;
                  if (isTop && btnPos[0] < 50) { ox = 4; oy = 5; }
                  else if (isTop && btnPos[0] >= 50) { ox = -4; oy = 5; }
                  else if (isLeft) { ox = 5; oy = 4; }
                  else if (isRight) { ox = -5; oy = 4; }
                  else { ox = btnPos[0] < 50 ? 4 : -4; oy = 4; }
                  dealerStyle = {left: (btnPos[0] + ox) + '%', top: (btnPos[1] + oy) + '%', transform: 'translate(-50%, -50%)'};
                }
                dealerEl = (
                  <div key="dealer" className="replayer-dealer-btn" style={dealerStyle}>
                    D
                  </div>
                );
              }

              // Render flying chip animations
              var flyChipEls = flyingChips.map(function(fc) {
                return React.createElement('div', {
                  key: fc.id,
                  className: 'replayer-flying-chip' + (fc.toWinner ? ' to-winner' : ''),
                  style: {
                    '--fly-x0': fc.x0 + 'px', '--fly-y0': fc.y0 + 'px',
                    '--fly-x1': fc.x1 + 'px', '--fly-y1': fc.y1 + 'px',
                    '--fly-duration': '0.4s',
                    animationDelay: fc.delay + 'ms',
                  },
                });
              });

              return [...seatEls, ...betChips, dealerEl, ...flyChipEls];
            })()}
          </div>

          {/* Draw info for draw games */}
          {(category === 'draw_triple' || category === 'draw_single') && currentStreet.draws && currentStreet.draws.length > 0 && (
            <div className="replayer-draw-info-bar">
              <div className="replayer-draw-info-label">{currentStreet.name || 'Draw'}</div>
              <div className="replayer-draw-info-players">
                {currentStreet.draws.map(d => {
                  var pName = hand.players[d.player]?.name || '?';
                  var isPat = d.discarded === 0;
                  return (
                    <div key={d.player} className={'replayer-draw-info-item' + (isPat ? ' pat' : '')}>
                      <span className="replayer-draw-info-name">{pName}</span>
                      {isPat ? (
                        <span className="replayer-draw-pat-badge">Stand Pat</span>
                      ) : (
                        <span className="replayer-draw-count-badge">
                          {d.discarded === 1 ? 'draws 1' : 'draws ' + d.discarded}
                        </span>
                      )}
                      {d.discardedCards && !isPat && (
                        <span className="replayer-draw-discarded-cards">
                          <CardRow text={d.discardedCards} max={d.discarded} />
                        </span>
                      )}
                      {d.newCards && !isPat && (
                        <span className="replayer-draw-new-cards">
                          <CardRow text={d.newCards} max={d.discarded} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Commentator Mode */}
          {rSettings.showCommentary && (
            <div className="replayer-commentary">
              {generateCommentary(hand, streetIdx, actionIdx, pot, stacks)}
            </div>
          )}

          {/* Hand Strength Meter */}
          {rSettings.showHandStrength && category === 'community' && (() => {
            var replayHeroI = hand.heroIdx != null ? hand.heroIdx : 0;
            var hCards = replayHeroI === (hand.heroIdx != null ? hand.heroIdx : 0) ? heroCards : '';
            var strength = calcHandStrength(hCards, boardCards, hand.gameType);
            if (strength === null) return null;
            var col = getStrengthColor(strength);
            return (
              <div className="replayer-hand-strength">
                <div className="replayer-hand-strength-label">Strength</div>
                <div className="replayer-hand-strength-bar">
                  <div className="replayer-hand-strength-fill" style={{width: strength + '%', background: col}} />
                </div>
                <div className="replayer-hand-strength-pct" style={{color: col}}>{strength}%</div>
              </div>
            );
          })()}

          {/* Pot Odds Display */}
          {rSettings.showPotOdds && actionIdx >= 0 && (() => {
            var actions = currentStreet?.actions || [];
            var curAct = actions[actionIdx];
            if (!curAct || !curAct.amount || curAct.action === 'fold') return null;
            var callAmt = curAct.amount;
            var potBefore = pot - callAmt;
            if (potBefore <= 0) return null;
            var odds = (callAmt / (potBefore + callAmt) * 100).toFixed(1);
            var ratio = (potBefore / callAmt).toFixed(1);
            return (
              <div className="replayer-pot-odds">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="12"/>
                </svg>
                Pot Odds: {ratio}:1 ({odds}% equity needed)
              </div>
            );
          })()}

          {/* Action Timeline */}


          {(() => {
            return (
              <div className="replayer-bottom-fixed">
                <div className="replayer-controls">
                  <button onClick={goToStart} disabled={!canGoBack} title="Start">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="19 20 9 12 19 4"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
                  </button>
                  <button onClick={stepBack} disabled={!canGoBack} title="Back">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <button onClick={() => setPlaying(p => !p)} title={playing ? 'Pause' : 'Play'}>
                    {playing ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    )}
                  </button>
                  <button onClick={stepForward} disabled={!canGoForward} title="Forward">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                  <button onClick={goToEnd} title="End">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 4 15 12 5 20"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                  </button>
                  <select value={speed} onChange={e => setSpeed(Number(e.target.value))} style={{
                    fontSize:'0.65rem',padding:'3px 6px',background:'var(--bg)',color:'var(--text)',border:'1px solid var(--border)',
                    borderRadius:'4px',fontFamily:"'Univers Condensed','Univers',sans-serif"
                  }}>
                    <option value={2000}>0.5x</option>
                    <option value={1000}>1x</option>
                    <option value={500}>2x</option>
                    <option value={250}>4x</option>
                  </select>
                </div>
                <div style={{display:'flex',gap:'6px',justifyContent:'center'}}>
                  <button className="btn btn-ghost btn-sm" onClick={onBack}>Back</button>
                  <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={copyShareLink} title="Copy share link">
                    {shareLinkCopied ? 'Copied!' : 'Link'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={shareReplayImage} title="Share as image">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{width:'14px',height:'14px'}}>
                      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled title="Video export (coming soon)"
                    style={{opacity:0.3}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:'14px',height:'14px'}}>
                      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
                      <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
                      <line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/>
                      <line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/>
                      <line x1="17" y1="7" x2="22" y2="7"/>
                    </svg>
                  </button>
                  <button className="replayer-gear-btn" onClick={function() { setShowSettings(true); }} title="Replayer Settings">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      );
    }

    // ── GTO-Style Entry View ──
    function GTOEntryView({ hand, setHand, onDone, onCancel, heroName }) {
      const [phase, setPhase] = useState('setup');
      const [currentStreetIdx, setCurrentStreetIdx] = useState(0);
      const [showRaiseInput, setShowRaiseInput] = useState(false);
      const [betAmount, setBetAmount] = useState('');
      var studDealTargetState = useState(0);
      const activeSeatRef = useRef(null);

      var gameCfg = HAND_CONFIG[hand.gameType] || HAND_CONFIG_DEFAULT;
      var streetDef = getStreetDef(hand.gameType);
      var category = getGameCategory(hand.gameType);
      var currentStreet = hand.streets[currentStreetIdx];
      var isPreflop = currentStreetIdx === 0;

      var potAndStacks = calcPotsAndStacks(hand, currentStreetIdx, (currentStreet.actions || []).length - 1);
      var currentPot = potAndStacks.pot;
      var currentStacks = potAndStacks.stacks;

      var foldedSet = useMemo(function() {
        var f = new Set();
        for (var si = 0; si <= currentStreetIdx; si++) {
          for (var ai = 0; ai < (hand.streets[si].actions || []).length; ai++) {
            var act = hand.streets[si].actions[ai];
            if (act.action === 'fold') f.add(act.player);
          }
        }
        return f;
      }, [hand.streets, currentStreetIdx]);

      var allInSet = useMemo(function() {
        var a = new Set();
        currentStacks.forEach(function(s, i) { if (s <= 0 && !foldedSet.has(i)) a.add(i); });
        return a;
      }, [currentStacks, foldedSet]);

      // All seats in position order (for rendering)
      var isRazz = hand.gameType === 'Razz' || hand.gameType === '2-7 Razz';
      var isStudLow = isRazz;
      // Folded set from prior streets only (for determining stud action order at start of street)
      var priorStreetFoldedSet = useMemo(function() {
        var f = new Set();
        for (var si = 0; si < currentStreetIdx; si++) {
          for (var ai = 0; ai < (hand.streets[si].actions || []).length; ai++) {
            var act = hand.streets[si].actions[ai];
            if (act.action === 'fold') f.add(act.player);
          }
        }
        return f;
      }, [hand.streets, currentStreetIdx]);
      var studInfo = useMemo(function() {
        if (!gameCfg.isStud) return null;
        var is3rdStreet = currentStreetIdx === 0;
        var bringInIdx = is3rdStreet ? findStudBringIn(hand, isStudLow) : -1;
        var bestBoardIdx = !is3rdStreet ? findStudBestBoard(hand, currentStreetIdx, priorStreetFoldedSet, isStudLow) : -1;
        return { isStud: true, is3rdStreet: is3rdStreet, bringInIdx: bringInIdx, bestBoardIdx: bestBoardIdx };
      }, [gameCfg.isStud, currentStreetIdx, hand, isStudLow, priorStreetFoldedSet]);

      var seatOrder = useMemo(function() {
        return getActionOrder(hand.players, isPreflop, studInfo);
      }, [hand.players, isPreflop, studInfo]);

      // Only seats that can still act (for determining whose turn it is)
      var actionOrder = useMemo(function() {
        return seatOrder.filter(function(i) { return !foldedSet.has(i) && !allInSet.has(i); });
      }, [seatOrder, foldedSet, allInSet]);

      // Bring-in amount for stud (typically half the small bet, or the ante)
      var bringInAmount = gameCfg.isStud ? Math.floor(((hand.blinds || {}).sb || (hand.blinds || {}).bb || 100) / 2) : 0;

      var streetBets = useMemo(function() {
        var contrib = new Array(hand.players.length).fill(0);
        var maxBet = 0;
        if (isPreflop && category !== 'stud') {
          var sbIdx = hand.players.findIndex(function(p) { return p.position === 'SB' || p.position === 'BTN/SB'; });
          var bbIdx = hand.players.findIndex(function(p) { return p.position === 'BB'; });
          if (sbIdx >= 0) contrib[sbIdx] = (hand.blinds || {}).sb || 0;
          if (bbIdx >= 0) contrib[bbIdx] = (hand.blinds || {}).bb || 0;
          maxBet = (hand.blinds || {}).bb || 0;
        }
        // Stud 3rd street: the bring-in amount is posted via an explicit 'bring-in' action
        // (handled in the action loop below). No implicit forced amount is set here —
        // the bring-in player's first action (bring-in or complete) determines the amount.
        (currentStreet.actions || []).forEach(function(act) {
          if (act.action === 'fold') return;
          if (act.action === 'bring-in') {
            contrib[act.player] = act.amount || bringInAmount;
            if (contrib[act.player] > maxBet) maxBet = contrib[act.player];
            return;
          }
          if (act.amount > 0) { contrib[act.player] += act.amount; if (contrib[act.player] > maxBet) maxBet = contrib[act.player]; }
        });
        return { contrib: contrib, maxBet: maxBet };
      }, [currentStreet.actions, isPreflop, hand.players, hand.blinds, category]);

      var currentActor = useMemo(function() {
        var actions = currentStreet.actions || [];
        if (actionOrder.length === 0) return -1;
        // Find the last raise/bet and who made it
        var lastRaiseIdx = -1;
        var lastRaiserPlayer = -1;
        for (var i = actions.length - 1; i >= 0; i--) {
          if (actions[i].action === 'raise' || actions[i].action === 'bet') {
            lastRaiseIdx = i;
            lastRaiserPlayer = actions[i].player;
            break;
          }
        }
        // Start scanning from AFTER the raiser in position order (or from the beginning if no raise)
        var startOi = 0;
        if (lastRaiserPlayer >= 0) {
          var raiserPos = actionOrder.indexOf(lastRaiserPlayer);
          if (raiserPos >= 0) startOi = raiserPos + 1;
        }
        // Scan all players, wrapping around, starting after the raiser
        for (var count = 0; count < actionOrder.length; count++) {
          var oi = (startOi + count) % actionOrder.length;
          var pidx = actionOrder[oi];
          var lastActIdx = -1;
          for (var j = actions.length - 1; j >= 0; j--) {
            if (actions[j].player === pidx) { lastActIdx = j; break; }
          }
          if (lastActIdx < lastRaiseIdx) return pidx;
          if (lastActIdx === -1) return pidx;
        }
        return -1;
      }, [actionOrder, currentStreet.actions]);

      var isBettingComplete = currentActor === -1;
      var activePlayers = hand.players.filter(function(_, i) { return !foldedSet.has(i); });
      var handOver = activePlayers.length <= 1;

      useEffect(function() {
        if (phase !== 'action') return;
        if (handOver) { setPhase('result'); return; }
        if (!isBettingComplete) return;
        var nextStreet = currentStreetIdx + 1;
        if (nextStreet >= hand.streets.length) { setPhase('showdown'); return; }
        if (category === 'community') { setPhase('board_entry'); }
        else if (category === 'stud') { setPhase('stud_deal'); }
        else if (category === 'draw_triple' || category === 'draw_single') { setPhase('draw_discard'); }
        else { setCurrentStreetIdx(nextStreet); }
      }, [isBettingComplete, phase, handOver]);

      // Scroll to top when entering board_entry or result phase
      useEffect(function() {
        if (phase === 'board_entry' || phase === 'stud_deal' || phase === 'draw_discard' || phase === 'draw_cards_entry' || phase === 'showdown' || phase === 'result') {
          var container = document.querySelector('.content-area');
          if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, [phase]);

      // Scroll the active card into view whenever the current actor changes.
      // This covers: initial action phase entry, after each action, after undo, after board entry.
      var scrollGenRef = useRef(0);
      useEffect(function() {
        if (phase !== 'action' || currentActor < 0) return;
        var gen = ++scrollGenRef.current;
        var tid = setTimeout(function() {
          if (gen !== scrollGenRef.current) return;
          var el = activeSeatRef.current;
          if (!el) return;
          var container = el.closest('.content-area');
          if (!container) return;
          var caTop = container.getBoundingClientRect().top;
          var sticky = container.querySelector('.gto-sticky-header');
          var stickyH = sticky ? sticky.getBoundingClientRect().bottom - caTop : 0;
          var elAbsTop = el.getBoundingClientRect().top - caTop + container.scrollTop;
          var target = elAbsTop - stickyH - 8;
          if (Math.abs(container.scrollTop - target) > 2) {
            container.scrollTo({ top: target, behavior: 'smooth' });
          }
        }, 180);
        return function() { clearTimeout(tid); };
      }, [currentActor, phase, currentStreetIdx]);

      var addAction = function(action, amount) {
        if (currentActor < 0) return;
        var playerIdx = currentActor;
        setHand(function(prev) {
          var streets = prev.streets.map(function(s, si) {
            if (si !== currentStreetIdx) return s;
            return Object.assign({}, s, { actions: (s.actions || []).concat([{ player: playerIdx, action: action, amount: amount || 0 }]) });
          });
          return Object.assign({}, prev, { streets: streets });
        });
        setShowRaiseInput(false);
        setBetAmount('');
        // Scroll handled by useEffect on [currentActor]
      };

      var undoToPlayer = function(playerIdx) {
        // Find this player's action in the current street and remove it + everything after
        setHand(function(prev) {
          // Search current street first, then earlier streets
          for (var si = currentStreetIdx; si >= 0; si--) {
            var acts = prev.streets[si].actions || [];
            // Find the index of this player's action in this street
            var targetIdx = -1;
            for (var ai = 0; ai < acts.length; ai++) {
              if (acts[ai].player === playerIdx) { targetIdx = ai; break; }
            }
            if (targetIdx >= 0) {
              // Remove this action and everything after it on this street
              var streets = prev.streets.map(function(s, i) {
                if (i < si) return s;
                if (i === si) return Object.assign({}, s, { actions: acts.slice(0, targetIdx) });
                // Clear actions on later streets too
                return Object.assign({}, s, { actions: [] });
              });
              if (si < currentStreetIdx) setCurrentStreetIdx(si);
              if (phase === 'result' || phase === 'showdown' || phase === 'board_entry' || phase === 'draw_discard' || phase === 'draw_cards_entry') setPhase('action');
              return Object.assign({}, prev, { streets: streets });
            }
          }
          return prev;
        });
        setShowRaiseInput(false);
        setBetAmount('');
        // Scroll handled by useEffect on [currentActor]
      };

      var undoLastAction = function() {
        setHand(function(prev) {
          for (var si = currentStreetIdx; si >= 0; si--) {
            var acts = prev.streets[si].actions || [];
            if (acts.length > 0) {
              var streets = prev.streets.map(function(s, i) {
                if (i !== si) return s;
                return Object.assign({}, s, { actions: acts.slice(0, -1) });
              });
              if (si < currentStreetIdx) setCurrentStreetIdx(si);
              if (phase === 'result' || phase === 'showdown' || phase === 'board_entry' || phase === 'draw_discard' || phase === 'draw_cards_entry') setPhase('action');
              return Object.assign({}, prev, { streets: streets });
            }
          }
          return prev;
        });
      };

      var updatePlayerField = function(idx, field, value) {
        setHand(function(prev) {
          return Object.assign({}, prev, {
            players: prev.players.map(function(p, i) {
              if (i !== idx) return p;
              var upd = {}; upd[field] = field === 'startingStack' ? (Number(value) || 0) : value;
              return Object.assign({}, p, upd);
            })
          });
        });
      };

      var setNumPlayers = function(n) {
        setHand(function(prev) {
          var positions = getPositionLabels(n);
          var players = Array.from({ length: n }, function(_, i) {
            if (prev.players[i]) return Object.assign({}, prev.players[i], { position: positions[i] || '' });
            return { name: i === 0 ? (prev.players[0] ? prev.players[0].name : 'Hero') : (DEFAULT_OPP_NAMES[i - 1] || 'Opp ' + i), position: positions[i] || '', startingStack: prev.players[0] ? prev.players[0].startingStack : 50000 };
          });
          var streets = prev.streets.map(function(s) {
            return Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: Array.from({ length: n - 1 }, function(_, j) { return (s.cards.opponents && s.cards.opponents[j]) || ''; }) }) });
          });
          return Object.assign({}, prev, { players: players, streets: streets });
        });
      };

      var heroIdx = hand.players.findIndex(function(p) { return p.name === (heroName || 'Hero'); });
      if (heroIdx < 0) heroIdx = 0; // fallback to first player

      var setHeroSeat = function(newIdx) {
        if (newIdx === heroIdx) return;
        setHand(function(prev) {
          var n = prev.players.length;
          // Rotate names/stacks so hero moves to clicked position, keeping relative seating
          // Positions stay fixed on each row — names shift circularly
          var shift = newIdx - heroIdx;
          var players = prev.players.map(function(p, i) {
            // Row i gets the name/stack from row (i - shift + n) % n
            var srcIdx = ((i - shift) % n + n) % n;
            var src = prev.players[srcIdx];
            return Object.assign({}, p, { name: src.name, startingStack: src.startingStack });
          });
          return Object.assign({}, prev, { players: players, heroIdx: newIdx });
        });
      };

      var playerContrib = currentActor >= 0 ? streetBets.contrib[currentActor] : 0;
      var callAmount = currentActor >= 0 ? Math.min(streetBets.maxBet - playerContrib, currentStacks[currentActor]) : 0;
      var canCheck = callAmount === 0;
      var playerStack = currentActor >= 0 ? currentStacks[currentActor] : 0;

      // Betting structure awareness
      var bettingType = gameCfg.betting || 'nl';
      var isLimitGame = bettingType === 'fl';
      var isPotLimit = bettingType === 'pl';
      var flSmallStreets = gameCfg.flSmallStreets || [0, 1];
      var flRaiseCap = gameCfg.raiseCap || 4;

      // Count bets+raises on current street for cap tracking
      // In fixed-limit: 1 bet + 3 raises = 4 total aggressive actions = cap
      // In stud with bring-in: "complete" counts as the first bet, then 3 raises
      var streetBetRaiseCount = 0;
      (currentStreet.actions || []).forEach(function(a) {
        if (a.action === 'raise' || a.action === 'bet') streetBetRaiseCount++;
      });

      // Heads-up: uncap raises (only cap when 3+ active players)
      var activePlayerCount = hand.players.filter(function(_, i) { return !foldedSet.has(i) && !allInSet.has(i); }).length;
      var isHeadsUp = activePlayerCount <= 2;

      // Fixed limit bet size
      // Stud 4th street exception: if any player shows an open pair, the big bet may be used
      var flIsSmall = flSmallStreets.includes(currentStreetIdx);
      var stud4thOpenPair = gameCfg.isStud && currentStreetIdx === 1 && studHasOpenPairOn4th(hand);
      var flBetSize = (flIsSmall && !stud4thOpenPair) ? ((hand.blinds || {}).bb || 100) : ((hand.blinds || {}).bb || 100) * 2;
      // flRaiseToTotal = the total amount the raiser will have committed this street
      var flRaiseToTotal = streetBets.maxBet + flBetSize;
      // Incremental amount the raiser needs to ADD (accounting for chips already in)
      var flRaiseIncrement = flRaiseToTotal - playerContrib;
      // Can raise? Cap at 4 bets+raises per street (1 bet + 3 raises), uncapped heads-up
      var flCanRaise = isHeadsUp || streetBetRaiseCount < flRaiseCap;

      // ── Pot-limit max raise: the "trail" formula ──
      //
      // The maximum raise in pot-limit is NOT simply "the pot." It accounts
      // for the call amount and all dead money (the "trail"):
      //
      //   1. Player first calls: adds callAmount to pot
      //   2. Pot after calling = currentPot + callAmount
      //   3. Player can raise BY (pot after calling)
      //   4. Total raise-to = streetBets.maxBet + (pot after calling)
      //   5. Increment (chips added) = raise-to - playerContrib
      //
      // Dealer shortcut ("trail formula"):
      //   Trail = currentPot - streetBets.maxBet  (dead money = pot minus live bet)
      //   Max raise-to = 3 × streetBets.maxBet + trail
      //                = 2 × streetBets.maxBet + currentPot
      //   Max increment = currentPot + 2 × callAmount
      //
      // For an opening bet (no one has bet yet): max bet = currentPot
      //
      var plPotAfterCall = currentPot + callAmount;
      var plRaiseToTotal = streetBets.maxBet + plPotAfterCall;
      var plMaxRaiseIncrement = plRaiseToTotal - playerContrib;
      var plMaxBet = currentPot;

      // NL/PL min-raise: at least the size of the last raise/bet, minimum BB
      // Track raise sizes by replaying the maxBet progression through street actions
      var _prevMax = 0;
      var _lastRaiseSize = (hand.blinds || {}).bb || 0;
      var _runContrib = new Array(hand.players.length).fill(0);
      if (isPreflop && category !== 'stud') {
        var _sbIdx = hand.players.findIndex(function(p) { return p.position === 'SB' || p.position === 'BTN/SB'; });
        var _bbIdx = hand.players.findIndex(function(p) { return p.position === 'BB'; });
        if (_sbIdx >= 0) _runContrib[_sbIdx] = (hand.blinds || {}).sb || 0;
        if (_bbIdx >= 0) _runContrib[_bbIdx] = (hand.blinds || {}).bb || 0;
        _prevMax = (hand.blinds || {}).bb || 0;
      }
      // Stud bring-in is handled via explicit 'bring-in' action in the loop below
      (currentStreet.actions || []).forEach(function(a) {
        if (a.action === 'fold') return;
        if (a.action === 'bring-in') {
          _runContrib[a.player] = a.amount || bringInAmount;
          _prevMax = Math.max(_prevMax, _runContrib[a.player]);
          return;
        }
        if (a.amount > 0) _runContrib[a.player] += a.amount;
        if (a.action === 'raise' || a.action === 'bet') {
          var newMax = _runContrib[a.player];
          _lastRaiseSize = Math.max(newMax - _prevMax, (hand.blinds || {}).bb || 0);
          _prevMax = newMax;
        }
      });
      // Min raise-to total = current maxBet + last raise size
      var minRaiseToTotal = streetBets.maxBet + _lastRaiseSize;
      // Min raise increment = how much more the current player needs to put in
      var minRaiseIncrement = minRaiseToTotal - playerContrib;

      var cumulativeBoard = useMemo(function() {
        var b = '';
        for (var si = 0; si <= currentStreetIdx; si++) { b += (hand.streets[si].cards.board || ''); }
        return b;
      }, [hand.streets, currentStreetIdx]);

      var playerActions = useMemo(function() {
        var map = {};
        (currentStreet.actions || []).forEach(function(act) { map[act.player] = act; });
        return map;
      }, [currentStreet.actions]);

      // ── SETUP PHASE ──
      if (phase === 'setup') {
        var isOfc = category === 'ofc';
        var setNumPlayersOfc = function(n) {
          setHand(function(prev) {
            var players = [];
            var newOfcRows = Object.assign({}, prev.ofcRows || {});
            for (var i = 0; i < n; i++) {
              if (prev.players[i]) { players.push(prev.players[i]); }
              else { players.push({ name: i === 0 ? (heroName || 'Hero') : (DEFAULT_OPP_NAMES[i - 1] || 'Opp ' + i), position: '', startingStack: 0 }); }
              if (!newOfcRows[i]) newOfcRows[i] = { top: '', middle: '', bottom: '' };
            }
            return Object.assign({}, prev, { players: players, ofcRows: newOfcRows });
          });
        };
        return (
          <div className="gto-entry">
            <div className="gto-phase-card"><div className="replayer-section">
              <div className="replayer-section-title">{isOfc ? 'Players' : 'Players & Blinds'}</div>
              <div className="replayer-row" style={{marginBottom:'8px'}}>
                <div className="replayer-field" style={{flex:'0 0 70px'}}>
                  <label>Players</label>
                  {isOfc ? (
                    <select value={hand.players.length} onChange={function(e) { setNumPlayersOfc(Number(e.target.value)); }}>
                      {[2,3].map(function(n) { return <option key={n} value={n}>{n}</option>; })}
                    </select>
                  ) : (
                    <select value={hand.players.length} onChange={function(e) { setNumPlayers(Number(e.target.value)); }}>
                      {[2,3,4,5,6,7,8,9,10].map(function(n) { return <option key={n} value={n}>{n}</option>; })}
                    </select>
                  )}
                </div>
                {!isOfc && <div className="replayer-field">
                  <label>SB</label>
                  <input type="text" inputMode="decimal" value={(hand.blinds || {}).sb || ''} onChange={function(e) { setHand(function(prev) { return Object.assign({}, prev, { blinds: Object.assign({}, prev.blinds || {}, { sb: Number(e.target.value) || 0 }) }); }); }} />
                </div>}
                {!isOfc && <div className="replayer-field">
                  <label>BB</label>
                  <input type="text" inputMode="decimal" value={(hand.blinds || {}).bb || ''} onChange={function(e) { setHand(function(prev) { return Object.assign({}, prev, { blinds: Object.assign({}, prev.blinds || {}, { bb: Number(e.target.value) || 0 }) }); }); }} />
                </div>}
                {!isOfc && <div className="replayer-field">
                  <label>{category === 'stud' ? 'Ante' : 'BB Ante'}</label>
                  <input type="text" inputMode="decimal" value={(hand.blinds || {}).ante || ''} onChange={function(e) { setHand(function(prev) { return Object.assign({}, prev, { blinds: Object.assign({}, prev.blinds || {}, { ante: Number(e.target.value) || 0 }) }); }); }} />
                </div>}
              </div>
              {!isOfc && <div style={{marginBottom:'4px',display:'flex'}}>
                <span style={{fontSize:'0.65rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',width:'32px',textAlign:'center'}}>Hero</span>
              </div>}
              {hand.players.map(function(p, i) {
                var isHero = i === heroIdx;
                return (
                  <div key={i} className="replayer-player-row">
                    {!isOfc && <span className={'replayer-player-pos' + (isHero ? ' hero' : '')}
                      style={{cursor:'pointer'}}
                      onClick={function() { setHeroSeat(i); }}>{p.position}</span>}
                    <div className="replayer-field" style={{flex:'1 1 80px'}}>
                      <input type="text" style={{textAlign:'left'}} value={p.name} onChange={function(e) { updatePlayerField(i, 'name', e.target.value); }} placeholder="Name" />
                    </div>
                    {!isOfc && <div className="replayer-field" style={{flex:'0 0 80px'}}>
                      <input type="text" inputMode="decimal" style={{textAlign:'right'}} value={p.startingStack} onChange={function(e) { updatePlayerField(i, 'startingStack', e.target.value); }} placeholder="Stack" />
                    </div>}
                  </div>
                );
              })}
            </div></div>
            <div style={{display:'flex',gap:'6px',justifyContent:'flex-end',padding:'10px 0'}}>
              <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={function() { setPhase(category === 'ofc' ? 'ofc_entry' : 'hero_cards'); }}>Next</button>
            </div>
          </div>
        );
      }

      // ── OFC ENTRY PHASE ──
      if (phase === 'ofc_entry') {
        var ofcRows = hand.ofcRows || {};
        var updateOfcRow = function(playerIdx, row, value) {
          setHand(function(prev) {
            var newRows = Object.assign({}, prev.ofcRows || {});
            newRows[playerIdx] = Object.assign({}, newRows[playerIdx] || { top: '', middle: '', bottom: '' });
            newRows[playerIdx][row] = value;
            return Object.assign({}, prev, { ofcRows: newRows });
          });
        };
        var ofcRowLabels = [
          { key: 'top', label: 'Top (3 cards)', max: 3 },
          { key: 'middle', label: 'Middle (5 cards)', max: 5 },
          { key: 'bottom', label: 'Bottom (5 cards)', max: 5 },
        ];
        // Collect all used cards across all players and rows
        var allUsedOfc = new Set();
        hand.players.forEach(function(_, pi) {
          var pr = ofcRows[pi] || {};
          ['top', 'middle', 'bottom'].forEach(function(r) {
            if (pr[r]) parseCardNotation(pr[r]).forEach(function(c) { if (c.suit !== 'x') allUsedOfc.add(c.rank + c.suit); });
          });
        });
        // Card picker for OFC
        var ofcAllRanks = 'AKQJT98765432'.split('');
        var ofcAllSuits = ['h', 'd', 'c', 's'];
        var ofcPickerTarget = useState(null); // { playerIdx, row }
        var ofcPickerState = ofcPickerTarget[0];
        var setOfcPickerState = ofcPickerTarget[1];
        var ofcToggleCard = function(rank, suit) {
          if (!ofcPickerState) return;
          var card = rank + suit;
          var pi = ofcPickerState.playerIdx;
          var row = ofcPickerState.row;
          var rowDef = ofcRowLabels.find(function(r) { return r.key === row; });
          var maxCards = rowDef ? rowDef.max : 5;
          var current = (ofcRows[pi] || {})[row] || '';
          var parsed = parseCardNotation(current).filter(function(c) { return c.suit !== 'x'; });
          var existing = parsed.map(function(c) { return c.rank + c.suit; });
          var idx = existing.indexOf(card);
          if (idx >= 0) {
            existing.splice(idx, 1);
          } else if (existing.length < maxCards) {
            existing.push(card);
          }
          updateOfcRow(pi, row, existing.join(''));
        };
        var ofcPickerSelectedSet = new Set();
        if (ofcPickerState) {
          var _cr = (ofcRows[ofcPickerState.playerIdx] || {})[ofcPickerState.row] || '';
          parseCardNotation(_cr).forEach(function(c) { if (c.suit !== 'x') ofcPickerSelectedSet.add(c.rank + c.suit); });
        }

        // Validate: check total cards per player
        var ofcValid = true;
        var ofcValidMsg = '';
        hand.players.forEach(function(p, pi) {
          var pr = ofcRows[pi] || {};
          var topCount = parseCardNotation(pr.top || '').filter(function(c) { return c.suit !== 'x'; }).length;
          var midCount = parseCardNotation(pr.middle || '').filter(function(c) { return c.suit !== 'x'; }).length;
          var botCount = parseCardNotation(pr.bottom || '').filter(function(c) { return c.suit !== 'x'; }).length;
          var total = topCount + midCount + botCount;
          if (total > 0 && total < 13) { ofcValid = false; ofcValidMsg = p.name + ' needs 13 cards total (' + total + ' placed)'; }
          if (topCount > 0 && topCount !== 3) { ofcValid = false; ofcValidMsg = p.name + ' top row needs exactly 3 cards'; }
          if (midCount > 0 && midCount !== 5) { ofcValid = false; ofcValidMsg = p.name + ' middle row needs exactly 5 cards'; }
          if (botCount > 0 && botCount !== 5) { ofcValid = false; ofcValidMsg = p.name + ' bottom row needs exactly 5 cards'; }
        });
        // At least hero must have cards
        var heroRows = ofcRows[0] || {};
        var heroTotal = parseCardNotation(heroRows.top || '').filter(function(c) { return c.suit !== 'x'; }).length +
          parseCardNotation(heroRows.middle || '').filter(function(c) { return c.suit !== 'x'; }).length +
          parseCardNotation(heroRows.bottom || '').filter(function(c) { return c.suit !== 'x'; }).length;
        if (heroTotal === 0) { ofcValid = false; ofcValidMsg = 'Place cards for at least Hero'; }

        return (
          <div className="gto-entry">
            <div className="gto-phase-card"><div className="replayer-section">
              <div className="replayer-section-title">OFC Card Placement</div>
              <div style={{fontSize:'0.65rem',color:'var(--text-muted)',marginBottom:'10px'}}>
                Place 13 cards per player into 3 rows: Top (3), Middle (5), Bottom (5). Tap a row to open the card picker.
              </div>
              {hand.players.map(function(p, pi) {
                var pr = ofcRows[pi] || { top: '', middle: '', bottom: '' };
                return (
                  <div key={pi} className="ofc-player-section">
                    <div className="ofc-player-name">{p.name}</div>
                    <div className="ofc-rows">
                      {ofcRowLabels.map(function(rowDef) {
                        var isActive = ofcPickerState && ofcPickerState.playerIdx === pi && ofcPickerState.row === rowDef.key;
                        return (
                          <div key={rowDef.key} className={'ofc-row' + (isActive ? ' ofc-row-active' : '')}
                            onClick={function() { setOfcPickerState(isActive ? null : { playerIdx: pi, row: rowDef.key }); }}>
                            <div className="ofc-row-label">{rowDef.label}</div>
                            <div className="ofc-row-cards">
                              <CardRow text={pr[rowDef.key] || ''} max={rowDef.max} placeholderCount={rowDef.max} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Card picker inline for active row */}
                    {ofcPickerState && ofcPickerState.playerIdx === pi && (
                      <div className="ofc-card-picker">
                        {ofcAllRanks.map(function(rank) {
                          return (
                            <div key={rank} className="ofc-picker-rank-row">
                              {ofcAllSuits.map(function(suit) {
                                var card = rank + suit;
                                var isUsed = allUsedOfc.has(card) && !ofcPickerSelectedSet.has(card);
                                var isSelected = ofcPickerSelectedSet.has(card);
                                var suitSymbols = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' };
                                var suitColors = { h: '#ef4444', d: '#3b82f6', c: '#22c55e', s: '#a78bfa' };
                                return (
                                  <button key={card}
                                    className={'ofc-picker-card' + (isSelected ? ' selected' : '') + (isUsed ? ' used' : '')}
                                    disabled={isUsed}
                                    onClick={function(e) { e.stopPropagation(); ofcToggleCard(rank, suit); }}
                                    style={{color: isUsed ? 'var(--text-muted)' : suitColors[suit]}}>
                                    {rank}{suitSymbols[suit]}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div></div>
            {ofcValidMsg && <div style={{fontSize:'0.65rem',color:'#ef4444',padding:'4px 0'}}>{ofcValidMsg}</div>}
            <div style={{display:'flex',gap:'6px',justifyContent:'flex-end',padding:'10px 0'}}>
              <button className="btn btn-ghost btn-sm" onClick={function() { setPhase('setup'); }}>Back</button>
              <button className="btn btn-primary btn-sm" disabled={!ofcValid} onClick={function() {
                // Save OFC data and finish
                onDone(hand);
              }}>Done</button>
            </div>
          </div>
        );
      }

      // ── HERO CARDS PHASE ──
      if (phase === 'hero_cards') {
        var heroCards = (hand.streets[0] && hand.streets[0].cards.hero) || '';
        var heroMaxCards = gameCfg.heroCards || 2;
        var heroCurrentCards = parseCardNotation(heroCards).filter(function(c) { return c.suit !== 'x'; }).map(function(c) { return c.rank + c.suit; });
        var heroCurrentSet = new Set(heroCurrentCards);
        var heroAllRanks = 'AKQJT98765432'.split('');
        var heroAllSuits = [
          { key: 'h', label: '♥', color: '#ef4444' },
          { key: 'd', label: '♦', color: '#3b82f6' },
          { key: 'c', label: '♣', color: '#22c55e' },
          { key: 's', label: '♠', color: 'var(--text)' }
        ];
        var toggleHeroCard = function(card) {
          if (heroCurrentSet.has(card)) {
            var remaining = heroCurrentCards.filter(function(c) { return c !== card; });
            var newVal = remaining.join('');
            setHand(function(prev) {
              var streets = prev.streets.map(function(s, i) { return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { hero: newVal }) }) : s; });
              return Object.assign({}, prev, { streets: streets });
            });
          } else {
            if (heroCurrentCards.length >= heroMaxCards) return;
            var newVal = heroCards + card;
            setHand(function(prev) {
              var streets = prev.streets.map(function(s, i) { return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { hero: newVal }) }) : s; });
              return Object.assign({}, prev, { streets: streets });
            });
          }
        };
        return (
          <div className="gto-entry">
            <div className="gto-phase-card">
              <div className="replayer-section">
                <div className="replayer-section-title">Hero Cards</div>
                <div className="replayer-field">
                  <label>Your Cards</label>
                  <input type="text" placeholder={gameCfg.heroPlaceholder || 'AhKd'}
                    value={heroCards}
                    onChange={function(e) {
                      var val = e.target.value;
                      setHand(function(prev) {
                        var streets = prev.streets.map(function(s, i) { return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { hero: val }) }) : s; });
                        return Object.assign({}, prev, { streets: streets });
                      });
                    }} />
                  <CardRow text={heroCards} stud={gameCfg.isStud} max={heroMaxCards} />
                </div>
                <div className="card-picker-grid">
                  {heroAllSuits.map(function(suit) {
                    return React.createElement(React.Fragment, { key: suit.key },
                      heroAllRanks.map(function(rank) {
                        var card = rank + suit.key;
                        var isSelected = heroCurrentSet.has(card);
                        var cls = 'card-picker-btn' + (isSelected ? ' selected' : '');
                        return React.createElement('button', {
                          key: card, className: cls,
                          onClick: function() { toggleHeroCard(card); }
                        }, React.createElement('img', {
                          src: '/cards/cards_gui_' + rank + suit.key + '.svg',
                          alt: card, loading: 'eager'
                        }));
                      })
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="gto-street-card">
              <div style={{display:'flex',gap:'6px',justifyContent:'flex-end',padding:'10px 12px'}}>
                <button className="btn btn-ghost btn-sm" onClick={function() { setPhase('setup'); }}>Back</button>
                <button className="btn btn-primary btn-sm" onClick={function() { setPhase(gameCfg.isStud ? 'door_cards' : 'action'); }}>
                  {gameCfg.isStud ? 'Enter Door Cards' : 'Start Action'}
                </button>
              </div>
            </div>
          </div>
        );
      }

      // ── STUD DOOR CARDS PHASE ──
      if (phase === 'door_cards') {
        var numOpps = hand.players.length - 1;
        var heroIdxDC = hand.heroIdx != null ? hand.heroIdx : 0;
        // Collect used cards (hero's cards)
        var usedCardsDC = new Set();
        parseCardNotation((hand.streets[0] && hand.streets[0].cards.hero) || '').forEach(function(c) { if (c.suit !== 'x') usedCardsDC.add(c.rank + c.suit); });
        // Also collect already-entered opponent door cards
        var oppCards0 = (hand.streets[0] && hand.streets[0].cards.opponents) || [];
        oppCards0.forEach(function(opp) {
          parseCardNotation(opp || '').forEach(function(c) { if (c.suit !== 'x') usedCardsDC.add(c.rank + c.suit); });
        });

        var dcAllRanks = 'AKQJT98765432'.split('');
        var dcAllSuits = [
          { key: 'h', label: '♥', color: '#ef4444' },
          { key: 'd', label: '♦', color: '#3b82f6' },
          { key: 'c', label: '♣', color: '#22c55e' },
          { key: 's', label: '♠', color: 'var(--text)' }
        ];

        var setOppDoorCard = function(oppIdx, card) {
          setHand(function(prev) {
            var streets = prev.streets.map(function(s, si) {
              if (si !== 0) return s;
              var opponents = [...(s.cards.opponents || [])];
              var current = opponents[oppIdx] || '';
              if (current === card) {
                opponents[oppIdx] = ''; // toggle off
              } else {
                opponents[oppIdx] = card; // set single door card
              }
              return Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opponents }) });
            });
            return Object.assign({}, prev, { streets: streets });
          });
        };

        return (
          <div className="gto-entry">
            <div className="gto-phase-card">
              <div className="replayer-section">
                <div className="replayer-section-title">Opponent Door Cards</div>
                <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:'8px'}}>
                  Enter each opponent's face-up 3rd street card. Leave blank if unknown.
                </p>
                {hand.players.map(function(p, pi) {
                  if (pi === heroIdxDC) return null;
                  var oppSlot = pi < heroIdxDC ? pi : pi - 1;
                  var currentCard = oppCards0[oppSlot] || '';
                  var parsedCurrent = parseCardNotation(currentCard).filter(function(c) { return c.suit !== 'x'; });
                  var selectedCard = parsedCurrent.length ? parsedCurrent[0].rank + parsedCurrent[0].suit : '';

                  return (
                    <div key={pi} style={{marginBottom:'12px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
                        <span style={{fontWeight:700,fontSize:'0.8rem'}}>{p.name}</span>
                        <span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>{p.position}</span>
                        {selectedCard && <CardRow text={selectedCard} max={1} />}
                        {!selectedCard && <span style={{fontSize:'0.7rem',color:'var(--text-muted)',fontStyle:'italic'}}>? unknown</span>}
                      </div>
                    </div>
                  );
                })}
                <div className="card-picker-grid">
                  {dcAllSuits.map(function(suit) {
                    return React.createElement(React.Fragment, { key: suit.key },
                      dcAllRanks.map(function(rank) {
                        var card = rank + suit.key;
                        var isUsed = usedCardsDC.has(card);
                        // Check if this card is selected for any opponent
                        var selectedForOpp = -1;
                        oppCards0.forEach(function(opp, oi) {
                          if (opp === card) selectedForOpp = oi;
                        });
                        var cls = 'card-picker-btn' + (selectedForOpp >= 0 ? ' selected' : '') + (isUsed && selectedForOpp < 0 ? ' used' : '');
                        return React.createElement('button', {
                          key: card, className: cls,
                          disabled: isUsed && selectedForOpp < 0,
                          onClick: function() {
                            // Find first opponent without a door card, or toggle existing
                            if (selectedForOpp >= 0) {
                              setOppDoorCard(selectedForOpp, '');
                            } else {
                              for (var oi = 0; oi < numOpps; oi++) {
                                if (!oppCards0[oi]) {
                                  setOppDoorCard(oi, card);
                                  return;
                                }
                              }
                            }
                          }
                        }, React.createElement('img', {
                          src: '/cards/cards_gui_' + rank + suit.key + '.svg',
                          alt: card, loading: 'eager'
                        }));
                      })
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="gto-street-card">
              <div style={{display:'flex',gap:'6px',justifyContent:'flex-end',padding:'10px 12px'}}>
                <button className="btn btn-ghost btn-sm" onClick={function() { setPhase('hero_cards'); }}>Back</button>
                <button className="btn btn-primary btn-sm" onClick={function() { setPhase('action'); }}>Start Action</button>
              </div>
            </div>
          </div>
        );
      }

      // ── DRAW DISCARD PHASE ──
      if (phase === 'draw_discard' || phase === 'draw_cards_entry') {
        var nextDrawStreet = currentStreetIdx + 1;
        var drawStreetName = currentStreet.name || 'Draw';
        var isBadugi = hand.gameType === 'Badugi' || hand.gameType === 'Badeucy' || hand.gameType === 'Badacy';
        var maxDiscard = isBadugi ? 4 : 5;
        // Active players (not folded, not all-in)
        var drawActivePlayers = seatOrder.filter(function(i) { return !foldedSet.has(i); });
        // Track which player we're entering discards for
        var drawPlayerQueue = drawActivePlayers.filter(function(pi) {
          var existingDraw = (currentStreet.draws || []).find(function(d) { return d.player === pi; });
          return !existingDraw;
        });
        var currentDrawPlayer = drawPlayerQueue.length > 0 ? drawPlayerQueue[0] : -1;
        var allDrawsDeclared = drawPlayerQueue.length === 0;

        var addDraw = function(playerIdx, discardCount) {
          setHand(function(prev) {
            var streets = prev.streets.map(function(s, si) {
              if (si !== currentStreetIdx) return s;
              var draws = (s.draws || []).concat([{ player: playerIdx, discarded: discardCount, discardedCards: '', newCards: '' }]);
              return Object.assign({}, s, { draws: draws });
            });
            return Object.assign({}, prev, { streets: streets });
          });
        };

        var undoLastDraw = function() {
          setHand(function(prev) {
            var streets = prev.streets.map(function(s, si) {
              if (si !== currentStreetIdx) return s;
              var draws = (s.draws || []).slice(0, -1);
              return Object.assign({}, s, { draws: draws });
            });
            return Object.assign({}, prev, { streets: streets });
          });
        };

        var updateDrawCardsFn = function(playerIdx, field, val) {
          setHand(function(prev) {
            var streets = prev.streets.map(function(s, si) {
              if (si !== currentStreetIdx) return s;
              var draws = (s.draws || []).map(function(d) {
                if (d.player !== playerIdx) return d;
                var upd = Object.assign({}, d); upd[field] = val; return upd;
              });
              return Object.assign({}, s, { draws: draws });
            });
            return Object.assign({}, prev, { streets: streets });
          });
        };

        var getDrawPlayerHand = function(pi) {
          var dhi = hand.heroIdx != null ? hand.heroIdx : 0;
          var oppSlot = pi > dhi ? pi - 1 : pi;
          var base = pi === dhi ? (hand.streets[0]?.cards.hero || '') : (hand.streets[0]?.cards.opponents?.[oppSlot] || '');
          return computeDrawHand(base, getPlayerDrawsByStreet(hand, pi), currentStreetIdx - 1);
        };

        // ── DRAW CARDS ENTRY SUB-PHASE ──
        if (phase === 'draw_cards_entry') {
          return (
            <div className="gto-entry">
              <div className="gto-phase-card">
                <div className="replayer-section">
                  <div className="replayer-section-title">Card Details -- {drawStreetName}</div>
                  <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:'10px'}}>
                    Optionally specify which cards were discarded and drawn. Skip to continue.
                  </p>
                  {drawActivePlayers.map(function(pi) {
                    var p = hand.players[pi];
                    var de = (currentStreet.draws || []).find(function(d) { return d.player === pi; });
                    if (!de) return null;
                    var isPat = de.discarded === 0;
                    var curHand = getDrawPlayerHand(pi);
                    return (
                      <div key={pi} style={{marginBottom:'10px',padding:'8px 10px',background:'var(--surface2)',borderRadius:'6px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                          <span style={{fontWeight:700,fontSize:'0.78rem'}}>{p.name}</span>
                          <span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>{p.position}</span>
                          {isPat && <span className="replayer-draw-pat-badge">Stand Pat</span>}
                          {!isPat && <span className="replayer-draw-count-badge">Discards {de.discarded}</span>}
                        </div>
                        {curHand && <div style={{marginBottom:'4px'}}><span style={{fontSize:'0.6rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.03em'}}>Current Hand</span><CardRow text={curHand} max={gameCfg.heroCards || 5} /></div>}
                        {!isPat && (
                          <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                            <div className="replayer-field" style={{flex:1,minWidth:'80px'}}>
                              <label style={{fontSize:'0.55rem'}}>Discarded</label>
                              <input type="text" placeholder={'e.g. 7h3c'} value={de.discardedCards || ''} onChange={function(e) { updateDrawCardsFn(pi, 'discardedCards', e.target.value); }} />
                              {de.discardedCards && <CardRow text={de.discardedCards} max={de.discarded} />}
                            </div>
                            <div className="replayer-field" style={{flex:1,minWidth:'80px'}}>
                              <label style={{fontSize:'0.55rem'}}>New Cards</label>
                              <input type="text" placeholder={'e.g. Ah5s'} value={de.newCards || ''} onChange={function(e) { updateDrawCardsFn(pi, 'newCards', e.target.value); }} />
                              {de.newCards && <CardRow text={de.newCards} max={de.discarded} />}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="gto-street-card">
                <div style={{display:'flex',gap:'6px',justifyContent:'flex-end',padding:'10px 12px'}}>
                  <button className="btn btn-ghost btn-sm" onClick={function() { setPhase('draw_discard'); }}>Back</button>
                  <button className="btn btn-primary btn-sm" onClick={function() { setCurrentStreetIdx(nextDrawStreet); setPhase('action'); }}>Continue</button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="gto-entry">
            <div className="gto-phase-card">
              <div className="replayer-section">
                <div className="replayer-section-title">Draw Round -- {drawStreetName}</div>
                <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:'10px'}}>
                  Each player declares how many cards to discard. Stand Pat = keep all cards.
                </p>
                {drawActivePlayers.map(function(pi) {
                  var p = hand.players[pi];
                  var existingDraw = (currentStreet.draws || []).find(function(d) { return d.player === pi; });
                  var isDeclared = !!existingDraw;
                  var isCurrentTarget = pi === currentDrawPlayer;
                  var curHand = getDrawPlayerHand(pi);

                  return (
                    <div key={pi} className={'gto-seat' + (isCurrentTarget ? ' active' : '') + (isDeclared ? ' gto-draw-declared' : '')}
                      style={{marginBottom:'6px'}}>
                      <div className="gto-seat-strip">{p.position}</div>
                      <div className="gto-seat-content">
                        <div className="gto-seat-bar">
                          <div className="gto-seat-row1">
                            <span className="gto-seat-pos">{p.position}</span>
                            <span className="gto-seat-stack">{formatChipAmount(currentStacks[pi])}</span>
                          </div>
                          <div className="gto-seat-row2">
                            <span className="gto-seat-name">{p.name}</span>
                            {isDeclared && (
                              <span className="gto-seat-result-badge check" style={{marginLeft:'auto'}}>
                                {existingDraw.discarded === 0 ? 'Stand Pat' : 'Drew ' + existingDraw.discarded}
                              </span>
                            )}
                          </div>
                        </div>
                        {curHand && <div style={{padding:'4px 10px'}}><CardRow text={curHand} max={gameCfg.heroCards || 5} /></div>}
                        {isCurrentTarget && !isDeclared && (
                          <div className="gto-draw-buttons">
                            <button className="gto-draw-btn pat" onClick={function() { addDraw(pi, 0); }}>
                              Stand Pat
                            </button>
                            {Array.from({length: maxDiscard}, function(_, n) { return n + 1; }).map(function(count) {
                              return (
                                <button key={count} className="gto-draw-btn" onClick={function() { addDraw(pi, count); }}>
                                  {count}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="gto-street-card">
              <div style={{display:'flex',gap:'6px',justifyContent:'flex-end',padding:'10px 12px'}}>
                {(currentStreet.draws || []).length > 0 && (
                  <button className="gto-undo-btn" onClick={undoLastDraw}>Undo</button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={function() {
                  // Clear draws on this street and undo the last betting action to return to action phase
                  setHand(function(prev) {
                    // Find last action on current street and remove it + clear draws
                    for (var si = currentStreetIdx; si >= 0; si--) {
                      var acts = prev.streets[si].actions || [];
                      if (acts.length > 0) {
                        var streets = prev.streets.map(function(s, i) {
                          if (i < si) return s;
                          if (i === si) {
                            var updated = Object.assign({}, s, { actions: acts.slice(0, -1) });
                            if (i === currentStreetIdx) updated.draws = [];
                            return updated;
                          }
                          return Object.assign({}, s, { actions: [], draws: [] });
                        });
                        if (si < currentStreetIdx) setCurrentStreetIdx(si);
                        return Object.assign({}, prev, { streets: streets });
                      }
                    }
                    return prev;
                  });
                  setPhase('action');
                }}>Back</button>
                <button className="btn btn-primary btn-sm"
                  disabled={!allDrawsDeclared}
                  onClick={function() { setPhase('draw_cards_entry'); }}>
                  Enter Cards
                </button>
              </div>
            </div>
          </div>
        );
      }

      // ── STUD DEAL PHASE ──
      if (phase === 'stud_deal') {
        var nextStudStreet = currentStreetIdx + 1;
        var studStreetName = (hand.streets[nextStudStreet] && hand.streets[nextStudStreet].name) || 'Next Street';
        var heroIdxSD = hand.heroIdx != null ? hand.heroIdx : 0;
        var isLastStudStreet = nextStudStreet === 4; // 7th street (index 4 for 5 streets: 3rd,4th,5th,6th,7th)

        // Collect all used cards
        var usedCardsSD = new Set();
        hand.streets.forEach(function(s) {
          parseCardNotation(s.cards.hero || '').forEach(function(c) { if (c.suit !== 'x') usedCardsSD.add(c.rank + c.suit); });
          (s.cards.opponents || []).forEach(function(opp) {
            parseCardNotation(opp || '').forEach(function(c) { if (c.suit !== 'x') usedCardsSD.add(c.rank + c.suit); });
          });
        });

        // Get cards already entered for this next street
        var nextStreetData = hand.streets[nextStudStreet] || { cards: { hero: '', opponents: [] } };
        var heroNextCard = nextStreetData.cards.hero || '';
        var oppNextCards = nextStreetData.cards.opponents || [];

        var sdAllRanks = 'AKQJT98765432'.split('');
        var sdAllSuits = [
          { key: 'h', label: '♥', color: '#ef4444' },
          { key: 'd', label: '♦', color: '#3b82f6' },
          { key: 'c', label: '♣', color: '#22c55e' },
          { key: 's', label: '♠', color: 'var(--text)' }
        ];

        // studDealTargetState[0] is declared at the top level

        // Active (non-folded) players
        var activePlayers = hand.players.map(function(p, pi) { return pi; }).filter(function(pi) { return !foldedSet.has(pi); });

        var setStudCard = function(playerIdx, card) {
          setHand(function(prev) {
            var streets = prev.streets.map(function(s, si) {
              if (si !== nextStudStreet) return s;
              var newCards = Object.assign({}, s.cards);
              if (playerIdx === heroIdxSD) {
                newCards.hero = newCards.hero === card ? '' : card;
              } else {
                var oppSlot = playerIdx < heroIdxSD ? playerIdx : playerIdx - 1;
                var opponents = [...(newCards.opponents || [])];
                opponents[oppSlot] = opponents[oppSlot] === card ? '' : card;
                newCards.opponents = opponents;
              }
              return Object.assign({}, s, { cards: newCards });
            });
            return Object.assign({}, prev, { streets: streets });
          });
        };

        var getStudCardForPlayer = function(pi) {
          if (pi === heroIdxSD) return heroNextCard;
          var oppSlot = pi < heroIdxSD ? pi : pi - 1;
          return oppNextCards[oppSlot] || '';
        };

        // Count entered cards for continue button
        var enteredCount = activePlayers.filter(function(pi) { return getStudCardForPlayer(pi); }).length;

        return (
          <div className="gto-entry">
            <div className="gto-phase-card">
              <div className="replayer-section">
                <div className="replayer-section-title">Deal {studStreetName}</div>
                <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:'8px'}}>
                  {isLastStudStreet ? 'Enter each player\'s 7th street card (face down).' : 'Enter each player\'s next card.'}
                  {' Tap a player name to select them, then tap a card.'}
                </p>
                {activePlayers.map(function(pi) {
                  var p = hand.players[pi];
                  var isHero = pi === heroIdxSD;
                  var cardStr = getStudCardForPlayer(pi);
                  var isTarget = studDealTargetState[0] === pi;
                  return (
                    <div key={pi} style={{
                      display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px', padding:'6px 8px',
                      borderRadius:'6px', cursor:'pointer',
                      background: isTarget ? 'var(--accent-bg, rgba(34,197,94,0.1))' : 'transparent',
                      border: isTarget ? '1.5px solid var(--accent)' : '1.5px solid transparent'
                    }} onClick={function() { studDealTargetState[1](pi); }}>
                      <span style={{fontWeight:700,fontSize:'0.8rem',minWidth:'100px'}}>{p.name}</span>
                      <span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>{p.position}</span>
                      {cardStr ? <CardRow text={cardStr} max={1} /> : <span style={{fontSize:'0.7rem',color:'var(--text-muted)',fontStyle:'italic'}}>—</span>}
                    </div>
                  );
                })}
                <div className="card-picker-grid">
                  {sdAllSuits.map(function(suit) {
                    return React.createElement(React.Fragment, { key: suit.key },
                      sdAllRanks.map(function(rank) {
                        var card = rank + suit.key;
                        var isUsed = usedCardsSD.has(card);
                        // Check if selected for any player on this street
                        var selectedFor = -1;
                        activePlayers.forEach(function(pi) {
                          if (getStudCardForPlayer(pi) === card) selectedFor = pi;
                        });
                        var cls = 'card-picker-btn' + (selectedFor >= 0 ? ' selected' : '') + (isUsed && selectedFor < 0 ? ' used' : '');
                        return React.createElement('button', {
                          key: card, className: cls,
                          disabled: isUsed && selectedFor < 0,
                          onClick: function() {
                            if (selectedFor >= 0) {
                              // Toggle off
                              setStudCard(selectedFor, '');
                            } else if (studDealTargetState[0] >= 0) {
                              setStudCard(studDealTargetState[0], card);
                              // Auto-advance to next player without a card
                              var nextTarget = activePlayers.find(function(pi) {
                                return pi !== studDealTargetState[0] && !getStudCardForPlayer(pi);
                              });
                              if (nextTarget !== undefined) studDealTargetState[1](nextTarget);
                            }
                          }
                        }, React.createElement('img', {
                          src: '/cards/cards_gui_' + rank + suit.key + '.svg',
                          alt: card, loading: 'eager'
                        }));
                      })
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="gto-street-card">
              <div style={{display:'flex',gap:'6px',justifyContent:'flex-end',padding:'10px 12px'}}>
                <button className="btn btn-ghost btn-sm" onClick={function() { setPhase('action'); }}>Back</button>
                <button className="btn btn-primary btn-sm"
                  disabled={enteredCount < activePlayers.length}
                  onClick={function() { setCurrentStreetIdx(nextStudStreet); setPhase('action'); }}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        );
      }

      // ── BOARD ENTRY PHASE ──
      if (phase === 'board_entry') {
        var nextStreet = currentStreetIdx + 1;
        var streetName = (hand.streets[nextStreet] && hand.streets[nextStreet].name) || 'Next Street';
        var boardVal = (hand.streets[nextStreet] && hand.streets[nextStreet].cards.board) || '';
        var maxCards = streetDef.boardCards ? streetDef.boardCards[nextStreet] : 1;
        // Collect all cards already dealt (hero, opponents, all board streets)
        var usedCards = new Set();
        hand.streets.forEach(function(s) {
          parseCardNotation(s.cards.hero || '').forEach(function(c) { if (c.suit !== 'x') usedCards.add(c.rank + c.suit); });
          parseCardNotation(s.cards.board || '').forEach(function(c) { if (c.suit !== 'x') usedCards.add(c.rank + c.suit); });
          (s.cards.opponents || []).forEach(function(opp) {
            parseCardNotation(opp || '').forEach(function(c) { if (c.suit !== 'x') usedCards.add(c.rank + c.suit); });
          });
        });
        // Cards currently being entered for this street (so they show as selected, not used)
        var currentBoardCards = parseCardNotation(boardVal).filter(function(c) { return c.suit !== 'x'; }).map(function(c) { return c.rank + c.suit; });
        var currentBoardSet = new Set(currentBoardCards);
        // Remove current board cards from used (they're "selected", not "used")
        currentBoardCards.forEach(function(c) { usedCards.delete(c); });

        var allRanks = 'AKQJT98765432'.split('');
        var allSuits = [
          { key: 'h', label: '♥', color: '#ef4444' },
          { key: 'd', label: '♦', color: '#3b82f6' },
          { key: 'c', label: '♣', color: '#22c55e' },
          { key: 's', label: '♠', color: 'var(--text)' }
        ];

        var toggleCard = function(card) {
          if (currentBoardSet.has(card)) {
            // Remove this card
            var remaining = currentBoardCards.filter(function(c) { return c !== card; });
            var newVal = remaining.join('');
            setHand(function(prev) {
              var streets = prev.streets.map(function(s, i) { return i === nextStreet ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { board: newVal }) }) : s; });
              return Object.assign({}, prev, { streets: streets });
            });
          } else {
            // Add this card (respect max)
            if (currentBoardCards.length >= maxCards) return;
            var newVal = boardVal + card;
            setHand(function(prev) {
              var streets = prev.streets.map(function(s, i) { return i === nextStreet ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { board: newVal }) }) : s; });
              return Object.assign({}, prev, { streets: streets });
            });
          }
        };

        return (
          <div className="gto-entry">
            <div className="gto-phase-card">
              <div className="replayer-section" style={{textAlign:'center'}}>
                <div className="gto-street-label">Deal the {streetName}</div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'12px',margin:'8px 0'}}>
                  {cumulativeBoard && <CardRow text={cumulativeBoard} max={5} />}
                  {boardVal && <CardRow text={boardVal} max={maxCards} />}
                </div>
                <div className="replayer-field" style={{marginTop:'8px'}}>
                  <label>{streetName} Cards</label>
                  <input type="text" placeholder={nextStreet === 1 ? 'Qh7d2c' : 'Ts'}
                    value={boardVal}
                    onChange={function(e) {
                      var val = e.target.value;
                      setHand(function(prev) {
                        var streets = prev.streets.map(function(s, i) { return i === nextStreet ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { board: val }) }) : s; });
                        return Object.assign({}, prev, { streets: streets });
                      });
                    }} />
                </div>
                {/* Card picker grid */}
                <div className="card-picker-grid">
                  {allSuits.map(function(suit) {
                    return React.createElement(React.Fragment, { key: suit.key },
                      allRanks.map(function(rank) {
                        var card = rank + suit.key;
                        var isUsed = usedCards.has(card);
                        var isSelected = currentBoardSet.has(card);
                        var cls = 'card-picker-btn' + (isSelected ? ' selected' : '') + (isUsed ? ' used' : '');
                        return React.createElement('button', {
                          key: card, className: cls,
                          onClick: function() { toggleCard(card); }
                        }, React.createElement('img', {
                          src: '/cards/cards_gui_' + rank + suit.key + '.svg',
                          alt: card, loading: 'eager'
                        }));
                      })
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{display:'flex',gap:'6px',justifyContent:'flex-end',padding:'10px 0'}}>
              <button className="gto-undo-btn" onClick={undoLastAction}>Undo</button>
              <button className="btn btn-primary btn-sm"
                disabled={parseCardNotation(boardVal).filter(function(c) { return c.suit !== 'x'; }).length < maxCards}
                onClick={function() { setCurrentStreetIdx(nextStreet); setPhase('action'); }}>Continue</button>
            </div>
          </div>
        );
      }

      // ── SHOWDOWN PHASE ──
      if (phase === 'showdown') {
        // Collect used cards (hero, all board streets, all opponent streets)
        var sdUsedCards = new Set();
        hand.streets.forEach(function(s) {
          parseCardNotation(s.cards.hero || '').forEach(function(c) { if (c.suit !== 'x') sdUsedCards.add(c.rank + c.suit); });
          parseCardNotation(s.cards.board || '').forEach(function(c) { if (c.suit !== 'x') sdUsedCards.add(c.rank + c.suit); });
          (s.cards.opponents || []).forEach(function(opp) {
            parseCardNotation(opp || '').forEach(function(c) { if (c.suit !== 'x') sdUsedCards.add(c.rank + c.suit); });
          });
        });
        // Non-folded, non-hero opponents
        var showdownPlayers = hand.players.map(function(p, i) { return { player: p, idx: i }; })
          .filter(function(o) { return o.idx !== heroIdx && !foldedSet.has(o.idx); });

        var sdAllRanks = 'AKQJT98765432'.split('');
        var sdAllSuits = [
          { key: 'h', label: '♥' },
          { key: 'd', label: '♦' },
          { key: 'c', label: '♣' },
          { key: 's', label: '♠' }
        ];
        var sdMaxCards = gameCfg.heroCards || 2;
        var isStudShowdown = category === 'stud';

        // For stud: accumulate cards from all streets for each player
        var getStudAllCards = function(oppSlot) {
          var accumulated = '';
          hand.streets.forEach(function(s) {
            var oppC = (s.cards.opponents || [])[oppSlot] || '';
            if (oppC && oppC !== 'MUCK') accumulated += oppC;
          });
          return accumulated;
        };
        var getStudHeroAllCards = function() {
          var accumulated = '';
          hand.streets.forEach(function(s) {
            if (s.cards.hero) accumulated += s.cards.hero;
          });
          return accumulated;
        };

        // Get combined card string for an opponent (stud=all streets, else=street 0)
        var getOppCardStr = function(oppSlot) {
          if (isStudShowdown) return getStudAllCards(oppSlot);
          return (hand.streets[0].cards.opponents && hand.streets[0].cards.opponents[oppSlot]) || '';
        };

        // Track which opponent we're entering cards for
        // For stud, we need remaining down cards at showdown (holes + 7th street)
        // Opponent's known cards come from all streets, missing cards need to be entered
        var sdActiveIdx = -1;
        for (var sdi = 0; sdi < showdownPlayers.length; sdi++) {
          var oppIdx = showdownPlayers[sdi].idx;
          var oppSlot = oppIdx > heroIdx ? oppIdx - 1 : oppIdx;
          var oppCardStr = getOppCardStr(oppSlot);
          var oppCards = oppCardStr === 'MUCK' ? [] : parseCardNotation(oppCardStr).filter(function(c) { return c.suit !== 'x'; });
          if (oppCardStr !== 'MUCK' && oppCards.length < sdMaxCards) { sdActiveIdx = sdi; break; }
        }

        return (
          <div className="gto-entry">
            <div className="gto-phase-card">
              <div className="replayer-section" style={{textAlign:'center'}}>
                <div className="gto-street-label">Showdown</div>
                {cumulativeBoard && <div style={{margin:'8px 0'}}><CardRow text={cumulativeBoard} max={5} /></div>}
              </div>
            </div>
            {showdownPlayers.map(function(o, si) {
              var oppSlot = o.idx > heroIdx ? o.idx - 1 : o.idx;
              var oppCardStr = getOppCardStr(oppSlot);
              var isMucked = oppCardStr === 'MUCK' || (hand.streets[0].cards.opponents && hand.streets[0].cards.opponents[oppSlot]) === 'MUCK';
              var oppParsed = isMucked ? [] : parseCardNotation(oppCardStr).filter(function(c) { return c.suit !== 'x'; });
              var oppCardSet = new Set(oppParsed.map(function(c) { return c.rank + c.suit; }));
              var isComplete = isMucked || oppParsed.length >= sdMaxCards;
              var isActiveOpp = si === sdActiveIdx;

              // For stud: show how many known vs unknown cards
              var studKnownCount = 0;
              if (isStudShowdown && !isMucked) {
                // Count visible cards already entered on streets (door card + 4th-6th up cards)
                for (var _si = 0; _si < hand.streets.length; _si++) {
                  var _sc = (hand.streets[_si].cards.opponents || [])[oppSlot] || '';
                  parseCardNotation(_sc).filter(function(c) { return c.suit !== 'x'; }).forEach(function() { studKnownCount++; });
                }
              }
              var studMissingCount = isStudShowdown ? Math.max(0, sdMaxCards - oppParsed.length) : 0;

              // Build used set excluding this opponent's own cards
              var thisUsed = new Set(sdUsedCards);
              showdownPlayers.forEach(function(other) {
                if (other.idx === o.idx) return;
                var otherSlot = other.idx > heroIdx ? other.idx - 1 : other.idx;
                var otherStr = getOppCardStr(otherSlot);
                if (otherStr !== 'MUCK') {
                  parseCardNotation(otherStr).forEach(function(c) { if (c.suit !== 'x') thisUsed.add(c.rank + c.suit); });
                }
              });
              oppParsed.forEach(function(c) { thisUsed.delete(c.rank + c.suit); });

              // For stud showdown, write new hidden cards to street 0 (prepend for hole cards)
              // For non-stud, write to street 0 as before
              var toggleSdCard = function(card) {
                if (oppCardSet.has(card)) {
                  // Remove card — for stud, rebuild all streets; for non-stud, edit street 0
                  if (isStudShowdown) {
                    // Remove from whichever street has it
                    setHand(function(prev) {
                      var streets = prev.streets.map(function(s) {
                        var opps = (s.cards.opponents || []).slice();
                        var curr = opps[oppSlot] || '';
                        if (curr.indexOf(card) >= 0) {
                          opps[oppSlot] = curr.replace(card, '');
                          return Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) });
                        }
                        return s;
                      });
                      return Object.assign({}, prev, { streets: streets });
                    });
                  } else {
                    var remaining = oppParsed.map(function(c) { return c.rank + c.suit; }).filter(function(c) { return c !== card; });
                    var newVal = remaining.join('');
                    setHand(function(prev) {
                      var opps = (prev.streets[0].cards.opponents || []).slice();
                      opps[oppSlot] = newVal;
                      var streets = prev.streets.map(function(s, i) { return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) }) : s; });
                      return Object.assign({}, prev, { streets: streets });
                    });
                  }
                } else {
                  if (oppParsed.length >= sdMaxCards) return;
                  if (isStudShowdown) {
                    // For stud, prepend hidden cards to street 0 so order is hole1,hole2,door,4th,5th,6th,7th
                    setHand(function(prev) {
                      var opps = (prev.streets[0].cards.opponents || []).slice();
                      opps[oppSlot] = card + (opps[oppSlot] || '');
                      var streets = prev.streets.map(function(s, i) { return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) }) : s; });
                      return Object.assign({}, prev, { streets: streets });
                    });
                  } else {
                    var newVal = oppCardStr + card;
                    setHand(function(prev) {
                      var opps = (prev.streets[0].cards.opponents || []).slice();
                      opps[oppSlot] = newVal;
                      var streets = prev.streets.map(function(s, i) { return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) }) : s; });
                      return Object.assign({}, prev, { streets: streets });
                    });
                  }
                }
              };

              var setMuck = function() {
                setHand(function(prev) {
                  var opps = (prev.streets[0].cards.opponents || []).slice();
                  opps[oppSlot] = 'MUCK';
                  var streets = prev.streets.map(function(s, i) { return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) }) : s; });
                  return Object.assign({}, prev, { streets: streets });
                });
              };

              var clearOppCards = function() {
                if (isStudShowdown) {
                  // Clear cards from all streets for this opponent
                  setHand(function(prev) {
                    var streets = prev.streets.map(function(s) {
                      var opps = (s.cards.opponents || []).slice();
                      opps[oppSlot] = '';
                      return Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) });
                    });
                    return Object.assign({}, prev, { streets: streets });
                  });
                } else {
                  setHand(function(prev) {
                    var opps = (prev.streets[0].cards.opponents || []).slice();
                    opps[oppSlot] = '';
                    var streets = prev.streets.map(function(s, i) { return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) }) : s; });
                    return Object.assign({}, prev, { streets: streets });
                  });
                }
              };

              return (
                <div key={o.idx} className="gto-phase-card" style={{marginTop:'6px', opacity: isComplete && !isActiveOpp ? 0.6 : 1}}>
                  <div className="replayer-section">
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
                      <div>
                        <span className="replayer-player-pos" style={{marginRight:'6px'}}>{o.player.position}</span>
                        <span style={{fontFamily:"'Univers Condensed','Univers',sans-serif",fontSize:'0.8rem',fontWeight:600,color:'var(--text)'}}>{o.player.name}</span>
                      </div>
                      {isMucked ? (
                        <button className="gto-undo-btn" onClick={clearOppCards} style={{fontSize:'0.6rem'}}>Undo Muck</button>
                      ) : isComplete ? (
                        <button className="gto-undo-btn" onClick={clearOppCards} style={{fontSize:'0.6rem'}}>Clear</button>
                      ) : (
                        <button className="gto-undo-btn" onClick={setMuck} style={{fontSize:'0.6rem'}}>Muck</button>
                      )}
                    </div>
                    {isMucked ? (
                      <div style={{textAlign:'center',padding:'8px 0',fontFamily:"'Univers Condensed','Univers',sans-serif",fontSize:'0.75rem',color:'var(--text-muted)',fontStyle:'italic'}}>Mucked</div>
                    ) : (
                      <React.Fragment>
                        {oppParsed.length > 0 && <div style={{margin:'4px 0'}}>
                          <CardRow text={oppCardStr} stud={isStudShowdown} max={sdMaxCards} />
                          {isStudShowdown && studMissingCount > 0 && <div style={{fontSize:'0.6rem',color:'var(--text-muted)',marginTop:'2px'}}>
                            {studKnownCount} known cards, {studMissingCount} hidden card{studMissingCount !== 1 ? 's' : ''} remaining
                          </div>}
                        </div>}
                        {!isComplete && (
                          <div className="card-picker-grid">
                            {sdAllSuits.map(function(suit) {
                              return React.createElement(React.Fragment, { key: suit.key },
                                sdAllRanks.map(function(rank) {
                                  var card = rank + suit.key;
                                  var isUsedByOther = thisUsed.has(card);
                                  var isSelected = oppCardSet.has(card);
                                  var cls = 'card-picker-btn' + (isSelected ? ' selected' : '') + (isUsedByOther ? ' used' : '');
                                  return React.createElement('button', {
                                    key: card, className: cls,
                                    onClick: function() { toggleSdCard(card); }
                                  }, React.createElement('img', {
                                    src: '/cards/cards_gui_' + rank + suit.key + '.svg',
                                    alt: card, loading: 'eager'
                                  }));
                                })
                              );
                            })}
                          </div>
                        )}
                      </React.Fragment>
                    )}
                  </div>
                </div>
              );
            })}
            <div style={{display:'flex',gap:'6px',justifyContent:'flex-end',padding:'10px 0'}}>
              <button className="gto-undo-btn" onClick={undoLastAction}>Undo</button>
              <button className="btn btn-primary btn-sm" onClick={function() {
                // Auto-evaluate showdown winners
                var playerHands = [];
                // Hero — for stud, accumulate from all streets
                var heroCardStr = isStudShowdown ? getStudHeroAllCards() : (hand.streets[0].cards.hero || '');
                var heroParsed = parseCardNotation(heroCardStr).filter(function(c) { return c.suit !== 'x'; });
                if (heroParsed.length > 0) {
                  playerHands.push({ idx: heroIdx, cards: heroParsed });
                }
                // Opponents — for stud, accumulate from all streets
                showdownPlayers.forEach(function(o) {
                  var oppSlot = o.idx > heroIdx ? o.idx - 1 : o.idx;
                  var oppStr = getOppCardStr(oppSlot);
                  if (oppStr === 'MUCK' || !oppStr) return;
                  var oppParsed = parseCardNotation(oppStr).filter(function(c) { return c.suit !== 'x'; });
                  if (oppParsed.length > 0) {
                    playerHands.push({ idx: o.idx, cards: oppParsed });
                  }
                });
                // Build full board as parsed card objects
                var fullBoardStr = '';
                hand.streets.forEach(function(s) {
                  if (s.cards.board) fullBoardStr += s.cards.board;
                });
                var boardParsed = parseCardNotation(fullBoardStr).filter(function(c) { return c.suit !== 'x'; });
                // Only one non-mucked player = auto-win
                if (playerHands.length === 1) {
                  setHand(function(prev) {
                    return Object.assign({}, prev, { result: Object.assign({}, prev.result, { winners: [{ playerIdx: playerHands[0].idx, split: false }] }) });
                  });
                } else if (playerHands.length > 1) {
                  var winners = evaluateShowdown(hand.gameType, playerHands, boardParsed);
                  // Add hi/lo split labels for hilo games
                  var _ec = GAME_EVAL[hand.gameType];
                  if (_ec && _ec.type === 'hilo' && winners.some(function(w){return w.split;})) {
                    var _hs={}; var _ls={};
                    playerHands.forEach(function(ph){
                      var al=boardParsed.length?ph.cards.concat(boardParsed):ph.cards;
                      _hs[ph.idx]=_ec.method==='omaha'?bestOmahaHigh(ph.cards,boardParsed):bestHighHand(al);
                      var lo=_ec.method==='omaha'?bestOmahaLow(ph.cards,boardParsed):bestLowA5Hand(al,true);
                      _ls[ph.idx]=lo&&lo.qualified?lo:null;
                    });
                    var _bh=-1;var _bl=Infinity;
                    Object.keys(_hs).forEach(function(k){if(_hs[k]&&_hs[k].score>_bh)_bh=_hs[k].score;});
                    Object.keys(_ls).forEach(function(k){if(_ls[k]&&_ls[k].score<_bl)_bl=_ls[k].score;});
                    winners=winners.map(function(w){
                      var lb=[];
                      if(_hs[w.playerIdx]&&_hs[w.playerIdx].score===_bh)lb.push('Hi: '+(_hs[w.playerIdx].shortName||_hs[w.playerIdx].name));
                      if(_ls[w.playerIdx]&&_ls[w.playerIdx].score===_bl)lb.push('Lo: '+_ls[w.playerIdx].name);
                      if(lb.length)return Object.assign({},w,{label:hand.players[w.playerIdx].name+' wins '+lb.join(', ')});
                      return w;
                    });
                  }
                  if (winners.length > 0) {
                    setHand(function(prev) {
                      return Object.assign({}, prev, { result: Object.assign({}, prev.result, { winners: winners }) });
                    });
                  }
                }
                setPhase('result');
              }}>Continue to Result</button>
            </div>
          </div>
        );
      }

      // ── RESULT PHASE ──
      if (phase === 'result') {
        var autoWinner = handOver && activePlayers.length === 1 ? hand.players.indexOf(activePlayers[0]) : -1;
        return (
          <div className="gto-entry">
            <div className="gto-phase-card">
              <div className="replayer-section">
                <div className="replayer-section-title">Result</div>
                {autoWinner >= 0 ? (
                  <div style={{textAlign:'center',padding:'12px',fontFamily:"'Univers Condensed','Univers',sans-serif"}}>
                    <div style={{fontSize:'0.9rem',color:'#4ade80',fontWeight:700}}>{hand.players[autoWinner].name} wins</div>
                    <div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginTop:'4px'}}>All opponents folded</div>
                  </div>
                ) : (
                  <React.Fragment>
                    <div style={{display:'flex',flexWrap:'wrap',gap:'4px'}}>
                      {hand.players.filter(function(_, i) { return !foldedSet.has(i); }).map(function(p) {
                        var pi = hand.players.indexOf(p);
                        var winners = (hand.result && hand.result.winners) || [];
                        var isWinner = winners.some(function(w) { return w.playerIdx === pi && !w.split; });
                        var isSplit = winners.some(function(w) { return w.playerIdx === pi && w.split; });
                        return (
                          <button key={pi} style={{
                            flex:'1 1 0',padding:'8px 14px',borderRadius:'6px',border:'1.5px solid',cursor:'pointer',
                            fontFamily:"'Univers Condensed','Univers',sans-serif",fontSize:'0.75rem',fontWeight:600,transition:'all 0.15s',
                            background: isWinner ? 'rgba(74,222,128,0.15)' : isSplit ? 'rgba(250,204,21,0.15)' : 'transparent',
                            borderColor: isWinner ? '#4ade80' : isSplit ? '#facc15' : 'var(--border)',
                            color: isWinner ? '#4ade80' : isSplit ? '#facc15' : 'var(--text-muted)',
                          }} onClick={function() {
                            setHand(function(prev) {
                              var prevWinners = (prev.result && prev.result.winners) || [];
                              var existing = prevWinners.find(function(w) { return w.playerIdx === pi; });
                              var newWinners;
                              if (!existing) newWinners = prevWinners.concat([{ playerIdx: pi, split: false, label: '' }]);
                              else if (!existing.split) newWinners = prevWinners.map(function(w) { return w.playerIdx === pi ? Object.assign({}, w, { split: true }) : w; });
                              else newWinners = prevWinners.filter(function(w) { return w.playerIdx !== pi; });
                              return Object.assign({}, prev, { result: Object.assign({}, prev.result, { winners: newWinners }) });
                            });
                          }}>
                            {p.name} {isWinner ? '(Win)' : isSplit ? '(Split)' : ''}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{fontSize:'0.55rem',color:'var(--text-muted)',marginTop:'4px',fontFamily:"'Univers Condensed','Univers',sans-serif"}}>
                      {(hand.result && hand.result.winners && hand.result.winners.length) ? 'Auto-evaluated • ' : ''}Tap to cycle: none → win → split → none
                    </div>
                  </React.Fragment>
                )}
              </div>
            </div>
            <div className="gto-street-card">
              <div style={{display:'flex',gap:'6px',justifyContent:'flex-end',padding:'10px 12px'}}>
                <button className="gto-undo-btn" onClick={undoLastAction}>Undo</button>
                <button className="btn btn-primary btn-sm" onClick={function() {
                  var savedHand = Object.assign({}, hand, { heroIdx: heroIdx });
                  if (autoWinner >= 0 && !(hand.result && hand.result.winners && hand.result.winners.length)) {
                    onDone(Object.assign(savedHand, { result: { winners: [{ playerIdx: autoWinner, split: false, label: '' }] } }));
                  } else { onDone(savedHand); }
                }}>Save & Replay</button>
              </div>
            </div>
          </div>
        );
      }

      // ── ACTION PHASE ──
      // Portal the street bar into the parent's sticky header slot
      var stickySlot = document.getElementById('gto-sticky-slot');
      var streetCardEl = React.createElement('div', { className: 'gto-street-card', style: { marginTop: '6px' } },
        React.createElement('div', { className: 'gto-street-bar' },
          React.createElement('span', { className: 'gto-street-name' }, currentStreet.name),
          category === 'community' && cumulativeBoard ? React.createElement('span', { className: 'gto-board-inline' },
            React.createElement(CardRow, { text: cumulativeBoard, max: 5 })
          ) : null,
          React.createElement('span', { className: 'gto-pot-label' }, formatChipAmount(currentPot))
        )
      );

      return (
        <div className="gto-entry">
          {stickySlot && ReactDOM.createPortal(streetCardEl, stickySlot)}

          {/* Position cards */}
          {seatOrder.map(function(i) {
            var p = hand.players[i];
            var isActive = i === currentActor;
            var act = playerActions[i];
            var isFolded = foldedSet.has(i);
            // Hide players who folded on a previous street; show those who folded this street (dimmed)
            // Exception: in stud games, always show folded players (their upcards remain visible for info tracking)
            var foldedOnPriorStreet = isFolded && !(currentStreet.actions || []).some(function(a) { return a.player === i && a.action === 'fold'; });
            if (foldedOnPriorStreet && !isPreflop && category !== 'stud') return null;
            var seatClass = 'gto-seat' + (isActive ? ' active' : '') + (isFolded ? ' folded' : (act && !isActive) ? ' acted-' + act.action : '');
            var actionLabel = act ? (act.action.charAt(0).toUpperCase() + act.action.slice(1) + (act.amount > 0 ? ' ' + formatChipAmount(act.amount) : '')) : '';
            return (
              <div key={i} ref={isActive ? activeSeatRef : null} className={seatClass}
                onClick={!isActive && act ? function() { undoToPlayer(i); } : undefined}
                style={!isActive && act ? {cursor:'pointer'} : undefined}>
                <div className="gto-seat-strip">{p.position}</div>
                <div className="gto-seat-content">
                  <div className="gto-seat-bar">
                    <div className="gto-seat-row1">
                      <span className="gto-seat-pos">{p.position}</span>
                      <span className="gto-seat-stack">{formatChipAmount(currentStacks[i])}</span>
                    </div>
                    <div className="gto-seat-row2">
                      <span className="gto-seat-name">{p.name}</span>
                      {category === 'stud' ? (function() {
                        /* Stud: show accumulated board cards for each player */
                        var isHero = i === heroIdx;
                        var oppSlot = i < heroIdx ? i : i - 1;
                        var accumulated = '';
                        for (var si = 0; si <= currentStreetIdx; si++) {
                          var st = hand.streets[si];
                          if (!st) break;
                          if (isHero) {
                            accumulated += (st.cards.hero || '');
                          } else {
                            accumulated += ((st.cards.opponents || [])[oppSlot] || '');
                          }
                        }
                        var dimStyle = isFolded ? {opacity: 0.4, filter: 'grayscale(60%)'} : {};
                        /* For opponents: show 2 face-down hole cards + their visible cards + 7th street face-down if applicable */
                        /* For folded opponents: only show upcards (dimmed), no downcards */
                        if (!isHero) {
                          var oppVisible = parseCardNotation(accumulated).filter(function(c) { return c.suit !== 'x'; });
                          if (isFolded) {
                            /* Folded: show only upcards, dimmed — no hole card backs */
                            if (oppVisible.length === 0) return null;
                            return (
                              <span className="gto-seat-hero-cards" style={dimStyle}>
                                <div className="card-row" style={{gap:'2px',flexWrap:'nowrap'}}>
                                  {oppVisible.map(function(c, ci) {
                                    return <img key={ci} className="card-img" src={'/cards/cards_gui_' + c.rank + c.suit + '.svg'} alt={c.rank+c.suit} loading="eager" />;
                                  })}
                                </div>
                              </span>
                            );
                          }
                          var downAfter = currentStreetIdx >= 4 ? 1 : 0; // 7th street
                          return (
                            <span className="gto-seat-hero-cards">
                              <div className="card-row" style={{gap:'2px',flexWrap:'nowrap'}}>
                                <div className="card-unknown" style={{marginTop:8}} />
                                <div className="card-unknown" style={{marginTop:8}} />
                                {oppVisible.map(function(c, ci) {
                                  return <img key={ci} className="card-img" src={'/cards/cards_gui_' + c.rank + c.suit + '.svg'} alt={c.rank+c.suit} loading="eager" />;
                                })}
                                {downAfter > 0 && <div className="card-unknown" style={{marginTop:8}} />}
                              </div>
                            </span>
                          );
                        }
                        /* Hero folded: show cards dimmed */
                        if (!accumulated) return null;
                        return <span className="gto-seat-hero-cards" style={dimStyle}><CardRow text={accumulated} stud={true} max={7} /></span>;
                      })()
                      : i === heroIdx && hand.streets[0] && hand.streets[0].cards.hero && (
                        <span className="gto-seat-hero-cards"><CardRow text={hand.streets[0].cards.hero} max={gameCfg.heroCards || 2} /></span>
                      )}
                      {act && !isActive && <span className={'gto-seat-result-badge ' + act.action}>{actionLabel}</span>}
                    </div>
                  </div>

                  {/* Animated expand for active seat */}
                  <div className="gto-seat-detail-wrap">
                    <div className="gto-seat-detail-inner">
                      <div className="gto-seat-detail">
                        {/* Stud bring-in: first action on 3rd street for the bring-in player */}
                        {gameCfg.isStud && currentStreetIdx === 0 && studInfo && studInfo.bringInIdx === currentActor && !(currentStreet.actions || []).length ? (
                          <div className="gto-action-row">
                            <button className="gto-action-btn" onClick={function() { addAction('bring-in', bringInAmount); }}>
                              <span className="gto-action-icon call">⬤</span>
                              <span className="gto-action-label">Bring In {formatChipAmount(bringInAmount)}</span>
                            </button>
                            <button className="gto-action-btn" onClick={function() { addAction('bet', Math.min(flBetSize, playerStack)); }}>
                              <span className="gto-action-icon raise">▲</span>
                              <span className="gto-action-label">Complete {formatChipAmount(Math.min(flBetSize, playerStack))}</span>
                            </button>
                          </div>
                        ) : gameCfg.isStud && currentStreetIdx === 0 && (currentStreet.actions || []).length > 0 && streetBets.maxBet <= bringInAmount && streetBetRaiseCount === 0 ? (
                          /* ── Stud 3rd street after bring-in: anyone can "complete" to full small bet ── */
                          /* Applies to all stud betting types (limit, pot-limit, no-limit) */
                          <div className="gto-action-row">
                            <button className="gto-action-btn" onClick={function() { addAction('fold'); }}>
                              <span className="gto-action-icon fold">✕</span>
                              <span className="gto-action-label">Fold</span>
                            </button>
                            <button className="gto-action-btn" onClick={function() { addAction('call', Math.min(callAmount, playerStack)); }}>
                              <span className="gto-action-icon call">⬤</span>
                              <span className="gto-action-label">Call {formatChipAmount(Math.min(callAmount, playerStack))}</span>
                            </button>
                            <button className="gto-action-btn" onClick={function() { var completeAmt = Math.min(flBetSize - playerContrib, playerStack); addAction('bet', completeAmt); }}>
                              <span className="gto-action-icon raise">▲</span>
                              <span className="gto-action-label">Complete {formatChipAmount(Math.min(flBetSize, playerStack + playerContrib))}</span>
                            </button>
                            {/* NL/PL stud: allow raise beyond the complete amount */}
                            {!isLimitGame && playerStack > (flBetSize - playerContrib) && <button className="gto-action-btn" onClick={function() {
                              setShowRaiseInput(true);
                              setBetAmount(String(Math.min(flBetSize - playerContrib, playerStack)));
                            }}>
                              <span className="gto-action-icon raise">▲</span>
                              <span className="gto-action-label">Raise</span>
                            </button>}
                          </div>
                        ) : isLimitGame ? (
                          /* ── Fixed Limit: no amount input, fixed bet/raise sizes ── */
                          <div className="gto-action-row">
                            {!canCheck && <button className="gto-action-btn" onClick={function() { addAction('fold'); }}>
                              <span className="gto-action-icon fold">✕</span>
                              <span className="gto-action-label">Fold</span>
                            </button>}
                            {canCheck
                              ? <button className="gto-action-btn" onClick={function() { addAction('check'); }}>
                                  <span className="gto-action-icon check">✓</span>
                                  <span className="gto-action-label">Check</span>
                                </button>
                              : <button className="gto-action-btn" onClick={function() { addAction('call', Math.min(callAmount, playerStack)); }}>
                                  <span className="gto-action-icon call">⬤</span>
                                  <span className="gto-action-label">Call {formatChipAmount(Math.min(callAmount, playerStack))}</span>
                                </button>
                            }
                            {flCanRaise && playerStack > callAmount && (canCheck
                              ? <button className="gto-action-btn" onClick={function() { addAction('bet', Math.min(flBetSize, playerStack)); }}>
                                  <span className="gto-action-icon raise">▲</span>
                                  <span className="gto-action-label">Bet {formatChipAmount(Math.min(flBetSize, playerStack))}</span>
                                </button>
                              : <button className="gto-action-btn" onClick={function() { addAction('raise', Math.min(flRaiseIncrement, playerStack)); }}>
                                  <span className="gto-action-icon raise">▲</span>
                                  <span className="gto-action-label">Raise to {formatChipAmount(Math.min(flRaiseToTotal, playerStack + playerContrib))}</span>
                                </button>
                            )}
                          </div>
                        ) : isPotLimit ? (
                          /* ── Pot Limit: sizing capped at pot ── */
                          <>
                            {!showRaiseInput && (
                              <div className="gto-action-row">
                                {!canCheck && <button className="gto-action-btn" onClick={function() { addAction('fold'); }}>
                                  <span className="gto-action-icon fold">✕</span>
                                  <span className="gto-action-label">Fold</span>
                                </button>}
                                {canCheck
                                  ? <button className="gto-action-btn" onClick={function() { addAction('check'); }}>
                                      <span className="gto-action-icon check">✓</span>
                                      <span className="gto-action-label">Check</span>
                                    </button>
                                  : <button className="gto-action-btn" onClick={function() { addAction('call', Math.min(callAmount, playerStack)); }}>
                                      <span className="gto-action-icon call">⬤</span>
                                      <span className="gto-action-label">Call {formatChipAmount(Math.min(callAmount, playerStack))}</span>
                                    </button>
                                }
                                {playerStack > callAmount && <button className="gto-action-btn" onClick={function() {
                                  var container = document.querySelector('.content-area');
                                  if (container) {
                                    var savedTop = container.scrollTop;
                                    var lock = function() { container.scrollTop = savedTop; };
                                    container.addEventListener('scroll', lock);
                                    setTimeout(function() { container.removeEventListener('scroll', lock); }, 500);
                                  }
                                  setShowRaiseInput(true);
                                  var plMinBet = Math.min((hand.blinds || {}).bb || 0, playerStack);
                                  var plMinRaise = Math.min(minRaiseIncrement, playerStack);
                                  setBetAmount(String(canCheck ? plMinBet : plMinRaise));
                                }}>
                                  <span className="gto-action-icon raise">▲</span>
                                  <span className="gto-action-label">{canCheck ? 'Bet' : 'Raise'}</span>
                                </button>}
                                {playerStack > callAmount && <button className="gto-action-btn" onClick={function() {
                                  var potIncrement = canCheck ? Math.min(plMaxBet, playerStack) : Math.min(plMaxRaiseIncrement, playerStack);
                                  addAction(canCheck ? 'bet' : 'raise', potIncrement);
                                }}>
                                  <span className="gto-action-icon raise">▲</span>
                                  <span className="gto-action-label">Pot {formatChipAmount(Math.min(canCheck ? plMaxBet : plRaiseToTotal, playerStack + playerContrib))}</span>
                                </button>}
                              </div>
                            )}
                            {showRaiseInput && (
                              <React.Fragment>
                                <div className="gto-sizing-row">
                                  {[{label:'Min',mult:0},{label:'1/3',mult:1/3},{label:'1/2',mult:1/2},{label:'2/3',mult:2/3},{label:'Pot',mult:1}].map(function(s) {
                                    var pillAmt;
                                    if (canCheck) {
                                      // Opening bet: pills are fractions of current pot (max bet = pot)
                                      pillAmt = s.mult === 0 ? Math.min((hand.blinds || {}).bb || 0, playerStack) : Math.min(Math.round(plMaxBet * s.mult), playerStack);
                                    } else {
                                      // Facing a bet: "1/3 pot" means raise by 1/3 of pot-after-calling
                                      // Raise increment = call + raise_size, where raise_size = fraction * plPotAfterCall
                                      if (s.mult === 0) {
                                        pillAmt = Math.min(minRaiseIncrement, playerStack);
                                      } else {
                                        var raiseSize = Math.round(plPotAfterCall * s.mult);
                                        var totalIncrement = callAmount + raiseSize;
                                        pillAmt = Math.max(Math.min(totalIncrement, plMaxRaiseIncrement, playerStack), Math.min(minRaiseIncrement, playerStack));
                                      }
                                    }
                                    return <button key={s.label} className="gto-sizing-pill" onClick={function() { setBetAmount(String(pillAmt)); }}>{s.label}</button>;
                                  })}
                                </div>
                                <div className="gto-raise-slider-row">
                                  <input type="range" className="gto-raise-slider" min={canCheck ? Math.min((hand.blinds || {}).bb || 0, playerStack) : Math.min(minRaiseIncrement, playerStack)} max={canCheck ? Math.min(plMaxBet, playerStack) : Math.min(plMaxRaiseIncrement, playerStack)} step={1} value={Number(betAmount) || 0} onChange={function(e) { setBetAmount(e.target.value); }} />
                                </div>
                                <div className="gto-raise-input-row">
                                  <input type="text" inputMode="decimal" value={betAmount} onChange={function(e) { setBetAmount(e.target.value); }} autoFocus />
                                  <button className="btn btn-primary btn-sm" onClick={function() {
                                    var inputAmt = Number(betAmount) || 0;
                                    var maxIncrement = canCheck ? Math.min(plMaxBet, playerStack) : Math.min(plMaxRaiseIncrement, playerStack);
                                    var amt = Math.min(inputAmt, maxIncrement);
                                    if (amt > 0) addAction(canCheck ? 'bet' : 'raise', amt);
                                  }}>Confirm</button>
                                  <button className="btn btn-ghost btn-sm" onClick={function() {
                                    var container = document.querySelector('.content-area');
                                    if (container) {
                                      var savedTop = container.scrollTop;
                                      var lock = function() { container.scrollTop = savedTop; };
                                      container.addEventListener('scroll', lock);
                                      setTimeout(function() { container.removeEventListener('scroll', lock); }, 500);
                                    }
                                    setShowRaiseInput(false);
                                  }}>Cancel</button>
                                </div>
                              </React.Fragment>
                            )}
                          </>
                        ) : (
                          /* ── No Limit: original behavior ── */
                          <>
                            {!showRaiseInput && (
                              <div className="gto-action-row">
                                {!canCheck && <button className="gto-action-btn" onClick={function() { addAction('fold'); }}>
                                  <span className="gto-action-icon fold">✕</span>
                                  <span className="gto-action-label">Fold</span>
                                </button>}
                                {canCheck
                                  ? <button className="gto-action-btn" onClick={function() { addAction('check'); }}>
                                      <span className="gto-action-icon check">✓</span>
                                      <span className="gto-action-label">Check</span>
                                    </button>
                                  : <button className="gto-action-btn" onClick={function() { addAction('call', Math.min(callAmount, playerStack)); }}>
                                      <span className="gto-action-icon call">⬤</span>
                                      <span className="gto-action-label">Call {formatChipAmount(Math.min(callAmount, playerStack))}</span>
                                    </button>
                                }
                                <button className="gto-action-btn" onClick={function() {
                                  var container = document.querySelector('.content-area');
                                  if (container) {
                                    var savedTop = container.scrollTop;
                                    var lock = function() { container.scrollTop = savedTop; };
                                    container.addEventListener('scroll', lock);
                                    setTimeout(function() { container.removeEventListener('scroll', lock); }, 500);
                                  }
                                  setShowRaiseInput(true);
                                  setBetAmount(String(canCheck ? ((hand.blinds || {}).bb || 0) : Math.min(minRaiseIncrement, playerStack)));
                                }}>
                                  <span className="gto-action-icon raise">▲</span>
                                  <span className="gto-action-label">{canCheck ? 'Bet' : 'Raise'}</span>
                                </button>
                                <button className="gto-action-btn" onClick={function() { addAction(canCheck ? 'bet' : 'raise', playerStack); }}>
                                  <span className="gto-action-icon allin">★</span>
                                  <span className="gto-action-label">All-in</span>
                                </button>
                              </div>
                            )}
                            {showRaiseInput && (
                              <React.Fragment>
                                <div className="gto-sizing-row">
                                  {[{label:'Min',mult:0},{label:'1/3',mult:1/3},{label:'1/2',mult:1/2},{label:'2/3',mult:2/3},{label:'Pot',mult:1}].map(function(s) {
                                    var pillAmt;
                                    if (canCheck) {
                                      // Opening bet: fraction of current pot, min = BB
                                      pillAmt = s.mult === 0 ? Math.min((hand.blinds || {}).bb || 0, playerStack) : Math.min(Math.round(currentPot * s.mult), playerStack);
                                    } else {
                                      // Facing a bet: "X pot" means raise by X * pot-after-calling
                                      // The increment = call + raise_size, where raise_size = fraction * (pot + call)
                                      if (s.mult === 0) {
                                        pillAmt = Math.min(minRaiseIncrement, playerStack);
                                      } else {
                                        var potAfterCall = currentPot + callAmount;
                                        var raiseSize = Math.round(potAfterCall * s.mult);
                                        pillAmt = Math.min(callAmount + raiseSize, playerStack);
                                      }
                                    }
                                    return <button key={s.label} className="gto-sizing-pill" onClick={function() { setBetAmount(String(pillAmt)); }}>{s.label}</button>;
                                  })}
                                  <button className="gto-sizing-pill" onClick={function() { setBetAmount(String(playerStack)); }}>All-In</button>
                                </div>
                                <div className="gto-raise-slider-row">
                                  <input type="range" className="gto-raise-slider" min={canCheck ? Math.min((hand.blinds || {}).bb || 0, playerStack) : Math.min(minRaiseIncrement, playerStack)} max={playerStack} step={1} value={Number(betAmount) || 0} onChange={function(e) { setBetAmount(e.target.value); }} />
                                </div>
                                <div className="gto-raise-input-row">
                                  <input type="text" inputMode="decimal" value={betAmount} onChange={function(e) { setBetAmount(e.target.value); }} autoFocus />
                                  <button className="btn btn-primary btn-sm" onClick={function() { var amt = Math.min(Number(betAmount) || 0, playerStack); if (amt > 0) addAction(canCheck ? 'bet' : 'raise', amt); }}>Confirm</button>
                                  <button className="btn btn-ghost btn-sm" onClick={function() {
                                    var container = document.querySelector('.content-area');
                                    if (container) {
                                      var savedTop = container.scrollTop;
                                      var lock = function() { container.scrollTop = savedTop; };
                                      container.addEventListener('scroll', lock);
                                      setTimeout(function() { container.removeEventListener('scroll', lock); }, 500);
                                    }
                                    setShowRaiseInput(false);
                                  }}>Cancel</button>
                                </div>
                              </React.Fragment>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Fixed footer — portalled to body so it's truly pinned above the tab bar */}
          {ReactDOM.createPortal(
            <div className="gto-sticky-footer">
              <div className="gto-street-card">
                <div style={{display:'flex',gap:'6px',justifyContent:'space-between',alignItems:'center',padding:'10px 12px'}}>
                  <button className="gto-undo-btn" onClick={undoLastAction}>Undo</button>
                  <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel Hand</button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      );
    }

    // ── Main Hand Replayer View ──
    function HandReplayerView({ token, heroName, cardSplay, initialHand, onClearInitialHand }) {
      const [mode, setMode] = useState(initialHand ? 'replay' : 'list'); // 'list' | 'entry' | 'replay'
      const [entryMode, setEntryMode] = useState('gto'); // 'gto' | 'classic'
      const [savedHands, setSavedHands] = useState([]);
      const [currentHand, setCurrentHand] = useState(initialHand || null);
      const [currentHandId, setCurrentHandId] = useState(null);
      const [selectedGameType, setSelectedGameType] = useState('NLH');
      const [title, setTitle] = useState('');
      const [notes, setNotes] = useState('');
      const [isPublic, setIsPublic] = useState(false);
      const [loading, setLoading] = useState(false);
      // Custom game config
      const [customGameName, setCustomGameName] = useState('');
      const [customHeroCards, setCustomHeroCards] = useState(2);
      const [customCategory, setCustomCategory] = useState('community'); // community | stud | draw_triple | draw_single
      const [customStreetNames, setCustomStreetNames] = useState('');
      const [bettingStructure, setBettingStructure] = useState('No Limit');
      const [selectedGame, setSelectedGame] = useState("Hold'em");

      const variantDisplayName = useMemo(() => {
        const overrides = {
          "Pot Limit|Omaha 8/b": 'PLO8', "Pot Limit|Omaha": 'Pot Limit Omaha', "Pot Limit|Big O": 'Big O',
          "No Limit|Omaha": 'No Limit Omaha', "No Limit|Omaha 8/b": 'No Limit Omaha 8/b', "No Limit|Big O": 'No Limit Big O',
          "Limit|Omaha": 'Limit Omaha Hi', "Limit|Omaha 8/b": 'O8', "Limit|Big O": 'Limit Big O',
        };
        var key = bettingStructure + '|' + selectedGame;
        if (overrides[key]) return overrides[key];
        var typicallyLimit = ['Stud Hi', 'Stud 8', 'Razz', '2-7 Triple Draw', 'A-5 Triple Draw', 'Badugi', 'Badeucy', 'Badacey', 'Archie', 'Ari'];
        if (typicallyLimit.indexOf(selectedGame) >= 0 && bettingStructure === 'Limit') return selectedGame;
        return bettingStructure + ' ' + selectedGame;
      }, [bettingStructure, selectedGame]);

      var _nlPlStudTypes = ['NL Stud Hi', 'NL Stud 8', 'NL Razz', 'PL Stud Hi', 'PL Stud 8', 'PL Razz'];
      const gameTypes = Object.keys(HAND_CONFIG).filter(k => k !== 'OFC Pineapple' && k !== 'OFC' && _nlPlStudTypes.indexOf(k) < 0);

      const fetchHands = async () => {
        if (!token) return;
        try {
          const res = await fetch(`${API_URL}/hands`, {
            headers: { Authorization: 'Bearer ' + token }
          });
          if (res.ok) setSavedHands(await res.json());
        } catch (e) { console.error('Failed to load hands:', e); }
      };

      useEffect(() => { fetchHands(); }, [token]);

      // Handle initialHand prop changes (e.g., from hashchange events)
      useEffect(() => {
        if (initialHand) {
          setCurrentHand(initialHand);
          setMode('replay');
          setTitle('');
          setNotes('');
          // Clear the prop so going Back works normally
          if (onClearInitialHand) onClearInitialHand();
        }
      }, [initialHand]);

      // Game selection config
      var structureGameMap = {
        'No Limit':  { "Hold'em": 'NLH', 'Pineapple': 'NLH', 'Short Deck': 'NLH', 'Omaha': 'PLO', 'Omaha 8/b': 'PLO8', 'Big O': 'Big O', 'Stud Hi': 'NL Stud Hi', 'Stud 8': 'NL Stud 8', 'Razz': 'NL Razz', '2-7 Triple Draw': '2-7 TD', '2-7 Single Draw': 'NL 2-7 SD', 'A-5 Triple Draw': 'A-5 TD', 'A-5 Single Draw': 'A-5 TD', 'Badugi': 'Badugi', 'Badeucy': 'Badeucy', 'Badacey': 'Badacy', 'Archie': 'Badugi', 'Ari': 'Badugi', '5-Card Draw': 'PL 5CD Hi', 'OFC': 'OFC' },
        'Pot Limit': { "Hold'em": 'PLH', 'Pineapple': 'PLH', 'Short Deck': 'PLH', 'Omaha': 'PLO', 'Omaha 8/b': 'PLO8', 'Big O': 'Big O', 'Stud Hi': 'PL Stud Hi', 'Stud 8': 'PL Stud 8', 'Razz': 'PL Razz', '2-7 Triple Draw': 'PL 2-7 TD', '2-7 Single Draw': 'NL 2-7 SD', 'A-5 Triple Draw': 'A-5 TD', 'A-5 Single Draw': 'A-5 TD', 'Badugi': 'Badugi', 'Badeucy': 'Badeucy', 'Badacey': 'Badacy', 'Archie': 'Badugi', 'Ari': 'Badugi', '5-Card Draw': 'PL 5CD Hi', 'OFC': 'OFC' },
        'Limit':     { "Hold'em": 'LHE', 'Pineapple': 'LHE', 'Short Deck': 'LHE', 'Omaha': 'O8', 'Omaha 8/b': 'O8', 'Big O': 'Big O', 'Stud Hi': 'Stud Hi', 'Stud 8': 'Stud 8', 'Razz': 'Razz', '2-7 Triple Draw': '2-7 TD', '2-7 Single Draw': 'NL 2-7 SD', 'A-5 Triple Draw': 'A-5 TD', 'A-5 Single Draw': 'A-5 TD', 'Badugi': 'Badugi', 'Badeucy': 'Badeucy', 'Badacey': 'Badacy', 'Archie': 'Badugi', 'Ari': 'Badugi', '5-Card Draw': 'PL 5CD Hi', 'OFC': 'OFC' },
      };
      var defaultStructure = {
        "Hold'em": 'No Limit', 'Pineapple': 'No Limit', 'Short Deck': 'No Limit',
        'Omaha': 'Pot Limit', 'Omaha 8/b': 'Pot Limit', 'Big O': 'Pot Limit',
        'Stud Hi': 'Limit', 'Stud 8': 'Limit', 'Razz': 'Limit',
        '2-7 Triple Draw': 'Limit', '2-7 Single Draw': 'No Limit',
        'A-5 Triple Draw': 'Limit', 'A-5 Single Draw': 'No Limit',
        'Badugi': 'Limit', 'Badeucy': 'Limit', 'Badacey': 'Limit',
        'Archie': 'Limit', 'Ari': 'Limit', '5-Card Draw': 'No Limit',
        'OFC': 'No Limit',
      };
      var handleGameSelect = function(game) {
        setSelectedGame(game);
        if (defaultStructure[game]) setBettingStructure(defaultStructure[game]);
        var map = structureGameMap[defaultStructure[game] || 'No Limit'];
        if (map && map[game]) setSelectedGameType(map[game]);
      };
      var gameGroups = [
        { label: "Hold'em", games: ["Hold'em", 'Pineapple', 'Short Deck'] },
        { label: 'Omaha', games: ['Omaha', 'Omaha 8/b', 'Big O'] },
        { label: 'Stud', games: ['Stud Hi', 'Stud 8', 'Razz'] },
        { label: 'Draw', games: ['2-7 Triple Draw', '2-7 Single Draw', 'A-5 Triple Draw', 'A-5 Single Draw', 'Badugi', 'Badeucy', 'Badacey', 'Archie', 'Ari', '5-Card Draw'] },
        { label: 'Chinese', games: ['OFC'] },
      ];
      var handleStructureChange = function(s) {
        setBettingStructure(s);
        var map = structureGameMap[s];
        if (map && map[selectedGame]) setSelectedGameType(map[selectedGame]);
      };

      const startNewHand = () => {
        if (selectedGameType === 'Custom') {
          const gameName = customGameName.trim() || 'Custom';
          const heroCards = Math.max(1, Math.min(13, customHeroCards));
          const cat = customCategory;
          const hasBoard = cat === 'community';
          const isStud = cat === 'stud';
          // Register custom config at runtime
          HAND_CONFIG[gameName] = { heroCards, hasBoard, boardMax: hasBoard ? 5 : 0, isStud, heroPlaceholder: '' };
          // Custom street names
          let streetNames;
          if (customStreetNames.trim()) {
            streetNames = customStreetNames.split(',').map(s => s.trim()).filter(Boolean);
          } else {
            const def = STREET_DEFS[cat] || STREET_DEFS.community;
            streetNames = def.streets;
          }
          // Register custom street def
          if (!STREET_DEFS['custom_' + gameName]) {
            const boardCards = streetNames.map((_, i) => {
              if (!hasBoard) return 0;
              if (i === 0) return 0;
              if (i === 1) return 3;
              return 1;
            });
            STREET_DEFS['custom_' + gameName] = { streets: streetNames, boardCards };
          }
          // Patch getGameCategory and getStreetDef for this game
          const origGetCat = getGameCategory;
          const origGetDef = getStreetDef;
          // Temporarily override — these are stable since the config is now in HAND_CONFIG
          const customDef = STREET_DEFS['custom_' + gameName];
          const hand = {
            gameType: gameName,
            customConfig: { heroCards, category: cat, streetNames: customDef.streets, hasBoard, isStud },
            players: [
              { name: 'Hero', position: 'BTN', startingStack: 50000 },
              { name: 'Opp 1', position: 'BB', startingStack: 50000 },
            ],
            blinds: { sb: 100, bb: 200, ante: (hasBoard && !isStud) ? 200 : 0 },
            streets: customDef.streets.map(name => ({
              name,
              cards: { hero: '', opponents: [''], board: '' },
              actions: [],
              draws: [],
            })),
            result: null,
          };
          setCurrentHand(hand);
        } else {
          setCurrentHand(createEmptyHand(selectedGameType, heroName));
        }
        setCurrentHandId(null);
        setTitle('');
        setNotes('');
        setIsPublic(false);
        setMode('entry');
      };

      const loadHand = async (handId) => {
        try {
          const res = await fetch(`${API_URL}/hands/${handId}`, {
            headers: { Authorization: 'Bearer ' + token }
          });
          if (res.ok) {
            const data = await res.json();
            const handData = typeof data.hand_data === 'string' ? JSON.parse(data.hand_data) : data.hand_data;
            // Restore custom game config if needed
            if (handData.gameType && !HAND_CONFIG[handData.gameType]) {
              const cc = handData.customConfig;
              if (cc) {
                HAND_CONFIG[handData.gameType] = {
                  heroCards: cc.heroCards || 2,
                  hasBoard: !!cc.hasBoard,
                  boardMax: cc.hasBoard ? 5 : 0,
                  isStud: !!cc.isStud,
                  heroPlaceholder: '',
                };
                STREET_DEFS['custom_' + handData.gameType] = {
                  streets: cc.streetNames || handData.streets.map(s => s.name),
                  boardCards: (cc.streetNames || handData.streets.map(s => s.name)).map((_, i) => {
                    if (!cc.hasBoard) return 0;
                    if (i === 0) return 0;
                    if (i === 1) return 3;
                    return 1;
                  }),
                };
              } else {
                // Fallback: infer from hand data
                const streets = handData.streets || [];
                const hasBoard = streets.some(s => s.cards?.board);
                HAND_CONFIG[handData.gameType] = { heroCards: 2, hasBoard, boardMax: hasBoard ? 5 : 0, isStud: false, heroPlaceholder: '' };
                STREET_DEFS['custom_' + handData.gameType] = {
                  streets: streets.map(s => s.name),
                  boardCards: streets.map((_, i) => !hasBoard ? 0 : i === 0 ? 0 : i === 1 ? 3 : 1),
                };
              }
            }
            setCurrentHand(handData);
            setCurrentHandId(data.id);
            setTitle(data.title || '');
            setNotes(data.notes || '');
            setIsPublic(!!data.is_public);
            setMode('replay');
          }
        } catch (e) { console.error('Failed to load hand:', e); }
      };

      const saveHand = async (hand) => {
        if (!token) return;
        setLoading(true);
        try {
          const payload = {
            handData: hand,
            gameType: hand.gameType,
            title: title || (hand.gameType + ' Hand'),
            notes,
            isPublic,
          };
          let res;
          if (currentHandId) {
            res = await fetch(`${API_URL}/hands/${currentHandId}`, {
              method: 'PUT',
              headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          } else {
            res = await fetch(`${API_URL}/hands`, {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (res.ok) {
              const data = await res.json();
              setCurrentHandId(data.id);
            }
          }
          fetchHands();
        } catch (e) { console.error('Failed to save hand:', e); }
        setLoading(false);
      };

      const deleteHand = async (handId) => {
        if (!token) return;
        try {
          await fetch(`${API_URL}/hands/${handId}`, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + token },
          });
          fetchHands();
        } catch (e) { console.error('Failed to delete hand:', e); }
      };

      const handleEntryDone = (hand) => {
        setCurrentHand(hand);
        saveHand(hand);
        setMode('replay');
      };

      // Game type pill layout
      const renderGamePills = () => {
        const groups = [
          { label: 'Community', games: ['NLH', 'LHE', 'PLH', 'PLO', 'PLO8', 'O8', 'Big O', 'LO Hi'] },
          { label: 'Draw', games: ['2-7 TD', 'NL 2-7 SD', 'PL 2-7 TD', 'L 2-7 TD', 'A-5 TD', 'Badugi', 'Badeucy', 'Badacy', 'PL 5CD Hi'] },
          { label: 'Stud', games: ['Razz', 'Stud Hi', 'Stud 8', 'Stud Hi-Lo', '2-7 Razz'] },
          { label: 'Chinese', games: ['OFC'] },
        ];
        return React.createElement(React.Fragment, null,
          groups.map(g => (
            <div key={g.label} style={{marginBottom:'6px'}}>
              <div style={{fontSize:'0.55rem',color:'var(--text-muted)',fontFamily:"'Univers Condensed','Univers',sans-serif",textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'3px'}}>{g.label}</div>
              <div className="hand-game-pill-row" style={{flexWrap:'wrap'}}>
                {g.games.map(game => (
                  <button key={game} className={selectedGameType === game ? 'active' : ''} onClick={() => setSelectedGameType(game)}>{game}</button>
                ))}
              </div>
            </div>
          )),
          <div key="custom" style={{marginBottom:'6px'}}>
            <div style={{fontSize:'0.55rem',color:'var(--text-muted)',fontFamily:"'Univers Condensed','Univers',sans-serif",textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'3px'}}>Custom</div>
            <div className="hand-game-pill-row" style={{flexWrap:'wrap'}}>
              <button className={selectedGameType === 'Custom' ? 'active' : ''} onClick={() => setSelectedGameType('Custom')}>Custom Game</button>
            </div>
          </div>
        );
      };

      if (mode === 'entry' && currentHand) {
        return (
          <div className="replayer-view">
            <div className="gto-sticky-header" ref={node => { if (node) node._gtoStickyNode = node; }}>
              <div className="replayer-header">
                <h2>New Hand</h2>
              </div>
              {currentHand.gameType !== 'OFC' && <div className="live-update-tabs" style={{marginBottom:'8px'}}>
                <button className={entryMode === 'gto' ? 'active' : ''} onClick={() => setEntryMode('gto')}>GTO Style</button>
                <button className={entryMode === 'classic' ? 'active' : ''} onClick={() => setEntryMode('classic')}>Classic</button>
              </div>}
              <div className="replayer-row" style={{marginBottom:'8px'}}>
                <div className="replayer-field">
                  <label>Title</label>
                  <input type="text" placeholder="e.g. Huge pot with AA" value={title} onChange={e => setTitle(e.target.value)} />
                </div>
              </div>
              <div id="gto-sticky-slot"></div>
            </div>
            {(entryMode === 'gto' || currentHand.gameType === 'OFC') ? (
              <GTOEntryView
                hand={currentHand}
                setHand={setCurrentHand}
                onDone={handleEntryDone}
                onCancel={() => setMode('list')}
                heroName={heroName}
              />
            ) : (
              <HandReplayerEntry
                hand={currentHand}
                setHand={setCurrentHand}
                onDone={handleEntryDone}
                onCancel={() => setMode('list')}
              />
            )}
          </div>
        );
      }

      if (mode === 'replay' && currentHand) {
        return (
          <div className="replayer-view">
            <div className="replayer-header">
              <h2>{title || currentHand.gameType + ' Hand'}</h2>
              <span className="replayer-hand-card-game">{currentHand.gameType + (currentHand.blinds ? ' ' + formatChipAmount(currentHand.blinds.sb) + '/' + formatChipAmount(currentHand.blinds.bb) + (currentHand.blinds.ante ? '/' + formatChipAmount(currentHand.blinds.ante) : '') : '')}</span>
            </div>
            {notes && <div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginBottom:'8px'}}>{notes}</div>}
            <HandReplayerReplay
              hand={currentHand}
              onEdit={() => setMode('entry')}
              onBack={() => { setMode('list'); fetchHands(); }}
              cardSplay={cardSplay}
            />
          </div>
        );
      }

      // List mode
      return (
        <div className="replayer-view">
          <div className="replayer-header">
            <h2>Hand Replayer</h2>
          </div>

          {/* New hand creation */}
          <div className="replayer-section" style={{marginBottom:'12px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
              <div className="replayer-section-title">New Hand</div>
              <span style={{fontSize:'0.7rem',color:'var(--accent2)',fontFamily:"'Univers Condensed','Univers',sans-serif",fontWeight:600}}>{variantDisplayName}</span>
            </div>
            {/* Quick pills */}
            {[
              [{label:'NLH',struct:'No Limit',game:"Hold'em"},{label:'LHE',struct:'Limit',game:"Hold'em"}],
              [{label:'PLO',struct:'Pot Limit',game:'Omaha'},{label:'O8',struct:'Limit',game:'Omaha 8/b'},{label:'PLO8',struct:'Pot Limit',game:'Omaha 8/b'},{label:'Big O',struct:'Pot Limit',game:'Big O'}],
              [{label:'Stud Hi',struct:'Limit',game:'Stud Hi'},{label:'Stud 8',struct:'Limit',game:'Stud 8'},{label:'Razz',struct:'Limit',game:'Razz'}],
              [{label:'2-7 TD',struct:'Limit',game:'2-7 Triple Draw'},{label:'NL 2-7 SD',struct:'No Limit',game:'2-7 Single Draw'},{label:'Badugi',struct:'Limit',game:'Badugi'}],
            ].map((row, i) => (
              <div key={i} className="hand-game-pill-row" style={{marginBottom:'4px'}}>
                {row.map(q => (
                  <button key={q.label}
                    className={selectedGame === q.game && bettingStructure === q.struct ? 'active' : ''}
                    onClick={() => { setBettingStructure(q.struct); setSelectedGame(q.game); handleStructureChange(q.struct); setSelectedGame(q.game); var m = structureGameMap[q.struct]; if (m && m[q.game]) setSelectedGameType(m[q.game]); }}
                  >{q.label}</button>
                ))}
              </div>
            ))}
            {/* Full game selection */}
            <div style={{display:'flex',flexDirection:'column',gap:'8px',marginTop:'8px'}}>
              {gameGroups.map(g => (
                <div key={g.label}>
                  <div style={{fontSize:'0.55rem',color:'var(--text-muted)',fontFamily:"'Univers Condensed','Univers',sans-serif",textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'4px'}}>{g.label}</div>
                  <div className="hand-game-pill-row" style={{flexWrap:'wrap'}}>
                    {g.games.map(game => (
                      <button key={game} className={selectedGame === game ? 'active' : ''} onClick={() => handleGameSelect(game)}>{game}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <div style={{fontSize:'0.55rem',color:'var(--text-muted)',fontFamily:"'Univers Condensed','Univers',sans-serif",textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'4px'}}>Betting Structure</div>
                <div className="hand-game-pill-row">
                  {['No Limit', 'Pot Limit', 'Limit'].map(s => (
                    <button key={s} className={bettingStructure === s ? 'active' : ''} onClick={() => handleStructureChange(s)}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:'10px'}}>
              <button className="btn btn-primary btn-sm" onClick={startNewHand}>
                Create {variantDisplayName} Hand
              </button>
            </div>
          </div>

          {/* Saved hands list */}
          <div className="replayer-section-title" style={{marginBottom:'6px'}}>Saved Hands</div>
          {savedHands.length === 0 ? (
            <div className="replayer-empty">No saved hands yet. Create one above.</div>
          ) : (
            <div className="replayer-hand-list">
              {savedHands.map(h => (
                <div key={h.id} className="replayer-hand-card" onClick={() => loadHand(h.id)}>
                  <div className="replayer-hand-card-top">
                    <span className="replayer-hand-card-title">{h.title || 'Untitled'}</span>
                    <span className="replayer-hand-card-game">{h.game_type}</span>
                  </div>
                  {h.notes && <div className="replayer-hand-card-meta">{h.notes}</div>}
                  <div className="replayer-hand-card-meta">
                    {new Date(h.created_at).toLocaleDateString()}
                    {h.is_public ? ' \u00b7 Public' : ''}
                  </div>
                  <div className="replayer-hand-card-actions" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" style={{padding:'3px 8px',fontSize:'0.65rem'}}
                      onClick={() => deleteHand(h.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }


    window.REPLAYER_CARD_BACKS = REPLAYER_CARD_BACKS;
    window.REPLAYER_TABLE_SHAPES = REPLAYER_TABLE_SHAPES;
    window.useReplayerSetting = useReplayerSetting;
    window.generateCommentary = generateCommentary;
    window.calcHandStrength = calcHandStrength;
    window.getStrengthColor = getStrengthColor;
    window.calcSPR = calcSPR;
    window.getBetSizingLabel = getBetSizingLabel;
    window.estimateRange = estimateRange;
    window.calcShowdownEquity = calcShowdownEquity;
    window.getStreetColorClass = getStreetColorClass;
    window.calcPotBeforeAction = calcPotBeforeAction;
    window.PotChipVisual = PotChipVisual;
    window.PLAYER_STATS_DATA = PLAYER_STATS_DATA;
    window.getPlayerStats = getPlayerStats;
    window.ReplayerSettingsPanel = ReplayerSettingsPanel;
    window.HandReplayerReplay = HandReplayerReplay;
    window.GTOEntryView = GTOEntryView;
    window.HandReplayerView = HandReplayerView;

    window.CHIP_DENOMS = CHIP_DENOMS;
    window.ChipStack = ChipStack;
    window.DEFAULT_OPP_NAMES = DEFAULT_OPP_NAMES;
    window.HandReplayerEntry = HandReplayerEntry;
    window.REPLAYER_THEMES = REPLAYER_THEMES;
    window.calcPotsAndStacks = calcPotsAndStacks;
    window.createEmptyHand = createEmptyHand;
    window.formatChipAmount = formatChipAmount;
    window.getActionOrder = getActionOrder;
    window.getChipBreakdown = getChipBreakdown;
    window.getGameCategory = getGameCategory;
    window.getPositionLabels = getPositionLabels;
    window.getStreetDef = getStreetDef;
