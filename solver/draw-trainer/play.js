// ── Draw trainer: hand generation + hero-action injection (td27 / draw games) ──
// The draw-game analogue of solver/razz-trainer/play.js. Builds COMPLETED
// heads-up draw hands (2-7 Triple Draw by default) suitable for grading, and
// records — alongside EVERY decision (bet OR draw, both seats) — the minimal
// public+private facts the grader needs:
//   • a deep snapshot of the live state (so grade.js can clone it, swap in a
//     particle's opponent hand via lbr-draw.oppInfosetKey, and roll forward),
//   • the legal actions, the chosen action, and whose turn it is.
//
// The engine is NEVER duplicated — every transition goes through the draw
// `game` module (draw-game.js). A DRAW node and a BET node are recorded the
// SAME way; the grader tells them apart by snap.phase, not by a special record.
//
// Two roles (mirroring razz-trainer/play.js):
//   1. dealHand(blueprint, {rng|seed, heroSeat, game}) — pure self-play; BOTH
//      seats sample σ; returns a handRecord for grade.js.
//   2. playWithHero(blueprint, heroPolicy, opts) — opponent samples σ, hero's
//      actions come from an injected policy fn (the GUI seam).
//
// The blueprint blinds live in game.newHand — we do NOT re-implement them.

const DEFAULT_GAME = require('../games/triple-draw-27');
const { makeRng, cardStr, cardFromStr } = require('../engine/cards');

// Canonical strategy-lookup contract (spot.js / playout.js / lbr-draw.probsOf):
// node.a must positionally equal acts, else uniform fallback.
function strategyFor(strategyMap, key, acts) {
  const node = strategyMap[key];
  if (node && node.a.length === acts.length && node.a.every((a, i) => a === acts[i])) {
    return { probs: node.p, trained: true, mass: node.m || 0 };
  }
  return { probs: acts.map(() => 1 / acts.length), trained: false, mass: 0 };
}

function sampleIndex(probs, rng) {
  let r = rng();
  for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r <= 0) return i; }
  return probs.length - 1;
}

// ── FULL DISCARD CONTROL — explicit hero-discard action encoding ──────────────
// A hero draw under full control is encoded as a STATELESS, seeded-replayable
// string: 'd:' + the THROWN cards' 2-char strings concatenated, sorted by card
// INTEGER (a deterministic, game-generic order). 'd:' (no cards) = stand pat.
//   encodeDiscard([31, 44]) -> 'd:9sKc'  (throw 9s + Kc)
//   encodeDiscard([])       -> 'd:'      (pat)
// parseDiscard('d:9sKc') -> [31, 44]. The keep set is the hand MINUS the thrown
// cards; the draw count is thrown.length. Used by play.js (record/replay) and
// grade.js (per-discard EV) so the action round-trips exactly.
function encodeDiscard(thrownInts) {
  const sorted = thrownInts.slice().sort((a, b) => a - b);
  return 'd:' + sorted.map(cardStr).join('');
}

// Parse 'd:<2-char><2-char>...' -> [cardInt,...]. 'd:' -> []. The order is the
// stored (sorted) order; callers turn it into a Set against the hand.
function parseDiscard(action) {
  const body = action.slice(2); // after 'd:'
  const out = [];
  for (let i = 0; i < body.length; i += 2) out.push(cardFromStr(body.slice(i, i + 2)));
  return out;
}

// Is `action` an explicit-discard hero action ('d:...')? (vs an abstraction draw
// 'dK' or a betting action.)
function isExplicitDiscard(action) {
  return typeof action === 'string' && action.length >= 2 && action[0] === 'd' && action[1] === ':';
}

// The KEEP set for an explicit discard applied to `hand` (ints): hand minus the
// thrown cards. Throws if a thrown card is not in the hand (illegal discard).
function keepForDiscard(hand, action) {
  const thrown = new Set(parseDiscard(action));
  for (const c of thrown) {
    if (hand.indexOf(c) < 0) throw new Error(`discard ${cardStr(c)} not in hand ${hand.map(cardStr).join('')}`);
  }
  return hand.filter(c => !thrown.has(c));
}

// Deep snapshot of a live DRAW-game state. Cards are integers (engine-native).
// MUST carry every field draw-game.js's clone() / lbr-draw.js's cloneState()
// read, so the grader can clone it and roll it to terminal, and so
// game.infosetKey / oppInfosetKey reproduce the trained key byte-for-byte.
function snapshotState(s) {
  return {
    deck: s.deck.slice(),
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
    pendingDraw: s.pendingDraw ? { player: s.pendingDraw.player, count: s.pendingDraw.count } : null,
    drawCounts: [s.drawCounts[0].slice(), s.drawCounts[1].slice()],
    discards: [s.discards[0].slice(), s.discards[1].slice()],
    log: [],
  };
}

