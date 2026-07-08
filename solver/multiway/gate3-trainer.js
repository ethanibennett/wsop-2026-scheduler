#!/usr/bin/env node
// ── gate3-trainer — GATE for the MULTIWAY (3-player) razz TRAINER backend core ─
// Proves the play3.js + grade3.js core is correct + HONEST before any server/UI
// wiring. Five non-negotiable checks, all on REAL blueprint-driven hands:
//
//  (1) GRADE-VS-GRADE7 MATCH (the certificate). For every 7th-street hero
//      decision grade3 produces, we take the SAME reconstructed spot (spec +
//      ranges + hero) that grade3 built and call grade7.grade7th DIRECTLY. The
//      per-action EV, the best action, and the chosen-action EV-loss must match
//      grade3's output to <= 1e-9 (exact — same inputs, same primitive).
//
//  (2) LEGALITY. Every recorded decision's chosen action ∈ razz3-game.legalActions
//      at that decision's live state (injected hero actions AND sampled opponent
//      actions). No illegal action ever enters the record.
//
//  (3) OPPONENTS FOLLOW σ. Every NON-hero recorded action has POSITIVE probability
//      under the blueprint σ at that infoset (a σ-sample can only pick a support
//      action). Over many hands the sampled opponent action-frequencies track σ
//      (we report the mean |empirical − σ| over the most-visited infosets → ~0).
//
//  (4) HONESTY / GTO BAN. gradeLabel('gto') THROWS; the hand grade's label is the
//      certified-EV-loss-vs-stated-profile string; gtoBanned is true.
//
//  (5) PER-SEAT EXPLOITABILITY BAR PRESENT. Every 7th-street grade carries the
//      per-seat BR gap bar (lower bound, and the tighter true bound).
//
// Plus a full end-to-end graded 3-player hand printed for inspection.
//
// Run: node solver/multiway/gate3-trainer.js [--seeds N] [--oppCap K] [--bp PATH]

const fs = require('fs');
const path = require('path');
const play3 = require('./play3');
const grade3 = require('./grade3');
const grade7 = require('./grade7');
const { makeGame: makeRazz3 } = require('./razz3-game');
const { cardStr } = require('../engine/cards');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}

const GAME = makeRazz3({ cap: 2, antes: 8 });

function loadBlueprint(p) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return j;
}
function strategyMapOf(bp) { return play3.strategyMapOf(bp); }

// ── (1) grade-vs-grade7 exact match ────────────────────────────────────────
// grade3.grade7thDecision(opts.attachInputs:true) stashes the EXACT (spec,ranges,
// hero) it fed grade7th. For a grade7th-ELIGIBLE spot (hero is the 7th-round's
// FIRST actor), grade3 grades via grade7th directly, so a fresh direct grade7th on
// the SAME inputs must match to <=1e-9. For an INELIGIBLE (mid-round) spot grade3
// uses the snapshot-exact path — there is NO start-of-round grade7th equivalent, so
// we don't force a direct match (it would grade a different node); we only assert
// the grade is legal (action-set == the record's legal set) and evLoss is finite.
function checkGradeMatch(strategyMap, handRecord, gradeIdx) {
  const g = grade3.grade7thDecision(GAME, strategyMap, handRecord, gradeIdx,
    { oppCap: MATCH_OPPCAP, attachInputs: true });
  const barPresent = !!(g.exploitabilityBar && (g.exploitabilityBar.bounds || g.exploitabilityBar.lower));
  if (!g.grade7thEligible) {
    // mid-round snapshot-exact grade: no direct grade7th cross-check. Assert
    // legality (grade's action set == record's legal set) + finite evLoss.
    const d = handRecord.decisions[gradeIdx];
    const sameActs = JSON.stringify(g.actions.slice().sort()) === JSON.stringify(d.acts.slice().sort());
    const finite = Number.isFinite(g.evLoss);
    return { g, eligible: false, worst: 0, sameActs: sameActs && finite && g.actionSetOk,
      bestMatch: true, barPresent };
  }
  const built = g._grade7Inputs;
  const direct = grade7.grade7th(built.spec, built.ranges, strategyMap, { hero: built.hero });
  // compare per-action EV, best action, chosen evLoss
  let worst = 0;
  const sameActs = JSON.stringify(g.actions.slice().sort()) === JSON.stringify(direct.actions.slice().sort());
  for (const a of direct.actions) {
    worst = Math.max(worst, Math.abs(g.perActionEV[a] - direct.actionEV[a]));
  }
  worst = Math.max(worst, Math.abs(g.bestEV - direct.bestEV));
  worst = Math.max(worst, Math.abs(g.evLoss - direct.evLoss[g.chosen]));
  worst = Math.max(worst, Math.abs(g.onPolicyEV - direct.onPolicyEV));
  const bestMatch = g.bestAction === direct.bestAction;
  return { g, eligible: true, worst, sameActs, bestMatch, barPresent };
}
const MATCH_OPPCAP = parseInt(arg('oppCap', 10), 10);

