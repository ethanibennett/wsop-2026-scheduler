// Derive P*(h|m) = P(voluntarily enter | 3-card start) as an EQUITY FIXED POINT.
// See solver/entry/DERIVATION_SPEC.md (design wf_583effdb).
//
// enter iff  E[multiwayShare(h) vs the field that also enters] >= E* = c/pot.
// Iterate w_{t+1} = (1-a_t) w_t + a_t * logistic((E[share]-E*)/se)  (Robbins-Monro),
// starting from w0=1 (enter-all, weakest field) -> monotone-decreasing to the
// GREATEST fixed point. Converge on the scalar entering mass p_t.
//
// ISOMORPHISM: razz low ignores suits AND the field is suit-symmetric, so a hand's
// expected equity depends only on its 3 RANKS -> ~455 classes, not 22,100. stud8
// needs a suit-PATTERN refinement to the class key (which ranks are co-suited, for
// flushes) — razz-first here; stud8 class key marked APPROX until refined.
//
// PERFORMANCE (razz fast path): the MC hot loop is allocation-free. A module-level
// Uint8Array(52) marks used cards (mark/unmark by index, hero's 3 marked once per
// class); the razz class is encoded as an INT (r0*169+r1*13+r2, ranks 0..12) so the
// field weight is a Float64Array index — no Map<string> in the rejection loop; player
// 7-card buffers are preallocated; and the razz best-low is inlined (5 smallest
// distinct ranks when >=5 distinct, else exact fallback) instead of multiwayShare's
// 21-combo scan. The inlined share is verified byte-identical to multiwayShare.
// stud8 keeps the original (slower) string-key path — deferred, razz is the priority.
const { makeDeck, makeRng, cardFromStr, cardStr, rankOf, suitOf } = require('../engine/cards');
const { multiwayShare } = require('../equity');
const { bestLowRazz } = require('../eval/razz');
const { potAndCost } = require('./economics');

const logistic = z => 1 / (1 + Math.exp(-z));

// canonical isomorphism class of a 3-card hand
function classKey(game, cards) {
  const ranks = cards.map(rankOf).sort((a, b) => a - b);
  if (game === 'razz') return ranks.join('.');
  // stud8 (APPROX): ranks + which ranks share a suit (flush structure). Group the
  // sorted (rank,suit) by suit; emit each same-suit group's sorted ranks. Suit
  // LABELS don't matter, only the partition -> canonicalize by sorted group strings.
  const bySuit = {};
  for (const c of cards) { const s = suitOf(c); (bySuit[s] = bySuit[s] || []).push(rankOf(c)); }
  const groups = Object.values(bySuit).map(g => g.sort((a, b) => a - b).join('-')).sort();
  return ranks.join('.') + '|' + groups.join('/');
}

// razz integer class key: the 3 sorted rank-indices (0..12, 2->0 .. A->12) packed
// base-13. A pure relabeling of the razz string classKey (same partition), so it
// indexes the field-weight Float64Array without any string allocation.
function razzClassInt(cards) {
  let a = cards[0] >> 2, b = cards[1] >> 2, c = cards[2] >> 2; // rank-2, 0..12
  if (a > b) { const t = a; a = b; b = t; }
  if (b > c) { const t = b; b = c; c = t; }
  if (a > b) { const t = a; a = b; b = t; }
  return a * 169 + b * 13 + c;
}

// enumerate classes with a canonical representative + combinatorial multiplicity
function enumerateClasses(game) {
  const deck = makeDeck(); // card ints 0..51
  const map = new Map();
  for (let a = 0; a < 50; a++)
    for (let b = a + 1; b < 51; b++)
      for (let c = b + 1; c < 52; c++) {
        const cards = [deck[a], deck[b], deck[c]];
        const key = classKey(game, cards);
        let e = map.get(key);
        if (!e) { e = { key, rep: cards, mult: 0 }; map.set(key, e); }
        e.mult++;
      }
  return [...map.values()];
}

// draw 3 distinct cards (ints) from the deck avoiding `used` (a Set)
function draw3(deck, used, rng) {
  const out = [];
  while (out.length < 3) {
    const c = deck[(rng() * 52) | 0];
    if (!used.has(c) && !out.includes(c)) out.push(c);
  }
  return out;
}
function draw1(deck, used, rng) {
  for (;;) { const c = deck[(rng() * 52) | 0]; if (!used.has(c)) return c; }
}

