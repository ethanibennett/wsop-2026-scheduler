#!/usr/bin/env node
// ── Solver analyst ──────────────────────────────────────────
// Reads the training artifacts a running supervisor produces and emits a
// study/operations report:
//   1. Convergence & compute allocation — from strategies/curve.csv: each
//      game's latest exploitability lower bound, its recent slope, a verdict
//      (still descending / flattening), and which game deserves the cores.
//   2. Strategy heuristics — decodes the saved strategies into plain-English
//      action frequencies (per street, per decision type) and a few
//      signature spots, using each game's exact infoset-key abstraction.
//   3. (optional) Narrative — with --narrate and an ANTHROPIC_API_KEY, feeds
//      the compact digest (not the raw infosets) to Claude for expert
//      commentary. This is the thin agentic layer; the report above is fully
//      deterministic and runs without a key.
//
// Usage:
//   node solver/analyst.js                       # all games, text report
//   node solver/analyst.js --game stud8
//   node solver/analyst.js --dir solver/strategies --out report.md
//   node solver/analyst.js --narrate             # + Claude commentary
//
// Everything here is read-only; safe to run against a live training dir.

const fs = require('fs');
const os = require('os');
const path = require('path');

function arg(name, dflt) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : dflt; }
function has(name) { return process.argv.includes('--' + name); }

const DIR = path.resolve(arg('dir', path.join(__dirname, 'strategies')));
const ONLY = arg('game', 'all');
const OUT = arg('out', '');
const NARRATE = has('narrate');
const MODEL = arg('model', process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6');
const GAMES = ['td27', 'badugi', 'stud8'].filter(g => ONLY === 'all' || g === ONLY);
const GAME_NAMES = { td27: '2-7 Triple Draw', badugi: 'Badugi', stud8: 'Stud 8 or Better' };

// ── Action + street + bucket decoders (match the game files exactly) ──
const ACTION = { f: 'fold', c: 'call', r: 'raise', k: 'check', b: 'bet', co: 'complete', br: 'bring-in' };
function actName(a) { if (a[0] === 'd') return a === 'd0' ? 'stand pat' : `draw ${a[1]}`; return ACTION[a] || a; }

function drawStreetLabel(street, phase) {
  if (phase === 'D') return `draw ${street + 1}`;
  return ['pre-draw', 'after draw 1', 'after draw 2', 'after draw 3'][street] || `street ${street}`;
}
const STUD_STREET = ['3rd', '4th', '5th', '6th', '7th'];

// td27 own-hand bucket -> English (from triple-draw-27.js bucket()).
function td27Bucket(b) {
  if (b[0] === 'M') return `pat ${b[1]}-${b[2]} low`;
  const m = b.match(/^D(\d)k(\d+)(d?)(x?)(p?)$/);
  if (!m) return b;
  const [, n, top, d, x, p] = m;
  const bits = [`${n}-card draw`];
  if (top !== '0') bits.push(`top low ${top}`); else bits.push('no low kept');
  if (d) bits.push('holds a deuce');
  if (x) bits.push('straight risk');
  if (p) bits.push('rough made 9/T (can pat)');
  return bits.join(', ');
}
function badugiBucket(b) {
  if (b[0] === 'B') return b === 'BH' ? 'J+-high badugi' : b === 'B9' ? '9/T-high badugi' : `${b[1]}-high badugi`;
  if (b[0] === 'T') return b === 'TH' ? '3-card (J+)' : `3-card (${b[1]} high)`;
  if (b[0] === 'W') return b === 'W4' ? '2-card (4 low)' : '2-card (high)';
  return 'one card';
}
function studBucket(b) {
  // pairCls(-/p/P/A/2/T) + L(0..4) + a? + f? + (Ls|Lw)?
  const m = b.match(/^([-pPA2T])(\d)(a?)(f?)(Ls|Lw)?$/);
  if (!m) return b;
  const [, cls, L, a, f, lo] = m;
  const pc = { '-': 'no pair', p: 'pair (≤8)', P: 'pair (9-K)', A: 'pair of aces', '2': 'two pair', T: 'trips+' }[cls];
  const bits = [pc, `${L} low card${L === '1' ? '' : 's'}`];
  if (a) bits.push('ace');
  if (f) bits.push('flush draw');
  if (lo === 'Ls') bits.push('strong made low (≤6)');
  else if (lo === 'Lw') bits.push('weak made low (7-8)');
  return bits.join(', ');
}

// Split an infoset key into structured fields per game.
function decodeKey(game, key) {
  const parts = key.split('|');
  if (game === 'stud8') {
    const street = parseInt(parts[0], 10);
    return { street, streetLabel: `${STUD_STREET[street]} st`, seq: parts[2],
      first: parts[3] === 'f1', bucket: (parts[4] || '').replace(/^/, ''), bucketEng: studBucket(parts[4] || ''),
      bringIn: parts[6] === 'b1' };
  }
  const street = parseInt(parts[0][0], 10);
  const phase = parts[0][1]; // B or D
  const b = parts[5] || '';
  return { street, phase, streetLabel: drawStreetLabel(street, phase), seq: parts[2],
    bucket: b, bucketEng: game === 'td27' ? td27Bucket(b) : badugiBucket(b) };
}

// Classify a decision node by its action set.
function nodeType(acts) {
  if (acts[0] && acts[0][0] === 'd') return 'draw';
  if (acts.includes('br') || acts.includes('co')) return 'bringin';
  if (acts.includes('f')) return 'facing-bet';
  if (acts.includes('k')) return 'open';
  return 'other';
}

// ── Load artifacts ──────────────────────────────────────────
function loadStrategy(game) {
  const f = path.join(DIR, `${game}.json`);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; }
}
function loadCurve() {
  const f = path.join(DIR, 'curve.csv');
  if (!fs.existsSync(f)) return [];
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n').slice(1);
  return lines.map(l => {
    const [timestamp, game, iterations, infosets, exploit] = l.split(',');
    return { timestamp, game, iterations: +iterations, infosets: +infosets, exploit: parseFloat(exploit) };
  }).filter(r => r.game && Number.isFinite(r.iterations));
}

