// ── Draw-trainer grading: convergence-INDEPENDENT correctness gates ───────────
// Run:  node solver/draw-trainer/grade.test.js
//   or: node solver/draw-trainer/grade.js --game td27 --selftest
//
// These gates validate the GRADING ENGINE's correctness independent of whether
// the blueprint has converged. They assume only that (a) the engine's
// EV/utility math is internally consistent and (b) obviously-good / obviously-bad
// actions get ~zero / large evLoss. Each gate prints PASS/FAIL with numbers.
//
//   zero-sum + bounded ........ utility is zero-sum at terminals; |ev[a]| ≤ pot
//                               ceiling; evLoss ≥ 0.
//   monotone BET .............. folding the nuts (a pat wheel) on the last street
//                               → large evLoss AND the fold is the WORST action.
//   monotone DRAW (a) ......... breaking a made low to draw → d0 (pat) EV ≫
//                               d-natural EV.
//   monotone DRAW (b) ......... standing pat with a strong made hand → evLoss(pat)
//                               ≈ 0 and the per-action EV ranks pat on top.
//   monotone DRAW (c) ......... snowing trash → drawing ≫ patting (patting is the
//                               leak).
//   exact-forward vs BRUTE .... constructed street-3 (post-last-draw) spot with a
//                               SMALL explicit opponent final-hand range; brute-
//                               force the per-action EV by hand and assert the
//                               grader's exact-forward path matches to < 0.01.
//   particle health ........... ESS stays > N/4 through a normal replayed hand.

const fs = require('fs');
const path = require('path');
const { makeRng, cardFromStr, cardStr, makeDeck } = require('../engine/cards');
const grade = require('./grade');
const play = require('./play');
const lbr = require('../lbr-draw');

const H = s => s.split(' ').map(cardFromStr);

let results = [];
function gate(name, pass, detail) {
  results.push({ name, pass });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}\n       ${detail}`);
}

function loadBlueprint(gameId) {
  const p = path.join(__dirname, '..', 'strategies', `${gameId}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

// Max possible chip swing in HU fixed-limit draw: blinds + 4 caps of small (2)
// on streets 0..1 and big (4) on 2..3. Loose pot ceiling for the bounded gate.
const POT_CEIL = 2 + (4 * 2) * 2 + (4 * 4) * 2; // = 50, very loose

// ── direct EV over an EXPLICIT particle range (bypasses the posterior) ─────────
// Used by the brute-force gate: install hero's real hand + opponent particles by
// hand, run the grader's perActionEV exact-forward path.
function evWithExplicitRange(game, strategyMap, liveSnap, heroSeat, oppHands) {
  const parts = oppHands.map(h => ({ hand: h.slice(), discards: [], w: 1 / oppHands.length }));
  const live = grade.cloneState(liveSnap);
  return grade.perActionEV(game, strategyMap, live, heroSeat, game.legalActions(live), parts, {
    evParticles: oppHands.length,
    shuffleRng: makeRng(99),
  });
}

// Brute-force the per-action EV for a street-3 (deal-free) bet node BY HAND,
// independently of grade.js: for each action, install each opponent hand, then
// compute the EXACT σ-expectation of the deal-free betting subtree by recursive
// enumeration (every action weighted by σ — no sampling, no chance nodes), and
// average over the explicit range. This is the ground-truth the grader's exact-
// forward path must reproduce.
function bruteForceExactForward(game, strategyMap, liveSnap, heroSeat, oppHands) {
  const opp = 1 - heroSeat;
  function sigmaExpect(st) {
    if (game.isTerminal(st)) return game.utility(st)[heroSeat];
    const acts = game.legalActions(st);
    const look = grade.lookup(strategyMap, game.infosetKey(st), acts);
    let v = 0;
    for (let i = 0; i < acts.length; i++) {
      if (look.probs[i] <= 0) continue;
      v += look.probs[i] * sigmaExpect(game.applyAction(st, acts[i]));
    }
    return v;
  }
  const ev = {};
  for (const a of game.legalActions(liveSnap)) {
    let tot = 0;
    for (const oh of oppHands) {
      let st = grade.cloneState(liveSnap);
      st.hands[opp] = oh.slice();
      st.deck = [];
      st = game.applyAction(st, a);
      tot += sigmaExpect(st);
    }
    ev[a] = tot / oppHands.length;
  }
  return ev;
}

// Build a live street-3 BET snapshot by hand (post-3rd-draw, deal-free): both
// players are pat, hero faces a bet so 'f'/'c'/'r' are legal.
function street3BetSnap(game, heroSeat, heroHand) {
  // contrib: hero faces a bet of the big-bet size. Put a moderate pot.
  const opp = 1 - heroSeat;
  const contrib = [0, 0];
  contrib[opp] = 12; contrib[heroSeat] = 8; // hero faces 4 to call (big bet)
  const hands = [];
  hands[heroSeat] = heroHand.slice();
  hands[opp] = []; // filled per-particle
  return {
    deck: [],
    hands,
    street: 3, phase: 'bet', toAct: heroSeat,
    bets: 1, contrib,
    acted: heroSeat === 1 ? [true, false] : [false, true],
    folded: null, hist: 'x'.repeat(0), curSeq: 'b',
    pendingDraw: null,
    drawCounts: [[0, 0, 0], [0, 0, 0]],
    discards: [[], []],
    log: [],
  };
}