// MC estimate of E[hero split share] vs the entering field w, and its std-error.
// GENERAL path (stud8): Map<string> weights, multiwayShare. razz uses evShareRazz.
function evShare(game, hero, w, classOf, m, M, deck, rng) {
  const k = m - 1;
  let sum = 0, sumSq = 0;
  for (let s = 0; s < M; s++) {
    const used = new Set(hero);
    const opps = [];
    for (let o = 0; o < k; o++) {
      let cand = null;
      for (let t = 0; t < 400; t++) {
        const c = draw3(deck, used, rng);
        if (rng() < w.get(classOf(c))) { cand = c; break; }
      }
      if (!cand) cand = draw3(deck, used, rng); // fallback (very tight field)
      for (const x of cand) used.add(x);
      opps.push(cand);
    }
    const players = [hero.slice(), ...opps.map(o => o.slice())];
    for (const p of players) while (p.length < 7) { const c = draw1(deck, used, rng); used.add(c); p.push(c); }
    const sh = multiwayShare(game, players[0], players.slice(1));
    sum += sh; sumSq += sh * sh;
  }
  const mean = sum / M;
  const varr = Math.max(0, sumSq / M - mean * mean);
  return { mean, se: Math.sqrt(varr / M) };
}

// ── razz fast path: allocation-free MC of E[hero split share] ──────────────
// Module-level scratch reused across every call (single-threaded, sequential).
const USED = new Uint8Array(52);     // used-card marker, index = card int
const PC = new Uint8Array(3 * 7);    // player 7-card buffers (m<=3): player p at p*7
const TOUCH = new Int16Array(32);    // cards marked THIS sample, to unmark
const TMP5 = new Int8Array(5);       // 5 smallest distinct low-ranks

// exact best razz low from 7 cards in PC[off..off+6]; returns the score5Razz value
// (LOWER better). Fast path: >=5 distinct low-ranks -> the 5 smallest, no pair
// (category 0, always the global min). Else fall back to the exact combo scan.
function bestLow7(off) {
  let mask = 0;
  for (let i = 0; i < 7; i++) {
    const r = PC[off + i] >> 2;          // 0..12
    const lr = r === 12 ? 1 : r + 2;     // ace-low rank 1..13
    mask |= (1 << lr);
  }
  let idx = 0;
  for (let lr = 1; lr <= 13 && idx < 5; lr++) if (mask & (1 << lr)) TMP5[idx++] = lr;
  if (idx < 5) { // <5 distinct ranks -> forced pairing, rare -> exact fallback
    return bestLowRazz([PC[off], PC[off + 1], PC[off + 2], PC[off + 3], PC[off + 4], PC[off + 5], PC[off + 6]]);
  }
  // base-15 of the 5 smallest, largest-first (matches score5Razz's no-pair encoding)
  let v = TMP5[4];
  v = v * 15 + TMP5[3]; v = v * 15 + TMP5[2]; v = v * 15 + TMP5[1]; v = v * 15 + TMP5[0];
  return v;
}

// razz class int of the 3 cards at PC[off..off+2]
function razzClassIntBuf(off) {
  let a = PC[off] >> 2, b = PC[off + 1] >> 2, c = PC[off + 2] >> 2;
  if (a > b) { const t = a; a = b; b = t; }
  if (b > c) { const t = b; b = c; c = t; }
  if (a > b) { const t = a; a = b; b = t; }
  return a * 169 + b * 13 + c;
}

// draw 3 distinct not-USED cards into PC[off..off+2] (does NOT mark them USED)
function draw3Into(off, rng) {
  let got = 0;
  while (got < 3) {
    const c = (rng() * 52) | 0;
    if (USED[c]) continue;
    if (got >= 1 && PC[off] === c) continue;
    if (got >= 2 && PC[off + 1] === c) continue;
    PC[off + got++] = c;
  }
}

