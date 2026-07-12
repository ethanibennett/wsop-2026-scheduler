// Empirical realism check for the full-ring ENTRY models (razz earlyLowTier +
// stud8 stud8EntryTier). Enumerates ALL C(52,3) = 22100 three-card starting hands,
// runs each through the entry weight, and reports the implied full-ring VPIP (mean
// play-weight over uniform starting hands) + the tier-mass distribution. This
// MEASURES the "is the realistic range actually realistic?" claim (design asserted
// stud8 lands ~22-26% VPIP) instead of inferring it.
//   node solver/razz-trainer/entry-vpip.js
const { stud8EntryTier, STUD8_ENTRY_W } = require('./grade');
const razz = require('../games/razz-game');
const RAZZ_ENTRY_W = { 0: 1.0, 1: 1.0, 2: 0.7, 3: 0.35, 4: 0.12, 5: 0.04 };

// all 3-card combos of a 52-card deck (card ints 0..51)
const combos = [];
for (let a = 0; a < 50; a++)
  for (let b = a + 1; b < 51; b++)
    for (let c = b + 1; c < 52; c++)
      combos.push([a, b, c]);

function report(name, weightOf, tierOf, W) {
  let sum = 0, playCut = 0;                 // playCut = mass at weight >= 0.35 (voluntary-entry band)
  const tierCount = {};
  for (const cc of combos) {
    const t = tierOf(cc);
    const w = weightOf(cc);
    tierCount[t] = (tierCount[t] || 0) + 1;
    sum += w;
    if (w >= 0.35 - 1e-9) playCut++;
  }
  const n = combos.length;
  console.log(`\n== ${name} ==`);
  console.log(`  implied VPIP (mean entry weight)      : ${(100 * sum / n).toFixed(1)}%`);
  console.log(`  hands at weight >= 0.35 (would enter) : ${(100 * playCut / n).toFixed(1)}%`);
  console.log(`  tier mass (% of all starting hands):`);
  for (const t of Object.keys(tierCount).sort()) {
    const pct = (100 * tierCount[t] / n).toFixed(1);
    console.log(`    tier ${t} (w=${W[t]})  ${pct.padStart(5)}%  (${tierCount[t]} combos)`);
  }
}

report('STUD8 (stud8EntryTier)',
  (cc) => STUD8_ENTRY_W[stud8EntryTier(cc)],
  (cc) => stud8EntryTier(cc), STUD8_ENTRY_W);

report('RAZZ (earlyLowTier)',
  (cc) => { const t = razz.earlyLowTier(cc); return RAZZ_ENTRY_W[t] != null ? RAZZ_ENTRY_W[t] : 0.04; },
  (cc) => razz.earlyLowTier(cc), RAZZ_ENTRY_W);

console.log('\nREAD: a winning full-ring stud8/razz player VPIPs ~20-30% on 3rd. A realistic');
console.log('entry model should land near that; a HU-maniac blueprint (no prior) is ~100%.');