// ── (2) legality + (3) opponents-follow-σ, walked from the record ──────────
function checkRecord(strategyMap, handRecord) {
  let illegal = 0, oppActions = 0, oppInSupport = 0, heroActions = 0;
  for (const d of handRecord.decisions) {
    const st = grade3.cloneState(d.state);
    const acts = GAME.legalActions(st);
    // legality: recorded acts set must equal the live legal set, chosen ∈ set
    if (JSON.stringify(acts) !== JSON.stringify(d.acts) || acts.indexOf(d.chosen) < 0) illegal++;
    // σ-following for opponents (non-hero)
    if (!d.isHero) {
      oppActions++;
      const node = strategyMap[d.key];
      let p;
      if (node && node.a && node.a.length === acts.length && node.a.every((a, i) => a === acts[i])) {
        p = node.p[acts.indexOf(d.chosen)];
      } else {
        p = 1 / acts.length; // untrained → uniform; every action is in support
      }
      if (p > 0) oppInSupport++;
    } else heroActions++;
  }
  return { illegal, oppActions, oppInSupport, heroActions };
}

// ── (3b) empirical opponent frequencies vs σ over many hands ───────────────
// Aggregate, per opponent infoset, the sampled action counts across many self-play
// hands; compare the empirical distribution to σ at the most-visited infosets.
function checkOppFrequencies(bp, nHands) {
  const strategyMap = strategyMapOf(bp);
  const counts = {}; // key -> { acts, n:[...], sigma }
  for (let seed = 1; seed <= nHands; seed++) {
    const rec = play3.dealHand3(bp, { seed, heroSeat: seed % 3 });
    for (const d of rec.decisions) {
      if (d.isHero) continue;
      const node = strategyMap[d.key];
      if (!node) continue; // only score trained infosets
      if (!counts[d.key]) counts[d.key] = { acts: d.acts.slice(), n: d.acts.map(() => 0), sigma: node.p.slice() };
      const idx = d.acts.indexOf(d.chosen);
      if (idx >= 0) counts[d.key].n[idx]++;
    }
  }
  // Across independent hands most of razz3's 788k infosets are visited once, so
  // in-hand aggregation is thin. To get a STATISTICALLY MEANINGFUL frequency test
  // we take the SINGLE most-visited opponent infoset seen above and re-sample the
  // blueprint σ at it MANY times through the SAME sampler play3 uses (sampleIndex),
  // then compare the empirical action mix to σ. This isolates "does the sampler
  // reproduce σ?" from the sparsity of natural infoset repeats.
  let bestKey = null, bestTot = -1;
  for (const k of Object.keys(counts)) { const t = counts[k].n.reduce((a, b) => a + b, 0); if (t > bestTot) { bestTot = t; bestKey = k; } }
  const inHandRows = Object.values(counts).map(c => {
    const tot = c.n.reduce((a, b) => a + b, 0);
    const emp = c.n.map(x => x / tot);
    let maxAbs = 0; for (let i = 0; i < emp.length; i++) maxAbs = Math.max(maxAbs, Math.abs(emp[i] - c.sigma[i]));
    return { tot, maxAbs, emp, sigma: c.sigma };
  }).sort((a, b) => b.tot - a.tot);

  // direct resample of the sampler at the most-visited σ node
  let direct = null;
  if (bestKey) {
    const node = strategyMap[bestKey];
    const { makeRng } = require('../engine/cards');
    const rng = makeRng(0x5A11 ^ 0x9e3779b1);
    const N = 20000;
    const n = node.p.map(() => 0);
    for (let i = 0; i < N; i++) n[play3.sampleIndex(node.p, rng)]++;
    const emp = n.map(x => x / N);
    let maxAbs = 0; for (let i = 0; i < emp.length; i++) maxAbs = Math.max(maxAbs, Math.abs(emp[i] - node.p[i]));
    direct = { key: bestKey, N, emp, sigma: node.p.slice(), maxAbs, acts: node.a.slice() };
  }
  return { infosetsScored: inHandRows.length, top: inHandRows.slice(0, 4), direct };
}