// hero's 3 class cards must be preloaded into PC[0..2] by the caller.
// Wf = Float64Array field weights indexed by razz class int.
function evShareRazz(Wf, m, M, rng) {
  // mark hero's 3 cards ONCE per class (outside the sample loop)
  USED[PC[0]] = 1; USED[PC[1]] = 1; USED[PC[2]] = 1;
  let sum = 0, sumSq = 0;
  for (let s = 0; s < M; s++) {
    let nt = 0;
    // opponents: rejection-sample a 3-card entering hand per opp
    for (let o = 1; o < m; o++) {
      const base = o * 7;
      let accepted = false;
      for (let t = 0; t < 400; t++) {
        draw3Into(base, rng);
        if (rng() < Wf[razzClassIntBuf(base)]) { accepted = true; break; }
      }
      if (!accepted) draw3Into(base, rng); // fallback (very tight field)
      USED[PC[base]] = 1; TOUCH[nt++] = PC[base];
      USED[PC[base + 1]] = 1; TOUCH[nt++] = PC[base + 1];
      USED[PC[base + 2]] = 1; TOUCH[nt++] = PC[base + 2];
    }
    // fill each player (hero + opps) to 7 cards
    for (let p = 0; p < m; p++) {
      const base = p * 7;
      for (let j = 3; j < 7; j++) {
        let c;
        do { c = (rng() * 52) | 0; } while (USED[c]);
        USED[c] = 1; TOUCH[nt++] = c; PC[base + j] = c;
      }
    }
    // hero split share = 1/#winners if hero ties the min low, else 0
    let minS = Infinity, winners = 0, heroS = 0;
    for (let p = 0; p < m; p++) {
      const sc = bestLow7(p * 7);
      if (p === 0) heroS = sc;
      if (sc < minS) { minS = sc; winners = 1; }
      else if (sc === minS) winners++;
    }
    const sh = heroS === minS ? 1 / winners : 0;
    sum += sh; sumSq += sh * sh;
    // unmark everything touched this sample (hero's 3 stay marked)
    for (let i = 0; i < nt; i++) USED[TOUCH[i]] = 0;
  }
  USED[PC[0]] = 0; USED[PC[1]] = 0; USED[PC[2]] = 0;
  const mean = sum / M;
  const varr = Math.max(0, sumSq / M - mean * mean);
  return { mean, se: Math.sqrt(varr / M) };
}

// ── razz solve (fast integer-keyed fixed point) ──
function solveRazz(opts) {
  const m = opts.m, M0 = opts.M0, Mmax = opts.Mmax, maxIters = opts.maxIters, minIters = opts.minIters;
  const eStar = opts.eStar, rng = opts.rng;
  const classes = enumerateClasses('razz');
  for (const cl of classes) cl.ik = razzClassInt(cl.rep);
  const Wf = new Float64Array(13 * 13 * 13); // indexed by razz class int
  for (const cl of classes) Wf[cl.ik] = 1.0;  // w0 = enter-all
  const totalCombos = classes.reduce((a, c) => a + c.mult, 0);
  const massOf = () => { let s = 0; for (const cl of classes) s += Wf[cl.ik] * cl.mult; return s / totalCombos; };
  const sigmaArr = new Float64Array(classes.length);

  let prevP = 1.0;
  const log = [];
  for (let t = 0; t < maxIters; t++) {
    const M = Math.min(Mmax, M0 * (t + 1));
    const alpha = 3 / (3 + t); // Robbins-Monro: sum=inf, sum^2<inf
    for (let i = 0; i < classes.length; i++) {
      const rep = classes[i].rep;
      PC[0] = rep[0]; PC[1] = rep[1]; PC[2] = rep[2];
      const { mean, se } = evShareRazz(Wf, m, M, rng);
      const z = (mean - eStar) / Math.max(se, 1e-4);
      sigmaArr[i] = logistic(z);
    }
    for (let i = 0; i < classes.length; i++) {
      const ik = classes[i].ik;
      Wf[ik] = (1 - alpha) * Wf[ik] + alpha * sigmaArr[i];
    }
    const p = massOf();
    log.push({ t, M, alpha: +alpha.toFixed(3), vpip: +(100 * p).toFixed(1), dP: +(p - prevP).toFixed(4) });
    if (t >= minIters && Math.abs(p - prevP) < 1e-3) { prevP = p; break; }
    prevP = p;
  }
  const w = { get: k => Wf[k] };
  const classOf = cards => razzClassInt(cards);
  return { game: 'razz', m, eStar, classes, w, classOf, Wf, vpip: massOf(), log };
}

