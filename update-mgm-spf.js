#!/usr/bin/env node
// Apply MGM Grand 2026 Summer Poker Festival structure data to the 84
// pre-existing tournament rows (stable_ids MGM-1..MGM-51 + Flights + Restarts).
// Source: schedule-docs/MGM Grand/structures/*.pdf (51 event sheets + event list)
// Also fixes two known issues in the original AI-parsed import:
//   (a) 7/5 Seniors + 7/5 DGC Bounty were numbered MGM-45/46 but should be
//       MGM-46/47 (PDF numbering is continuous: 7/4 = 44/45, 7/5 = 46/47).
//   (b) Event 40 name "HORSE Championship" should be "HEROS Championship".

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'poker-tournaments.db');
const STRUCT_DIR = 'schedule-docs/MGM Grand/structures';

// ── Per-event structure data (starting chips + level duration in minutes).
// Level duration is the *starting* level length. Events marked "30/40 min"
// transition later in the day; we store 30 as the card-facing level value.
// Keys are MGM event numbers (no flight letter); flight / restart rows inherit
// from their parent event number.
const STRUCT = {
   1: { chips: 30000, levels: 30 },
   2: { chips: 30000, levels: 30 },
   3: { chips: 25000, levels: 30 },
   4: { chips: 20000, levels: 20 }, // 20K/20K/50K rebuy format
   5: { chips: 50000, levels: 30 },
   6: { chips: 30000, levels: 30 },
   7: { chips: 30000, levels: 30 },
   8: { chips: 30000, levels: 30 },
   9: { chips: 25000, levels: 30 },
  10: { chips: 30000, levels: 30 },
  11: { chips: 25000, levels: 30 },
  12: { chips: 30000, levels: 30 },
  13: { chips: 25000, levels: 30 },
  14: { chips: 25000, levels: 30 },
  15: { chips: 40000, levels: 30 },
  16: { chips: 30000, levels: 30 },
  17: { chips: 30000, levels: 30 },
  18: { chips: 20000, levels: 20 },
  19: { chips: 30000, levels: 30 },
  20: { chips: 30000, levels: 30 },
  21: { chips: 25000, levels: 30 },
  22: { chips: 30000, levels: 30 },
  23: { chips: 40000, levels: 30 },
  24: { chips: 30000, levels: 30 },
  25: { chips: 30000, levels: 30 },
  26: { chips: 25000, levels: 30 },
  27: { chips: 30000, levels: 30 },
  28: { chips: 25000, levels: 30 },
  29: { chips: 30000, levels: 30 },
  30: { chips: 25000, levels: 30 },
  31: { chips: 30000, levels: 30 },
  32: { chips: 25000, levels: 30 },
  33: { chips: 30000, levels: 30 },
  34: { chips: 25000, levels: 30 },
  35: { chips: 30000, levels: 30 },
  36: { chips: 25000, levels: 30 },
  37: { chips: 30000, levels: 30 },
  38: { chips: 30000, levels: 30 },
  39: { chips: 25000, levels: 30 },
  40: { chips: 30000, levels: 30 },
  41: { chips: 25000, levels: 30 },
  42: { chips: 30000, levels: 30 },
  43: { chips: 25000, levels: 30 },
  44: { chips: 30000, levels: 30 },
  45: { chips: 25000, levels: 30 },
  46: { chips: 30000, levels: 30 },
  47: { chips: 25000, levels: 30 },
  48: { chips: 30000, levels: 30 },
  49: { chips: 25000, levels: 30 },
  50: { chips: 25000, levels: 30 },
  51: { chips: 50000, levels: 30 },
};

// ── Event # → structure PDF filename (relative to STRUCT_DIR).
const FILES = {};
for (const f of fs.readdirSync(STRUCT_DIR)) {
  const m = f.match(/^Event #(\d+)\b/);
  if (m) FILES[parseInt(m[1], 10)] = f;
}

function structurePathFor(eventNum) {
  const f = FILES[eventNum];
  return f ? `${STRUCT_DIR}/${f}` : null;
}

// Extract the MGM event number from a stable_id like
// "MGM-15A-June 13, 2026" → 15, "MGM-51-July 10, 2026" → 51.
function eventNumFromStableId(sid) {
  const m = /^MGM-(\d+)/.exec(sid || '');
  return m ? parseInt(m[1], 10) : null;
}

async function run() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  // Pull current MGM Grand rows
  const rows = db.exec("SELECT id, stable_id, event_number, event_name, date, starting_chips, level_duration FROM tournaments WHERE venue='MGM Grand'");
  if (!rows.length) { console.error('No MGM Grand rows found.'); process.exit(1); }

  let updated = 0, skipped = 0;
  for (const r of rows[0].values) {
    const [id, stableId, eventNumber, eventName, date, curChips, curLevels] = r;
    const en = eventNumFromStableId(stableId);
    if (!en || !STRUCT[en]) { skipped++; continue; }

    const { chips, levels } = STRUCT[en];
    const structPath = structurePathFor(en);

    db.run(
      `UPDATE tournaments
          SET starting_chips = ?,
              level_duration = ?,
              structure_sheet_path = ?
        WHERE id = ?`,
      [chips, levels, structPath, id]
    );
    updated++;
  }
  console.log(`Structure data applied: ${updated} rows updated, ${skipped} skipped.`);

  // ── (a) Fix off-by-one event numbering for 7/5 events.
  // 7/4: #44 TORSE, #45 DGC (correct)
  // 7/5: PDF says #46 Seniors, #47 DGC — DB has them as #45/#46.
  // Only updating the displayed event_number column, NOT stable_id (stable_id
  // is referenced by user schedules).
  db.run("UPDATE tournaments SET event_number='MGM-46' WHERE stable_id='MGM-45-July 5, 2026' AND event_name LIKE '%Seniors%'");
  db.run("UPDATE tournaments SET event_number='MGM-47' WHERE stable_id='MGM-46-July 5, 2026' AND event_name LIKE '%Double Green Chip Bounty%'");
  console.log('Fixed 7/5 event_number sequence (Seniors → 46, DGC → 47).');

  // ── (b) HEROS Championship rename (AI parser misread HEROS as HORSE).
  const heroBefore = db.exec("SELECT event_name FROM tournaments WHERE stable_id='MGM-40-July 2, 2026'");
  if (heroBefore.length && /horse/i.test(heroBefore[0].values[0][0])) {
    db.run("UPDATE tournaments SET event_name='HEROS Championship' WHERE stable_id='MGM-40-July 2, 2026'");
    console.log('Renamed Event 40: HORSE Championship → HEROS Championship.');
  }

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log('DB saved.');
  db.close();
}

run().catch(err => { console.error(err); process.exit(1); });