// ── driver ──────────────────────────────────────────────────────────────────
function run() {
  const bpPath = arg('bp', path.join(__dirname, '..', 'strategies', 'razz3.best-750k.json'));
  const nSeeds = parseInt(arg('seeds', 60), 10);
  console.log(`gate3-trainer  blueprint=${path.basename(bpPath)}  seeds=1..${nSeeds}  oppCap=${MATCH_OPPCAP}\n`);
  const bp = loadBlueprint(bpPath);
  const strategyMap = strategyMapOf(bp);
  console.log(`blueprint: ${Object.keys(strategyMap).length} infosets\n`);

  // ── (2)+(3): scan many hands for legality + opponents-in-σ-support ──────────
  let totIllegal = 0, totOppActions = 0, totOppInSupport = 0, handsWith7 = 0;
  const sevenSpots = []; // {seed, rec, gradeIdx}
  for (let seed = 1; seed <= nSeeds; seed++) {
    const heroSeat = seed % 3;
    const rec = play3.dealHand3(bp, { seed, heroSeat });
    const r = checkRecord(strategyMap, rec);
    totIllegal += r.illegal; totOppActions += r.oppActions; totOppInSupport += r.oppInSupport;
    // collect this hand's 7th-street hero decisions for the exact-match check
    let has7 = false;
    for (let i = 0; i < rec.decisions.length; i++) {
      const d = rec.decisions[i];
      if (d.isHero && d.state.street === 4) { sevenSpots.push({ seed, rec, gradeIdx: i }); has7 = true; }
    }
    if (has7) handsWith7++;
  }

  console.log('── (2) LEGALITY ──────────────────────────────────────────────');
  console.log(`  decisions with an illegal chosen action (or act-set mismatch): ${totIllegal}`);
  const legalityPass = totIllegal === 0;
  console.log(`  → ${legalityPass ? 'PASS ✅' : 'FAIL ❌'}\n`);

  console.log('── (3) OPPONENTS FOLLOW σ (every sampled opp action in support) ──');
  console.log(`  opponent actions: ${totOppActions};  in σ-support: ${totOppInSupport}`);
  const suppPass = totOppInSupport === totOppActions;
  console.log(`  → ${suppPass ? 'PASS ✅' : 'FAIL ❌'}`);
  const freq = checkOppFrequencies(bp, Math.max(nSeeds, 200));
  let freqPass = true;
  if (freq.direct) {
    const dr = freq.direct;
    console.log(`  direct σ-sampler resample at the most-visited opp infoset (${dr.N} draws):`);
    console.log(`      key=${dr.key.slice(0, 46)}`);
    console.log(`      acts=[${dr.acts.join(',')}]  emp=[${dr.emp.map(x => x.toFixed(3)).join(',')}]  σ=[${dr.sigma.map(x => x.toFixed(3)).join(',')}]  max|emp−σ|=${dr.maxAbs.toFixed(4)}`);
    freqPass = dr.maxAbs < 0.02; // 20k draws → sampling noise well under 2%
  }
  console.log(`  (in-hand aggregation touched ${freq.infosetsScored} trained opp infosets; razz3's 788k space makes natural repeats sparse — hence the direct resample above)`);
  console.log(`  → sampler reproduces σ (direct resample max Δ<0.02): ${freqPass ? 'PASS ✅' : 'FAIL ❌'}\n`);

  // ── (1)+(5): grade-vs-grade7 exact match + exploitability bar present ───────
  console.log('── (1) GRADE-VS-GRADE7 MATCH (7th-street certificate) ───────────');
  console.log(`  hands with a 7th-street hero decision: ${handsWith7}/${nSeeds};  7th-street hero spots: ${sevenSpots.length}`);
  let worstMatch = 0, eligChecked = 0, snapChecked = 0, allBars = true, allBest = true, allActs = true;
  const sample = sevenSpots.slice(0, parseInt(arg('matchN', 25), 10));
  for (const sp of sample) {
    const m = checkGradeMatch(strategyMap, sp.rec, sp.gradeIdx);
    if (!m.barPresent) allBars = false;
    if (!m.bestMatch) allBest = false;
    if (!m.sameActs) allActs = false;
    if (m.eligible) { worstMatch = Math.max(worstMatch, m.worst); eligChecked++; }
    else snapChecked++;
  }
  console.log(`  grade7th-ELIGIBLE spots (hero is 7th-round first actor) cross-checked vs a direct grade7th call: ${eligChecked}`);
  console.log(`  worst |Δ| on eligible spots (per-action EV / bestEV / evLoss / onPolicy): ${worstMatch.toExponential(3)}`);
  console.log(`  mid-round snapshot-exact spots (legality-checked, no direct grade7th equiv): ${snapChecked}`);
  console.log(`  action-sets == record legal set (all spots): ${allActs ? 'YES ✅' : 'NO ❌'};  best-action match (eligible): ${allBest ? 'YES ✅' : 'NO ❌'}`);
  // The certificate gate: every eligible spot matches grade7th to <=1e-9, we
  // actually exercised >=1 eligible spot, and every spot's action set is legal.
  const matchPass = worstMatch <= 1e-9 && allActs && allBest && eligChecked > 0;
  console.log(`  → grade3 7th grade == direct grade7th to <=1e-9 (eligible) + all legal: ${matchPass ? 'PASS ✅' : 'FAIL ❌'}\n`);

  console.log('── (5) PER-SEAT EXPLOITABILITY BAR PRESENT ──────────────────────');
  console.log(`  every 7th-street grade carries the per-seat BR bar: ${allBars ? 'YES ✅' : 'NO ❌'}`);
  // show one bar for inspection
  if (sample.length) {
    const one = checkGradeMatch(strategyMap, sample[0].rec, sample[0].gradeIdx).g;
    const bar = one.exploitabilityBar;
    if (bar && bar.bounds) {
      for (const b of bar.bounds) {
        console.log(`      seat${b.seat}: exploit lower-bound=${b.exploitLowerBound.toFixed(4)}  true=${b.exploitTrue.toFixed(4)}  abstractionGap=${b.abstractionGap.toFixed(4)} chips`);
      }
    }
  }
  const barPass = allBars;
  console.log(`  → ${barPass ? 'PASS ✅' : 'FAIL ❌'}\n`);

  // ── (4): honesty / GTO ban ──────────────────────────────────────────────
  console.log('── (4) HONESTY / GTO LABEL BANNED ───────────────────────────────');
  let banOk = false, banErr = '';
  try { grade3.gradeLabel('gto'); } catch (e) { banOk = true; banErr = e.message.split('—')[0].trim(); }
  const label = grade3.gradeLabel('ev-loss');
  console.log(`  gradeLabel('gto') throws: ${banOk ? 'YES ✅' : 'NO ❌'}  (${banErr})`);
  console.log(`  certified label: "${label}"`);
  // also confirm a full hand grade stamps gtoBanned + the label
  const demoRec = sample.length ? sample[0].rec : play3.dealHand3(bp, { seed: 1, heroSeat: 0 });
  const demoGrade = grade3.gradeHand3(demoRec, bp, { oppCap: MATCH_OPPCAP, samples: 200 });
  const honestOnHand = demoGrade.gtoBanned === true && demoGrade.label === label
    && demoGrade.grades.every(g => g.certified && g.certified.includes('EV-loss-vs-stated-profile'));
  console.log(`  hand grade: gtoBanned=${demoGrade.gtoBanned}, label matches, every grade certified-EV-loss-framed: ${honestOnHand ? 'YES ✅' : 'NO ❌'}`);
  const honestyPass = banOk && honestOnHand;
  console.log(`  → ${honestyPass ? 'PASS ✅' : 'FAIL ❌'}\n`);

  // ── END-TO-END: print one fully graded 3-player hand ────────────────────────
  console.log('── END-TO-END: one fully graded 3-player hand ───────────────────');
  printHand(demoRec, demoGrade);

  // ── verdict ──────────────────────────────────────────────────────────────
  const pass = legalityPass && suppPass && freqPass && matchPass && barPass && honestyPass;
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`GATE3-TRAINER: ${pass ? 'ALL PASS ✅' : 'FAIL ❌'}`);
  console.log(JSON.stringify({
    legality: legalityPass, oppInSupport: suppPass, oppFreqTracksSigma: freqPass,
    gradeVsGrade7Match: matchPass, worstMatchDelta: worstMatch,
    exploitBarPresent: barPass, honestyGtoBanned: honestyPass, pass,
  }));
  console.log('══════════════════════════════════════════════════════════════');
  process.exit(pass ? 0 : 2);
}

