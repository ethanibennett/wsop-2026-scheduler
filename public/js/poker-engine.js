    const CARD_RANKS = new Set('AKQJT98765432'.split(''));
    const CARD_SUITS = new Set('hdcsx'.split(''));
    function parseCardNotation(str) {
      if (!str) return [];
      const ranks = [], suits = [];
      for (const ch of str) {
        if (CARD_RANKS.has(ch.toUpperCase())) ranks.push(ch.toUpperCase());
        else if (CARD_SUITS.has(ch.toLowerCase())) suits.push(ch.toLowerCase());
      }
      return ranks.map((r, i) => ({ rank: r, suit: suits[i] || 'x' }));
    }

    // Convert grouped notation (AKhd) to interleaved (AhKd)
    function interleaveNotation(str) {
      const cards = parseCardNotation(str);
      return cards.map(c => c.rank + c.suit).join('');
    }
    function dualPlaceholder(str) {
      const alt = interleaveNotation(str);
      return str === alt ? str : alt + ' or ' + str;
    }

    // ── Poker Hand Evaluation Engine ──────────────────────────
    const RANK_VAL = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };
    const RANK_NAME = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'T',11:'J',12:'Q',13:'K',14:'A' };
    const RANK_WORD = { 14:'Ace',13:'King',12:'Queen',11:'Jack',10:'Ten',9:'Nine',8:'Eight',7:'Seven',6:'Six',5:'Five',4:'Four',3:'Three',2:'Two' };
    const RANK_SHORT = { 14:'A',13:'K',12:'Q',11:'J',10:'10',9:'9',8:'8',7:'7',6:'6',5:'5',4:'4',3:'3',2:'2' };
    const rankPlural = v => { const w = RANK_WORD[v]; return w.endsWith('x') ? w + 'es' : w + 's'; };
    const rankShortPlural = v => RANK_SHORT[v] + 's';

    function combinations(arr, k) {
      const res = [];
      (function go(s, c) {
        if (c.length === k) { res.push([...c]); return; }
        for (let i = s; i <= arr.length - (k - c.length); i++) { c.push(arr[i]); go(i + 1, c); c.pop(); }
      })(0, []);
      return res;
    }

    // Score a 5-card high hand. Returns { cat, score, name }
    function evalHigh5(cards) {
      const vals = cards.map(c => RANK_VAL[c.rank]).sort((a, b) => b - a);
      const suits = cards.map(c => c.suit);
      const isFlush = suits.every(s => s === suits[0]);
      // Straight detection
      let isStraight = false, straightHigh = 0;
      if (vals[0] - vals[4] === 4 && new Set(vals).size === 5) { isStraight = true; straightHigh = vals[0]; }
      // Wheel: A-2-3-4-5
      if (!isStraight && vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) {
        isStraight = true; straightHigh = 5;
      }
      // Frequency counts
      const freq = {};
      vals.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
      const groups = Object.entries(freq).map(([v, c]) => [c, +v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
      const P = 15;
      let cat, kickers, name;

      let shortName;
      if (isStraight && isFlush) {
        cat = 9; kickers = [straightHigh, 0, 0, 0, 0];
        name = straightHigh === 14 ? 'Royal Flush' : 'Straight Flush, ' + RANK_WORD[straightHigh] + '-high';
        shortName = straightHigh === 14 ? 'Royal Flush' : 'Str. Flush, ' + RANK_SHORT[straightHigh] + '-high';
      } else if (groups[0][0] === 4) {
        cat = 8; kickers = [groups[0][1], groups[1][1], 0, 0, 0];
        name = 'Four of a Kind, ' + rankPlural(groups[0][1]);
        shortName = 'Quad ' + rankShortPlural(groups[0][1]);
      } else if (groups[0][0] === 3 && groups[1][0] === 2) {
        cat = 7; kickers = [groups[0][1], groups[1][1], 0, 0, 0];
        name = rankPlural(groups[0][1]) + ' full of ' + rankPlural(groups[1][1]);
        shortName = rankShortPlural(groups[0][1]) + ' full of ' + rankShortPlural(groups[1][1]);
      } else if (isFlush) {
        cat = 6; kickers = vals;
        name = 'Flush, ' + RANK_WORD[vals[0]] + '-high';
        shortName = 'Flush, ' + RANK_SHORT[vals[0]] + '-high';
      } else if (isStraight) {
        cat = 5; kickers = [straightHigh, 0, 0, 0, 0];
        name = straightHigh === 5 ? 'Wheel' : 'Straight, ' + RANK_WORD[straightHigh] + '-high';
        shortName = straightHigh === 5 ? 'Wheel' : 'Straight, ' + RANK_SHORT[straightHigh] + '-high';
      } else if (groups[0][0] === 3) {
        cat = 4; const rest = vals.filter(v => v !== groups[0][1]);
        kickers = [groups[0][1], rest[0], rest[1], 0, 0];
        name = 'Three ' + rankPlural(groups[0][1]);
        shortName = 'Trip ' + rankShortPlural(groups[0][1]);
      } else if (groups[0][0] === 2 && groups[1][0] === 2) {
        cat = 3; const kick = vals.find(v => v !== groups[0][1] && v !== groups[1][1]);
        kickers = [groups[0][1], groups[1][1], kick, 0, 0];
        name = 'Two Pair, ' + rankPlural(groups[0][1]) + ' and ' + rankPlural(groups[1][1]);
        shortName = 'Two Pair, ' + rankShortPlural(groups[0][1]) + ' & ' + rankShortPlural(groups[1][1]);
      } else if (groups[0][0] === 2) {
        cat = 2; const rest = vals.filter(v => v !== groups[0][1]);
        kickers = [groups[0][1], rest[0], rest[1], rest[2], 0];
        name = 'Pair of ' + rankPlural(groups[0][1]);
        shortName = 'Pair of ' + rankShortPlural(groups[0][1]);
      } else {
        cat = 1; kickers = vals;
        name = RANK_WORD[vals[0]] + '-high';
        shortName = RANK_SHORT[vals[0]] + '-high';
      }
      const score = cat * Math.pow(P, 5) + kickers[0] * Math.pow(P, 4) + kickers[1] * Math.pow(P, 3) + kickers[2] * Math.pow(P, 2) + kickers[3] * P + (kickers[4] || 0);
      return { cat, score, name, shortName };
    }

    // A-5 lowball: aces low, straights/flushes ignored. Lower score = better.
    function evalLowA5(cards, eightOrBetter) {
      const vals = cards.map(c => RANK_VAL[c.rank] === 14 ? 1 : RANK_VAL[c.rank]).sort((a, b) => b - a);
      // Check for pairs — paired hands don't qualify as low
      if (new Set(vals).size < 5) return { score: Infinity, name: null, qualified: false };
      if (eightOrBetter && vals[0] > 8) return { score: Infinity, name: null, qualified: false };
      const P = 15;
      const score = vals[0] * Math.pow(P, 4) + vals[1] * Math.pow(P, 3) + vals[2] * Math.pow(P, 2) + vals[3] * P + vals[4];
      const dispRank = v => v === 1 ? 'A' : RANK_NAME[v];
      const name = vals.map(dispRank).join('-') + ' low';
      return { score, name, qualified: true };
    }

    // 2-7 lowball: aces high, straights/flushes count against. Lower score = better.
    function evalLow27(cards) {
      const vals = cards.map(c => RANK_VAL[c.rank]).sort((a, b) => b - a);
      const suits = cards.map(c => c.suit);
      const isFlush = suits.every(s => s === suits[0]);
      let isStraight = false;
      // In 2-7, aces are high (14), so A-5-4-3-2 is NOT a straight (no wheel)
      if (vals[0] - vals[4] === 4 && new Set(vals).size === 5) isStraight = true;
      // If flush, straight, or paired — treat as a high hand (very bad for low)
      if (isFlush || isStraight || new Set(vals).size < 5) {
        // Return a very high score — essentially the high hand score offset way up
        const hi = evalHigh5(cards);
        return { score: 1e9 + hi.score, name: hi.name + ' (bad low)' };
      }
      const P = 15;
      const score = vals[0] * Math.pow(P, 4) + vals[1] * Math.pow(P, 3) + vals[2] * Math.pow(P, 2) + vals[3] * P + vals[4];
      const name = vals.map(v => RANK_NAME[v]).join('-') + ' low';
      return { score, name };
    }

    // Badugi: want 4 different suits AND ranks, lower wins. More cards used > fewer.
    function evalBadugi(cards) {
      const tryN = (arr, n) => {
        const combos = n === arr.length ? [arr] : combinations(arr, n);
        let best = null;
        for (const combo of combos) {
          const suitSet = new Set(combo.map(c => c.suit));
          const rankSet = new Set(combo.map(c => c.rank));
          if (suitSet.size === n && rankSet.size === n) {
            // Valid n-card badugi — score by ranks ascending (lower = better), A=1
            const vals = combo.map(c => RANK_VAL[c.rank] === 14 ? 1 : RANK_VAL[c.rank]).sort((a, b) => a - b);
            const P = 15;
            let score = 0;
            for (let i = 0; i < vals.length; i++) score += vals[i] * Math.pow(P, n - 1 - i);
            if (!best || score < best.score) {
              const dispRank = v => v === 1 ? 'A' : RANK_NAME[v];
              best = { score, name: vals.map(dispRank).join('-') + (n === 4 ? ' Badugi' : ' (' + n + '-card)') };
            }
          }
        }
        return best;
      };
      for (let n = Math.min(cards.length, 4); n >= 1; n--) {
        const result = tryN(cards, n);
        if (result) {
          // Offset score so 4-card always beats 3-card etc.
          result.numCards = n;
          result.score = (5 - n) * 1e8 + result.score; // Lower is better; fewer cards = higher penalty
          return result;
        }
      }
      return { score: Infinity, numCards: 0, name: 'No Badugi' };
    }

    // Best-hand selectors
    function bestHighHand(cards) {
      if (cards.length === 5) return evalHigh5(cards);
      if (cards.length < 5) return null;
      let best = null;
      for (const c of combinations(cards, 5)) { const ev = evalHigh5(c); if (!best || ev.score > best.score) best = ev; }
      return best;
    }
    function bestOmahaHigh(hole, board) {
      if (hole.length < 2 || board.length < 3) return null;
      let best = null;
      for (const h2 of combinations(hole, 2)) for (const b3 of combinations(board, 3)) {
        const ev = evalHigh5([...h2, ...b3]);
        if (!best || ev.score > best.score) best = ev;
      }
      return best;
    }
    function bestOmahaLow(hole, board) {
      if (hole.length < 2 || board.length < 3) return null;
      let best = null;
      for (const h2 of combinations(hole, 2)) for (const b3 of combinations(board, 3)) {
        const ev = evalLowA5([...h2, ...b3], true);
        if (ev.qualified && (!best || ev.score < best.score)) best = ev;
      }
      return best;
    }
    function bestLowA5Hand(cards, eightOrBetter) {
      if (cards.length === 5) return evalLowA5(cards, eightOrBetter);
      if (cards.length < 5) return null;
      let best = null;
      for (const c of combinations(cards, 5)) { const ev = evalLowA5(c, eightOrBetter); if (ev.qualified && (!best || ev.score < best.score)) best = ev; }
      return best;
    }
    function bestLow27Hand(cards) {
      if (cards.length === 5) return evalLow27(cards);
      if (cards.length < 5) return null;
      let best = null;
      for (const c of combinations(cards, 5)) { const ev = evalLow27(c); if (!best || ev.score < best.score) best = ev; }
      return best;
    }
    function bestBadugiHand(cards) {
      if (cards.length <= 4) return evalBadugi(cards);
      // For 5-card hands (Badeucy/Badacy), try all C(5,4) subsets
      let best = null;
      for (const c of combinations(cards, 4)) { const ev = evalBadugi(c); if (!best || ev.score < best.score) best = ev; }
      return best;
    }

    // Evaluate a multi-way showdown. Returns array of { playerIdx, split } winners.
    // playerHands: [{ idx, cards: [{rank,suit},...] }], boardCards: [{rank,suit},...]
    function evaluateShowdown(gameType, playerHands, boardCards) {
      const cfg = GAME_EVAL[gameType];
      if (!cfg || playerHands.length === 0) return [];

      // Evaluate each player's best hand(s)
      var evals = playerHands.map(function(ph) {
        var cards = ph.cards;
        var all = boardCards.length ? cards.concat(boardCards) : cards;
        var hi = null, lo = null, bad = null;
        if (cfg.type === 'high' || cfg.type === 'hilo') {
          hi = cfg.method === 'omaha' ? bestOmahaHigh(cards, boardCards) : bestHighHand(all);
        }
        if (cfg.type === 'hilo') {
          lo = cfg.method === 'omaha' ? bestOmahaLow(cards, boardCards) : bestLowA5Hand(all, true);
        }
        if (cfg.type === 'low') {
          lo = cfg.lowType === 'a5' ? bestLowA5Hand(all, false) : bestLow27Hand(all);
        }
        if (cfg.type === 'badugi') {
          bad = bestBadugiHand(cards);
        }
        if (cfg.type === 'split-badugi') {
          bad = bestBadugiHand(cards);
          lo = cfg.otherLow === '27' ? bestLow27Hand(cards) : bestLowA5Hand(cards, false);
        }
        return { idx: ph.idx, hi: hi, lo: lo, bad: bad };
      });

      if (cfg.type === 'high') {
        var validHi = evals.filter(function(e) { return e.hi; });
        if (!validHi.length) return [];
        var bestScore = Math.max.apply(null, validHi.map(function(e) { return e.hi.score; }));
        var hiWinners = validHi.filter(function(e) { return e.hi.score === bestScore; });
        return hiWinners.map(function(e) { return { playerIdx: e.idx, split: hiWinners.length > 1 }; });
      }

      if (cfg.type === 'low') {
        var validLo = evals.filter(function(e) { return e.lo; });
        if (!validLo.length) return [];
        var bestLoScore = Math.min.apply(null, validLo.map(function(e) { return e.lo.score; }));
        var loWinners = validLo.filter(function(e) { return e.lo.score === bestLoScore; });
        return loWinners.map(function(e) { return { playerIdx: e.idx, split: loWinners.length > 1 }; });
      }

      if (cfg.type === 'badugi') {
        var validBad = evals.filter(function(e) { return e.bad; });
        if (!validBad.length) return [];
        var bestBadScore = Math.min.apply(null, validBad.map(function(e) { return e.bad.score; }));
        var badWinners = validBad.filter(function(e) { return e.bad.score === bestBadScore; });
        return badWinners.map(function(e) { return { playerIdx: e.idx, split: badWinners.length > 1 }; });
      }

      if (cfg.type === 'hilo') {
        var winners = [];
        // High half
        var vHi = evals.filter(function(e) { return e.hi; });
        if (vHi.length) {
          var bHi = Math.max.apply(null, vHi.map(function(e) { return e.hi.score; }));
          var hWin = vHi.filter(function(e) { return e.hi.score === bHi; });
          // Check if there's a qualifying low
          var vLo = evals.filter(function(e) { return e.lo && e.lo.qualified; });
          if (vLo.length === 0) {
            // No qualifying low — high scoops
            return hWin.map(function(e) { return { playerIdx: e.idx, split: hWin.length > 1 }; });
          }
          // High winners get half
          hWin.forEach(function(e) { winners.push({ playerIdx: e.idx, split: true }); });
          // Low winners get half
          var bLo = Math.min.apply(null, vLo.map(function(e) { return e.lo.score; }));
          var lWin = vLo.filter(function(e) { return e.lo.score === bLo; });
          lWin.forEach(function(e) {
            if (!winners.some(function(w) { return w.playerIdx === e.idx; })) {
              winners.push({ playerIdx: e.idx, split: true });
            }
          });
          // If same player wins both, they scoop
          if (winners.length === 1) winners[0].split = false;
        }
        return winners;
      }

      if (cfg.type === 'split-badugi') {
        var sbWinners = [];
        var vBad2 = evals.filter(function(e) { return e.bad; });
        var vLo2 = evals.filter(function(e) { return e.lo; });
        if (vBad2.length) {
          var bBad2 = Math.min.apply(null, vBad2.map(function(e) { return e.bad.score; }));
          vBad2.filter(function(e) { return e.bad.score === bBad2; }).forEach(function(e) {
            sbWinners.push({ playerIdx: e.idx, split: true });
          });
        }
        if (vLo2.length) {
          var bLo2 = Math.min.apply(null, vLo2.map(function(e) { return e.lo.score; }));
          vLo2.filter(function(e) { return e.lo.score === bLo2; }).forEach(function(e) {
            if (!sbWinners.some(function(w) { return w.playerIdx === e.idx; })) {
              sbWinners.push({ playerIdx: e.idx, split: true });
            }
          });
        }
        if (sbWinners.length === 1) sbWinners[0].split = false;
        return sbWinners;
      }

      return [];
    }

    // Game variant evaluation config
    const GAME_EVAL = {
      'NLH':{type:'high',method:'standard'},'LHE':{type:'high',method:'standard'},'PLH':{type:'high',method:'standard'},
      'Stud Hi':{type:'high',method:'standard'},'PL 5CD Hi':{type:'high',method:'standard'},
      'PLO':{type:'high',method:'omaha'},'LO Hi':{type:'high',method:'omaha'},
      'PLO8':{type:'hilo',method:'omaha'},'O8':{type:'hilo',method:'omaha'},'Big O':{type:'hilo',method:'omaha'},
      'Stud 8':{type:'hilo',method:'standard'},'Stud Hi-Lo':{type:'hilo',method:'standard'},
      'Razz':{type:'low',lowType:'a5'},'A-5 TD':{type:'low',lowType:'a5'},
      '2-7 TD':{type:'low',lowType:'27'},'PL 2-7 TD':{type:'low',lowType:'27'},'L 2-7 TD':{type:'low',lowType:'27'},
      'NL 2-7 SD':{type:'low',lowType:'27'},'2-7 Razz':{type:'low',lowType:'27'},
      'Badugi':{type:'badugi'},
      'Badeucy':{type:'split-badugi',otherLow:'27'},'Badacy':{type:'split-badugi',otherLow:'a5'},
      'OFC Pineapple':null
    };

    function evaluateHand(game, heroCards, opponentCards, boardCards) {
      const cfg = GAME_EVAL[game];
      if (!cfg) return null;

      const heroAll = boardCards.length ? [...heroCards, ...boardCards] : heroCards;
      const oppAll = boardCards.length ? [...opponentCards, ...boardCards] : opponentCards;
      let hHi = null, oHi = null, hLo = null, oLo = null, hBad = null, oBad = null;

      if (cfg.type === 'high' || cfg.type === 'hilo') {
        if (cfg.method === 'omaha') {
          hHi = bestOmahaHigh(heroCards, boardCards);
          oHi = bestOmahaHigh(opponentCards, boardCards);
        } else {
          hHi = bestHighHand(heroAll);
          oHi = bestHighHand(oppAll);
        }
      }
      if (cfg.type === 'hilo') {
        if (cfg.method === 'omaha') {
          hLo = bestOmahaLow(heroCards, boardCards);
          oLo = bestOmahaLow(opponentCards, boardCards);
        } else {
          hLo = bestLowA5Hand(heroAll, true);
          oLo = bestLowA5Hand(oppAll, true);
        }
      }
      if (cfg.type === 'low') {
        if (cfg.lowType === 'a5') { hLo = bestLowA5Hand(heroAll, false); oLo = bestLowA5Hand(oppAll, false); }
        else { hLo = bestLow27Hand(heroAll); oLo = bestLow27Hand(oppAll); }
      }
      if (cfg.type === 'badugi') {
        hBad = bestBadugiHand(heroCards); oBad = bestBadugiHand(opponentCards);
      }
      if (cfg.type === 'split-badugi') {
        hBad = bestBadugiHand(heroCards); oBad = bestBadugiHand(opponentCards);
        if (cfg.otherLow === '27') { hLo = bestLow27Hand(heroCards); oLo = bestLow27Hand(opponentCards); }
        else { hLo = bestLowA5Hand(heroCards, false); oLo = bestLowA5Hand(opponentCards, false); }
      }

      // Determine result
      if (cfg.type === 'high') {
        if (!hHi || !oHi) return null;
        if (hHi.score > oHi.score) return { result: { outcome:'hero', text:'Hero wins \u2014 ' + hHi.name, color:'green' }, heroHigh:hHi, opponentHigh:oHi };
        if (oHi.score > hHi.score) return { result: { outcome:'opponent', text:'Opp wins \u2014 ' + oHi.name, color:'red' }, heroHigh:hHi, opponentHigh:oHi };
        return { result: { outcome:'chop', text:'Chop \u2014 ' + hHi.name, color:'yellow' }, heroHigh:hHi, opponentHigh:oHi };
      }
      if (cfg.type === 'low') {
        if (!hLo || !oLo) return null;
        if (hLo.score < oLo.score) return { result: { outcome:'hero', text:'Hero wins \u2014 ' + hLo.name, color:'green' }, heroLow:hLo, opponentLow:oLo };
        if (oLo.score < hLo.score) return { result: { outcome:'opponent', text:'Opp wins \u2014 ' + oLo.name, color:'red' }, heroLow:hLo, opponentLow:oLo };
        return { result: { outcome:'chop', text:'Chop \u2014 ' + hLo.name, color:'yellow' }, heroLow:hLo, opponentLow:oLo };
      }
      if (cfg.type === 'badugi') {
        if (!hBad || !oBad) return null;
        if (hBad.score < oBad.score) return { result: { outcome:'hero', text:'Hero wins \u2014 ' + hBad.name, color:'green' }, heroBadugi:hBad, opponentBadugi:oBad };
        if (oBad.score < hBad.score) return { result: { outcome:'opponent', text:'Opp wins \u2014 ' + oBad.name, color:'red' }, heroBadugi:hBad, opponentBadugi:oBad };
        return { result: { outcome:'chop', text:'Chop \u2014 ' + hBad.name, color:'yellow' }, heroBadugi:hBad, opponentBadugi:oBad };
      }
      if (cfg.type === 'hilo') {
        if (!hHi || !oHi) return null;
        const highW = hHi.score > oHi.score ? 'hero' : oHi.score > hHi.score ? 'opponent' : 'chop';
        const anyLo = (hLo && hLo.qualified) || (oLo && oLo.qualified);
        if (!anyLo) {
          // No qualifying low — high hand scoops
          if (highW === 'hero') return { result: { outcome:'hero', text:'Hero wins \u2014 ' + hHi.name + ' (no qualifying low)', color:'green' }, heroHigh:hHi, opponentHigh:oHi };
          if (highW === 'opponent') return { result: { outcome:'opponent', text:'Opp wins \u2014 ' + oHi.name + ' (no qualifying low)', color:'red' }, heroHigh:hHi, opponentHigh:oHi };
          return { result: { outcome:'chop', text:'Chop \u2014 ' + hHi.name + ' (no qualifying low)', color:'yellow' }, heroHigh:hHi, opponentHigh:oHi };
        }
        let lowW = 'chop';
        if (hLo && oLo && hLo.qualified && oLo.qualified) lowW = hLo.score < oLo.score ? 'hero' : oLo.score < hLo.score ? 'opponent' : 'chop';
        else if (hLo && hLo.qualified) lowW = 'hero';
        else if (oLo && oLo.qualified) lowW = 'opponent';
        if (highW === lowW) {
          const who = highW === 'hero' ? 'Hero' : highW === 'opponent' ? 'Opp' : null;
          if (who) return { result: { outcome:highW, text:who + ' scoops \u2014 ' + (highW === 'hero' ? hHi.name : oHi.name) + ' / ' + (highW === 'hero' ? hLo.name : oLo.name), color: highW === 'hero' ? 'green' : 'red' }, heroHigh:hHi, opponentHigh:oHi, heroLow:hLo, opponentLow:oLo };
          return { result: { outcome:'chop', text:'Chop \u2014 ' + hHi.name + ' / ' + hLo.name, color:'yellow' }, heroHigh:hHi, opponentHigh:oHi, heroLow:hLo, opponentLow:oLo };
        }
        const hiText = highW === 'hero' ? 'Hero wins high (' + hHi.name + ')' : highW === 'opponent' ? 'Opp wins high (' + oHi.name + ')' : 'Chop high';
        const loText = lowW === 'hero' ? 'Hero wins low (' + hLo.name + ')' : lowW === 'opponent' ? 'Opp wins low (' + oLo.name + ')' : 'Chop low';
        return { result: { outcome:'split', text:'Split \u2014 ' + hiText + ', ' + loText, color:'yellow' }, heroHigh:hHi, opponentHigh:oHi, heroLow:hLo, opponentLow:oLo };
      }
      if (cfg.type === 'split-badugi') {
        if (!hBad || !oBad || !hLo || !oLo) return null;
        const badW = hBad.score < oBad.score ? 'hero' : oBad.score < hBad.score ? 'opponent' : 'chop';
        const lowW2 = hLo.score < oLo.score ? 'hero' : oLo.score < hLo.score ? 'opponent' : 'chop';
        if (badW === lowW2) {
          const who = badW === 'hero' ? 'Hero' : badW === 'opponent' ? 'Opp' : null;
          if (who) return { result: { outcome:badW, text:who + ' scoops \u2014 ' + (badW === 'hero' ? hBad.name : oBad.name) + ' / ' + (badW === 'hero' ? hLo.name : oLo.name), color: badW === 'hero' ? 'green' : 'red' }, heroBadugi:hBad, opponentBadugi:oBad, heroLow:hLo, opponentLow:oLo };
          return { result: { outcome:'chop', text:'Chop \u2014 ' + hBad.name + ' / ' + hLo.name, color:'yellow' }, heroBadugi:hBad, opponentBadugi:oBad, heroLow:hLo, opponentLow:oLo };
        }
        const bText = badW === 'hero' ? 'Hero wins Badugi (' + hBad.name + ')' : badW === 'opponent' ? 'Opp wins Badugi (' + oBad.name + ')' : 'Chop Badugi';
        const lText = lowW2 === 'hero' ? 'Hero wins draw (' + hLo.name + ')' : lowW2 === 'opponent' ? 'Opp wins draw (' + oLo.name + ')' : 'Chop draw';
        return { result: { outcome:'split', text:'Split \u2014 ' + bText + ', ' + lText, color:'yellow' }, heroBadugi:hBad, opponentBadugi:oBad, heroLow:hLo, opponentLow:oLo };
      }
      return null;
    }

    // Assign neutral suits to 'x'-suit cards for evaluation.
    // Picks suits that avoid duplicates and minimize flush impact.
    function assignNeutralSuits(handCards, usedCardKeys, boardSuits) {
      const allSuits = ['h', 'd', 'c', 's'];
      const used = new Set(usedCardKeys);
      const assigned = [];
      const handSuitsUsed = [];
      for (const c of handCards) {
        if (c.suit !== 'x') {
          assigned.push(c);
          used.add(c.rank + c.suit);
          handSuitsUsed.push(c.suit);
        } else {
          const available = allSuits.filter(s => !used.has(c.rank + s));
          if (!available.length) { assigned.push(c); continue; }
          // Prefer suits not on board (no false flush), then not in this hand
          const pick = available.find(s => !boardSuits.has(s) && !handSuitsUsed.includes(s))
                    || available.find(s => !boardSuits.has(s))
                    || available.find(s => !handSuitsUsed.includes(s))
                    || available[0];
          assigned.push({ rank: c.rank, suit: pick });
          used.add(c.rank + pick);
          handSuitsUsed.push(pick);
        }
      }
      return assigned;
    }

    // Export to window for use by bundled app.js
    window.parseCardNotation = parseCardNotation;
    window.evaluateHand = evaluateHand;
    window.evaluateShowdown = evaluateShowdown;
    window.assignNeutralSuits = assignNeutralSuits;
    window.GAME_EVAL = GAME_EVAL;