// ── per-GAME gate fixtures ─────────────────────────────────────────────────
// The grading ENGINE is game-generic, but the monotone-direction gates need
// game-specific cards (a "made low" / "the nuts" / "trash" mean different things
// in 2-7 vs badugi) and game-specific opponent ranges (the comparison is only
// load-bearing against the RIGHT field — pat-a-made-hand dominates breaking it
// only vs a broad MADE range; draw-a-rough-hand beats patting only vs a WEAK /
// incomplete range). td27's fixtures reproduce the ORIGINAL inline gate values
// byte-for-byte (so td27 stays 9/9); badugi supplies its 4-card analogues.
//
// Notable badugi DIFFERENCE from td27: there is NO pat-ONLY made hand. Every
// complete badugi keeps the break-rough-badugi option (drawOptions [0,1]), so
// the td27 "premium is pat-only (drawOptions === ['d0'])" sub-gate does not
// hold — badugi instead asserts the made badugi STANDS PAT as the top action
// with ~0 evLoss (the pat-vs-break-1 choice is real, and pat wins it).
const SPECS = {
  td27: {
    // monotone BET — the pat NUT low and a spread of worse made lows.
    nutHand: '7s 5d 4c 3h 2s',
    nutBetOppRange: ['8c 6d 5h 4s 3c', '9c 8d 7h 5s 4c', 'Tc 8h 6s 5c 4d'],
    // monotone DRAW (a) — break a made 9-low.
    madeBreakHand: '9s 7d 5c 3h 2s',     // drawOptions [0,1]; pat(d0) ≫ break(d1)
    madeBreakRange: null,                // null → default weakOppRange (td27)
    breakDir: { pat: 'd0', draw: 'd1', gap: 0.5 },
    // monotone DRAW (b) — premium pat-only + a 9-low pats vs worse made.
    premiumPatOnly: '7s 5d 4c 3h 2s',    // legalActions === ['d0'] (pat-only)
    standPatHand: '9s 5d 4c 3h 2s',
    standPatRange: ['Th 8d 6c 4s 2d', 'Js 9h 7c 5s 3d', 'Tc 8h 6d 5s 2c',
                    'Jh 9d 8c 6s 4d', 'Td 9c 7h 5d 2s', 'Jc Th 8d 6c 3s'],
    standPatBest: 'd0',
    // monotone DRAW (c) — snow trash vs draw-4.
    snowTrashHand: 'As Kd Qc Jh 9s',
    snowTrashRange: null,                // default weakOppRange
    snowDir: { snow: 'd0', draw: 'd4', gap: 0.5 },
    // exact-forward vs brute.
    bruteHeroHand: '8s 6d 5c 3h 2s',
    bruteOppRange: ['7c 5h 4s 3c 2d', '9c 8h 6s 4c 3d', 'Kc Qh Js Tc 8d'],
    // first-principles: hero 8-6 low; contrib=[8,12]. Opp candidates: a hand that
    // BEATS hero (−12), two hero WINS (+12), and one dead-card-sharing hand that
    // MUST be removed. After removal hero beats 2/3 → EV(call)=+4, EV(fold)=−8.
    fpHeroHand: '8s 6d 5c 3h 2s',
    fpLose: '7c 5h 4s 3c 2d',           // nut 7-low beats hero (−12)
    fpWin1: '9c 7h 6s 4c 3d',           // 9-7 low, hero wins (+12)
    fpWin2: 'Kc Qh Js Tc 8h',           // king high, hero wins (+12)
    fpDead: '7d 5h 4d 3s 2s',           // shares hero's 2s → dead-card-removed
    // posterior concentration — hero (BB) hand + the "premium class" bucket test.
    // td27's deuce-draw cap concentrates sharply: ESS drops at the graded node and
    // ≥3 of the top-4 buckets are premium.
    postHeroBB: '8s 6d 5c 3h 2s',
    isPremium: b => b[0] === 'M' || b.includes('d'), // made low OR deuce-draw
    postEssFrac: 0.8,    // ESS@node < 0.8·N
    postPremShift: 0.15, // premium mass gains ≥ 0.15 over the uniform prior
    postTop4Prem: 3,     // ≥3 of the top-4 buckets are premium

    // ── FULL DISCARD CONTROL fixtures ───────────────────────────────────────
    // CONSISTENCY: any made/draw hand at a draw node — the explicit natural
    // discard must equal the abstraction natural-draw EV, and 'd:' must equal d0.
    fdcConsistHand: '9s 7d 5c 3h 2s',  // drawOptions [0,1]; natural draw 1 (throw the 9)
    fdcConsistRange: ['Ks Qd Jc 8h 6s', 'As Qh Tc 7d 5s', 'Kd Jh 9c 6s 4d'],
    // MONOTONE: a discard-CHOICE hand — good lows + high cards, draw to keep the
    // lows. Recommended throw (the highs) is the EV-best abstraction option
    // (loss ~0); throwing the premium LOWS instead is a large evLoss. vs a weak
    // field where completing the low actually wins.
    fdcMonoHand: '2s 3d 4c Kh Qs',     // drawOptions [0,2]; chooseKeep(2) keeps 2-3-4
    fdcMonoRange: null,                // null → default weakOppRange (td27)
    // OFF-BOOK: a draw count NOT in cfg.drawOptions(hand). For 2-3-4-K-Q the
    // offered counts are [0,2]; drawing 1 (throw only the K) is off-book.
    fdcOffBookHand: '2s 3d 4c Kh Qs',
    fdcOffBookThrow: 'Kh',             // throw ONE card → draw 1 (not in [0,2])
  },
  badugi: {
    // monotone BET — the nut rainbow badugi A-2-3-4 vs worse made badugis.
    nutHand: 'As 2h 3d 4c',
    nutBetOppRange: ['8s 6h 4d 2c', '9s 7h 5d 3c', 'Ts 8h 6d 4c'],
    // monotone DRAW (a) — break a made nut badugi vs a BROAD made-badugi field.
    madeBreakHand: 'As 2h 3d 4c',        // drawOptions [0,1]; pat(d0) ≫ break(d1)
    madeBreakRange: ['8s 6h 4d 2c', '9s 7h 5d 3c', 'Ts 8h 6d 4c', '7s 5h 3d 2c',
                     'Js 9h 7d 5c', 'Qs Th 8d 6c', 'Ks Jh 9d 7c', '9s 8h 6d 4c',
                     'Ts 9h 7d 5c', '8s 7h 5d 3c'],
    breakDir: { pat: 'd0', draw: 'd1', gap: 0.5 },
    // monotone DRAW (b) — NO pat-only hand in badugi; a made 5-high badugi stands
    // pat as the best action vs a broad made field (break is the leak).
    premiumPatOnly: null,                // signals "no pat-only assertion"
    standPatHand: '5s 4h 3d 2c',
    standPatRange: ['8s 6h 4d 2c', '9s 7h 5d 3c', 'Ts 8h 6d 4c', '7s 5h 3d 2c',
                    'Js 9h 7d 5c', 'Qs Th 8d 6c', 'Ks Jh 9d 7c', '9s 8h 6d 4c',
                    'Ts 9h 7d 5c', '8s 7h 5d 3c'],
    standPatBest: 'd0',
    // monotone DRAW (c) — a rough INCOMPLETE 3-card hand should DRAW to complete
    // a badugi (drawOptions [0,1]) vs a WEAK incomplete field; patting is the leak.
    snowTrashHand: '9s 7h 5d 5c',        // 3-card hand (paired 5) → draw 1
    snowTrashRange: ['8s 6h 4d 4c', 'Ts 8h 6d 6c', '7c 5h 3d 3c',
                     'Js 9h 7d 7c', 'Qs Th 8d 8c', '9c 8h 6d 6c', 'Td 9h 7d 7c',
                     'Ks Qh Jd Jc', 'Ac Kh Qd Qc'],
    snowDir: { snow: 'd0', draw: 'd1', gap: 0.5 },
    // exact-forward vs brute (small explicit final-hand range) — a pat 8-high
    // badugi vs worse made badugis + a king-high badugi (a win).
    bruteHeroHand: '8s 6h 4d 2c',
    bruteOppRange: ['7s 5h 3d Ac', '9s 7h 5d 3c', 'Ks Qh Jd Tc'],
    // first-principles: hero pat 8-high badugi; contrib=[8,12]. Opp candidates:
    // a 7-high badugi BEATS hero (−12), a 9-high + a K-high are hero WINS (+12
    // each), and a hand sharing hero's 2c MUST be removed (it is itself a low
    // badugi that would beat hero). After removal hero beats 2/3 → EV(call)=+4,
    // EV(fold)=−8 (SAME constants as td27 — the chip math is contrib-driven, not
    // evaluator-driven; only the win/lose DIRECTION uses the badugi evaluator).
    fpHeroHand: '8s 6h 4d 2c',
    fpLose: '7s 5h 3d Ac',              // 7-high badugi beats hero (−12)
    fpWin1: '9s 7h 5d 3c',              // 9-high badugi, hero wins (+12)
    fpWin2: 'Ks Qh Jd Tc',              // K-high badugi, hero wins (+12)
    fpDead: 'As 2c 3h 4d',              // shares hero's 2c → dead-card-removed
    // posterior concentration — hero (BB) holds a made 8-high badugi; the SB's
    // 3-bet/cap should shift the posterior onto complete-badugi buckets. Premium
    // class = any complete badugi (bucket starts with 'B') or a strong 3-card
    // 'T4' (the badugi analogue of td27's made-low / deuce-draw premium classes).
    postHeroBB: '8s 6h 4d 2c',
    isPremium: b => b[0] === 'B' || b === 'T4',
    // Badugi DIFFERS from td27 here: pre-draw the cap/4-bet does NOT discriminate
    // by hand as sharply (every pre-draw hand is incomplete, so capping is more
    // range/position than hand-strength), and complete badugis are RARE pre-draw
    // and SPLIT across B5..BH — so the final-node ESS recovers toward N and the
    // top-4 buckets are dominated by (individually larger) incomplete buckets even
    // as premium MASS multiplies. The reweight is still validated decisively by
    // the premium-mass SHIFT (≈5× here) and by ESS dropping somewhere in the
    // trace; we assert ESS_min (not ESS@node) and a relaxed top-bucket floor.
    postEssOnMin: true,  // judge concentration on the ESS MINIMUM over the trace
    postEssFrac: 0.9,    // ESS_min < 0.9·N (a real, if smaller, concentration)
    postPremShift: 0.15, // premium mass gains ≥ 0.15 (observed ≈ +0.30)
    postTop4Prem: 1,     // ≥1 premium bucket in the top-4 (rest are big incompletes)

    // ── FULL DISCARD CONTROL fixtures (badugi 4-card analogues) ─────────────
    // CONSISTENCY: a 3-card hand (paired) drawing 1 to complete the badugi.
    fdcConsistHand: '9s 7h 5d 5c',     // drawOptions [0,1]; natural draw 1 (throw a 5)
    fdcConsistRange: ['8s 6h 4d 4c', 'Ts 8h 6d 6c', 'Ks Qh Jd Jc'],
    // MONOTONE: a 3-card hand A-2-3 with a redundant paired 3 (3c). Recommended
    // throw = the paired 3c (loss ~0, the EV-best abstraction draw); throwing the
    // premium ACE instead is a large evLoss. vs a weak incomplete field.
    fdcMonoHand: 'As 2h 3d 3c',        // best subset A-2-3 (3c pairs the 3d) → draw 1
    fdcMonoRange: ['8s 6h 4d 4c', 'Ts 8h 6d 6c', '7c 5h 3s 3h', 'Js 9h 7d 7c',
                   'Qs Th 8d 8c', '9c 8h 6d 6c', 'Td 9h 7s 7c', 'Ks Qh Jd Jc',
                   'Ac Kh Qd Qc', 'Js Th 9d 9c'],
    // OFF-BOOK: a 2-card-base hand offering [0,2]; drawing 1 is off-book.
    fdcOffBookHand: 'As 2s 3h 3d',     // 2-card base (As/2s same suit) → drawOptions [0,2]
    fdcOffBookThrow: '3h',             // throw ONE card → draw 1 (not in [0,2])
  },
};

