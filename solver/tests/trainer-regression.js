#!/usr/bin/env node
// ── Mixed-games TRAINER regression suite ─────────────────────────────────────
// Run:  node solver/tests/trainer-regression.js
//   or: npm run test:trainer
//
// Guards the 5-game Trainer (razz / stud8 / td27 / badugi / a5td) so it can't
// SILENTLY break. This suite is ADDITIVE — it does not change any engine / grader
// / server behaviour. It tests the libraries the trainer routes are a thin
// wrapper over (solver/razz-trainer + solver/draw-trainer + solver/games) plus the
// invariants the server's payload builders enforce (server.js razzToState /
// drawToState / *ResultPayload / razzHeroSeat). Where the existing selftests
// already prove a property (the stud/draw grade gates), we REUSE them via
// subprocess instead of duplicating them.
//
// Invariants covered (per the trainer spec):
//   1. NO CARD LEAK   — a FOLD never exposes the opponent's hidden cards in the
//                       client-facing deal/step/grade payload; opponent cards
//                       appear only on an actual SHOWDOWN result. (The leak-scan
//                       CARD_RE is pinned to the canonical T-form cardStr emits.)
//   2. DEAL CONTRACT  — each game's deal returns the right client shape; heroSeat
//                       is recomputable from the seed alone (seed & 1).
//   3. DETERMINISM    — same seed -> identical deal AND identical grade; PLUS a
//                       draw hand's grade is invariant to BATCH ORDER (guards the
//                       lbr-draw memoizeCfg cache-order nondeterminism).
//   4. GRADE SANITY   — STUD: the exact-forward⇔samplesUsed==0 coupling (the real
//                       structural property; evLossSE==0 is its util:null consequence,
//                       NOT an independent noise measurement — see realBugsFound).
//                       DRAW: the exact-forward FORWARD TREE is genuinely noise-free
//                       (single-particle SE==0 with best≠chosen, driving pairedSE
//                       THROUGH its computation — not a best===chosen short-circuit);
//                       multi-particle exact-forward range-sampling SE is REPORTED.
//   4b. EV-LOSS MATH  — evLoss == max(0, bestEV − chosenEV), strict for BOTH the
//                       stud and (post benchmark-0-clamp fix) draw graders.
//   4c. NUT SANITY    — on an OBVIOUS nut spot a value action grades small and the
//                       blunder (folding the nut) grades LARGE + is the WORST action:
//                       stud (razz/stud8, exact 7th) AND draw (td27/badugi/a5td,
//                       exact post-last-draw) in-process — closes the a5td cell.
//   4d. DRAW SELFTEST — the FAST draw selftests (12/12 gates each) reused as
//                       subprocesses (skippable via TRAINER_FAST=1).
//   5. DEAD CARDS     — seeded stud dead cards never collide with live/opp cards.
//   6. DISCARD CTRL   — an explicit discard equal to cfg.chooseKeep grades
//                       IDENTICALLY to the matching abstraction draw option.
//
// FIXED SEEDS, fast + deterministic. Math.random is monkeypatched to THROW during
// the in-process run, so any future case that forgets its seed fails LOUDLY rather
// than flaking. The stud8 retrain may be running in the background; this suite does
// NOT depend on any blueprint being converged — it only asserts SHAPE / LEAK /
// DETERMINISM / internal-consistency invariants. TRAINER_FAST=1 skips the two
// subprocess selftests (their grade-sanity is also covered in-process by 4c-draw).

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { makeRng, cardStr } = require('../engine/cards');
const { GAMES } = require('../games');
const razzPlay = require('../razz-trainer/play');
const razzGrade = require('../razz-trainer/grade');
const drawPlay = require('../draw-trainer/play');
const drawGrade = require('../draw-trainer/grade');

const STRAT_DIR = path.join(__dirname, '..', 'strategies');
const STUD_GAMES = ['razz', 'stud8'];
const DRAW_GAMES = ['td27', 'badugi', 'a5td'];
const ALL_GAMES = [...STUD_GAMES, ...DRAW_GAMES];

// ── harness (matches solver/tests/run-tests.js) ─────────────────────────────
let passed = 0, failed = 0, skipped = 0;
const reports = []; // surfaced real bugs / notable findings
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) {
    if (e && e.SKIP) { skipped++; console.log(`SKIP  ${name}  (${e.message})`); return; }
    failed++; console.log(`FAIL  ${name}\n      ${e && e.message}`);
  }
}
function skip(msg) { const e = new Error(msg); e.SKIP = true; throw e; }
function report(line) { reports.push(line); }

// ── ENFORCE "every path is seeded" (determinism hardening) ───────────────────
// The trainer libs + grade CLIs fall back to Math.random() when no seed/rng is
// given (razz-trainer/play.js, draw-trainer/play.js, both grade.js CLIs). The
// suite is safe by CONVENTION today (every dealHand/gradeHand/playWithHero call
// passes an explicit numeric seed; verified: 0 Math.random hits across all seeded
// in-process paths). We make that convention an ENFORCED invariant: monkeypatch
// Math.random to THROW, so a future added case that omits its seed fails LOUDLY
// (with the message below) instead of silently flaking. The real Math.random is
// restored only around the intentional subprocess boundary (runSelftest spawns
// child processes with their own fixed seeds; process spawn may touch the host
// RNG) and at the summary.
const REAL_RANDOM = Math.random;
function armRandomGuard() {
  Math.random = function () {
    throw new Error(
      'UNSEEDED RNG: Math.random() was called during the in-process suite. ' +
      'Every dealHand/gradeHand/playWithHero/perActionEV call must pass an explicit ' +
      'seed (or rng) — a path fell back to the Math.random default, which would flake. ' +
      'Add the missing seed to the offending call.');
  };
}
function disarmRandomGuard() { Math.random = REAL_RANDOM; }
// Run `fn` with the real Math.random restored (for intentional non-seeded host ops
// like child-process spawn), re-arming the guard afterwards.
function withRealRandom(fn) {
  disarmRandomGuard();
  try { return fn(); } finally { armRandomGuard(); }
}
armRandomGuard();

// Blueprint loader — mirrors server.getTrainerBp (reads solver/strategies/<id>.json).
// These files can be large + a clone may be pruned; skip cleanly if absent.
const _bp = {};
function bp(gameId) {
  if (gameId in _bp) return _bp[gameId];
  const file = path.join(STRAT_DIR, `${gameId}.json`);
  _bp[gameId] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  return _bp[gameId];
}
function needBp(gameId) { const b = bp(gameId); if (!b) skip(`no ${gameId}.json`); return b; }

