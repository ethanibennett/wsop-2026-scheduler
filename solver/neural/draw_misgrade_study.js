// ── M2 MIS-GRADE STUDY: blueprint grader vs the EXACT post-last-draw ORACLE ──
// The draw-game analogue of the methodology that justified shipping the stud
// 7th-street oracle (the "6:1 undercharge" study): on deterministic-seed
// self-play hands from the draw trainer's own replay path, every POST-LAST-DRAW
// hero BETTING decision is graded twice —
//   1. BLUEPRINT: solver/draw-trainer/grade.js (exact-forward σ-expectation
//      over the particle-filter posterior; the shipped production grade), and
//   2. ORACLE: solver/neural/oracle_worker.py -> resolve_draw_final.
//      draw_root_action_ev (EXACT equilibrium re-solve of the final betting
//      round over the SAME particle posterior).
// The opponent range fed to the oracle is the particle posterior REBUILT with
// gradeDecision's own seed derivation (byte-identical belief), deduplicated,
// and — when wider than --cap holdings — SYSTEMATIC-sampled across the
// reach-sorted range (evenly strided, then renormalized), NOT top-mass-capped:
// the stud study proved a flat range's top-K head is an unrepresentative slice
// that biases the solve (the "flat-range top-K trap").
//
// This is EVIDENCE, not a gate: it reports the evLoss gap distribution, the
// under-charge vs over-charge ratio (blueprint vs oracle), disagreement flips,
// and per-decision oracle latency. Run:
//   ORACLE_PYTHON=/usr/bin/python3 node solver/neural/draw_misgrade_study.js \
//     --game badugi --spots 40 [--cap 40] [--iters 800] [--seed0 1] [--jsonl out]

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const play = require(path.join(ROOT, 'solver', 'draw-trainer', 'play.js'));
const gradeMod = require(path.join(ROOT, 'solver', 'draw-trainer', 'grade.js'));
const lbr = require(path.join(ROOT, 'solver', 'lbr-draw.js'));
const { GAMES } = require(path.join(ROOT, 'solver', 'games'));
const { makeRng, cardStr } = require(path.join(ROOT, 'solver', 'engine', 'cards.js'));
const { OracleWorker } = require(path.join(ROOT, 'solver', 'razz-trainer', 'oracle-bridge.js'));

function arg(n, d) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; }

// Deduplicate a particle set into [{hand:[ints], w}] and, if wider than `cap`,
// take a SYSTEMATIC (evenly-strided) sample across the reach-sorted range —
// a representative miniature of the whole posterior (see header). Weights are
// the retained holdings' own reach, renormalized.
function particlesToRange(parts, cap) {
  const acc = new Map();
  for (const p of parts) {
    if (!(p.w > 0)) continue;
    const key = p.hand.slice().sort((a, b) => a - b).join(',');
    const e = acc.get(key);
    if (e) e.w += p.w; else acc.set(key, { hand: p.hand.slice().sort((a, b) => a - b), w: p.w });
  }
  let cands = [...acc.values()];
  cands.sort((a, b) => b.w - a.w);
  const distinct = cands.length;
  let kept = cands;
  if (cap > 0 && cands.length > cap) {
    const stride = cands.length / cap;
    kept = [];
    for (let i = 0; kept.length < cap && Math.floor(i) < cands.length; i += stride) {
      kept.push(cands[Math.floor(i)]);
    }
  }
  let z = 0; for (const c of kept) z += c.w;
  for (const c of kept) c.w /= z;
  return { range: kept, distinct };
}

