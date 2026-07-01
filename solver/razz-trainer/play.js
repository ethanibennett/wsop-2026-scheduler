// ── Razz trainer: hand generation + hero-action injection ──────────────
// Builds COMPLETED heads-up razz hands suitable for grading. Two roles:
//
//   1. dealHand(rng)       — self-play a full hand where BOTH seats sample
//                            the blueprint (reuses the playout.js loop), and
//                            return a `handRecord` (the public + private line)
//                            that grade.js can consume. The hero is one of the
//                            two seats (caller picks, default 0).
//
//   2. playWithHero(...)   — play a hand where the OPPONENT samples the
//                            blueprint and the HERO's actions come from an
//                            injected policy fn (id-list -> chosen id). This is
//                            the basis the trainer GUI will drive later: the
//                            human is the hero, the solver fills the other seat.
//
// The engine is NEVER duplicated — every state transition goes through the
// razz `game` module. We only record, alongside each hero decision, the
// minimal facts grade.js needs (a deep snapshot of the live state + the
// legal actions + the chosen action + whose turn it is).

// The game module is a PARAMETER (passed to runHand / dealHand / playWithHero
// via opts.game), defaulting to razz so existing callers are byte-identical.
// buildHandRecord stays razz-only — it is a test-only helper that uses the
// razz-specific razzBoardValue bring-in primitive.
const DEFAULT_GAME = require('../games/razz-game');
const { makeRng, cardStr, cardFromStr, rankOf, suitOf, lowRankOf } = require('../engine/cards');

// ── DEAD CARDS (folded opponents' exposed door cards) ───────────────────
// In a real ring game the heads-up pot is the survivor of a 6–9-handed table;
// the players who folded on 3rd street EXPOSED a door card that is now dead.
// We model K such cards (K seeded in [4,7], ≈ a 6–9-handed table minus the 2
// live seats). They are:
//   - drawn from the deck AFTER the hero+bot 3rd-street cards (deck slots that a
//     heads-up hand could never reach: a HU hand consumes at most 14 cards, so
//     slots 14.. are guaranteed never dealt to anyone),
//   - DETERMINISTIC from the seed (we pull our own rng off the deal rng),
//   - biased by a realistic FOLDING model (folders muck their WORST door card),
//   - never equal to any hero/bot card (guaranteed by drawing from the unused
//     tail) and FIXED for the whole hand.
//
// Folding model — folders keep low door cards and fold high ones:
//   razz  : a folder's worst door is a HIGH card (T–K); bias dead cards toward
//           high ranks. weight(rank) = lowRank(=1..13) ^ HIGH_BIAS, so a king
//           (13) is ~ (13/2)^2 ≈ 42× as likely as a deuce.
//   stud8 : weak-for-the-game doors are high cards too (a high door rarely
//           continues for a low), but the pull is MILDER (high cards still play
//           for high), so a gentler exponent.
const DEAD_HIGH_BIAS = { razz: 2.0, stud8: 1.1 };

// How many dead cards this hand has, seeded in [4,7].
function deadCount(rng) {
  return 4 + Math.floor(rng() * 4); // 4,5,6,7
}

// Weighted-without-replacement draw of `k` cards from `pool`, weight ∝
// (lowRank)^bias so HIGH ranks (ace-low 9..13) dominate. Deterministic in rng.
function drawDeadCards(pool, k, bias, rng) {
  const avail = pool.slice();
  const out = [];
  for (let n = 0; n < k && avail.length; n++) {
    let total = 0;
    const w = avail.map(c => { const x = Math.pow(lowRankOf(c), bias); total += x; return x; });
    let r = rng() * total;
    let idx = 0;
    while (idx < w.length - 1 && (r -= w[idx]) > 0) idx++;
    out.push(avail[idx]);
    avail[idx] = avail[avail.length - 1]; avail.pop();
  }
  out.sort((a, b) => a - b);
  return out;
}

// Build this hand's dead cards from a fresh state + the deal rng. Disjoint from
// every card the heads-up hand could ever use (drawn from the deck tail past the
// 8 future cards a full HU hand would deal). Returns [] when disabled.
function makeDeadCards(game, state, rng, opts) {
  // Explicit override: caller forced the exact dead cards (tests / replay).
  if (opts.deadCards) return opts.deadCards.map(c => (typeof c === 'string' ? cardFromStr(c) : c));
  // OPT-IN: dead cards are only generated when the caller asks (dead:true or a
  // deadK). Default off => every existing caller/test is byte-identical.
  if (opts.dead !== true && opts.deadK == null) return [];
  const k = opts.deadK != null ? opts.deadK : deadCount(rng);
  if (k <= 0) return [];
  // state.deck is the post-3rd-street deck (the 46 cards not yet dealt). Future
  // streets pull via deck.pop() — i.e. off the END — and a HU hand deals at most
  // 8 more cards (4th–7th × 2). So reserve the LAST 8 entries and draw the dead
  // cards from the FRONT region, which can NEVER collide with a future live card.
  const tail = state.deck.slice(0, Math.max(0, state.deck.length - 8));
  const bias = DEAD_HIGH_BIAS[game.id] != null ? DEAD_HIGH_BIAS[game.id] : 0;
  return drawDeadCards(tail, k, bias, rng);
}

