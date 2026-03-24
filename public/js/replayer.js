    const { useState, useEffect, useMemo, useCallback, useRef } = React;
    const { createPortal } = ReactDOM;

    function getGameCategory(gameType) {
      const cfg = HAND_CONFIG[gameType];
      if (!cfg) return 'community';
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
    // Standard poker seating: BTN, SB, BB, then early→late positions ending at CO
    function getPositionLabels(numPlayers) {
      if (numPlayers <= 2) return ['BTN/SB', 'BB'];
      if (numPlayers === 3) return ['BTN', 'SB', 'BB'];
      // 4–10 players: always BTN/SB/BB, then fill middle seats from a fixed pool
      // Pool ordered early→late: UTG, UTG+1, UTG+2, LJ, HJ, CO
      var middle = ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO'];
      var need = numPlayers - 3; // seats between BB and BTN
      // Take the last `need` from the pool so CO is always present, then HJ, etc.
      var picked = middle.slice(Math.max(0, middle.length - need));
      return ['BTN', 'SB', 'BB'].concat(picked);
    }

    // Action order: preflop starts at UTG (index 3+), postflop starts at SB (index 1)
    // Position layout from getPositionLabels: [BTN(0), SB(1), BB(2), UTG(3), ...]
    // Heads-up: [BTN/SB(0), BB(1)] — preflop BTN/SB acts first
    function getActionOrder(players, isPreflop) {
      var n = players.length;
      if (n <= 0) return [];
      var indices = [];
      if (n === 2) {
        // Heads-up: preflop BTN/SB first, postflop BB first
        indices = isPreflop ? [0, 1] : [1, 0];
      } else if (isPreflop) {
        // Preflop: UTG first (seat 3), then around to BB (seat 2)
        for (var i = 3; i < n; i++) indices.push(i);
        indices.push(0); // BTN
        indices.push(1); // SB
        indices.push(2); // BB
      } else {
        // Postflop: SB first (seat 1), then around to BTN (seat 0)
        for (var i = 1; i < n; i++) indices.push(i);
        indices.push(0);
      }
      return indices.filter(function(i) { return i < n; });
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

    function createEmptyHand(gameType, heroName) {
      const streetDef = getStreetDef(gameType);
      const gameCfg = HAND_CONFIG[gameType] || HAND_CONFIG_DEFAULT;
      const numPlayers = 6;
      const positions = getPositionLabels(numPlayers);
      return {
        gameType,
        players: Array.from({ length: numPlayers }, function(_, i) {
          return { name: i === 0 ? (heroName || 'Hero') : (DEFAULT_OPP_NAMES[i - 1] || 'Opp ' + i), position: positions[i] || '', startingStack: 50000 };
        }),
        blinds: { sb: 100, bb: 200, ante: 0 },
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
      let pot = hand.players.length * (blinds.ante || 0);
      stacks.forEach((_, i) => { stacks[i] -= (blinds.ante || 0); });

      // Post blinds on first street
      if (hand.streets.length > 0 && hand.streets[0].actions) {
        const category = getGameCategory(hand.gameType);
        if (category !== 'stud') {
          // SB and BB
          const sbIdx = hand.players.findIndex(p => p.position === 'SB' || p.position === 'BTN/SB');
          const bbIdx = hand.players.findIndex(p => p.position === 'BB');
          if (sbIdx >= 0) { stacks[sbIdx] -= (blinds.sb || 0); pot += (blinds.sb || 0); }
          if (bbIdx >= 0) { stacks[bbIdx] -= (blinds.bb || 0); pot += (blinds.bb || 0); }
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

      const addAction = (action) => {
        const amount = ['bet', 'raise', 'call'].includes(action) ? (Number(actionAmount) || 0) : 0;
        // Determine which player is next
        const street = hand.streets[currentStreetIdx];
        const actionsLen = street.actions ? street.actions.length : 0;
        const foldedPlayers = new Set((street.actions || []).filter(a => a.action === 'fold').map(a => a.player));
        let activePlayers = hand.players.map((_, i) => i).filter(i => !foldedPlayers.has(i));
        let nextPlayer = activePlayers[actionsLen % activePlayers.length] || 0;

        updateStreet(currentStreetIdx, s => {
          const actions = [...(s.actions || []), { player: nextPlayer, action, amount }];
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
          else draws.push({ player: playerIdx, discarded: Number(val) || 0 });
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
                <label>Ante</label>
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
                <div className="replayer-draw-label">Cards Drawn</div>
                {hand.players.map((p, pi) => {
                  const draw = (currentStreet.draws || []).find(d => d.player === pi);
                  return (
                    <div key={pi} className="replayer-row" style={{marginBottom:'2px'}}>
                      <span style={{fontSize:'0.65rem',color:'var(--text-muted)',minWidth:'50px'}}>{p.name}</span>
                      <div className="replayer-field" style={{flex:'0 0 50px'}}>
                        <input type="number" min="0" max="5" value={draw ? draw.discarded : ''}
                          onChange={e => updateDrawDiscard(currentStreetIdx, pi, e.target.value)}
                          placeholder="0" />
                      </div>
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

            <div className="replayer-row" style={{marginTop:'6px',gap:'4px'}}>
              <div className="replayer-field" style={{flex:'0 0 80px'}}>
                <input type="text" inputMode="decimal" placeholder="Amount" value={actionAmount}
                  onChange={e => setActionAmount(e.target.value)} />
              </div>
            </div>
            <div className="replayer-action-btns">
              <button className="action-fold" onClick={() => addAction('fold')}>Fold</button>
              <button onClick={() => addAction('check')}>Check</button>
              <button className="action-call" onClick={() => addAction('call')}>Call</button>
              <button className="action-bet" onClick={() => addAction('bet')}>Bet</button>
              <button className="action-raise" onClick={() => addAction('raise')}>Raise</button>
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
                    fontFamily:"'Oswald',sans-serif",fontSize:'0.68rem',transition:'all 0.15s',
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
            <div style={{fontSize:'0.55rem',color:'var(--text-muted)',marginTop:'4px',fontFamily:"'Oswald',sans-serif"}}>
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
      if (actionIdx < 0) {
        if (streetIdx === 0) return 'Cards are dealt. ' + hand.players.length + ' players at the table. Blinds are ' + formatChipAmount((hand.blinds || {}).sb || 0) + '/' + formatChipAmount((hand.blinds || {}).bb || 0) + '.';
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
        case 'bet': return name + posStr + ' leads out with a bet of ' + formatChipAmount(act.amount) + ' into a ' + formatChipAmount(pot - act.amount) + ' pot.';
        case 'raise': return name + posStr + ' fires a raise to ' + formatChipAmount(act.amount) + '! The pot swells to ' + formatChipAmount(pot) + '.';
        case 'all-in': return name + posStr + ' moves ALL IN for ' + formatChipAmount(act.amount) + '! A pivotal moment at the table.';
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
          var ev;
          if (gameEval.method === 'omaha') {
            ev = bestOmahaHigh(hole, bCards);
          } else {
            ev = bestHighHand(hole.concat(bCards));
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

      // Build cumulative hero/opponent cards for stud
      const heroCards = useMemo(() => {
        if (category !== 'stud') return hand.streets[0]?.cards.hero || '';
        let cards = '';
        for (let si = 0; si <= streetIdx; si++) {
          if (hand.streets[si]?.cards.hero) cards += hand.streets[si].cards.hero;
        }
        return cards;
      }, [hand, streetIdx, category]);

      const replayHeroIdx = hand.heroIdx != null ? hand.heroIdx : 0;

      const opponentCards = useMemo(() => {
        // Build a card string for each player index (excluding hero)
        // opponents array is indexed by "slot" = player index with hero removed
        return hand.players.map((_, pi) => {
          if (pi === replayHeroIdx) return null; // hero, skip
          var oppSlot = pi > replayHeroIdx ? pi - 1 : pi;
          if (category !== 'stud') return hand.streets[0]?.cards.opponents?.[oppSlot] || '';
          let cards = '';
          for (let si = 0; si <= streetIdx; si++) {
            if (hand.streets[si]?.cards.opponents?.[oppSlot]) cards += hand.streets[si].cards.opponents[oppSlot];
          }
          return cards;
        });
      }, [hand, streetIdx, category, replayHeroIdx]);

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
            var pName = w.playerIdx === 0 ? 'Hero' : (hand.players[w.playerIdx]?.name || 'Player');
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
              index: w.playerIdx > 0 ? w.playerIdx - 1 : 0,
              result: {
                outcome: w.playerIdx === 0 ? 'hero' : (w.split ? 'split' : 'opponent'),
                text: label,
                color: w.split ? 'yellow' : (w.playerIdx === 0 ? 'green' : 'red'),
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
            if (playerIdx === 0) {
              const heroWins = evalResult.some(r => r.result.outcome === 'hero');
              const heroLoses = evalResult.some(r => r.result.outcome === 'opponent');
              const heroSplits = evalResult.some(r => r.result.outcome === 'split');
              if (heroWins && !heroLoses) return 'winner';
              if (heroLoses && !heroWins) return 'loser';
              if (heroSplits) return 'split';
            } else {
              const oppResult = evalResult.find(r => r.index === playerIdx - 1);
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
        let ev = null;
        if (cfg.type === 'high' || cfg.type === 'hilo') {
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
          ctx.font = 'bold 36px Oswald, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(hand.gameType + ' Hand', outW / 2, 60);

          // Blinds
          ctx.font = '22px Oswald, sans-serif';
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
            ctx.font = '16px Oswald, sans-serif';
            ctx.fillStyle = '#666666';
            ctx.fillText('BOARD', outW / 2, yPos);
            yPos += 14;
            for (const c of bCards) {
              const key = c.rank + c.suit;
              const img = images.get(key);
              if (img) { ctx.drawImage(img, cx, yPos, cw, ch); }
              else { ctx.fillStyle = '#333'; ctx.fillRect(cx, yPos, cw, ch); ctx.fillStyle = '#666'; ctx.font = '24px Oswald'; ctx.textAlign = 'center'; ctx.fillText('?', cx + cw/2, yPos + ch/2 + 8); }
              cx += cw + gap;
            }
            yPos += ch + 20;
          }

          // Pot
          ctx.textAlign = 'center';
          ctx.font = 'bold 28px Oswald, sans-serif';
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
            ctx.font = 'bold 20px Oswald, sans-serif';
            ctx.fillStyle = seatClass === 'winner' ? '#4ade80' : seatClass === 'loser' ? '#f87171' : '#ffffff';
            ctx.textAlign = 'left';
            const px = 80;
            ctx.fillText(p.name + ' (' + p.position + ')', px, yPos);
            ctx.font = '16px Oswald, sans-serif';
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
                ctx.font = '20px Oswald';
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
              ctx.font = '16px Oswald, sans-serif';
              ctx.fillStyle = seatClass === 'winner' ? '#4ade80' : '#f87171';
              ctx.textAlign = 'left';
              ctx.fillText(handName, cardX + 12, yPos + ch / 2 + 4);
            }

            yPos += ch + 16;
            ctx.globalAlpha = 1;
          });

          // Result
          if (showResult && evalResult) {
            ctx.font = 'bold 24px Oswald, sans-serif';
            ctx.textAlign = 'center';
            const rText = evalResult.map(r => r.result.text).join(' | ');
            const rColor = evalResult[0]?.result.color === 'green' ? '#4ade80' : evalResult[0]?.result.color === 'red' ? '#f87171' : '#facc15';
            ctx.fillStyle = rColor;
            ctx.fillText(rText, outW / 2, Math.min(yPos + 20, outH - 60));
          }

          // Watermark
          ctx.font = '14px Oswald, sans-serif';
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
                <div style={{fontSize:'0.7rem',fontFamily:"'Oswald',sans-serif",textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'8px',color:'var(--text-muted)'}}>Felt Color</div>
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
                return <div className="replayer-pot-display replayer-split-pot">
                  <div className="replayer-pot-label">Split Pot</div>
                  <div className="replayer-split-circles">
                    {Array.from({length: Math.min(splitCount, 3)}, function(_, i) {
                      return <div key={i} className="replayer-split-circle" style={{
                        marginLeft: i > 0 ? '-8px' : 0, zIndex: splitCount - i,
                      }}>{formatChipAmount(splitAmt)}</div>;
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
            <div style={{textAlign:'center',fontSize:'0.68rem',color:'var(--text-muted)',fontFamily:"'Oswald',sans-serif"}}>
              {currentStreet.draws.map(d => (
                <span key={d.player} style={{marginRight:'8px'}}>
                  {hand.players[d.player]?.name}: drew {d.discarded}
                </span>
              ))}
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
                    borderRadius:'4px',fontFamily:"'Oswald',sans-serif"
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
      var seatOrder = useMemo(function() {
        return getActionOrder(hand.players, isPreflop);
      }, [hand.players, isPreflop]);

      // Only seats that can still act (for determining whose turn it is)
      var actionOrder = useMemo(function() {
        return seatOrder.filter(function(i) { return !foldedSet.has(i) && !allInSet.has(i); });
      }, [seatOrder, foldedSet, allInSet]);

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
        (currentStreet.actions || []).forEach(function(act) {
          if (act.action === 'fold') return;
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
        else { setCurrentStreetIdx(nextStreet); }
      }, [isBettingComplete, phase, handOver]);

      // Scroll to top when entering board_entry or result phase
      useEffect(function() {
        if (phase === 'board_entry' || phase === 'showdown' || phase === 'result') {
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
          if (el) scrollBelowSticky(el, 8);
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
              if (phase === 'result' || phase === 'showdown' || phase === 'board_entry') setPhase('action');
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
              if (phase === 'result' || phase === 'showdown' || phase === 'board_entry') setPhase('action');
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
          var players = prev.players.map(function(p, i) {
            if (i === newIdx) {
              // This seat becomes hero
              return Object.assign({}, p, { name: heroName || 'Hero' });
            }
            if (i === heroIdx) {
              // Old hero seat gets an opponent name
              // Find the first unused opponent name
              var usedNames = new Set(prev.players.map(function(pl) { return pl.name; }));
              var oppName = 'Opp';
              for (var oi = 0; oi < DEFAULT_OPP_NAMES.length; oi++) {
                if (!usedNames.has(DEFAULT_OPP_NAMES[oi])) { oppName = DEFAULT_OPP_NAMES[oi]; break; }
              }
              return Object.assign({}, p, { name: oppName });
            }
            return p;
          });
          return Object.assign({}, prev, { players: players, heroIdx: newIdx });
        });
      };

      var callAmount = currentActor >= 0 ? Math.min(streetBets.maxBet - streetBets.contrib[currentActor], currentStacks[currentActor]) : 0;
      var canCheck = callAmount === 0;
      var minRaise = Math.max((hand.blinds || {}).bb || 0, streetBets.maxBet * 2 - (currentActor >= 0 ? streetBets.contrib[currentActor] : 0));
      var playerStack = currentActor >= 0 ? currentStacks[currentActor] : 0;

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
        return (
          <div className="gto-entry">
            <div className="gto-phase-card"><div className="replayer-section">
              <div className="replayer-section-title">Players & Blinds</div>
              <div className="replayer-row" style={{marginBottom:'8px'}}>
                <div className="replayer-field" style={{flex:'0 0 70px'}}>
                  <label>Players</label>
                  <select value={hand.players.length} onChange={function(e) { setNumPlayers(Number(e.target.value)); }}>
                    {[2,3,4,5,6,7,8,9,10].map(function(n) { return <option key={n} value={n}>{n}</option>; })}
                  </select>
                </div>
                <div className="replayer-field">
                  <label>SB</label>
                  <input type="text" inputMode="decimal" value={(hand.blinds || {}).sb || ''} onChange={function(e) { setHand(function(prev) { return Object.assign({}, prev, { blinds: Object.assign({}, prev.blinds || {}, { sb: Number(e.target.value) || 0 }) }); }); }} />
                </div>
                <div className="replayer-field">
                  <label>BB</label>
                  <input type="text" inputMode="decimal" value={(hand.blinds || {}).bb || ''} onChange={function(e) { setHand(function(prev) { return Object.assign({}, prev, { blinds: Object.assign({}, prev.blinds || {}, { bb: Number(e.target.value) || 0 }) }); }); }} />
                </div>
                <div className="replayer-field">
                  <label>Ante</label>
                  <input type="text" inputMode="decimal" value={(hand.blinds || {}).ante || ''} onChange={function(e) { setHand(function(prev) { return Object.assign({}, prev, { blinds: Object.assign({}, prev.blinds || {}, { ante: Number(e.target.value) || 0 }) }); }); }} />
                </div>
              </div>
              {hand.players.map(function(p, i) {
                var isHero = i === heroIdx;
                return (
                  <div key={i} className="replayer-player-row">
                    <span className={'replayer-player-pos' + (isHero ? ' hero' : '')}
                      style={{cursor:'pointer'}}
                      onClick={function() { setHeroSeat(i); }}>{p.position}</span>
                    <div className="replayer-field" style={{flex:'1 1 80px'}}>
                      <input type="text" style={{textAlign:'left'}} value={p.name} onChange={function(e) { updatePlayerField(i, 'name', e.target.value); }} placeholder="Name" />
                    </div>
                    <div className="replayer-field" style={{flex:'0 0 80px'}}>
                      <input type="text" inputMode="decimal" style={{textAlign:'right'}} value={p.startingStack} onChange={function(e) { updatePlayerField(i, 'startingStack', e.target.value); }} placeholder="Stack" />
                    </div>
                  </div>
                );
              })}
            </div></div>
            <div style={{display:'flex',gap:'6px',justifyContent:'flex-end',padding:'10px 0'}}>
              <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={function() { setPhase('hero_cards'); }}>Next</button>
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
                <button className="btn btn-primary btn-sm" onClick={function() { setPhase('action'); }}>Start Action</button>
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
        // Collect used cards (hero, all board streets)
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

        // Track which opponent we're entering cards for
        var sdActiveIdx = -1;
        for (var sdi = 0; sdi < showdownPlayers.length; sdi++) {
          var oppIdx = showdownPlayers[sdi].idx;
          var oppCardStr = (hand.streets[0].cards.opponents && hand.streets[0].cards.opponents[oppIdx > heroIdx ? oppIdx - 1 : oppIdx]) || '';
          var oppCards = parseCardNotation(oppCardStr).filter(function(c) { return c.suit !== 'x'; });
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
              var oppCardStr = (hand.streets[0].cards.opponents && hand.streets[0].cards.opponents[oppSlot]) || '';
              var isMucked = oppCardStr === 'MUCK';
              var oppParsed = isMucked ? [] : parseCardNotation(oppCardStr).filter(function(c) { return c.suit !== 'x'; });
              var oppCardSet = new Set(oppParsed.map(function(c) { return c.rank + c.suit; }));
              var isComplete = isMucked || oppParsed.length >= sdMaxCards;
              var isActiveOpp = si === sdActiveIdx;

              // Build used set excluding this opponent's own cards
              var thisUsed = new Set(sdUsedCards);
              // Add other opponents' cards
              showdownPlayers.forEach(function(other) {
                if (other.idx === o.idx) return;
                var otherSlot = other.idx > heroIdx ? other.idx - 1 : other.idx;
                var otherStr = (hand.streets[0].cards.opponents && hand.streets[0].cards.opponents[otherSlot]) || '';
                if (otherStr !== 'MUCK') {
                  parseCardNotation(otherStr).forEach(function(c) { if (c.suit !== 'x') thisUsed.add(c.rank + c.suit); });
                }
              });
              oppParsed.forEach(function(c) { thisUsed.delete(c.rank + c.suit); });

              var toggleSdCard = function(card) {
                if (oppCardSet.has(card)) {
                  var remaining = oppParsed.map(function(c) { return c.rank + c.suit; }).filter(function(c) { return c !== card; });
                  var newVal = remaining.join('');
                  setHand(function(prev) {
                    var opps = (prev.streets[0].cards.opponents || []).slice();
                    opps[oppSlot] = newVal;
                    var streets = prev.streets.map(function(s, i) { return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) }) : s; });
                    return Object.assign({}, prev, { streets: streets });
                  });
                } else {
                  if (oppParsed.length >= sdMaxCards) return;
                  var newVal = oppCardStr + card;
                  setHand(function(prev) {
                    var opps = (prev.streets[0].cards.opponents || []).slice();
                    opps[oppSlot] = newVal;
                    var streets = prev.streets.map(function(s, i) { return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) }) : s; });
                    return Object.assign({}, prev, { streets: streets });
                  });
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
                setHand(function(prev) {
                  var opps = (prev.streets[0].cards.opponents || []).slice();
                  opps[oppSlot] = '';
                  var streets = prev.streets.map(function(s, i) { return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) }) : s; });
                  return Object.assign({}, prev, { streets: streets });
                });
              };

              return (
                <div key={o.idx} className="gto-phase-card" style={{marginTop:'6px', opacity: isComplete && !isActiveOpp ? 0.6 : 1}}>
                  <div className="replayer-section">
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
                      <div>
                        <span className="replayer-player-pos" style={{marginRight:'6px'}}>{o.player.position}</span>
                        <span style={{fontFamily:"'Oswald',sans-serif",fontSize:'0.8rem',fontWeight:600,color:'var(--text)'}}>{o.player.name}</span>
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
                      <div style={{textAlign:'center',padding:'8px 0',fontFamily:"'Oswald',sans-serif",fontSize:'0.75rem',color:'var(--text-muted)',fontStyle:'italic'}}>Mucked</div>
                    ) : (
                      <React.Fragment>
                        {oppParsed.length > 0 && <div style={{margin:'4px 0'}}><CardRow text={oppCardStr} max={sdMaxCards} /></div>}
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
                // Hero
                var heroCardStr = (hand.streets[0].cards.hero || '');
                var heroParsed = parseCardNotation(heroCardStr).filter(function(c) { return c.suit !== 'x'; });
                if (heroParsed.length > 0) {
                  playerHands.push({ idx: heroIdx, cards: heroParsed });
                }
                // Opponents
                showdownPlayers.forEach(function(o) {
                  var oppSlot = o.idx > heroIdx ? o.idx - 1 : o.idx;
                  var oppStr = (hand.streets[0].cards.opponents && hand.streets[0].cards.opponents[oppSlot]) || '';
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
                  <div style={{textAlign:'center',padding:'12px',fontFamily:"'Oswald',sans-serif"}}>
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
                            fontFamily:"'Oswald',sans-serif",fontSize:'0.75rem',fontWeight:600,transition:'all 0.15s',
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
                    <div style={{fontSize:'0.55rem',color:'var(--text-muted)',marginTop:'4px',fontFamily:"'Oswald',sans-serif"}}>
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
            var foldedOnPriorStreet = isFolded && !(currentStreet.actions || []).some(function(a) { return a.player === i && a.action === 'fold'; });
            if (foldedOnPriorStreet && !isPreflop) return null;
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
                      {i === heroIdx && hand.streets[0] && hand.streets[0].cards.hero && (
                        <span className="gto-seat-hero-cards"><CardRow text={hand.streets[0].cards.hero} max={gameCfg.heroCards || 2} /></span>
                      )}
                      {act && !isActive && <span className={'gto-seat-result-badge ' + act.action}>{actionLabel}</span>}
                    </div>
                  </div>

                  {/* Animated expand for active seat */}
                  <div className="gto-seat-detail-wrap">
                    <div className="gto-seat-detail-inner">
                      <div className="gto-seat-detail">
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
                              setBetAmount(String(canCheck ? ((hand.blinds || {}).bb || 0) : minRaise));
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
                              {[{label:'1/3',mult:1/3},{label:'1/2',mult:1/2},{label:'2/3',mult:2/3},{label:'Pot',mult:1}].map(function(s) {
                                return <button key={s.label} className="gto-sizing-pill" onClick={function() { setBetAmount(String(Math.min(Math.round(currentPot * s.mult), playerStack))); }}>{s.label}</button>;
                              })}
                              <button className="gto-sizing-pill" onClick={function() { setBetAmount(String(playerStack)); }}>All-In</button>
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
    function HandReplayerView({ token, heroName, cardSplay }) {
      const [mode, setMode] = useState('list'); // 'list' | 'entry' | 'replay'
      const [entryMode, setEntryMode] = useState('gto'); // 'gto' | 'classic'
      const [savedHands, setSavedHands] = useState([]);
      const [currentHand, setCurrentHand] = useState(null);
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

      const gameTypes = Object.keys(HAND_CONFIG).filter(k => k !== 'OFC Pineapple');

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

      // Game selection config
      var structureGameMap = {
        'No Limit':  { "Hold'em": 'NLH', 'Pineapple': 'NLH', 'Short Deck': 'NLH', 'Omaha': 'PLO', 'Omaha 8/b': 'PLO8', 'Big O': 'Big O', 'Stud Hi': 'Stud Hi', 'Stud 8': 'Stud 8', 'Razz': 'Razz', '2-7 Triple Draw': '2-7 TD', '2-7 Single Draw': 'NL 2-7 SD', 'A-5 Triple Draw': 'A-5 TD', 'A-5 Single Draw': 'A-5 TD', 'Badugi': 'Badugi', 'Badeucy': 'Badeucy', 'Badacey': 'Badacy', 'Archie': 'Badugi', 'Ari': 'Badugi', '5-Card Draw': 'PL 5CD Hi' },
        'Pot Limit': { "Hold'em": 'PLH', 'Pineapple': 'PLH', 'Short Deck': 'PLH', 'Omaha': 'PLO', 'Omaha 8/b': 'PLO8', 'Big O': 'Big O', 'Stud Hi': 'Stud Hi', 'Stud 8': 'Stud 8', 'Razz': 'Razz', '2-7 Triple Draw': 'PL 2-7 TD', '2-7 Single Draw': 'NL 2-7 SD', 'A-5 Triple Draw': 'A-5 TD', 'A-5 Single Draw': 'A-5 TD', 'Badugi': 'Badugi', 'Badeucy': 'Badeucy', 'Badacey': 'Badacy', 'Archie': 'Badugi', 'Ari': 'Badugi', '5-Card Draw': 'PL 5CD Hi' },
        'Limit':     { "Hold'em": 'LHE', 'Pineapple': 'LHE', 'Short Deck': 'LHE', 'Omaha': 'O8', 'Omaha 8/b': 'O8', 'Big O': 'Big O', 'Stud Hi': 'Stud Hi', 'Stud 8': 'Stud 8', 'Razz': 'Razz', '2-7 Triple Draw': '2-7 TD', '2-7 Single Draw': 'NL 2-7 SD', 'A-5 Triple Draw': 'A-5 TD', 'A-5 Single Draw': 'A-5 TD', 'Badugi': 'Badugi', 'Badeucy': 'Badeucy', 'Badacey': 'Badacy', 'Archie': 'Badugi', 'Ari': 'Badugi', '5-Card Draw': 'PL 5CD Hi' },
      };
      var defaultStructure = {
        "Hold'em": 'No Limit', 'Pineapple': 'No Limit', 'Short Deck': 'No Limit',
        'Omaha': 'Pot Limit', 'Omaha 8/b': 'Pot Limit', 'Big O': 'Pot Limit',
        'Stud Hi': 'Limit', 'Stud 8': 'Limit', 'Razz': 'Limit',
        '2-7 Triple Draw': 'Limit', '2-7 Single Draw': 'No Limit',
        'A-5 Triple Draw': 'Limit', 'A-5 Single Draw': 'No Limit',
        'Badugi': 'Limit', 'Badeucy': 'Limit', 'Badacey': 'Limit',
        'Archie': 'Limit', 'Ari': 'Limit', '5-Card Draw': 'No Limit',
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
            blinds: { sb: 100, bb: 200, ante: 0 },
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
        ];
        return React.createElement(React.Fragment, null,
          groups.map(g => (
            <div key={g.label} style={{marginBottom:'6px'}}>
              <div style={{fontSize:'0.55rem',color:'var(--text-muted)',fontFamily:"'Oswald',sans-serif",textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'3px'}}>{g.label}</div>
              <div className="hand-game-pill-row" style={{flexWrap:'wrap'}}>
                {g.games.map(game => (
                  <button key={game} className={selectedGameType === game ? 'active' : ''} onClick={() => setSelectedGameType(game)}>{game}</button>
                ))}
              </div>
            </div>
          )),
          <div key="custom" style={{marginBottom:'6px'}}>
            <div style={{fontSize:'0.55rem',color:'var(--text-muted)',fontFamily:"'Oswald',sans-serif",textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'3px'}}>Custom</div>
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
              <div className="live-update-tabs" style={{marginBottom:'8px'}}>
                <button className={entryMode === 'gto' ? 'active' : ''} onClick={() => setEntryMode('gto')}>GTO Style</button>
                <button className={entryMode === 'classic' ? 'active' : ''} onClick={() => setEntryMode('classic')}>Classic</button>
              </div>
              <div className="replayer-row" style={{marginBottom:'8px'}}>
                <div className="replayer-field">
                  <label>Title</label>
                  <input type="text" placeholder="e.g. Huge pot with AA" value={title} onChange={e => setTitle(e.target.value)} />
                </div>
              </div>
              <div id="gto-sticky-slot"></div>
            </div>
            {entryMode === 'gto' ? (
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
              <span style={{fontSize:'0.7rem',color:'var(--accent2)',fontFamily:"'Oswald',sans-serif",fontWeight:600}}>{variantDisplayName}</span>
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
                  <div style={{fontSize:'0.55rem',color:'var(--text-muted)',fontFamily:"'Oswald',sans-serif",textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'4px'}}>{g.label}</div>
                  <div className="hand-game-pill-row" style={{flexWrap:'wrap'}}>
                    {g.games.map(game => (
                      <button key={game} className={selectedGame === game ? 'active' : ''} onClick={() => handleGameSelect(game)}>{game}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <div style={{fontSize:'0.55rem',color:'var(--text-muted)',fontFamily:"'Oswald',sans-serif",textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'4px'}}>Betting Structure</div>
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