// ── 1. Convergence + allocation ─────────────────────────────
function analyzeCurve(curve) {
  const out = {};
  for (const g of GAMES) {
    const rows = curve.filter(r => r.game === g && Number.isFinite(r.exploit));
    if (rows.length === 0) { out[g] = { points: 0 }; continue; }
    const last = rows[rows.length - 1];
    // slope over the recent window (up to last 6 points), chips/hand per 1M iters.
    const win = rows.slice(-6);
    let slope = null;
    if (win.length >= 2) {
      const a = win[0], b = win[win.length - 1];
      const dIter = b.iterations - a.iterations;
      if (dIter > 0) slope = (b.exploit - a.exploit) / (dIter / 1e6);
    }
    // noise floor: std-dev of the windowed exploit values.
    const mean = win.reduce((s, r) => s + r.exploit, 0) / win.length;
    const noise = Math.sqrt(win.reduce((s, r) => s + (r.exploit - mean) ** 2, 0) / win.length);
    let verdict;
    if (slope === null) verdict = 'too few points';
    else if (slope < -Math.max(0.02, noise)) verdict = 'descending — keep training';
    else if (Math.abs(slope) <= Math.max(0.02, noise)) verdict = 'flattening / near abstraction ceiling';
    else verdict = 'rising (noise or regression — watch)';
    out[g] = { points: rows.length, latest: last, slope, noise, verdict };
  }
  return out;
}