// Strategy lookup with the canonical "node.a must deep-equal acts" contract
// (spot.js:7-13 / playout.js:10-16). Missing or shape-mismatched -> uniform.
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

// Deep snapshot of a live razz state. Cards are integers (engine-native);
// down/up are per-seat arrays. Everything grade.js needs to (a) reconstruct
// the infoset key for either seat and (b) roll the hand forward.
function snapshotState(s) {
  return {
    down: [s.down[0].slice(), s.down[1].slice()],
    up: [s.up[0].slice(), s.up[1].slice()],
    deck: s.deck.slice(),
    street: s.street,
    phase: s.phase,
    toAct: s.toAct,
    bets: s.bets,
    base: s.base,
    contrib: s.contrib.slice(),
    acted: s.acted.slice(),
    folded: s.folded,
    bringIn: s.bringIn,
    hist: s.hist,
    curSeq: s.curSeq,
    starter: s.starter,
    log: [],
  };
}

// Resolve a blueprint argument that may be the whole file ({strategy:{...}})
// or the bare strategy map. server.js passes strat.strategy; callers here may
// hand us either, so normalise.
function strategyMapOf(blueprint) {
  if (blueprint && blueprint.strategy && typeof blueprint.strategy === 'object') return blueprint.strategy;
  return blueprint || {};
}

// Core driver. `heroSeat` is the seat whose decisions we tag as hero nodes.
// `heroPolicy`, if given, is (acts, state, ctx) -> chosenActionId and OVERRIDES
// blueprint sampling at hero nodes (the opponent still samples the blueprint).
// If `heroPolicy` is null, the hero ALSO samples the blueprint (pure self-play).
function runHand(strategyMap, rng, heroSeat, heroPolicy, game = DEFAULT_GAME, deadOpts = {}) {
  let state = game.newHand(rng);
  // Dead cards are generated ONCE, from the deal rng, right after the 3rd-street
  // deal — disjoint from every live card, fixed for the whole hand, shown to the
  // hero. The blueprint never sees them (σ stays heads-up-trained). [] => no-op.
  const deadCards = makeDeadCards(game, state, rng, deadOpts);
  const decisions = []; // every decision node (both seats), in order
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

    let chosen;
    if (heroPolicy && actor === heroSeat) {
      chosen = heroPolicy(acts.slice(), snap, { key, strat });
      if (acts.indexOf(chosen) < 0) {
        throw new Error(`heroPolicy returned illegal action ${chosen} (legal: ${acts.join(',')})`);
      }
    } else {
      chosen = acts[sampleIndex(strat.probs, rng)];
    }

    decisions.push({
      actor,
      isHero: actor === heroSeat,
      street: state.street,
      key,
      acts: acts.slice(),
      chosen,
      gtoProbs: strat.probs.slice(),
      gtoTrained: strat.trained,
      state: snap, // pre-action live state (toAct === actor)
    });

    state = game.applyAction(state, chosen);
  }

  const utility = game.utility(state);
  return {
    game: game.id,
    heroSeat,
    decisions,
    deadCards, // folded opponents' exposed door cards (card ints); [] if none
    terminal: snapshotState(state),
    utility, // [u0, u1] net chips, zero-sum
    result: game.result(state),
  };
}

// Public: deal a completed self-play hand to grade. Both seats sample σ.
// `seed` (optional) makes it deterministic; otherwise uses the provided rng.
function dealHand(blueprint, opts = {}) {
  const strategyMap = strategyMapOf(blueprint);
  const heroSeat = opts.heroSeat == null ? 0 : opts.heroSeat;
  const game = opts.game || DEFAULT_GAME;
  const rng = opts.rng || (opts.seed != null ? makeRng(opts.seed) : makeRng((Math.random() * 0xffffffff) >>> 0));
  return runHand(strategyMap, rng, heroSeat, null, game, deadOptsOf(opts));
}

// Pluck the dead-card options out of a caller opts object. By DEFAULT no dead
// cards are generated (dead must be opted in with opts.dead:true / deadK /
// deadCards) so every existing caller + test is byte-identical.
function deadOptsOf(opts) {
  return { dead: opts.dead === true, deadK: opts.deadK, deadCards: opts.deadCards };
}

// Public: play a hand where the hero's actions are injected.
function playWithHero(blueprint, heroPolicy, opts = {}) {
  const strategyMap = strategyMapOf(blueprint);
  const heroSeat = opts.heroSeat == null ? 0 : opts.heroSeat;
  const game = opts.game || DEFAULT_GAME;
  const rng = opts.rng || (opts.seed != null ? makeRng(opts.seed) : makeRng((Math.random() * 0xffffffff) >>> 0));
  return runHand(strategyMap, rng, heroSeat, heroPolicy, game, deadOptsOf(opts));
}