function run(gameId = 'td27') {
  results = [];
  const game = require('../games').GAMES[gameId];
  if (!game) { console.log(`(skip — unknown game ${gameId})`); return true; }
  if (!SPECS[gameId]) { console.log(`(skip — no gate fixtures for ${gameId})`); return true; }
  const spec = SPECS[gameId];
  lbr.memoizeCfg(game);
  const bpFile = loadBlueprint(gameId);
  if (!bpFile) { console.log(`(skip — no ${gameId}.json)`); return true; }
  const strategyMap = bpFile.strategy;
  console.log(`\n=== draw-trainer grading gates — ${game.name} ===\n`);

  // ── GATE: zero-sum + bounded (over self-played hands) ───────────────────────
  {
    let okZero = true, okBound = true, okLoss = true, n = 0, worstZero = 0;
    let maxAbsEV = 0, minLoss = Infinity;
    for (let s = 0; s < 12; s++) {
      const rec = play.dealHand(bpFile, { rng: makeRng(1000 + s), heroSeat: s % 2, game });
      const z = rec.utility[0] + rec.utility[1];
      worstZero = Math.max(worstZero, Math.abs(z));
      if (Math.abs(z) > 1e-9) okZero = false;
      const g = grade.gradeHand(rec, bpFile, { seed: 1000 + s, N: 120, samples: 40, game });
      for (const gr of g.grades) {
        n++;
        for (const a of gr.gtoMix.actions) {
          maxAbsEV = Math.max(maxAbsEV, Math.abs(gr.perActionEV[a]));
          if (Math.abs(gr.perActionEV[a]) > POT_CEIL) okBound = false;
        }
        if (gr.evLoss < -1e-9) okLoss = false;
        minLoss = Math.min(minLoss, gr.evLoss);
      }
    }
    gate('zero-sum + bounded',
      okZero && okBound && okLoss && n > 0,
      `${n} graded decisions; |Σutility| ≤ ${worstZero.toFixed(2)}; max|ev| ${maxAbsEV.toFixed(2)} ≤ ${POT_CEIL}; min evLoss ${minLoss.toFixed(3)} ≥ 0`);
  }

  // ── GATE: monotone BET — fold the nuts (pat wheel) on the last street ───────
  {
    // Hero (seat 0) holds the pat NUT low 7-5-4-3-2 on street-3 bet, facing a bet.
    // The opponent range is broad (any pat-ish made hand) — but vs the NUTS hero
    // never loses, so folding (giving up the pot) must be the WORST action with a
    // large evLoss; calling/raising realise positive EV.
    const heroHand = H(spec.nutHand);
    const snap = street3BetSnap(game, 0, heroHand);
    // explicit opponent range: a spread of legitimate made hands (all lose to the
    // nuts) — used only to define a concrete, adversary-agnostic spot.
    const fullN = 2 * game.cfg.handSize;
    const oppRange = spec.nutBetOppRange.map(H)
      .filter(h => new Set([...heroHand, ...h]).size === fullN);
    const res = evWithExplicitRange(game, strategyMap, snap, 0, oppRange);
    const acts = game.legalActions(snap);
    let bestA = acts[0]; for (const a of acts) if (res.ev[a] > res.ev[bestA]) bestA = a;
    const evLossFold = res.ev[bestA] - res.ev['f'];
    const foldWorst = acts.every(a => res.ev['f'] <= res.ev[a] + 1e-9);
    gate('monotone BET: folding the nut wheel is worst + large evLoss',
      foldWorst && evLossFold > 4 && bestA !== 'f',
      `ev f=${res.ev['f'].toFixed(2)} c=${res.ev['c'].toFixed(2)} r=${res.ev['r'].toFixed(2)}; best '${bestA}'; evLoss(fold) ${evLossFold.toFixed(2)} (>4)`);
  }

  // ── GATE: monotone DRAW (a) — breaking a made hand to draw is bad ────────────
  {
    // On the LAST draw (street-2 draw phase), hero holds a strong MADE hand with
    // drawOptions [0,1] (td27: a made 9-low; badugi: the nut rainbow badugi).
    // Breaking it (d1) is a downgrade → ev[pat] ≫ ev[break]. The comparison is
    // load-bearing only vs the right field, so badugi passes a BROAD made-badugi
    // range (vs pure trash, break-and-redraw still beats trash → no signal).
    const { pat, draw, gap: thr } = spec.breakDir;
    const heroHand = H(spec.madeBreakHand);
    const oppR = spec.madeBreakRange ? spec.madeBreakRange.map(H)
      .filter(h => { const u = new Set(heroHand); return h.every(c => !u.has(c)) && new Set(h).size === game.cfg.handSize; }) : undefined;
    const r = drawSpotEV(game, strategyMap, 0, heroHand, oppR);
    const gap = r.ev[pat] - (r.ev[draw] != null ? r.ev[draw] : r.ev[Object.keys(r.ev).find(k => k !== pat)]);
    gate('monotone DRAW (a): breaking a made hand to draw is bad',
      r.acts.includes(pat) && r.acts.includes(draw) && r.ev[pat] > r.ev[draw] + thr,
      `ev pat(${pat})=${r.ev[pat].toFixed(2)} vs break(${draw})=${r.ev[draw].toFixed(2)}; gap ${gap.toFixed(2)} (>${thr})`);
  }

  // ── GATE: monotone DRAW (b) — standing pat correctly ────────────────────────
  // The engine must NOT spuriously punish standing pat with a strong made hand:
  // against a worse field, pat (d0) is the TOP-ranked action with evLoss ≈ 0.
  //   td27 ALSO checks (i) a PREMIUM 7-low is PAT-ONLY in the abstraction
  //        (drawOptions === ['d0']) — the engine offers no draw, so the pat is
  //        forced and evLoss is trivially 0.
  //   badugi has NO pat-only hand (every complete badugi keeps the break-1
  //        option), so it SKIPS (i) and asserts only that a made 5-high badugi
  //        STANDS PAT as the best action with ~0 evLoss (break-1 is the leak).
  {
    // (i) premium pat-only (td27 only).
    let patOnly = null;
    if (spec.premiumPatOnly) {
      const premium = H(spec.premiumPatOnly);
      const snapPat = {
        deck: [], hands: [premium.slice(), []], street: 2, phase: 'draw', toAct: 0,
        bets: 0, contrib: [6, 6], acted: [false, false], folded: null, hist: '', curSeq: '',
        pendingDraw: null, drawCounts: [[0, 0], [0, 0]], discards: [[], []], log: [],
      };
      patOnly = game.legalActions(snapPat); // expect ['d0']
    }

    // (ii) strong made hand vs an explicit WORSE field. Patting wins the
    //      showdown → pat (standPatBest) is the top action with evLoss ≈ 0.
    const made = H(spec.standPatHand);
    const worseMade = spec.standPatRange.map(H)
      .filter(h => { const u = new Set(made); return h.every(c => !u.has(c)) && new Set(h).size === game.cfg.handSize; });
    const r = drawSpotEV(game, strategyMap, 0, made, worseMade);
    let bestA = r.acts[0]; for (const a of r.acts) if (r.ev[a] > r.ev[bestA]) bestA = a;
    const patId = spec.standPatBest;
    const lossPat = Math.max(0, r.ev[bestA] - r.ev[patId]);
    const drawId = r.acts.find(a => a !== patId);

    const patOnlyOK = patOnly == null || (patOnly.length === 1 && patOnly[0] === 'd0');
    const patOnlyMsg = patOnly == null ? 'no pat-only hand in this game (skipped)' : `premium legalActions [${patOnly.join(',')}] (pat-only)`;
    gate('monotone DRAW (b): premium pat-only (if any) + patting a strong made hand vs worse has ~0 evLoss',
      patOnlyOK && bestA === patId && lossPat < 0.5,
      `${patOnlyMsg}; made-hand ev ${patId}=${r.ev[patId].toFixed(2)} vs draw=${r.ev[drawId].toFixed(2)}, best '${bestA}', evLoss(pat) ${lossPat.toFixed(3)} (<0.5)`);
  }

  // ── GATE: monotone DRAW (c) — not drawing a weak/rough hand is the leak ──────
  {
    // td27: hero holds total trash A-K-Q-J-9 (drawOptions [0,4]); snowing (d0) vs
    // drawing 4 (d4) — drawing crushes snowing.
    // badugi: hero holds a rough INCOMPLETE 3-card hand (drawOptions [0,1]);
    // patting (d0) vs drawing 1 to complete the badugi (d1) — drawing wins vs a
    // WEAK incomplete field (patting an incomplete hand is the leak).
    const { snow, draw, gap: thr } = spec.snowDir;
    const heroHand = H(spec.snowTrashHand);
    const oppR = spec.snowTrashRange ? spec.snowTrashRange.map(H)
      .filter(h => { const u = new Set(heroHand); return h.every(c => !u.has(c)) && new Set(h).size === game.cfg.handSize; }) : undefined;
    const r = drawSpotEV(game, strategyMap, 0, heroHand, oppR);
    const gap = r.ev[draw] - r.ev[snow];
    gate('monotone DRAW (c): not drawing a weak/rough hand is worse than drawing',
      r.acts.includes(draw) && r.ev[draw] > r.ev[snow] + thr,
      `ev draw(${draw})=${r.ev[draw].toFixed(2)} vs pat/snow(${snow})=${r.ev[snow].toFixed(2)}; gap ${gap.toFixed(2)} (>${thr})`);
  }

  // ── GATE: exact-forward vs BRUTE-FORCE (street-3 bet, explicit small range) ──
  {
    const heroHand = H(spec.bruteHeroHand);
    const snap = street3BetSnap(game, 0, heroHand);
    // small explicit opponent FINAL-hand range (3 made hands, dead cards removed):
    const used = new Set(heroHand);
    const oppRange = spec.bruteOppRange.map(H)
      .filter(h => h.every(c => !used.has(c)) && new Set(h).size === game.cfg.handSize);
    const graderEV = evWithExplicitRange(game, strategyMap, snap, 0, oppRange).ev;
    const bruteEV = bruteForceExactForward(game, strategyMap, snap, 0, oppRange);
    let maxDiff = 0;
    for (const a of game.legalActions(snap)) maxDiff = Math.max(maxDiff, Math.abs(graderEV[a] - bruteEV[a]));
    gate('exact-forward EV matches brute force (< 0.01 chips)',
      maxDiff < 0.01,
      `actions ${game.legalActions(snap).join(',')}; grader=[${game.legalActions(snap).map(a => graderEV[a].toFixed(3)).join(',')}] brute=[${game.legalActions(snap).map(a => bruteEV[a].toFixed(3)).join(',')}]; max|Δ| ${maxDiff.toExponential(2)}`);
  }

  // ── GATE: FIRST-PRINCIPLES EV (hardcoded constant, not a second recursion) ──
  // The exact-forward-vs-brute gate above compares two copies of the SAME deal-
  // free recursion (tautological w.r.t. the evaluator) and removes no dead cards.
  // Here we pin the grader's exact-forward EV to an EV computed BY HAND from an
  // explicit showdown, and FORCE dead-card removal to be load-bearing.
  //
  // Spot: street-3 (post-last-draw, deal-free) BET. Hero (seat 0) holds the pat
  // 8-6 low 8-6-5-3-2 and faces a 4-chip bet into a pot where contrib=[8,12]
  // (opp bet 4). Hero's CALL → contrib[hero]=12, both acted → showdown, so the
  // call subtree is a SINGLE terminal per opponent hand (no σ mixing): EV(call) is
  // exactly the mean showdown chip swing. Explicit opponent FINAL-hand range (all
  // 5-card, deal-free):
  //   7-5-4-3-2 (nut wheel)  → hero LOSES  → −contrib[hero] = −12
  //   9-7-6-4-3              → hero WINS   → +contrib[opp]  = +12
  //   K-Q-J-T-8 (king high)  → hero WINS   → +12
  //   7d-5h-4d-3s-2s         → SHARES hero's 2s → MUST be dead-card-removed.
  // The dead card is itself a nut wheel that BEATS hero, so removing it correctly
  // is load-bearing: keep it and the win count (and EV) changes. After removal the
  // range is the 3 valid hands; hero beats exactly 2 of 3, so
  //   EV(call)  = (−12 + 12 + 12)/3 = +4.0   (HARDCODED)
  //   EV(fold)  = −contrib[hero]    = −8.0   (HARDCODED; fold forfeits hero's 8)
  {
    const heroHand = H(spec.fpHeroHand); // pat made hand — NOT the nuts (beatable)
    const snap = street3BetSnap(game, 0, heroHand); // contrib=[8,12], hero faces 4
    const candidates = [
      H(spec.fpLose), // beats hero (−12)
      H(spec.fpWin1), // hero wins (+12)
      H(spec.fpWin2), // hero wins (+12)
      H(spec.fpDead), // shares a hero card → dead-card removal MUST drop it
    ];
    const used = new Set(heroHand);
    const oppRange = candidates.filter(h => h.every(c => !used.has(c)) && new Set(h).size === game.cfg.handSize);
    const deadRemoved = candidates.length - oppRange.length; // expect exactly 1
    const res = evWithExplicitRange(game, strategyMap, snap, 0, oppRange).ev;

    const EV_CALL_HAND = 4.0;   // (−12 + 12 + 12)/3
    const EV_FOLD_HAND = -8.0;  // forfeit hero's contrib (8)
    const okDead = deadRemoved === 1 && oppRange.length === 3;
    const okCall = Math.abs(res['c'] - EV_CALL_HAND) < 1e-9;
    const okFold = Math.abs(res['f'] - EV_FOLD_HAND) < 1e-9;
    gate('first-principles EV: exact-forward call/fold EV == hand-computed constants',
      okDead && okCall && okFold,
      `dead-removed ${deadRemoved} (range ${oppRange.length}); EV(call)=${res['c'].toFixed(6)} (=${EV_CALL_HAND}), EV(fold)=${res['f'].toFixed(6)} (=${EV_FOLD_HAND})`);
  }

  // ── GATE: POSTERIOR CONCENTRATION (validates buildPosterior reweighting) ─────
  // No other gate directly exercises buildPosterior (the particle reweighting);
  // zero-sum/ESS only touch it incidentally. Here we replay a line where the
  // OPPONENT 3-bets then 4-bets (caps) the pre-draw betting and assert the
  // posterior CONCENTRATES on the strong class: ESS drops materially and the
  // top-weighted buckets are premium (made lows 'M*' or deuce-draws 'D..d..').
  {
    const N = 400;
    // hero = BB (seat 1); the OPPONENT = SB (seat 0) is the capping aggressor.
    // SB raise, BB 3-bet, SB cap(4-bet), BB faces the cap → grade idx 3. The SB
    // hand is a placeholder (the line, not its cards, drives the belief); we give
    // it the FIRST handSize cards distinct from hero so the deal is card-legal.
    const heroBB = H(spec.postHeroBB);
    const heroSet = new Set(heroBB);
    const sbHand = []; for (let c = 0; c < 52 && sbHand.length < game.cfg.handSize; c++) if (!heroSet.has(c)) sbHand.push(c);
    const cards = { hands: [sbHand, heroBB], future: [] };
    const line = [
      { actor: 0, action: 'r' }, // SB raise
      { actor: 1, action: 'r' }, // BB 3-bet
      { actor: 0, action: 'r' }, // SB cap (4-bet) — the strong opponent action
      { actor: 1, action: 'c' }, // BB faces the cap (hero node we build to)
    ];
    const rec = play.buildHandRecord(cards, line, { heroSeat: 1, blueprint: bpFile, game });
    const instr = { fallbacks: 0, collapses: 0 };
    const post = grade.buildPosterior(game, strategyMap, rec, 3, 1, N, makeRng(2026), instr);
    const essNode = post.ess[post.ess.length - 1];

    const isPremium = spec.isPremium; // game-specific "strong class" bucket predicate
    const tally = {};
    for (const p of post.parts) { const b = game.cfg.bucket(p.hand); tally[b] = (tally[b] || 0) + p.w; }
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    let postPrem = 0; for (const [b, w] of sorted) if (isPremium(b)) postPrem += w;
    // prior (uniform) premium mass at the pre-draw root for the same seat.
    const root = rec.decisions[0].state;
    const M = 4000, p0 = lbr.initParticles(root, 1, M, game.cfg.handSize, makeRng(2026));
    let priorPrem = 0; for (const p of p0) if (isPremium(game.cfg.bucket(p.hand))) priorPrem += 1 / M;
    const top4 = sorted.slice(0, 4);
    const top4Prem = top4.filter(([b]) => isPremium(b)).length;

    // Concentration is judged on ESS@node (td27) or ESS_min over the trace
    // (badugi — its pre-draw cap concentrates mid-line then the final reweight
    // re-spreads; see the badugi spec note). Both are valid "the reweight moved
    // the belief" signals; the premium-mass SHIFT is the primary assertion.
    const essMetric = spec.postEssOnMin ? Math.min(...post.ess) : essNode;
    const essThr = spec.postEssFrac * N;
    const essDropped = essMetric < essThr;                       // material concentration
    const concentrated = postPrem > priorPrem + spec.postPremShift; // mass shifts to premium
    const topIsPremium = top4Prem >= spec.postTop4Prem;          // top buckets carry the class
    gate('posterior concentration: a 3-bet/cap shifts mass onto premium buckets + drops ESS',
      instr.collapses === 0 && essDropped && concentrated && topIsPremium,
      `ESS ${spec.postEssOnMin ? 'min' : '@node'} ${essMetric.toFixed(1)} (<${essThr.toFixed(0)}); premium mass ${postPrem.toFixed(3)} vs prior ${priorPrem.toFixed(3)} (+${(postPrem - priorPrem).toFixed(3)}); top4 ${top4.map(([b]) => b).join(',')} (${top4Prem}/4 premium)`);
  }

  // ── GATE: particle health — ESS > N/4 through a normal replayed hand ────────
  {
    const N = 200;
    let minEssOverall = Infinity, anyGraded = false, lows = 0, tot = 0;
    for (let s = 0; s < 8; s++) {
      const rec = play.dealHand(bpFile, { rng: makeRng(5000 + s), heroSeat: s % 2, game });
      const g = grade.gradeHand(rec, bpFile, { seed: 5000 + s, N, samples: 40, game });
      for (const gr of g.grades) {
        anyGraded = true; tot++;
        minEssOverall = Math.min(minEssOverall, gr.essMin);
        if (gr.essMin < N / 4) lows++;
      }
    }
    gate('particle health: ESS stays > N/4 through replay',
      anyGraded && lows === 0,
      `over ${tot} graded nodes: min ESS ${minEssOverall.toFixed(1)} (N/4=${N / 4}); ${lows} nodes below threshold`);
  }

  // ── GATE: FULL DISCARD CONTROL — CONSISTENCY ────────────────────────────────
  // The explicit-keep apply must reproduce the abstraction draw EV EXACTLY. On the
  // SAME CRN particle set + shared pool: a hero discard equal to chooseKeep(natK)'s
  // thrown cards has EV == the abstraction natural-draw (dK) EV; and 'd:' (throw
  // nothing) has EV == d0. Validates applyDraw(explicit keep) == applyAction('dK')
  // on the natural sets, through the grader's own perActionEV.
  {
    const heroHand = H(spec.fdcConsistHand);
    const snap = drawPhaseSnap(game, 0, heroHand); // street-2 draw, hero to act
    const oppRange = spec.fdcConsistRange.map(H)
      .filter(h => { const u = new Set(heroHand); return h.every(c => !u.has(c)) && new Set(h).size === game.cfg.handSize; });
    const parts = oppRange.map(h => ({ hand: h.slice(), discards: [], w: 1 / oppRange.length }));

    const offered = game.cfg.drawOptions(heroHand);
    const natK = offered.find(k => k > 0);
    const acts = offered.map(k => 'd' + k);
    const keepNat = game.cfg.chooseKeep(heroHand, natK);
    const thrownNat = heroHand.filter(c => !keepNat.includes(c));
    const encNat = play.encodeDiscard(thrownNat);     // explicit natural
    const encPat = play.encodeDiscard([]);            // 'd:' (pat)
    const res = grade.perActionEV(game, strategyMap, grade.cloneState(snap), 0,
      acts.concat([encNat, encPat]), parts,
      { evParticles: parts.length, rolloutMode: 'passive', shuffleRng: makeRng(31337) });

    const dNat = Math.abs(res.ev['d' + natK] - res.ev[encNat]);
    const dPat = Math.abs(res.ev['d0'] - res.ev[encPat]);
    gate('FULL DISCARD CONTROL — consistency: explicit natural discard EV == abstraction draw EV',
      dNat < 1e-9 && dPat < 1e-9,
      `explicit natural ${encNat}=${res.ev[encNat].toFixed(6)} vs abstraction d${natK}=${res.ev['d' + natK].toFixed(6)} (|Δ| ${dNat.toExponential(2)}); ` +
      `explicit pat 'd:'=${res.ev[encPat].toFixed(6)} vs d0=${res.ev['d0'].toFixed(6)} (|Δ| ${dPat.toExponential(2)})`);
  }

  // ── GATE: FULL DISCARD CONTROL — MONOTONE ───────────────────────────────────
  // Throwing the BEST low cards (keeping the high cards / a redundant card) is a
  // large evLoss; the recommended natural discard is evLoss ≈ 0. vs a weak field
  // where completing the low actually wins.
  {
    const heroHand = H(spec.fdcMonoHand);
    const snap = drawPhaseSnap(game, 0, heroHand);
    const oppRange = (spec.fdcMonoRange ? spec.fdcMonoRange.map(H) : weakOppRange(heroHand))
      .filter(h => { const u = new Set(heroHand); return h.every(c => !u.has(c)) && new Set(h).size === game.cfg.handSize; });
    const parts = oppRange.map(h => ({ hand: h.slice(), discards: [], w: 1 / oppRange.length }));

    const offered = game.cfg.drawOptions(heroHand);
    const natK = offered.find(k => k > 0);
    const acts = offered.map(k => 'd' + k);
    // recommended discard = chooseKeep(natK)'s thrown cards.
    const keepNat = game.cfg.chooseKeep(heroHand, natK);
    const recThrown = heroHand.filter(c => !keepNat.includes(c));
    const encRec = play.encodeDiscard(recThrown);
    // BAD discard = throw the natK BEST (lowest) cards, keeping the worst — the
    // exact opposite of the recommended keep. Same draw count, so on-book.
    const sortedLowFirst = heroHand.slice().sort((a, b) => lowOf(game, a) - lowOf(game, b));
    const badThrown = sortedLowFirst.slice(0, recThrown.length);
    const encBad = play.encodeDiscard(badThrown);

    const res = grade.perActionEV(game, strategyMap, grade.cloneState(snap), 0,
      acts.concat([encRec, encBad]), parts,
      { evParticles: parts.length, rolloutMode: 'passive', shuffleRng: makeRng(31337) });
    let bestEV = -Infinity; for (const a of acts) if (res.ev[a] > bestEV) bestEV = res.ev[a];
    const lossRec = Math.max(0, Math.max(bestEV, 0) - res.ev[encRec]);
    const lossBad = Math.max(0, Math.max(bestEV, 0) - res.ev[encBad]);
    gate('FULL DISCARD CONTROL — monotone: throwing the best lows is a large evLoss, recommended ~0',
      lossRec < 0.5 && lossBad > 3.0 && lossBad > lossRec + 2.0,
      `recommended throw ${recThrown.map(cardStr).join('')} EV ${res.ev[encRec].toFixed(2)} evLoss ${lossRec.toFixed(2)} (<0.5); ` +
      `bad throw ${badThrown.map(cardStr).join('')} EV ${res.ev[encBad].toFixed(2)} evLoss ${lossBad.toFixed(2)} (>3)`);
  }

  // ── GATE: FULL DISCARD CONTROL — OFF-BOOK FLAG ──────────────────────────────
  // A hero draw COUNT not in cfg.drawOptions(hand) is flagged confidence:'low' /
  // rangeDegraded, with the off-book note — through the FULL gradeHand path (the
  // production seam). An ON-BOOK recommended discard at the same hand is high
  // confidence with the recommended note.
  {
    const heroHand = H(spec.fdcOffBookHand);
    const heroSet = new Set(heroHand);
    const oppHand = []; for (let c = 0; c < 52 && oppHand.length < game.cfg.handSize; c++) if (!heroSet.has(c)) oppHand.push(c);
    const used = new Set([...heroHand, ...oppHand]); const future = [];
    for (let c = 0; c < 52 && future.length < 12; c++) if (!used.has(c)) future.push(c);
    const cards = { hands: [heroHand, oppHand], future };

    // OFF-BOOK: throw exactly the named card → draw 1 (not in the offered counts).
    const offBook = play.encodeDiscard([cardFromStr(spec.fdcOffBookThrow)]);
    // line: hero(SB,0) calls, BB(1) checks → draw phase; BB pats; HERO draws.
    const mkLine = heroDraw => [
      { actor: 0, action: 'c' }, { actor: 1, action: 'k' },
      { actor: 1, action: 'd0' }, { actor: 0, action: heroDraw },
    ];
    const recOff = grade.gradeHand(
      play.buildHandRecord(cards, mkLine(offBook), { heroSeat: 0, blueprint: bpFile, game }),
      bpFile, { seed: 7, N: 120, samples: 40, game });
    const drOff = recOff.grades.find(x => x.kind === 'draw');

    // ON-BOOK recommended discard at a count the abstraction offers.
    const offered = game.cfg.drawOptions(heroHand);
    const onK = offered.find(k => k > 0);
    const keepOn = game.cfg.chooseKeep(heroHand, onK);
    const onBook = play.encodeDiscard(heroHand.filter(c => !keepOn.includes(c)));
    const recOn = grade.gradeHand(
      play.buildHandRecord(cards, mkLine(onBook), { heroSeat: 0, blueprint: bpFile, game }),
      bpFile, { seed: 7, N: 120, samples: 40, game });
    const drOn = recOn.grades.find(x => x.kind === 'draw');

    const offOK = drOff && drOff.explicitDiscard && drOff.offBookCount &&
      drOff.confidence === 'low' && drOff.rangeDegraded &&
      /off-book/.test(drOff.discardNote || '');
    const onOK = drOn && drOn.explicitDiscard && !drOn.offBookCount &&
      drOn.confidence === 'high' && /recommended/.test(drOn.discardNote || '');
    gate('FULL DISCARD CONTROL — off-book flag: off-count → low/rangeDegraded; on-book recommended → high',
      offOK && onOK,
      `off-book draw ${drOff && drOff.heroDrawCount} → conf=${drOff && drOff.confidence} rangeDegraded=${drOff && drOff.rangeDegraded} ("${drOff && drOff.discardNote}"); ` +
      `on-book draw ${drOn && drOn.heroDrawCount} → conf=${drOn && drOn.confidence} ("${drOn && drOn.discardNote}")`);
  }

  const passed = results.filter(r => r.pass).length;
  console.log(`\n${passed}/${results.length} gates passed`);
  return passed === results.length;
}