// Resolve a blueprint argument that may be the whole file ({strategy:{...}}) or
// the bare strategy map.
function strategyMapOf(blueprint) {
  if (blueprint && blueprint.strategy && typeof blueprint.strategy === 'object') return blueprint.strategy;
  return blueprint || {};
}

// Core driver. `heroSeat` is the seat whose decisions we tag as hero nodes.
// `heroPolicy`, if given, is (acts, snap, ctx) -> chosenActionId and OVERRIDES
// blueprint sampling at hero nodes (the opponent still samples σ). If null, the
// hero ALSO samples σ (pure self-play).
//
// We record BOTH-seat decisions (the grader needs the opponent's observed
// betting/draw line to build the posterior); only seat === heroSeat nodes are
// flagged isHero (those get graded).
function runHand(strategyMap, rng, heroSeat, heroPolicy, game = DEFAULT_GAME) {
  let state = game.newHand(rng);
  const decisions = [];
  let guard = 0;

  while (!game.isTerminal(state)) {
    if (++guard > 500) break;
    if (game.isChance(state)) { state = game.sampleChance(state, rng); continue; }
    const acts = game.legalActions(state);
    if (acts.length <= 1) { state = game.applyAction(state, acts[0]); continue; }

    const actor = game.currentPlayer(state);
    const key = game.infosetKey(state);
    const strat = strategyFor(strategyMap, key, acts);
    const snap = snapshotState(state);
    const kind = state.phase === 'draw' ? 'draw' : 'bet';

    let chosen;
    if (heroPolicy && actor === heroSeat) {
      chosen = heroPolicy(acts.slice(), snap, { key, strat });
      // FULL DISCARD CONTROL: the hero may return an EXPLICIT-discard action
      // 'd:...' at a DRAW node (any specific cards), which is NOT in the
      // abstraction's `acts` list. Validate it's a legal draw-node discard; the
      // opponent's draws (and all betting) stay on the abstraction `acts`.
      if (isExplicitDiscard(chosen)) {
        if (kind !== 'draw') {
          throw new Error(`heroPolicy returned discard ${chosen} at a non-draw node (legal: ${acts.join(',')})`);
        }
        keepForDiscard(state.hands[actor], chosen); // throws if the thrown cards aren't in-hand
      } else if (acts.indexOf(chosen) < 0) {
        throw new Error(`heroPolicy returned illegal action ${chosen} (legal: ${acts.join(',')})`);
      }
    } else {
      chosen = acts[sampleIndex(strat.probs, rng)];
    }

    decisions.push({
      actor,
      isHero: actor === heroSeat,
      kind,                 // 'bet' | 'draw' — both grade identically
      street: state.street,
      phase: state.phase,
      key,
      acts: acts.slice(),
      chosen,               // may be an explicit-discard 'd:...' at a hero draw node
      gtoProbs: strat.probs.slice(),
      gtoTrained: strat.trained,
      state: snap,          // pre-action live state (toAct === actor)
    });

    // Apply: an explicit hero discard goes through game.applyDraw with the
    // explicit keep (same chance/deck mechanics as 'dK', explicit keep instead of
    // chooseKeep); everything else through the normal applyAction.
    if (isExplicitDiscard(chosen)) {
      state = game.applyDraw(state, keepForDiscard(state.hands[actor], chosen));
    } else {
      state = game.applyAction(state, chosen);
    }
  }

  const utility = game.utility(state);
  return {
    game: game.id,
    heroSeat,
    decisions,
    terminal: snapshotState(state),
    utility,                // [u0,u1] net chips, zero-sum
    result: game.result(state),
  };
}

// Public: deal a completed self-play hand to grade. Both seats sample σ.
function dealHand(blueprint, opts = {}) {
  const strategyMap = strategyMapOf(blueprint);
  const heroSeat = opts.heroSeat == null ? 0 : opts.heroSeat;
  const game = opts.game || DEFAULT_GAME;
  const rng = opts.rng || (opts.seed != null ? makeRng(opts.seed) : makeRng((Math.random() * 0xffffffff) >>> 0));
  return runHand(strategyMap, rng, heroSeat, null, game);
}

// Public: play a hand where the hero's actions are injected (GUI seam).
function playWithHero(blueprint, heroPolicy, opts = {}) {
  const strategyMap = strategyMapOf(blueprint);
  const heroSeat = opts.heroSeat == null ? 0 : opts.heroSeat;
  const game = opts.game || DEFAULT_GAME;
  const rng = opts.rng || (opts.seed != null ? makeRng(opts.seed) : makeRng((Math.random() * 0xffffffff) >>> 0));
  return runHand(strategyMap, rng, heroSeat, heroPolicy, game);
}