const trainerOf = g => (DRAW_GAMES.includes(g) ? drawPlay : razzPlay);
const graderOf = g => (DRAW_GAMES.includes(g) ? drawGrade : razzGrade);
// heroSeat is a pure function of the seed (server.js razzHeroSeat). The deal/step
// contract relies on this so /step can recompute it from {seed} alone.
const heroSeatFromSeed = seed => seed & 1;

// All 2-char card strings that appear ANYWHERE in a value (deep walk). Used to
// prove the opponent's hidden cards never appear in a client-facing payload.
// engine cardStr() emits ten as 'T' (never '10'), so the regex matches the single
// canonical form; the CARD_RE_CANONICAL test below pins that the emitter can't
// diverge from this notation.
const CARD_RE = /^[2-9TJQKA][shdc]$/;
function collectCardStrings(v, out) {
  if (v == null) return out;
  if (typeof v === 'string') { if (CARD_RE.test(v)) out.add(v); return out; }
  if (Array.isArray(v)) { for (const x of v) collectCardStrings(x, out); return out; }
  if (typeof v === 'object') { for (const k of Object.keys(v)) collectCardStrings(v[k], out); return out; }
  return out;
}

// ── Server-payload mirrors ───────────────────────────────────────────────────
// Faithful re-implementations of the leak guards in server.js so we can assert
// the client-facing payload contract without standing up Express (and without
// the deal route's Math.random seed). Kept in lock-step with:
//   server.js trainerResultPayload   (stud showdown-only oppDown)
//   server.js drawResultPayload      (draw showdown-only oppCards)
//   server.js razzToState / drawToState (state never serializes opp hidden cards)
// If the server's guard logic changes, these mirrors + the leak tests below are
// the canary.
function studResultPayload(game, term, heroDelta, heroSeat) {
  const resu = game.result(term);
  const opp = 1 - heroSeat;
  const isStud8 = game.id === 'stud8';
  let showdown = null;
  if (resu.type === 'showdown') {
    if (isStud8) {
      showdown = {
        hi: { heroHand: resu.players[heroSeat].hi, oppHand: resu.players[opp].hi },
        lo: { heroLow: resu.players[heroSeat].lo, oppLow: resu.players[opp].lo },
        oppDown: resu.players[opp].down,
      };
    } else {
      showdown = {
        heroLow: resu.players[heroSeat].lo,
        oppLow: resu.players[opp].lo,
        oppDown: resu.players[opp].down,
      };
    }
  }
  return { heroDelta, endType: resu.type, showdown };
}
function drawResultPayload(game, term, heroDelta, heroSeat) {
  const resu = game.result(term);
  const opp = 1 - heroSeat;
  const showdown = resu.type === 'showdown'
    ? { heroHand: resu.players[heroSeat].label, oppHand: resu.players[opp].label, oppCards: resu.players[opp].cards }
    : null;
  return { heroDelta, endType: resu.type, showdown };
}
const resultPayloadOf = g => (DRAW_GAMES.includes(g) ? drawResultPayload : studResultPayload);

// Build the client-facing `state` for a stud snapshot — mirrors razzToState's
// field set (NEVER serializes the opponent's down cards; only oppUp + deadCards)
// INCLUDING the action `log` (server builds each entry's `label` via
// game.actionLabel, which must never embed a card — walking it here makes the
// leak scan a canary against a future card-leaking label).
function studState(game, s, heroSeat, deadCards, decisions) {
  const opp = 1 - heroSeat;
  return {
    street: s.street,
    heroUp: s.up[heroSeat].map(cardStr),
    heroDown: s.down[heroSeat].map(cardStr),
    oppUp: s.up[opp].map(cardStr),
    deadCards: (deadCards || []).map(cardStr),
    toAct: s.toAct,
    log: (decisions || []).map(d => ({
      seat: d.actor, street: d.street, actionId: d.chosen,
      label: game.actionLabel(d.chosen, d.state),
    })),
  };
}
// Mirrors drawToState — heroCards only, opponent hand never serialized; the draw
// `log` labels are walked too (same canary rationale as studState).
function drawState(game, s, heroSeat, decisions) {
  const opp = 1 - heroSeat;
  return {
    game: game.id,
    street: s.street,
    phase: s.phase,
    heroCards: s.hands[heroSeat].map(cardStr),
    oppDrawCounts: s.drawCounts[opp].slice(),
    toAct: s.toAct,
    log: (decisions || []).map(d => ({
      seat: d.actor, street: d.street, phase: d.phase, actionId: d.chosen,
      label: game.actionLabel(d.chosen, d.state),
    })),
  };
}

// Deal a full hand to terminal deterministically, returning the handRecord + the
// snapshot the server would build the deal `state` from. Mirrors the server's
// replayRazz/replayDraw enough to exercise the same shapes / guards.
function dealToTerminal(gameId, seed) {
  const game = GAMES[gameId];
  const b = needBp(gameId);
  const heroSeat = heroSeatFromSeed(seed);
  const opts = { seed, heroSeat, game };
  if (STUD_GAMES.includes(gameId)) opts.dead = true; // stud trainer seeds dead cards
  const rec = trainerOf(gameId).dealHand(b, opts);
  return { game, heroSeat, rec };
}