function recommendAllocation(curveStats, strategies) {
  // Score each game's marginal value of compute: still-descending and still-
  // exploitable games earn cores; flattened ones give them up. Stud 8 stays
  // single-worker (memory-bound) regardless.
  const cores = os.cpus().length;
  const scores = {};
  for (const g of GAMES) {
    const c = curveStats[g];
    const s = strategies[g];
    if (!c || !c.points || !c.latest) { scores[g] = { score: 0.5, note: 'no curve yet' }; continue; }
    const exploit = c.latest.exploit;
    const descending = c.slope !== null && c.slope < -Math.max(0.02, c.noise);
    // ratio of iters per infoset is a rough "how trained" proxy.
    const ratio = s ? s.iterations / Math.max(1, s.infosets) : 0;
    const score = (descending ? 1 : 0.2) * (0.5 + Math.min(2, exploit));
    scores[g] = { score, exploit, descending, ratio, note: c.verdict };
  }
  // Build a suggested --workers line. Stud 8 = 1; split the rest by score.
  const light = GAMES.filter(g => g !== 'stud8');
  const wk = {};
  for (const g of GAMES) wk[g] = 1;
  // Stud 8 is memory-bound, so normally 1 worker — but on a big-RAM box it's
  // safe to give the priority (steepest-descending, most-exploitable) game a
  // second core. Bump to 2 when RAM is ample and Stud 8 is still descending.
  if (GAMES.includes('stud8') && scores.stud8 && scores.stud8.descending && os.totalmem() >= 48e9) wk.stud8 = 2;
  const pool = Math.max(0, cores - 1 - (GAMES.includes('stud8') ? wk.stud8 : 0));
  const totalScore = light.reduce((s, g) => s + (scores[g] ? scores[g].score : 0), 0) || 1;
  let assigned = 0;
  light.forEach((g, i) => {
    const share = (scores[g].score / totalScore) * pool;
    wk[g] = Math.max(1, i === light.length - 1 ? pool - assigned : Math.round(share));
    assigned += wk[g];
  });
  return { cores, scores, workers: wk };
}

// ── 2. Strategy heuristics ──────────────────────────────────
// Mass-weighted action frequencies grouped by (streetLabel, nodeType).
function aggregate(game, strat) {
  const groups = new Map();
  for (const key of Object.keys(strat)) {
    const n = strat[key];
    const d = decodeKey(game, key);
    const t = nodeType(n.a);
    const gk = `${d.street} ${d.streetLabel} ${t}`;
    let g = groups.get(gk);
    if (!g) { g = { street: d.street, streetLabel: d.streetLabel, type: t, mass: 0, nodes: 0, act: {} }; groups.set(gk, g); }
    g.mass += n.m; g.nodes++;
    for (let i = 0; i < n.a.length; i++) g.act[n.a[i]] = (g.act[n.a[i]] || 0) + n.m * n.p[i];
  }
  return [...groups.values()].sort((a, b) => a.street - b.street || b.mass - a.mass);
}

// A few signature decision charts: for a filtered spot, list buckets by P(action).
function chart(game, strat, filterFn, primaryAct, topN = 12) {
  const rows = [];
  for (const key of Object.keys(strat)) {
    const n = strat[key];
    const d = decodeKey(game, key);
    if (!filterFn(d, n)) continue;
    const idx = n.a.indexOf(primaryAct);
    if (idx < 0) continue;
    rows.push({ bucket: d.bucketEng, raw: d.bucket, p: n.p[idx], m: n.m, mix: n.a.map((a, i) => `${actName(a)} ${(n.p[i] * 100).toFixed(0)}%`).join(', ') });
  }
  // de-dup by bucket, mass-weighted average of the primary action
  const by = new Map();
  for (const r of rows) {
    let e = by.get(r.raw);
    if (!e) { e = { bucket: r.bucket, raw: r.raw, num: 0, den: 0, mix: r.mix, m: 0 }; by.set(r.raw, e); }
    e.num += r.p * r.m; e.den += r.m; e.m += r.m;
    if (r.m > (e.topM || 0)) { e.topM = r.m; e.mix = r.mix; }
  }
  return [...by.values()].map(e => ({ ...e, p: e.den ? e.num / e.den : 0 }))
    .sort((a, b) => b.p - a.p).slice(0, topN);
}