// Street-2 (LAST) draw-phase snapshot for the hero, deal-free pre-draw. Mirrors
// drawSpotEV's snapshot.
function drawPhaseSnap(game, heroSeat, heroHand) {
  return {
    deck: [],
    hands: heroSeat === 0 ? [heroHand.slice(), []] : [[], heroHand.slice()],
    street: 2, phase: 'draw', toAct: heroSeat,
    bets: 0, contrib: [6, 6],
    acted: [false, false], folded: null, hist: '', curSeq: '',
    pendingDraw: null, drawCounts: [[0, 0], [0, 0]], discards: [[], []], log: [],
  };
}

// Game-generic "low rank" for ordering a hand low→high so the MONOTONE gate can
// throw the BEST low cards. td27 uses the 2..A low ladder (rankOf); badugi uses
// the ace-low ladder (lowRankOf). Falls back to rankOf.
function lowOf(game, card) {
  const cards = require('../engine/cards');
  return game.id === 'badugi' ? cards.lowRankOf(card) : cards.rankOf(card);
}

// Build a WEAK opponent range (explicit drawing/high-card hands) on the last
// draw: hands that will themselves draw and that a made low is ahead of. Used by
// the monotone-DRAW "made hand stands pat" gates so the comparison is against a
// realistic weaker opponent (a uniform-random opponent over-represents made hands
// AND improves by drawing, making break-to-draw spuriously competitive).
function weakOppRange(heroHand) {
  const dead = new Set(heroHand);
  const cand = [
    'Ks Qd Jc 8h 6s', 'As Qh Tc 7d 5s', 'Kd Jh 9c 6s 4d',
    'Qs Th 8c 7s 5d', 'Js 9h 7c 6d 4s', 'Ks Td 8h 5c 4s',
    'Ad Kh Qs 9c 7d', 'Qd Jc 9h 8s 6d', 'Ts 8d 7h 5s 4c',
    'Kc Qs Th 7d 6c',
  ].map(H).filter(h => h.every(c => !dead.has(c)) && new Set(h).size === 5);
  return cand;
}