// ── draw post-last-draw (street-3) BET fixtures ───────────────────────────────
// A deal-free street-3 bet snapshot (post-3rd-draw): both players pat, hero (seat
// 0) faces a big bet → f/c/r legal, and the forward tree has NO chance nodes, so
// grade.perActionEV takes the EXACT-FORWARD path. Mirrors draw-trainer/
// grade.test.js's street3BetSnap so the in-suite draw grade-sanity cells reuse the
// exact spot the draw selftests already validate. Fully deterministic (no seed).
function drawStreet3BetSnap(game, heroSeat, heroHand) {
  const opp = 1 - heroSeat;
  const contrib = [0, 0];
  contrib[opp] = 12; contrib[heroSeat] = 8;           // hero faces 4 to call (big bet)
  const hands = [];
  hands[heroSeat] = heroHand.slice();
  hands[opp] = [];                                     // filled per-particle
  return {
    deck: [], hands, street: 3, phase: 'bet', toAct: heroSeat,
    bets: 1, contrib, acted: heroSeat === 1 ? [true, false] : [false, true],
    folded: null, hist: '', curSeq: 'b', pendingDraw: null,
    drawCounts: [[0, 0, 0], [0, 0, 0]], discards: [[], []], log: [],
  };
}
// Run the grader's exact-forward per-action EV over an EXPLICIT opponent particle
// range (bypasses the sampled posterior). Deterministic; `res.exact` is true.
function drawEvExplicit(game, strategyMap, snap, heroSeat, oppHands) {
  const parts = oppHands.map(h => ({ hand: h.slice(), discards: [], w: 1 / oppHands.length }));
  const live = drawGrade.cloneState(snap);
  return drawGrade.perActionEV(game, strategyMap, live, heroSeat, game.legalActions(live), parts, {
    evParticles: oppHands.length, shuffleRng: makeRng(99),
  });
}
const H = s => s.split(' ').map(c => require('../engine/cards').cardFromStr(c));
const strategyMapOf = b => (b && b.strategy) || {};
// Per-game post-last-draw NUT hero hand + a small worse-made opponent field. The
// hero holds the pat nut low; folding it must be the WORST action with a large
// evLoss (the grade-sanity blunder direction), a value action (raise/call) is best.
const DRAW_NUT_FIXTURE = {
  td27:   { hero: '7s 5d 4c 3h 2s', opp: ['8h 6c 5s 4d 3d', '9c 8s 7d 6h 4h', 'Td 8c 6s 5h 4d'] },
  a5td:   { hero: 'As 2h 3d 4c 5s', opp: ['8c 6d 7h 9s Ts', '9d 7c 6h Jd Qh', 'Tc 8h 7s Jc Kd'] },
  badugi: { hero: 'As 2h 3d 4c',    opp: ['8s 6h 5d 2c', '9s 7h 6d 3c', 'Ts 8d 7c 5h'] },
};
// Build the nut fixture for a game, dropping opp hands that collide with the hero
// (card-disjointness is required for a legal particle).
function drawNutFixture(gameId) {
  const game = GAMES[gameId];
  const fx = DRAW_NUT_FIXTURE[gameId];
  const hero = H(fx.hero);
  const fullN = 2 * game.cfg.handSize;
  const opp = fx.opp.map(H).filter(h => new Set([...hero, ...h]).size === fullN);
  return { game, hero, opp };
}

// ── 1. NO CARD LEAK ──────────────────────────────────────────────────────────
console.log('— invariant 1: no card leak on a FOLD —');
for (const gameId of ALL_GAMES) {
  test(`${gameId}: a FOLD result never exposes the opponent's hidden cards`, () => {
    const game = GAMES[gameId];
    const b = needBp(gameId);
    const makePayload = resultPayloadOf(gameId);
    let foundFold = false, foundShowdown = false;
    // Scan fixed seeds; both seats as hero so we cover both fold directions.
    for (let seed = 1; seed <= 200 && !(foundFold && foundShowdown); seed++) {
      const heroSeat = heroSeatFromSeed(seed);
      const opp = 1 - heroSeat;
      const opts = { seed, heroSeat, game };
      if (STUD_GAMES.includes(gameId)) opts.dead = true;
      const rec = trainerOf(gameId).dealHand(b, opts);
      const term = rec.terminal;
      const resu = game.result(term);
      const heroDelta = rec.utility[heroSeat];
      const payload = makePayload(game, term, heroDelta, heroSeat);

      // The OPPONENT's hidden cards in this hand (engine truth, from the raw
      // terminal snapshot — NOT what the client should see).
      const oppHidden = STUD_GAMES.includes(gameId)
        ? new Set(term.down[opp].map(cardStr))          // stud: opp's down cards
        : new Set(term.hands[opp].map(cardStr));        // draw: opp's whole hand
      assert(oppHidden.size > 0, 'opponent has hidden cards');

      // What the client actually receives at the terminal: result payload + the
      // serialized terminal state the server would send (incl. the whole-hand
      // action log, whose labels we also walk for card leaks).
      const clientState = STUD_GAMES.includes(gameId)
        ? studState(game, term, heroSeat, rec.deadCards, rec.decisions)
        : drawState(game, term, heroSeat, rec.decisions);
      const exposed = new Set();
      collectCardStrings(payload, exposed);
      collectCardStrings(clientState, exposed);

      if (resu.type === 'fold') {
        foundFold = true;
        // The fold guard: payload.showdown is null, so NONE of the opponent's
        // hidden cards may appear anywhere in the client-facing output.
        assert.strictEqual(payload.showdown, null, 'fold payload has no showdown block');
        for (const c of oppHidden) {
          assert(!exposed.has(c),
            `LEAK: opponent hidden card ${c} exposed on a FOLD (seed ${seed})`);
        }
      } else if (resu.type === 'showdown') {
        foundShowdown = true;
        // Sanity for the contrast: on a real showdown the opponent IS revealed.
        assert(payload.showdown, 'showdown payload present');
        const showExposed = new Set();
        collectCardStrings(payload.showdown, showExposed);
        for (const c of oppHidden) {
          assert(showExposed.has(c),
            `showdown should reveal opponent card ${c} (seed ${seed})`);
        }
      }
    }
    assert(foundFold, 'covered at least one FOLD hand');
    assert(foundShowdown, 'covered at least one SHOWDOWN hand');
  });
}