function topSpots(game, strat, n = 8) {
  return Object.keys(strat).map(key => ({ key, ...strat[key] }))
    .sort((a, b) => b.m - a.m).slice(0, n)
    .map(s => {
      const d = decodeKey(game, s.key);
      const mix = s.a.map((a, i) => `${actName(a)} ${(s.p[i] * 100).toFixed(0)}%`).join(', ');
      const where = game === 'stud8'
        ? `${d.streetLabel}${d.bringIn ? ', bring-in' : ''}${d.seq ? `, seq "${d.seq}"` : ''}`
        : `${d.streetLabel}${d.seq ? `, seq "${d.seq}"` : ''}`;
      return { where, hand: d.bucketEng, mix, mass: s.m };
    });
}

// ── Report ──────────────────────────────────────────────────
function pct(x) { return `${(x * 100).toFixed(0)}%`; }
function fmtAgg(g) {
  const total = Object.values(g.act).reduce((s, v) => s + v, 0) || 1;
  const parts = Object.keys(g.act).sort((a, b) => g.act[b] - g.act[a])
    .map(a => `${actName(a)} ${pct(g.act[a] / total)}`);
  return parts.join(', ');
}

function buildReport(curve, curveStats, alloc, strategies) {
  const L = [];
  L.push(`# Solver analyst report`);
  L.push(`_${new Date().toISOString()} · dir ${DIR}_\n`);

  // 1. Convergence + allocation
  L.push(`## 1. Convergence & compute allocation\n`);
  if (curve.length === 0) {
    L.push(`No \`curve.csv\` yet — start the supervisor and let the meter run a few passes.\n`);
  } else {
    L.push(`| game | iters | infosets | exploit_lb (chips/hand) | recent slope (/1M iters) | verdict |`);
    L.push(`|---|---|---|---|---|---|`);
    for (const g of GAMES) {
      const c = curveStats[g];
      if (!c || !c.points) { L.push(`| ${g} | — | — | — | — | no data |`); continue; }
      const sl = c.slope === null ? '—' : c.slope.toFixed(3);
      L.push(`| ${g} | ${c.latest.iterations.toLocaleString()} | ${c.latest.infosets.toLocaleString()} | ${c.latest.exploit.toFixed(3)} | ${sl} | ${c.verdict} |`);
    }
    L.push('');
    const wline = GAMES.map(g => `${g}=${alloc.workers[g]}`).join(',');
    L.push(`**Suggested allocation** for this ${alloc.cores}-core box (Stud 8 pinned single-worker — memory-bound):`);
    L.push('```');
    L.push(`npm run supervise -- --heap 16384 --meter-min 20 --workers ${wline}`);
    L.push('```');
    L.push(`_Rationale: cores follow the curve — a game still descending earns compute; one that has flattened (hit this abstraction's ceiling) gives it up. The exploit number is a Monte-Carlo lower bound, so treat small moves as noise (see each game's noise band)._\n`);
  }

  // 2. Heuristics per game
  L.push(`## 2. Strategy heuristics\n`);
  for (const g of GAMES) {
    const strat = strategies[g];
    L.push(`### ${GAME_NAMES[g]}`);
    if (!strat) { L.push(`_No strategy file saved yet._\n`); continue; }
    L.push(`_${strat.iterations.toLocaleString()} iters · ${strat.infosets.toLocaleString()} infosets_\n`);

    const aggs = aggregate(g, strat.strategy);
    L.push(`**Action frequencies by street & decision** (mass-weighted):\n`);
    L.push(`| street | decision | infosets | frequencies |`);
    L.push(`|---|---|---|---|`);
    const typeLabel = { 'facing-bet': 'facing a bet', open: 'first in / checked to', draw: 'drawing', bringin: 'forced open (bring-in/complete)', other: 'other' };
    for (const a of aggs) {
      if (a.mass <= 0) continue;
      L.push(`| ${a.streetLabel} | ${typeLabel[a.type] || a.type} | ${a.nodes.toLocaleString()} | ${fmtAgg(a)} |`);
    }
    L.push('');

    // Signature charts
    if (g === 'td27' || g === 'badugi') {
      const open = chart(g, strat.strategy, (d) => d.street === 0 && d.phase === 'B' && d.seq === '', 'r');
      if (open.length) {
        L.push(`**Pre-draw opening (button first in) — P(raise) by hand:**\n`);
        L.push(`| hand | raise % | full mix (highest-mass node) |`);
        L.push(`|---|---|---|`);
        for (const r of open) L.push(`| ${r.bucket} | ${pct(r.p)} | ${r.mix} |`);
        L.push('');
      }
      const draw1 = chart(g, strat.strategy, (d) => d.phase === 'D' && d.street === 0, 'd0');
      if (draw1.length) {
        L.push(`**First draw — P(stand pat) by hand:**\n`);
        L.push(`| hand | pat % | full mix |`);
        L.push(`|---|---|---|`);
        for (const r of draw1) L.push(`| ${r.bucket} | ${pct(r.p)} | ${r.mix} |`);
        L.push('');
      }
    } else if (g === 'stud8') {
      const def = chart(g, strat.strategy, (d) => d.street === 0 && d.bringIn && /[o]/.test(d.seq), 'f');
      if (def.length) {
        L.push(`**3rd street, bring-in facing a completion — P(fold) by hand:**\n`);
        L.push(`| hand | fold % | full mix |`);
        L.push(`|---|---|---|`);
        for (const r of def) L.push(`| ${r.bucket} | ${pct(r.p)} | ${r.mix} |`);
        L.push('');
      }
    }

    // Top spots (always literal/correct)
    L.push(`**Most-trained spots** (highest visit mass):\n`);
    for (const s of topSpots(g, strat.strategy)) L.push(`- _${s.where}_ — ${s.hand}: ${s.mix}`);
    L.push('');
  }
  return L.join('\n');
}