// Per-game 3rd-street bring-in seat from the two door (first-up) cards.
// Mirrors each game's newHand bring-in EXACTLY (razz-game.js:169-172 /
// stud8-game.js:130-131). razz: highest razzBoardValue brings in, suit breaks
// rank ties. stud8: lowest rank (ace high), suit c<d<h<s breaks rank ties.
function bringInSeat(game, up0, up1) {
  if (game.id === 'stud8') {
    const r0 = rankOf(up0[0]), r1 = rankOf(up1[0]);
    return (r0 < r1 || (r0 === r1 && suitOf(up0[0]) < suitOf(up1[0]))) ? 0 : 1;
  }
  // razz (default)
  const v0 = game.razzBoardValue(up0), v1 = game.razzBoardValue(up1);
  if (v0 !== v1) return v0 > v1 ? 0 : 1;
  return suitOf(up0[0]) > suitOf(up1[0]) ? 0 : 1;
}

// Helper: build a handRecord from explicit cards + a scripted betting line.
// Used for hand-constructed adversarial cases in the tests. `cards` is
// { down:[[..],[..]], up:[[..],[..]] } as STRINGS or ints; `line` is an array
// of { actor, action } applied in order from a fresh 3rd-street state whose
// hole/up cards are forced to `cards`. We rebuild a state by hand (bypassing
// newHand's shuffle) so the cards are exactly as specified.
function buildHandRecord(cards, line, opts = {}) {
  // Test helper. Defaults to razz; pass opts.game for stud8. The bring-in rule
  // is the one truly game-specific bit (razz: highest door brings in via
  // razzBoardValue; stud8: lowest door, ace high, suit c<d<h<s breaks ties) —
  // computed below to match each game's newHand exactly.
  const game = opts.game || DEFAULT_GAME;
  const toInt = c => (typeof c === 'string' ? cardFromStr(c) : c);
  const down = [cards.down[0].map(toInt), cards.down[1].map(toInt)];
  const up = [cards.up[0].map(toInt), cards.up[1].map(toInt)];
  // remaining deck = everything not yet assigned (for any future deals the line implies)
  const used = new Set([...down[0], ...down[1], ...up[0], ...up[1]]);
  // allow extra board cards for later streets via cards.future (array of cards
  // dealt in deal order: [p0_4th, p1_4th, p0_5th, p1_5th, ...]).
  const future = (cards.future || []).map(toInt);
  for (const c of future) used.add(c);
  const ANTE = 1;
  const bringIn = bringInSeat(game, up[0], up[1]);

  let state = {
    deck: future.slice().reverse(), // pop() takes the LAST -> reverse so deal order is preserved
    down, up,
    street: 0, phase: 'bet', toAct: bringIn,
    bets: 0, base: ANTE, contrib: [ANTE, ANTE],
    acted: [false, false], folded: null, bringIn,
    hist: '', curSeq: '', starter: bringIn, log: [],
  };

  const heroSeat = opts.heroSeat == null ? 0 : opts.heroSeat;
  const strategyMap = strategyMapOf(opts.blueprint || {});
  const decisions = [];

  // Apply the scripted line; whenever the engine reaches a deal node, advance
  // it (pulling the next future card); record each decision node.
  let li = 0;
  let guard = 0;
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
    if (acts.indexOf(step.action) < 0) {
      throw new Error(`line step ${li - 1} action ${step.action} illegal (legal: ${acts.join(',')}) at street ${state.street}`);
    }
    const key = game.infosetKey(state);
    const strat = strategyFor(strategyMap, key, acts);
    decisions.push({
      actor, isHero: actor === heroSeat, street: state.street, key,
      acts: acts.slice(), chosen: step.action,
      gtoProbs: strat.probs.slice(), gtoTrained: strat.trained,
      state: snapshotState(state),
    });
    state = game.applyAction(state, step.action);
  }
  // run out any remaining forced transitions to terminal (deals/single-action)
  guard = 0;
  while (!game.isTerminal(state)) {
    if (++guard > 500) break;
    if (game.isChance(state)) { state = game.sampleChance(state); continue; }
    const acts = game.legalActions(state);
    if (acts.length <= 1) { state = game.applyAction(state, acts[0]); continue; }
    break; // a real decision remains but the line is exhausted
  }

  // Dead cards for hand-constructed records are passed explicitly (opts.deadCards
  // as strings or ints); default [] keeps existing constructed records identical.
  const deadCards = (opts.deadCards || []).map(toInt);

  return {
    game: game.id, heroSeat, decisions,
    deadCards,
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
  makeDeadCards,
  drawDeadCards,
  snapshotState,
  strategyMapOf,
  strategyFor,
  sampleIndex,
  cardStr,
  cardFromStr,
  game: DEFAULT_GAME,
};