// ── 2. DEAL / STEP CONTRACT ──────────────────────────────────────────────────
console.log('— invariant 2: deal shape + heroSeat-from-seed —');
test('heroSeat is recomputable from the seed alone (seed & 1), deterministic + binary', () => {
  for (let seed = 0; seed < 2000; seed++) {
    const a = heroSeatFromSeed(seed), bseat = heroSeatFromSeed(seed);
    assert.strictEqual(a, bseat, 'deterministic');
    assert(a === 0 || a === 1, `binary seat (got ${a})`);
  }
});
test('cardStr emits the canonical T-form for every card (never "10") — keeps CARD_RE + the emitter in lock-step', () => {
  // The leak-scan CARD_RE is /^[2-9TJQKA][shdc]$/ (single canonical form). Pin that
  // cardStr can never emit '10h', which would slip past the scan and diverge the
  // repo's card notation. Walk the full 52-card deck.
  let seen = 0;
  for (let c = 0; c < 52; c++) {
    const s = cardStr(c);
    assert(/^[2-9TJQKA][shdc]$/.test(s), `cardStr(${c}) = "${s}" is not canonical 2-char T-form`);
    assert(!s.startsWith('10'), `cardStr(${c}) = "${s}" emits the non-canonical '10' ten-notation`);
    assert(CARD_RE.test(s), `cardStr(${c}) = "${s}" must match the leak-scan CARD_RE`);
    seen++;
  }
  assert.strictEqual(seen, 52, 'walked all 52 cards');
});
for (const gameId of STUD_GAMES) {
  test(`${gameId} (stud) deal: upcards + heroDown + dead-cards panel present, opp down absent`, () => {
    const { rec, heroSeat } = dealToTerminal(gameId, 31);
    // The deal snapshot the server serializes is the hero's FIRST decision node;
    // for shape purposes the terminal snapshot carries the same fields.
    const term = rec.terminal;
    const st = studState(GAMES[gameId], term, heroSeat, rec.deadCards, rec.decisions);
    assert(Array.isArray(st.heroUp) && st.heroUp.length >= 1, 'hero upcards present');
    assert(Array.isArray(st.heroDown) && st.heroDown.length >= 1, 'hero down cards present');
    assert(Array.isArray(st.oppUp) && st.oppUp.length >= 1, 'opponent UP cards present (visible)');
    assert('deadCards' in st && Array.isArray(st.deadCards), 'dead-cards panel present');
    assert(st.deadCards.length > 0, 'stud deal seeds a non-empty dead-cards panel');
    // No serialized field carries the opponent's DOWN cards.
    assert(!('oppDown' in st), 'opponent down cards are not serialized into the deal state');
  });
}
for (const gameId of DRAW_GAMES) {
  test(`${gameId} (draw) deal: hero hand present, opponent hidden, draw decision offered`, () => {
    const game = GAMES[gameId];
    const b = needBp(gameId);
    const heroSeat = heroSeatFromSeed(31);
    // Drive to the hero's first decision (server stops there for /deal); using a
    // policy that throws at the first hero node lets us inspect a live decision.
    const rec = drawPlay.dealHand(b, { seed: 31, heroSeat, game });
    const st = drawState(game, rec.terminal, heroSeat, rec.decisions);
    assert(Array.isArray(st.heroCards) && st.heroCards.length === game.cfg.handSize,
      `hero holds ${game.cfg.handSize} cards`);
    assert(!('oppCards' in st) && !('oppHand' in st) && !('hands' in st),
      'opponent hand is hidden in the deal state');
    // A draw decision is OFFERED somewhere in the hand: at least one hero decision
    // is a draw node carrying draw options (d0..dK).
    const heroDraw = rec.decisions.find(d => d.isHero && d.kind === 'draw');
    assert(heroDraw, 'a hero draw decision exists in the hand');
    assert(heroDraw.acts.every(a => /^d\d+$/.test(a)),
      `draw node offers dK options (got ${heroDraw.acts.join(',')})`);
  });
}

// ── 3. DETERMINISM ───────────────────────────────────────────────────────────
console.log('— invariant 3: same seed -> identical deal + identical grade —');
function dealSig(rec) {
  return JSON.stringify({
    u: rec.utility,
    t: rec.result && rec.result.type,
    dead: (rec.deadCards || []).slice(),
    dec: rec.decisions.map(d => [d.actor, d.kind, d.key, d.chosen]),
  });
}
function gradeSig(g) {
  return JSON.stringify(g.grades.map(x => [
    x.street, x.kind, x.heroActionId ?? x.chosen, x.bestActionId ?? x.bestAction,
    round(x.evLoss),
  ]));
}
const round = x => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x);
for (const gameId of ALL_GAMES) {
  test(`${gameId}: deal is byte-identical for a repeated seed`, () => {
    const game = GAMES[gameId];
    const b = needBp(gameId);
    const heroSeat = heroSeatFromSeed(909);
    const opts = { seed: 909, heroSeat, game };
    if (STUD_GAMES.includes(gameId)) opts.dead = true;
    const a = trainerOf(gameId).dealHand(b, opts);
    const c = trainerOf(gameId).dealHand(b, opts);
    assert.strictEqual(dealSig(a), dealSig(c), 'identical deal record');
  });
  test(`${gameId}: grade is identical for a repeated seed (same-input determinism)`, () => {
    const game = GAMES[gameId];
    const b = needBp(gameId);
    const heroSeat = heroSeatFromSeed(909);
    const opts = { seed: 909, heroSeat, game };
    if (STUD_GAMES.includes(gameId)) opts.dead = true;
    const rec = trainerOf(gameId).dealHand(b, opts);
    // Grade the SAME record twice with the same seed, back-to-back — pure same-input
    // determinism. (The BATCH-ORDER cache scenario is a separate test below.)
    const gOpts = DRAW_GAMES.includes(gameId)
      ? { seed: 909, N: 120, game }
      : { seed: 909, samples: 800, game };
    const g1 = graderOf(gameId).gradeHand(rec, b, gOpts);
    const g2 = graderOf(gameId).gradeHand(rec, b, gOpts);
    assert.strictEqual(gradeSig(g1), gradeSig(g2), 'identical grade');
  });
}
// BATCH-ORDER determinism (the documented lbr-draw memoizeCfg cache-order failure
// mode: "11.98 isolated vs 10.55 after a batch" — a hand's grade depending on how
// many OTHER hands were graded before it). The same-input test above never exercises
// this because no other hand is graded between its two calls. Here we grade a target
// hand IN ISOLATION, then grade N unrelated hands, then re-grade the target, and
// require its gradeSig to be byte-identical. Draw games only (the cache-order effect
// lives in the shared lbr-draw particle machinery).
for (const gameId of DRAW_GAMES) {
  test(`${gameId}: target grade is invariant to batch order (guards lbr-draw cache-order)`, () => {
    const game = GAMES[gameId];
    const b = needBp(gameId);
    const seed = 909, heroSeat = heroSeatFromSeed(seed);
    const rec = drawPlay.dealHand(b, { seed, heroSeat, game });
    const gOpts = { seed, N: 120, game };
    // Isolated grade FIRST (fresh — nothing graded before it).
    const isolated = gradeSig(drawGrade.gradeHand(rec, b, gOpts));
    // Grade several UNRELATED hands to churn the memoizeCfg cache order.
    for (let s = 1; s <= 6; s++) {
      const r2 = drawPlay.dealHand(b, { seed: s, heroSeat: heroSeatFromSeed(s), game });
      drawGrade.gradeHand(r2, b, { seed: s, N: 120, game });
    }
    // Re-grade the target: must match the isolated signature byte-for-byte.
    const afterBatch = gradeSig(drawGrade.gradeHand(rec, b, gOpts));
    assert(rec.decisions.some(d => d.isHero), 'target hand has at least one hero grade');
    assert.strictEqual(afterBatch, isolated,
      `grade of the target hand changed after grading ${6} unrelated hands first — the lbr-draw memoizeCfg cache-order nondeterminism has resurfaced`);
  });
}