async function main() {
  const gameId = arg('game', 'badugi');
  const game = GAMES[gameId];
  if (!game) { console.error('unknown game', gameId); process.exit(1); }
  const targetSpots = parseInt(arg('spots', '40'), 10);
  const cap = parseInt(arg('cap', '40'), 10);
  const iters = parseInt(arg('iters', '800'), 10);
  const seed0 = parseInt(arg('seed0', '1'), 10);
  const N = parseInt(arg('N', '200'), 10);
  const jsonlOut = arg('jsonl', null);

  const bp = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'solver', 'strategies', `${gameId}.json`), 'utf8'));
  const strategyMap = play.strategyMapOf(bp);
  lbr.memoizeCfg(game);

  const oracle = new OracleWorker({
    pythonPath: process.env.ORACLE_PYTHON || '/usr/bin/python3',
    timeoutMs: 180000,
  });
  if (!(await oracle.ping())) {
    console.error('oracle worker failed to start:', oracle.startError);
    process.exit(1);
  }

  const rows = [];
  let seed = seed0;
  let hands = 0;
  while (rows.length < targetSpots && hands < targetSpots * 30) {
    const s = seed++;
    hands++;
    const heroSeat = s % 2;
    const rec = play.dealHand(bp, { rng: makeRng(s), heroSeat, game });
    // shipped-production blueprint grades for every hero decision of the hand
    // (server defaults: N=200, targetSE 0.3, maxRepeats 16; exact-forward
    // street-3 grades are byte-identical to non-adaptive grading).
    let graded;
    try {
      graded = gradeMod.gradeHand(rec, bp, { seed: s, N, game, targetSE: 0.3, maxRepeats: 16 });
    } catch (e) {
      continue; // skip degenerate hands rather than abort the study
    }
    for (const g of graded.grades) {
      if (rows.length >= targetSpots) break;
      if (g.street !== 3 || g.kind !== 'bet') continue;   // post-last-draw bets only
      const i = g.gradeIdx;
      const d = rec.decisions[i];
      const snap = d.state;
      const opp = 1 - heroSeat;

      // Rebuild the particle posterior EXACTLY as gradeDecision did (same
      // seed derivation -> byte-identical belief at this node).
      const instr = { fallbacks: 0, collapses: 0 };
      const post = gradeMod.buildPosterior(
        game, strategyMap, rec, i, heroSeat, N,
        makeRng((s ^ (i * 0x9e3779b1)) >>> 0), instr);
      const { range, distinct } = particlesToRange(post.parts, cap);

      const spot = {
        game: gameId,
        me: snap.hands[heroSeat].map(cardStr),
        opp_range: range.map(c => [c.hand.map(cardStr), c.w]),
        contrib: [snap.contrib[heroSeat], snap.contrib[opp]],
        bets: snap.bets,
        acted: [snap.acted[heroSeat], snap.acted[opp]],
        street: 3,
        iters,
      };
      const t0 = Date.now();
      const res = await oracle.perActionEV(spot);
      const ms = Date.now() - t0;
      if (!res) { console.error(`seed ${s} idx ${i}: oracle failed, skipped`); continue; }

      const acts = d.acts;
      let oBest = acts[0], oBestEV = -Infinity;
      for (const a of acts) {
        if (!(a in res.per_action_ev)) { oBest = null; break; }
        if (res.per_action_ev[a] > oBestEV) { oBestEV = res.per_action_ev[a]; oBest = a; }
      }
      if (oBest == null) { console.error(`seed ${s} idx ${i}: action-set mismatch`); continue; }
      const oLoss = Math.max(0, oBestEV - res.per_action_ev[d.chosen]);

      rows.push({
        game: gameId, seed: s, gradeIdx: i, heroSeat,
        chosen: d.chosen, acts,
        bpLoss: g.evLoss, bpBest: g.bestActionId, bpEV: g.perActionEV,
        oLoss, oBest, oEV: res.per_action_ev,
        gap: oLoss - g.evLoss,
        exploitability: res.exploitability,
        rangeDistinct: distinct, rangeUsed: range.length,
        essMin: g.essMin, confidence: g.confidence,
        latencyMs: ms,
      });
      process.stderr.write(`\r${rows.length}/${targetSpots} spots (${hands} hands)   `);
    }
  }
  process.stderr.write('\n');
  oracle.stop();

  if (jsonlOut) fs.writeFileSync(jsonlOut, rows.map(r => JSON.stringify(r)).join('\n') + '\n');

  // ── summary ────────────────────────────────────────────────────────────────
  const n = rows.length;
  const gaps = rows.map(r => r.oLoss - r.bpLoss);
  const absg = gaps.map(Math.abs).sort((a, b) => a - b);
  const mean = xs => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const q = (xs, p) => xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))] : 0;
  const under = rows.filter(r => r.oLoss > r.bpLoss + 1e-9);   // blueprint UNDER-charged
  const over = rows.filter(r => r.bpLoss > r.oLoss + 1e-9);    // blueprint OVER-charged
  const underMass = mean(under.map(r => r.oLoss - r.bpLoss)) * under.length;
  const overMass = mean(over.map(r => r.bpLoss - r.oLoss)) * over.length;
  const flips = rows.filter(r => r.oBest !== r.bpBest).length;
  const bigMiss = rows.filter(r => Math.abs(r.oLoss - r.bpLoss) > 2).length; // >1 small bet
  const lat = rows.map(r => r.latencyMs).sort((a, b) => a - b);

  console.log(`\n=== ${gameId} mis-grade study: ${n} post-last-draw bet decisions ===`);
  console.log(`blueprint evLoss: mean ${mean(rows.map(r => r.bpLoss)).toFixed(3)}  ` +
              `oracle evLoss: mean ${mean(rows.map(r => r.oLoss)).toFixed(3)} (chips)`);
  console.log(`gap (oracle - blueprint): mean ${mean(gaps).toFixed(3)}  ` +
              `median|gap| ${q(absg, 0.5).toFixed(3)}  p90|gap| ${q(absg, 0.9).toFixed(3)}  ` +
              `max|gap| ${q(absg, 1).toFixed(3)}`);
  console.log(`under-charged (o>bp): ${under.length} spots / ${underMass.toFixed(1)} chips   ` +
              `over-charged (bp>o): ${over.length} spots / ${overMass.toFixed(1)} chips   ` +
              `mass ratio ${(underMass / Math.max(1e-9, overMass)).toFixed(1)}:1`);
  console.log(`best-action flips (oracle vs blueprint): ${flips}/${n}   ` +
              `|gap| > 1 small bet (2 chips): ${bigMiss}/${n}`);
  console.log(`oracle latency ms: mean ${mean(lat).toFixed(0)}  median ${q(lat, 0.5)}  p90 ${q(lat, 0.9)}  max ${q(lat, 1)}`);
  console.log(`oracle resolve exploitability (chips): mean ${mean(rows.map(r => r.exploitability)).toFixed(4)}  ` +
              `max ${Math.max(...rows.map(r => r.exploitability)).toFixed(4)}`);
  console.log(`opp range: mean distinct ${mean(rows.map(r => r.rangeDistinct)).toFixed(0)} -> ` +
              `mean used ${mean(rows.map(r => r.rangeUsed)).toFixed(0)} (cap ${cap})`);
}

main().catch(e => { console.error(e); process.exit(1); });