// ── 3. Optional narrative via Claude ────────────────────────
async function narrate(report) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return `\n## 3. Narrative\n_Skipped — set ANTHROPIC_API_KEY to enable Claude commentary (--narrate)._\n`;
  }
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) {
    return `\n## 3. Narrative\n_Skipped — @anthropic-ai/sdk not installed._\n`;
  }
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: 'You are a world-class mixed-games poker theorist and CFR researcher. ' +
        'Given a deterministic analyst digest of trained heads-up limit solvers (2-7 Triple Draw, Badugi, Stud 8), ' +
        'write concise expert commentary: (a) the 3-5 most strategically notable frequencies and whether they match sound theory, ' +
        '(b) any number that looks like an abstraction/undertraining artifact rather than real strategy, ' +
        '(c) one concrete next experiment. Be specific and cite the figures. Do not restate the tables.',
      messages: [{ role: 'user', content: report }],
    });
    const text = msg.content.map(c => c.text || '').join('');
    return `\n## 3. Narrative (Claude ${MODEL})\n\n${text}\n`;
  } catch (e) {
    return `\n## 3. Narrative\n_Failed: ${e.message}_\n`;
  }
}

// ── Main ────────────────────────────────────────────────────
(async () => {
  const curve = loadCurve();
  const strategies = {};
  for (const g of GAMES) strategies[g] = loadStrategy(g);
  const curveStats = analyzeCurve(curve);
  const alloc = recommendAllocation(curveStats, strategies);
  let report = buildReport(curve, curveStats, alloc, strategies);
  if (NARRATE) report += await narrate(report);
  if (OUT) { fs.writeFileSync(OUT, report); console.log(`Wrote ${OUT} (${report.length} bytes)`); }
  else { console.log(report); }
})().catch(e => { console.error(e); process.exit(1); });