// ── 4. GRADE SANITY: exact-forward grades have SE == 0 ───────────────────────
console.log('— invariant 4: exact-forward (stud 7th / post-last-draw) grades are SE≈0 —');
// STUD (razz/stud8): a 7th-street grade is labelled `exact-forward` because the
// opponent RANGE is exactly enumerated (rangeMode 'exact-range') and no more cards
// are dealt. Its evLossSE is 0 — but that 0 is a WIRING consequence, not an
// independent measurement: exact-forward sets result.util=null, and pairSE returns
// 0 immediately when util is null (razz-trainer/grade.js:416). So `evLossSE===0`
// can only fail if the two branches are UNWIRED — it cannot catch an incorrect SE.
//
// The REAL coupling being guarded is `forwardMode==='exact-forward' ⇔ samplesUsed===0`
// (the exact-forward path sets samplesUsed:0; the mc-forward path sets it to the
// sampled count). We assert that coupling in BOTH directions — a genuine,
// catchable structural property — and keep evLossSE===0 as its documented
// consequence (labelled as such, not as a noise measurement).
//
// NOTE (recorded in realBugsFound): the exact-forward EV is NOT actually seed-
// independent even though evLossSE reads 0 — rolloutAfterAction SAMPLES the
// opponent's remaining 7th-street betting via sigmaAction(rng) rather than taking
// a σ-expectation, so the per-action EV shifts with the crn seed (observed swings
// up to ~36 chips across seeds on stud8). We therefore do NOT assert cross-seed EV
// reproducibility here (it would fail); the sound structural guard is the coupling.
for (const gameId of STUD_GAMES) {
  test(`${gameId}: exact-forward ⇔ samplesUsed==0 coupling holds (with evLossSE==0 as its consequence)`, () => {
    const game = GAMES[gameId];
    const b = needBp(gameId);
    let exactFwd = 0, mcFwd = 0;
    for (let seed = 1; seed <= 120 && exactFwd < 3; seed++) {
      const heroSeat = heroSeatFromSeed(seed);
      const rec = trainerOf(gameId).dealHand(b, { seed, heroSeat, game, dead: true });
      const g = graderOf(gameId).gradeHand(rec, b, { seed, samples: 400, game });
      for (const gr of g.grades) {
        if (gr.forwardMode === 'exact-forward') {
          exactFwd++;
          // The real coupling: exact-forward path ⇒ zero sampled particles.
          assert.strictEqual(gr.samplesUsed, 0,
            `exact-forward grade must report samplesUsed===0 (got ${gr.samplesUsed} at street ${gr.street}, seed ${seed})`);
          // Documented consequence of util:null (a wiring check, not a noise check).
          assert.strictEqual(gr.evLossSE || 0, 0,
            `exact-forward grade reports evLossSE 0 via the util:null path (got ${gr.evLossSE}, seed ${seed})`);
        } else if (gr.forwardMode === 'mc-forward') {
          mcFwd++;
          // The other direction: an mc-forward grade DID sample (samplesUsed>0).
          assert(gr.samplesUsed > 0,
            `mc-forward grade must report samplesUsed>0 (got ${gr.samplesUsed} at street ${gr.street}, seed ${seed})`);
        }
      }
    }
    if (!exactFwd) skip('no exact-forward hero grade in the sampled seeds');
    assert(mcFwd > 0, 'the coupling was exercised in BOTH directions (some mc-forward grades seen)');
  });
}
// DRAW (td27/badugi/a5td): on the post-last-draw street a grade is labelled
// `exact-forward`, and its FORWARD TREE is genuinely deal-free (deterministic).
// But evLossSE here is NOT a forward-tree-noise measure — it is the PAIRED SE of
// the realised (best − chosen) difference ACROSS THE SAMPLED OPPONENT PARTICLES
// (pairedSE, draw-trainer/grade.js:281). So an exact-forward grade with best≠chosen
// still reports a NON-ZERO evLossSE from the finite-range sampling, even though the
// forward tree carries no noise (verified: pairedSE(res,'r','f',used) ≈ 0.17 on a
// multi-particle nut spot). The genuinely-load-bearing property is therefore:
//
//   the FORWARD TREE itself is noise-free — with a SINGLE opponent particle (which
//   zeroes the range-sampling variance), an exact-forward grade with best≠chosen
//   must report evLossSE EXACTLY 0. This drives pairedSE THROUGH its computation
//   (it does NOT short-circuit on best===chosen, since best='r'≠chosen='f') and
//   proves the deal-free rollout is deterministic — NOT a `best===chosen` tautology.
//
// We assert that on a DETERMINISTIC in-process fixture (so it ALWAYS runs — the old
// seed-scan `bothFold` branch fired 0× for td27, making the test vacuous), and we
// keep the advisory seed-scan REPORT that multi-particle exact-forward grades carry
// real range-sampling SE (so the "exact-forward ⇒ SE≈0" claim is not over-stated).
for (const gameId of DRAW_GAMES) {
  test(`${gameId}: exact-forward FORWARD TREE is noise-free (single-particle SE==0 with best≠chosen)`, () => {
    const { game, hero, opp } = drawNutFixture(gameId);
    const b = needBp(gameId);
    const sm = strategyMapOf(b);
    assert(opp.length >= 1, 'fixture has at least one opponent particle');
    const snap = drawStreet3BetSnap(game, 0, hero);
    // ONE particle → range-sampling variance is identically 0, isolating the pure
    // forward-tree noise. If the deal-free rollout ever became non-deterministic
    // (e.g. an added chance node past this street), this SE would go positive.
    const res = drawEvExplicit(game, sm, snap, 0, [opp[0]]);
    assert.strictEqual(res.exact, true, 'the post-last-draw bet node takes the exact-forward path');
    const acts = game.legalActions(snap);
    let bestA = acts[0]; for (const a of acts) if (res.ev[a] > res.ev[bestA]) bestA = a;
    assert(bestA !== 'f',
      `the EV-best action vs the nut is a value action, so best≠chosen('f') drives pairedSE through its computation (got best '${bestA}')`);
    const se = drawGrade.pairedSE(res, bestA, 'f', res.used);
    assert.strictEqual(se, 0,
      `exact-forward forward tree must be noise-free: single-particle pairedSE(best='${bestA}', chosen='f') must be 0 (got ${se})`);

    // Advisory: multi-particle exact-forward grades DO carry a (range-sampling) SE.
    let mislabeled = 0, maxSE = 0, found = 0;
    for (let seed = 1; seed <= 160 && mislabeled < 8; seed++) {
      const heroSeat = heroSeatFromSeed(seed);
      const rec = drawPlay.dealHand(b, { seed, heroSeat, game });
      const g = drawGrade.gradeHand(rec, b, { seed, N: 80, game });
      for (const gr of g.grades) {
        if (gr.forwardMode !== 'exact-forward') continue;
        found++;
        const s = gr.evLossSE || 0;
        if (gr.heroActionId !== gr.bestActionId && s > 1e-9) { mislabeled++; if (s > maxSE) maxSE = s; }
      }
    }
    if (mislabeled > 0) {
      report(`${gameId}: ${mislabeled}+ grade(s) labelled forwardMode:'exact-forward' carry non-zero evLossSE (up to ${maxSE.toFixed(2)} chips) — this SE is the paired difference across the SAMPLED opponent range (pairedSE), NOT forward-tree noise; the deal-free forward tree is exact (asserted above), so "exact-forward ⇒ SE≈0" is only true up to finite-range sampling.`);
    }
  });
}