// Helper: build a street-2 DRAW-phase snapshot (the LAST draw) for the hero and
// return the per-action EV over an EXPLICIT opponent range (default: a weak
// drawing range). Runs the grader's perActionEV with a 'passive' continuation so
// the post-draw round is checked down to a guaranteed showdown — isolating the
// DRAW-node SHOWDOWN value from any σ betting artefacts.
function drawSpotEV(game, strategyMap, heroSeat, heroHand, oppRange) {
  // LAST draw = the street-2 draw phase (draws happen after the street-0/1/2 bet
  // rounds; street 3 has only a bet round then showdown). 2 prior draws done.
  const opp = 1 - heroSeat;
  const snap = {
    deck: [],
    hands: heroSeat === 0 ? [heroHand.slice(), []] : [[], heroHand.slice()],
    street: 2, phase: 'draw', toAct: heroSeat,
    bets: 0, contrib: [6, 6],
    acted: [false, false], folded: null,
    hist: '', curSeq: '',
    pendingDraw: null,
    drawCounts: [[0, 0], [0, 0]],
    discards: [[], []],
    log: [],
  };
  // opponent range: explicit weak/drawing hands (default) — equal-weighted
  // particles. resampleOnDraw inside the rollout will draw them naturally.
  const range = oppRange || weakOppRange(heroHand);
  const parts = range.map(h => ({ hand: h.slice(), discards: [], w: 1 / range.length }));
  const acts = game.legalActions(snap);
  // 'passive' continuation: check the post-draw round DOWN to a guaranteed
  // showdown, isolating the draw's SHOWDOWN value (σ would otherwise fold the
  // betting out first in this synthetic spot — an artefact, not a draw property).
  const res = grade.perActionEV(game, strategyMap, grade.cloneState(snap), heroSeat, acts, parts, {
    evParticles: parts.length,
    rolloutMode: 'passive',
    shuffleRng: makeRng(31337),
  });
  return { acts, ev: res.ev };
}

module.exports = { run };

if (require.main === module) {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
  const ok = run(arg('game', 'td27'));
  process.exit(ok ? 0 : 1);
}