function solve(game, opts = {}) {
  const m = opts.m || 3;
  const M0 = opts.M0 || 800, Mmax = opts.Mmax || 3000;
  const maxIters = opts.maxIters || 14, minIters = opts.minIters || 4;
  const seed = opts.seed || 12345;
  const eStar = opts.eStar != null ? opts.eStar : potAndCost({ m, action: 'open' }).eStar;
  const rng = makeRng(seed);
  // opts.general forces the original Map/multiwayShare path (for faithfulness A/B).
  if (game === 'razz' && !opts.general) return solveRazz({ m, M0, Mmax, maxIters, minIters, eStar, rng });

  // ── general path (stud8): string class keys + multiwayShare (deferred) ──
  const deck = makeDeck();
  const classes = enumerateClasses(game);
  const classOf = (cards) => classKey(game, cards);
  const w = new Map(classes.map(c => [c.key, 1.0])); // w0 = enter-all
  const totalCombos = classes.reduce((a, c) => a + c.mult, 0);
  const massOf = () => classes.reduce((a, c) => a + w.get(c.key) * c.mult, 0) / totalCombos;

  let prevP = 1.0;
  const log = [];
  for (let t = 0; t < maxIters; t++) {
    const M = Math.min(Mmax, M0 * (t + 1));
    const alpha = 3 / (3 + t); // Robbins-Monro: sum=inf, sum^2<inf
    const sigma = new Map();
    for (const cl of classes) {
      const { mean, se } = evShare(game, cl.rep, w, classOf, m, M, deck, rng);
      const z = (mean - eStar) / Math.max(se, 1e-4);
      sigma.set(cl.key, logistic(z));
    }
    for (const cl of classes) w.set(cl.key, (1 - alpha) * w.get(cl.key) + alpha * sigma.get(cl.key));
    const p = massOf();
    log.push({ t, M, alpha: +alpha.toFixed(3), vpip: +(100 * p).toFixed(1), dP: +(p - prevP).toFixed(4) });
    if (t >= minIters && Math.abs(p - prevP) < 1e-3) { prevP = p; break; }
    prevP = p;
  }
  return { game, m, eStar, classes, w, classOf, vpip: massOf(), log };
}

// P* for a specific 3-card hand string (e.g. 'As2h3d')
function pEnter(res, handStr) {
  const cards = []; for (let i = 0; i < handStr.length; i += 2) cards.push(cardFromStr(handStr.slice(i, i + 2)));
  return res.w.get(res.classOf(cards));
}

// validation helper: E[hero share] for a 3-card hand vs a razz field Wf (fast path).
function probeShare(cards, Wf, m, M, rng) {
  PC[0] = cards[0]; PC[1] = cards[1]; PC[2] = cards[2];
  return evShareRazz(Wf, m, M, rng);
}

module.exports = { solve, pEnter, classKey, razzClassInt, enumerateClasses, evShare, evShareRazz, probeShare };

// ── CLI: node solver/entry/equity-fixed-point.js [game] [m] ──
if (require.main === module) {
  const game = process.argv[2] || 'razz';
  const m = parseInt(process.argv[3] || '3', 10);
  const smoke = process.argv.includes('--smoke');
  const t0 = Date.now();
  const res = solve(game, smoke ? { m, M0: 150, Mmax: 400, maxIters: 5, minIters: 2 } : { m });
  console.log(`\n${game} m=${m}  E*=${res.eStar.toFixed(3)}  classes=${res.classes.length}  VPIP=${res.vpip.toFixed(3)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log('convergence:', res.log.map(l => `${l.vpip}%`).join(' -> '));
  const gates = game === 'razz'
    ? ['As2h3d', '2c3h4d', 'Ah2c4d', '5s4d3c', '6s5d4c', '8s7d5c', '8s6d4c', '2c2h5d', '3c3h6d', 'Ac2d7s', 'Ac2d9s', 'KsQd9c', 'KdJh8c', 'Qs9c4d']
    : ['As2s3s', '3c3d3h', 'Ah2c4d', 'KsKd4h', 'KhQd9c'];
  console.log('\ngate hands  ->  P*(enter):');
  for (const h of gates) console.log(`  ${h.padEnd(8)}  ${pEnter(res, h).toFixed(3)}`);
}