// ── 5. DEAD CARDS (stud): no collision with live or opponent cards ───────────
console.log('— invariant 5: stud dead cards never collide with live/opp cards —');
for (const gameId of STUD_GAMES) {
  test(`${gameId}: seeded dead cards are disjoint from every live + opponent card`, () => {
    const game = GAMES[gameId];
    const b = needBp(gameId);
    let handsWithDead = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const heroSeat = heroSeatFromSeed(seed);
      const rec = trainerOf(gameId).dealHand(b, { seed, heroSeat, game, dead: true });
      const dead = new Set(rec.deadCards || []);
      if (!dead.size) continue;
      handsWithDead++;
      // Every card EVER dealt to either seat across the whole hand.
      const t = rec.terminal;
      const live = new Set([...t.down[0], ...t.down[1], ...t.up[0], ...t.up[1]]);
      for (const d of dead) {
        assert(!live.has(d),
          `dead card ${cardStr(d)} collides with a live/opp card (seed ${seed})`);
      }
    }
    assert(handsWithDead > 0, 'at least one hand seeded dead cards');
  });
}

// ── 6. FULL DISCARD CONTROL (draw): explicit-keep == abstraction option ──────
console.log('— invariant 6: explicit discard == abstraction draw option (consistency) —');
for (const gameId of DRAW_GAMES) {
  test(`${gameId}: an explicit discard equal to cfg.chooseKeep grades identically to dK`, () => {
    const game = GAMES[gameId];
    const b = needBp(gameId);
    const cfg = game.cfg;
    let tested = 0;
    for (let seed = 1; seed <= 80 && tested < 1; seed++) {
      let pickedK = null;
      // Hero policy: at the FIRST hero draw node with a non-pat abstraction option,
      // throw the complement of cfg.chooseKeep(hand, K) for the largest K>0.
      // Elsewhere follow the blueprint's top action.
      let firedDraw = false;
      const policy = (acts, snap, info) => {
        if (snap.phase === 'draw' && !firedDraw) {
          const counts = acts.map(a => parseInt(a.slice(1), 10)).filter(n => n > 0);
          if (counts.length) {
            firedDraw = true;
            const K = Math.max(...counts);
            pickedK = K;
            const hand = snap.hands[snap.toAct];
            const keep = cfg.chooseKeep(hand, K, makeRng(99));
            const thrown = hand.filter(c => !keep.includes(c));
            return drawPlay.encodeDiscard(thrown);
          }
        }
        const p = info.strat.probs;
        let bi = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[bi]) bi = i;
        return acts[bi];
      };
      const rec = drawPlay.playWithHero(b, policy, { seed, heroSeat: heroSeatFromSeed(seed), game });
      if (pickedK == null) continue;
      const g = drawGrade.gradeHand(rec, b, { seed, N: 300, game });
      const gr = g.grades.find(x => x.kind === 'draw' && x.explicitDiscard);
      if (!gr) continue;
      const explicitKey = gr.heroActionId;       // 'd:...'
      const abstractKey = `d${pickedK}`;
      assert(explicitKey in gr.perActionEV, 'explicit-discard EV column present');
      assert(abstractKey in gr.perActionEV, 'matching abstraction dK EV column present');
      const diff = Math.abs(gr.perActionEV[explicitKey] - gr.perActionEV[abstractKey]);
      assert(diff < 1e-9,
        `explicit keep must EV-match the abstraction option (${explicitKey} vs ${abstractKey}, diff ${diff})`);
      tested++;
    }
    if (!tested) skip('no matching explicit-vs-abstraction draw node in the sampled seeds');
  });
}

// ── 4b. GRADE SANITY: evLoss reconstructs from perActionEV (the math contract) ─
// evLoss MUST equal max(0, max_a EV(a) - EV(chosen)) over the graded options. BOTH
// graders satisfy this: the stud grader always has, and the draw grader now does
// too (its benchmark 0-clamp was removed — it no longer over-states the loss when
// the EV-best action is itself negative, i.e. a hero in a losing spot is no longer
// wrongly told they blundered). Both loops lock the correct contract in strictly.
console.log('— invariant 4b: evLoss == max(0, bestEV - chosenEV) over graded options —');
function reconstructEvLossViolations(gameId, seeds) {
  const game = GAMES[gameId];
  const b = bp(gameId);
  if (!b) return null;
  let checked = 0, viol = 0, maxOver = 0;
  for (const seed of seeds) {
    const heroSeat = heroSeatFromSeed(seed);
    const opts = { seed, heroSeat, game };
    if (STUD_GAMES.includes(gameId)) opts.dead = true;
    const rec = trainerOf(gameId).dealHand(b, opts);
    const gOpts = DRAW_GAMES.includes(gameId) ? { seed, N: 120, game } : { seed, samples: 600, game };
    const g = graderOf(gameId).gradeHand(rec, b, gOpts);
    for (const gr of g.grades) {
      const acts = (gr.gtoMix && gr.gtoMix.actions) || [];
      const chosenKey = gr.heroActionId ?? gr.chosen;
      const evs = gr.perActionEV;
      if (!evs || chosenKey == null || evs[chosenKey] == null) continue;
      const optEVs = acts.map(a => evs[a]).filter(x => typeof x === 'number');
      if (!optEVs.length) continue;
      const best = Math.max(...optEVs);
      // Use the chosen action's EV (whether abstraction option or explicit 'd:...').
      const correct = Math.max(0, best - evs[chosenKey]);
      checked++;
      const over = gr.evLoss - correct;
      if (over > 0.01 + 4 * (gr.evLossSE || 0)) { viol++; if (over > maxOver) maxOver = over; }
    }
  }
  return { checked, viol, maxOver };
}
const SEEDS_4B = Array.from({ length: 30 }, (_, i) => i + 1);
for (const gameId of STUD_GAMES) {
  test(`${gameId}: evLoss reconstructs from perActionEV on every hero grade`, () => {
    const r = reconstructEvLossViolations(gameId, SEEDS_4B);
    if (!r) skip(`no ${gameId}.json`);
    assert(r.checked > 0, 'graded some hero nodes');
    assert.strictEqual(r.viol, 0,
      `${r.viol}/${r.checked} grades over-state evLoss (max +${r.maxOver.toFixed(2)} chips)`);
  });
}
for (const gameId of DRAW_GAMES) {
  // The draw grader's benchmark 0-clamp (draw-trainer/grade.js:379) was removed —
  // the benchmark is now the ACTUAL EV-best legal option, so a hero who takes the
  // least-bad line in a losing spot grades ~0 instead of phantom |chosenEV| loss.
  // This now asserts the SAME strict contract as the stud grader above (was an
  // xfail pinning ~24-28% over-statement, up to +18.69 chips, before the fix).
  test(`${gameId}: evLoss reconstructs from perActionEV on every hero grade`, () => {
    const r = reconstructEvLossViolations(gameId, SEEDS_4B);
    if (!r) skip(`no ${gameId}.json`);
    assert(r.checked > 0, 'graded some hero nodes');
    assert.strictEqual(r.viol, 0,
      `${r.viol}/${r.checked} grades over-state evLoss (max +${r.maxOver.toFixed(2)} chips)`);
  });
}