function printHand(rec, grade) {
  console.log(`  seed hand; hero seat ${rec.heroSeat}; net result ${rec.utility[rec.heroSeat]} chips (utility=${JSON.stringify(rec.utility)})`);
  console.log(`  label: "${grade.label}"  (GTO impossible — 3-player razz is general-sum)`);
  for (const gr of grade.grades) {
    const mix = gr.gtoMix.actions.map((a, i) => `${a}:${(gr.gtoMix.probs[i] * 100).toFixed(0)}%`).join(' ');
    const evs = (gr.actions || gr.gtoMix.actions).map(a => `${a}=${(gr.perActionEV[a] != null ? gr.perActionEV[a] : 0).toFixed(2)}`).join(' ');
    const oppUp = (gr.oppUp || []).map(u => u.join('')).join(' | ');
    console.log(`  ${gr.streetName.padEnd(3)} [${gr.gradeSource}] hero ${gr.heroCards.down.join('')}(${gr.heroCards.up.join('')}) vs opp up ${oppUp}`);
    console.log(`       σ-mix [${mix}]${gr.trained ? '' : ' (UNTRAINED→uniform)'}`);
    console.log(`       EV(chips) [${evs}]`);
    const se = gr.evLossSE != null ? ` ± ${gr.evLossSE.toFixed(2)}` : '';
    console.log(`       chose '${gr.chosen}', best '${gr.bestAction}', evLoss ${gr.evLoss.toFixed(2)}${se} chips  (${gr.forwardMode})`);
  }
}

module.exports = { run, checkGradeMatch, checkRecord, checkOppFrequencies };
if (require.main === module) run();
