// ── MULTIWAY (3-player) razz trainer: hand generation + hero-action injection ──
// The 3-player analogue of solver/razz-trainer/play.js. Two roles, same shape:
//
//   1. dealHand3(bp, opts)      — self-play a full razz3 hand where ALL THREE seats
//                                 sample the blueprint σ, returning a `handRecord`
//                                 (public + private line) that grade3.js consumes.
//                                 The hero is one of the seats (opts.heroSeat, def 0).
//
//   2. playWithHero3(bp, pol,…) — play a hand where the TWO NON-HERO seats sample
//                                 the blueprint σ and the HERO's actions come from
//                                 an injected policy fn (acts, snap, ctx)→chosenId.
//                                 This is the basis the 3-player trainer GUI drives
//                                 later: the human is the hero, the solver fills the
//                                 other two seats at the razz3 blueprint profile.
//
// The engine is NEVER duplicated — every state transition goes through the razz3
// `game` object (razz3-game.js: legalActions/applyAction/utility/infosetKey/
// currentPlayer/isTerminal/isChance/sampleChance). We only RECORD, alongside each
// decision, the minimal facts grade3.js needs: a deep snapshot of the live state
// (3-seat arrays + deadPot/lastAgg), the legal actions, the chosen action, whose
// turn it is, and the σ mix at that infoset.
//
// DIFFERENCES FROM THE HU play.js (razz-trainer/play.js):
//   • 3 seats everywhere (down/up/contrib/acted/folded are length-3).
//   • The state carries razz3-only fields deadPot (owner-less overlay → general-sum)
//     and lastAgg (last aggressor). The snapshot preserves them so grade3 can
//     rebuild a byte-identical live state.
//   • razz3-game has NO result() method (the HU game does); we never call it.
//   • NO dead-card model here — razz3 already seeds the pot with the folded seats'
//     dead antes (deadPot) and burns the folded seats' 3rd-street cards for correct
//     removal. The "dead money" the HU trainer bolts on is intrinsic to razz3.

// razz3-game exports a makeGame FACTORY (not a ready instance like the HU
// razz-game). The blueprint was trained at cap 2 / antes 8 (razz3-game defaults),
// so we build the game with those defaults; callers may pass opts.game to override.
const { makeGame: makeRazz3 } = require('./razz3-game');
const { makeRng, cardStr, cardFromStr } = require('../engine/cards');

// Default game instance, matching the razz3 blueprint's training params (cap 2,
// antes 8). Constructed once; the deterministic newHand takes the rng as an arg.
const DEFAULT_GAME = makeRazz3({ cap: 2, antes: 8 });

// Resolve a blueprint argument that may be the whole file ({strategy:{...}} or
// {meta,strategy}) or a bare strategy map. The razz3 blueprint ships as
// {meta, strategy}; grade7.sigmaProbs and the grinds read `.strategy`.
function strategyMapOf(blueprint) {
  if (blueprint && blueprint.strategy && typeof blueprint.strategy === 'object') return blueprint.strategy;
  if (blueprint && blueprint.nodes && typeof blueprint.nodes === 'object') return blueprint.nodes;
  if (blueprint && blueprint.avg && typeof blueprint.avg === 'object') return blueprint.avg;
  return blueprint || {};
}

// Strategy lookup with the canonical "node.a must deep-equal acts" contract (the
// same contract grade7.sigmaProbs / measure3 / br3 use). Missing or shape-
// mismatched → uniform over the legal actions (flagged untrained).
function strategyFor(strategyMap, key, acts) {
  const node = strategyMap[key];
  if (node && node.a && node.a.length === acts.length && node.a.every((a, i) => a === acts[i])) {
    return { probs: node.p.slice(), trained: true };
  }
  return { probs: acts.map(() => 1 / acts.length), trained: false };
}

function sampleIndex(probs, rng) {
  let r = rng();
  for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r <= 0) return i; }
  return probs.length - 1;
}

// Deep snapshot of a live razz3 state. Cards are integers (engine-native); the
// per-seat arrays are length-3. Everything grade3.js needs to (a) reconstruct the
// infoset key for any seat, (b) rebuild a byte-identical live state via cloneState,
// and (c) enumerate the reach-consistent opponent support.
function snapshotState(s) {
  return {
    down: [s.down[0].slice(), s.down[1].slice(), s.down[2].slice()],
    up: [s.up[0].slice(), s.up[1].slice(), s.up[2].slice()],
    deck: s.deck.slice(),
    street: s.street,
    phase: s.phase,
    toAct: s.toAct,
    bets: s.bets,
    base: s.base,
    contrib: s.contrib.slice(),
    acted: s.acted.slice(),
    folded: s.folded.slice(),
    bringIn: s.bringIn,
    lastAgg: s.lastAgg,
    hist: s.hist,
    curSeq: s.curSeq,
    starter: s.starter,
    deadPot: s.deadPot,
    log: [],
  };
}

// Core driver. `heroSeat` is the seat whose decisions we tag as hero nodes.
// `heroPolicy`, if given, is (acts, snap, ctx)→chosenActionId and OVERRIDES the
// blueprint sampling at hero nodes (the two OTHER seats still sample the blueprint).
// If `heroPolicy` is null, the hero ALSO samples the blueprint (pure self-play).
function runHand3(strategyMap, rng, heroSeat, heroPolicy, game = DEFAULT_GAME) {
  let state = game.newHand(rng);
  const decisions = []; // every decision node (all seats), in order
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
      // opponents (and, in self-play, the hero too) sample the blueprint σ
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

  const utility = game.utility(state); // [u0,u1,u2]; general-sum (deadPot overlay)
  return {
    game: game.id,
    heroSeat,
    nseat: game.NSEAT || 3,
    decisions,
    terminal: snapshotState(state),
    utility,
  };
}

// Public: deal a completed self-play hand to grade. All 3 seats sample σ.
// `seed` (optional) makes it deterministic; otherwise uses the provided/fresh rng.
function dealHand3(blueprint, opts = {}) {
  const strategyMap = strategyMapOf(blueprint);
  const heroSeat = opts.heroSeat == null ? 0 : opts.heroSeat;
  const game = opts.game || DEFAULT_GAME;
  const rng = opts.rng || (opts.seed != null ? makeRng(opts.seed) : makeRng((Math.random() * 0xffffffff) >>> 0));
  return runHand3(strategyMap, rng, heroSeat, null, game);
}

// Public: play a hand where the hero's actions are injected (the trainer path).
function playWithHero3(blueprint, heroPolicy, opts = {}) {
  const strategyMap = strategyMapOf(blueprint);
  const heroSeat = opts.heroSeat == null ? 0 : opts.heroSeat;
  const game = opts.game || DEFAULT_GAME;
  const rng = opts.rng || (opts.seed != null ? makeRng(opts.seed) : makeRng((Math.random() * 0xffffffff) >>> 0));
  return runHand3(strategyMap, rng, heroSeat, heroPolicy, game);
}

module.exports = {
  dealHand3,
  playWithHero3,
  runHand3,
  snapshotState,
  strategyMapOf,
  strategyFor,
  sampleIndex,
  cardStr,
  cardFromStr,
  game: DEFAULT_GAME,
};