// ── 4c. GRADE SANITY on an OBVIOUS spot (invariant 4, in-process, stud) ───────
// The task's grade-sanity invariant: on an obvious spot, the blueprint's TOP
// (EV-best value) action grades ~0 evLoss, and an obviously-bad action grades a
// LARGE evLoss. We construct the exact-forward 7th-street monotone spot the stud
// grade.test.js already validates (hero holds the NUT: razz = the A-2-3-4-5
// wheel, stud8 = the A-2-3-4-5 straight flush that scoops), grade it IN-PROCESS
// (fast: one exact-forward node), and assert BOTH directions. This deliberately
// does NOT shell out to `grade.js --selftest --game razz|stud8`: the stud selftest
// is a heavyweight suite (CRN + doubling-samples convergence over ~40 nodes) that
// runs for MINUTES per game and would blow any fast-suite timeout — so we cover
// the same grade-sanity property here cheaply and keep the FAST draw selftests
// (which finish in ~5s) as subprocesses below.
console.log('— invariant 4c: stud grade sanity on an obvious NUT spot (exact-forward) —');
// The nut-on-7th monotone fixtures, lifted verbatim from razz-trainer/grade.test.js
// (the spots it already proves), parameterised by the hero's LAST action so we can
// grade either the FOLD (a leak) or the VALUE call (~0). Only the last hero node is
// flagged isHero, so exactly ONE exact-forward node is graded (the opponent
// posterior still reads the full line). heroSeat 0 in both.
const STUD_NUT_FIXTURE = {
  razz: {
    cards: { down: [['2h', 'Ah'], ['Kc', 'Qd']], up: [['5s'], ['Js']], future: ['4d', 'Tc', '3c', '9d', '6s', '8h', '7d', '2c'] },
    pre: [
      { actor: 1, action: 'br' }, { actor: 0, action: 'r' }, { actor: 1, action: 'c' },
      { actor: 0, action: 'k' }, { actor: 1, action: 'k' }, { actor: 0, action: 'k' }, { actor: 1, action: 'k' },
      { actor: 0, action: 'k' }, { actor: 1, action: 'k' }, { actor: 0, action: 'k' }, { actor: 1, action: 'b' },
    ],
    value: 'c', // call the nut wheel (near-optimal; raise is best but call ~0)
  },
  stud8: {
    cards: { down: [['Ah', '2h'], ['Tc', '8d']], up: [['3h'], ['Kc']], future: ['4h', 'Qd', '5h', 'Js', 'Kd', '9c', '6c', '7s'] },
    pre: [
      // 3rd: bring-in + a CALL closes the street (corrected rule — the bring-in gets
      // no live check/raise option). Then 4th-6th check through (actor 1 holds the
      // best board — Kc-high — so acts first each street), and on 7th the opponent
      // bets into hero's straight-flush scoop. (Was a 10-action line whose step-2
      // {0,'k'} was the illegal bring-in-checks-after-being-called-around node.)
      { actor: 0, action: 'br' }, { actor: 1, action: 'c' },
      { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
      { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
      { actor: 1, action: 'k' }, { actor: 0, action: 'k' },
      { actor: 1, action: 'b' },
    ],
    value: 'r', // RAISE the straight-flush scoop — the true EV-best line. Calling it
    // leaves ~3.3 chips vs raising for value (EVs: fold -3, call +11, raise +14.33);
    // the old SAMPLED grader hid that in noise, the exact-forward fix surfaces it, so
    // grade the ACTUAL best action here for the "value action grades ~0" contract.
  },
};
// Grade ONLY the hero's last (7th-street) decision — the nut node facing a bet.
function gradeStudNut(gameId, lastAction) {
  const game = GAMES[gameId];
  const b = needBp(gameId);
  const fx = STUD_NUT_FIXTURE[gameId];
  const line = fx.pre.concat([{ actor: 0, action: lastAction }]);
  const rec = razzPlay.buildHandRecord(fx.cards, line, { game, heroSeat: 0, blueprint: b });
  // Flag only the final hero node so exactly one exact-forward node is graded.
  const last = rec.decisions.length - 1;
  const sliced = Object.assign({}, rec, {
    decisions: rec.decisions.map((d, i) => Object.assign({}, d, { isHero: i === last && d.actor === 0 })),
  });
  const g = razzGrade.gradeHand(sliced, b, { seed: 7, samples: 40, game });
  assert.strictEqual(g.grades.length, 1, 'exactly one hero node graded');
  return g.grades[0];
}
for (const gameId of STUD_GAMES) {
  test(`${gameId}: FOLDING the nut on 7th is a large evLoss; the value action is ~0 (exact-forward, SE 0)`, () => {
    // (a) fold the nut -> a big, exact, noise-free leak.
    const gf = gradeStudNut(gameId, 'f');
    assert.strictEqual(gf.chosen, 'f', 'graded the fold node');
    assert.strictEqual(gf.forwardMode, 'exact-forward', 'a 7th-street grade is exact-forward');
    assert.strictEqual(gf.evLossSE || 0, 0, 'exact-forward grade is noise-free');
    assert(gf.bestAction === 'c' || gf.bestAction === 'r',
      `the EV-best action vs the nut is a value action (got ${gf.bestAction})`);
    assert(gf.perActionEV.f < gf.perActionEV[gf.bestAction] - 6,
      `folding must be far worse than the value action (EV[f]=${gf.perActionEV.f.toFixed(2)} vs EV[best]=${gf.perActionEV[gf.bestAction].toFixed(2)})`);
    assert(gf.evLoss > 6,
      `folding the nut on 7th is a large evLoss (got ${gf.evLoss.toFixed(2)}, expected > 6)`);
    // (b) taking the value action instead -> ~0 evLoss (the grade-sanity contract).
    const gv = gradeStudNut(gameId, STUD_NUT_FIXTURE[gameId].value);
    assert.strictEqual(gv.chosen, STUD_NUT_FIXTURE[gameId].value, 'graded the value node');
    assert.strictEqual(gv.forwardMode, 'exact-forward', 'value grade is exact-forward');
    assert.strictEqual(gv.evLossSE || 0, 0, 'value grade is noise-free');
    // The value action is small evLoss (razz: 0.4524 — raise is best but call ~0).
    // Threshold loosened from 0.5 (only 0.048 chips of headroom over the live value)
    // to 2.0: still cleanly separates the value action from the fold leak (>6, and
    // the same fixture's folded evLoss is asserted >6 above) without being a
    // hair-trigger on a minor grader nudge.
    assert(gv.evLoss < 2.0,
      `playing the value action on an obvious nut spot is small evLoss (got ${gv.evLoss.toFixed(3)}, expected < 2.0)`);
    assert(gv.evLoss < gf.evLoss - 4,
      `the value action must grade much smaller than folding the nut (value ${gv.evLoss.toFixed(2)} vs fold ${gf.evLoss.toFixed(2)})`);
  });
}

// ── 4c-draw. GRADE SANITY on an OBVIOUS spot (in-process, DRAW) ───────────────
// The directional grade-sanity property — a known-BAD action grades LARGE evLoss
// and is the WORST action; a known-GOOD action grades small — was previously proven
// for razz/stud8 (4c above) and for td27/badugi (the 4d monotone-BET selftest), but
// NOT for a5td: it ships no draw selftest (grade.test.js SPECS = {td27,badugi}) and
// the 4c nut fixture is stud-only. a5td is exactly the game with ZERO game-specific
// trainer code, so a game-parameterization regression on it would be SILENT. This
// cell closes that gap for a5td (and re-covers td27/badugi in-process) by grading
// the post-last-draw NUT spot the draw selftests validate: hero pat with the nut
// low facing a bet. It reuses the exact-forward path (deterministic, no seed).
console.log('— invariant 4c-draw: draw grade sanity on an obvious NUT spot (exact-forward, a5td-covering) —');
for (const gameId of DRAW_GAMES) {
  test(`${gameId}: FOLDING the pat nut post-last-draw is the WORST action + large evLoss; a value action is best (exact-forward)`, () => {
    const { game, hero, opp } = drawNutFixture(gameId);
    const b = needBp(gameId);
    const sm = strategyMapOf(b);
    assert(opp.length >= 2, `fixture retains a multi-hand opponent field (got ${opp.length})`);
    const snap = drawStreet3BetSnap(game, 0, hero);
    const acts = game.legalActions(snap);
    assert.deepStrictEqual(acts, ['f', 'c', 'r'], `hero faces a bet with f/c/r legal (got ${acts.join(',')})`);
    const res = drawEvExplicit(game, sm, snap, 0, opp);
    assert.strictEqual(res.exact, true, 'the post-last-draw bet node takes the exact-forward path');
    let bestA = acts[0]; for (const a of acts) if (res.ev[a] > res.ev[bestA]) bestA = a;
    // (a) BLUNDER direction — vs the nut low, folding gives up a pot hero never
    //     loses, so it must be the WORST action AND a large evLoss.
    const foldWorst = acts.every(a => res.ev['f'] <= res.ev[a] + 1e-9);
    const evLossFold = res.ev[bestA] - res.ev['f'];
    assert(foldWorst,
      `folding the nut must be the worst action (ev f=${res.ev['f'].toFixed(2)} c=${res.ev['c'].toFixed(2)} r=${res.ev['r'].toFixed(2)})`);
    assert(bestA !== 'f', `the EV-best action vs the nut is a value action (got '${bestA}')`);
    assert(evLossFold > 6,
      `folding the pat nut is a large evLoss (got ${evLossFold.toFixed(2)}, expected > 6)`);
    // (b) GOOD direction — the value CALL recovers most of the pot vs folding
    //     (a known-good action does NOT grade like the blunder).
    assert(res.ev['c'] - res.ev['f'] > 6,
      `calling the nut is far better than folding (ev[c]=${res.ev['c'].toFixed(2)} vs ev[f]=${res.ev['f'].toFixed(2)})`);
  });
}

// ── 4d. Reuse the FAST draw grade selftests (12/12 gates each) as subprocesses ──
// The draw selftests finish in ~5s and cover zero-sum / bounded / monotone bet+
// draw / exact-forward-vs-brute / discard-control / off-book gates — reuse them
// rather than duplicate. (a5td ships no selftest; its directional grade-sanity is
// covered in-process by invariant 4c-draw above, and the CONTRACT/LEAK/DETERMINISM/
// math invariants by 1-3,4,4b,6.) The stud selftests are intentionally NOT run here.
console.log('— invariant 4d: existing FAST draw grade selftests (subprocess) —');
function runSelftest(label, args) {
  test(`selftest: ${label}`, () => {
    try {
      // Child process runs in its own V8 with its own fixed seeds; restore the real
      // Math.random around the spawn (process spawn may touch the host RNG).
      withRealRandom(() =>
        execFileSync('node', args, { cwd: path.join(__dirname, '..', '..'), stdio: 'pipe', timeout: 120000 }));
    } catch (e) {
      if (e.stdout && /no .*\.json|ENOENT/.test(e.stdout.toString())) skip('blueprint missing');
      throw new Error(`selftest failed (exit ${e.status == null ? 'timeout/killed' : e.status})`);
    }
  });
}
// Optional FAST local mode: TRAINER_FAST=1 skips the two subprocess selftests (the
// biggest wall-time cost). Their monotone bet/draw grade-sanity is ALSO covered
// in-process (invariant 4c-draw + the 4b/4/6 draw cells), so skipping them keeps
// the always-on in-process invariants intact. Default (CI / no flag) runs them.
const FAST = process.env.TRAINER_FAST === '1';
if (FAST) {
  test('selftest: td27 draw gates', () => skip('TRAINER_FAST=1 (covered in-process by invariant 4c-draw)'));
  test('selftest: badugi draw gates', () => skip('TRAINER_FAST=1 (covered in-process by invariant 4c-draw)'));
} else {
  if (bp('td27')) runSelftest('td27 draw gates', ['solver/draw-trainer/grade.js', '--game', 'td27', '--selftest']);
  if (bp('badugi')) runSelftest('badugi draw gates', ['solver/draw-trainer/grade.js', '--game', 'badugi', '--selftest']);
}

// ── summary ──────────────────────────────────────────────────────────────────
disarmRandomGuard(); // restore the real Math.random for the summary + exit
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
if (reports.length) {
  console.log('\n— REPORTED FINDINGS (bugs / notable) —');
  for (const r of reports) console.log(`  ! ${r}`);
}
process.exit(failed ? 1 : 0);