// ── Test helper: build a handRecord from explicit cards + a scripted line ──────
// Used by grade.test.js for hand-constructed adversarial spots. We bypass
// newHand's shuffle so the dealt cards are EXACTLY as specified.
//   cards = { hands:[[...],[...]] }  (5-card hands as STRINGS or ints; the
//            opponent's hand is hidden to the hero but present so the line is
//            card-consistent and a terminal showdown resolves).
//   future = cards.future (array of replacement cards, in deal order, popped
//            off the deck as the scripted line declares draws).
//   line   = [{ actor, action }, ...] applied from a fresh pre-draw state.
function buildHandRecord(cards, line, opts = {}) {
  const game = opts.game || DEFAULT_GAME;
  const HS = game.cfg.handSize;
  const toInt = c => (typeof c === 'string' ? cardFromStr(c) : c);
  const hands = [cards.hands[0].map(toInt), cards.hands[1].map(toInt)];
  const future = (cards.future || []).map(toInt);

  // newHand blinds/contrib, but with FORCED hands and a deck of `future` cards.
  // sampleChance pops from the END of deck, so reverse `future` to preserve the
  // intended deal order.
  let state = {
    deck: future.slice().reverse(),
    hands,
    street: 0,
    phase: 'bet',
    toAct: 0,
    bets: 1,
    contrib: [1, 2],
    acted: [false, false],
    folded: null,
    hist: '',
    curSeq: '',
    pendingDraw: null,
    drawCounts: [[], []],
    discards: [[], []],
    log: [],
  };

  const heroSeat = opts.heroSeat == null ? 0 : opts.heroSeat;
  const strategyMap = strategyMapOf(opts.blueprint || {});
  const decisions = [];

  let li = 0, guard = 0;
  while (!game.isTerminal(state) && li < line.length) {
    if (++guard > 500) break;
    if (game.isChance(state)) { state = game.sampleChance(state); continue; }
    const acts = game.legalActions(state);
    if (acts.length <= 1) { state = game.applyAction(state, acts[0]); continue; }
    const step = line[li++];
    const actor = game.currentPlayer(state);
    if (step.actor != null && step.actor !== actor) {
      throw new Error(`line step ${li - 1} expected actor ${step.actor} but engine says ${actor}`);
    }
    // Explicit hero discards ('d:...') are legal at draw nodes even though they
    // are not in the abstraction `acts` (FULL DISCARD CONTROL).
    const explicit = isExplicitDiscard(step.action);
    if (explicit) {
      if (state.phase !== 'draw') {
        throw new Error(`line step ${li - 1} discard ${step.action} at a non-draw node`);
      }
      keepForDiscard(state.hands[actor], step.action); // validates the thrown cards are in-hand
    } else if (acts.indexOf(step.action) < 0) {
      throw new Error(`line step ${li - 1} action ${step.action} illegal (legal: ${acts.join(',')}) at street ${state.street}/${state.phase}`);
    }
    const key = game.infosetKey(state);
    const strat = strategyFor(strategyMap, key, acts);
    decisions.push({
      actor, isHero: actor === heroSeat, kind: state.phase === 'draw' ? 'draw' : 'bet',
      street: state.street, phase: state.phase, key,
      acts: acts.slice(), chosen: step.action,
      gtoProbs: strat.probs.slice(), gtoTrained: strat.trained,
      state: snapshotState(state),
    });
    state = explicit
      ? game.applyDraw(state, keepForDiscard(state.hands[actor], step.action))
      : game.applyAction(state, step.action);
  }
  // run out any remaining forced transitions (deals / single-action nodes)
  guard = 0;
  while (!game.isTerminal(state)) {
    if (++guard > 500) break;
    if (game.isChance(state)) { state = game.sampleChance(state); continue; }
    const acts = game.legalActions(state);
    if (acts.length <= 1) { state = game.applyAction(state, acts[0]); continue; }
    break; // a real decision remains but the line is exhausted
  }

  void HS;
  return {
    game: game.id, heroSeat, decisions,
    terminal: snapshotState(state),
    utility: game.isTerminal(state) ? game.utility(state) : null,
    result: game.isTerminal(state) ? game.result(state) : null,
  };
}

module.exports = {
  dealHand,
  playWithHero,
  buildHandRecord,
  runHand,
  snapshotState,
  strategyMapOf,
  strategyFor,
  sampleIndex,
  // FULL DISCARD CONTROL — explicit hero-discard encoding (shared with grade.js)
  encodeDiscard,
  parseDiscard,
  isExplicitDiscard,
  keepForDiscard,
  cardStr,
  cardFromStr,
  game: DEFAULT_GAME,
};
