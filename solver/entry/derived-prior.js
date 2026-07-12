// Oracle consumer for the DERIVED (CFR) 3rd-street entry range. Returns
// P(enter | 3-card hand) read off a table emitted by extract-cfr-entry.js from a
// converged UNIFORM-deal razz3 blueprint — or null when no table exists yet, so
// the caller (grade.js entryPrior) transparently FALLS BACK to the hand-tuned
// tiers. Drop the table file in place and the oracle uses the derived range with
// no further code change. mtime-cached; env override for testing.
const fs = require('fs');
const path = require('path');
const { bucketOf } = require('./extract-cfr-entry');

// Per-game derived-entry table path (override via env for tests). razz only for now;
// stud8 gets its own once a stud8 multiway (uniform-deal) blueprint exists.
const FILES = {
  razz: process.env.RAZZ_ENTRY_FILE || path.join(__dirname, '../strategies/razz3-uniform-entry.json'),
};
const CACHE = {};

function loadTable(game) {
  const f = FILES[game];
  if (!f) return null;
  let st;
  try { st = fs.statSync(f); } catch { CACHE[game] = { table: null, mtime: -1 }; return null; }
  const c = CACHE[game];
  if (c && c.mtime === st.mtimeMs) return c.table;
  let table = null;
  try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); table = j.table || j; } catch { table = null; }
  CACHE[game] = { table, mtime: st.mtimeMs };
  return table;
}

// P(enter | 3-card hand) from the derived table, or null (no table / unseen bucket).
function pEnter(game, cards) {
  const t = loadTable(game);
  if (!t) return null;
  const v = t[bucketOf(cards)];
  return (v == null ? null : v);
}

module.exports = { pEnter, loadTable, FILES };
