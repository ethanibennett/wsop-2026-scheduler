#!/usr/bin/env node
// Generate South Point Poker Room Summer Events (May 25 - July 12, 2026)
// Insert directly into the SQLite database

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'poker-tournaments.db');

const WEEKLY = {
  monday: [
    { time: '10:10 AM', buyin: 300, chips: 30000, name: 'NLH 300K Multiday Day 1', variant: 'NLH', gtd: 300000, levels: '30', notes: '300K Multiday - 30-minute blind levels' },
    { time: '2:10 PM', buyin: 120, chips: 20000, name: 'NLH Chip Chop Survivor', variant: 'NLH', gtd: 6000, levels: '20' },
    { time: '6:10 PM', buyin: 300, chips: 30000, name: 'NLH 300K Multiday Day 1', variant: 'NLH', gtd: 300000, levels: '30', notes: '300K Multiday - 30-minute blind levels' },
    { time: '10:10 PM', buyin: 120, chips: 20000, name: 'NLH Turbo Bounty ($25)', variant: 'NLH', gtd: 4000, levels: '15', notes: 'Turbo - 15-minute blind levels, $25 bounty' },
  ],
  tuesday: [
    { time: '10:10 AM', buyin: 300, chips: 30000, name: 'NLH 300K Multiday Day 1', variant: 'NLH', gtd: 300000, levels: '30', notes: '300K Multiday - 30-minute blind levels' },
    { time: '2:10 PM', buyin: 120, chips: 15000, name: 'O8 Omaha 8/B', variant: 'O8', gtd: 6000, levels: '20' },
    { time: '6:10 PM', buyin: 300, chips: 30000, name: 'NLH 300K Multiday Day 1', variant: 'NLH', gtd: 300000, levels: '30', notes: '300K Multiday - 30-minute blind levels' },
    { time: '10:10 PM', buyin: 120, chips: 20000, name: 'NLH Turbo Bounty ($25)', variant: 'NLH', gtd: 4000, levels: '15', notes: 'Turbo - 15-minute blind levels, $25 bounty' },
  ],
  wednesday: [
    { time: '10:10 AM', buyin: 300, chips: 30000, name: 'NLH 300K Multiday Day 1', variant: 'NLH', gtd: 300000, levels: '30', notes: '300K Multiday - 30-minute blind levels' },
    { time: '6:10 PM', buyin: 300, chips: 30000, name: 'NLH 300K Multiday Day 1', variant: 'NLH', gtd: 300000, levels: '30', notes: '300K Multiday - 30-minute blind levels' },
  ],
  thursday: [
    { time: '10:10 AM', buyin: 120, chips: 20000, name: 'NLH $15K GTD', variant: 'NLH', gtd: 15000, levels: '20' },
    { time: '2:10 PM', buyin: 0, chips: null, name: 'NLH 300K Multiday Day 2 Restart', variant: 'NLH', gtd: 300000, levels: '30', notes: '300K Multiday Day 2 Restart - 30-minute blind levels', isRestart: true },
    { time: '6:10 PM', buyin: 200, chips: 30000, name: 'NLH Deepstack $20K GTD', variant: 'NLH', gtd: 20000, levels: '20', isDeepstack: true },
    { time: '10:10 PM', buyin: 120, chips: 20000, name: 'NLH Turbo Bounty ($25)', variant: 'NLH', gtd: 4000, levels: '15', notes: 'Turbo - 15-minute blind levels, $25 bounty' },
  ],
  friday: [
    { time: '10:10 AM', buyin: 120, chips: 20000, name: 'NLH $15K GTD', variant: 'NLH', gtd: 15000, levels: '20' },
    { time: '2:10 PM', buyin: 120, chips: 20000, name: 'Crazy Pineapple', variant: 'Other', gtd: 6000, levels: '20' },
    { time: '6:10 PM', buyin: 200, chips: 30000, name: 'NLH Deepstack $20K GTD', variant: 'NLH', gtd: 20000, levels: '20', isDeepstack: true },
    { time: '10:10 PM', buyin: 120, chips: 20000, name: 'NLH Turbo Bounty ($25)', variant: 'NLH', gtd: 4000, levels: '15', notes: 'Turbo - 15-minute blind levels, $25 bounty' },
  ],
  saturday: [
    { time: '10:10 AM', buyin: 120, chips: 20000, name: 'NLH $15K GTD', variant: 'NLH', gtd: 15000, levels: '20' },
    { time: '2:10 PM', buyin: 200, chips: 20000, name: 'O8 Omaha 8/B $15K GTD', variant: 'O8', gtd: 15000, levels: '20' },
    { time: '6:10 PM', buyin: 200, chips: 30000, name: 'NLH Bounty ($50) $20K GTD', variant: 'NLH', gtd: 20000, levels: '20', notes: '$50 bounty' },
    { time: '10:10 PM', buyin: 120, chips: 20000, name: 'Crazy Pineapple', variant: 'Other', gtd: 4000, levels: '20' },
  ],
  sunday: [
    { time: '10:10 AM', buyin: 120, chips: 20000, name: 'NLH $15K GTD', variant: 'NLH', gtd: 15000, levels: '20' },
    { time: '2:10 PM', buyin: 120, chips: 20000, name: 'NLH Turbo Bounty ($25) $6K GTD', variant: 'NLH', gtd: 6000, levels: '15', notes: 'Turbo - 15-minute blind levels, $25 bounty' },
    { time: '6:10 PM', buyin: 120, chips: 20000, name: 'Crazy Pineapple $10K GTD', variant: 'Other', gtd: 10000, levels: '20' },
    { time: '10:10 PM', buyin: 120, chips: 20000, name: 'NLH Turbo Bounty ($25)', variant: 'NLH', gtd: 4000, levels: '15', notes: 'Turbo - 15-minute blind levels, $25 bounty' },
  ],
};

// Cancellations from fine print
const CANCELLATIONS = new Set([
  '2026-06-12|2:10 PM',     // June 12 2pm
  '2026-06-26|10:10 AM',    // June 26 All
  '2026-06-26|2:10 PM',
  '2026-06-26|6:10 PM',
  '2026-06-26|10:10 PM',
  '2026-06-27|10:10 AM',    // June 27 10am & 2pm
  '2026-06-27|2:10 PM',
  '2026-06-28|2:10 PM',     // June 28 2pm
]);

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

async function main() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  // Check if stable_id column exists
  const cols = db.exec("PRAGMA table_info(tournaments)")[0].values.map(r => r[1]);
  const hasStableId = cols.includes('stable_id');

  const events = [];
  const start = new Date(2026, 4, 25); // May 25
  const end = new Date(2026, 6, 12);   // July 12

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayName = DAY_NAMES[d.getDay()];
    const templates = WEEKLY[dayName];
    if (!templates) continue;

    const dateStr = d.toISOString().split('T')[0];

    for (const t of templates) {
      const cancelKey = `${dateStr}|${t.time}`;
      if (CANCELLATIONS.has(cancelKey)) continue;

      const stableId = `sp-summer-${dateStr}-${t.time.replace(/[: ]/g, '').toLowerCase()}`;

      // Check if already exists
      let exists;
      if (hasStableId) {
        exists = db.exec(`SELECT id FROM tournaments WHERE stable_id = '${stableId}'`);
      } else {
        exists = db.exec(`SELECT id FROM tournaments WHERE venue = 'South Point' AND date = '${dateStr}' AND time = '${t.time}' AND event_name = '${t.name.replace(/'/g, "''")}'`);
      }
      if (exists.length > 0 && exists[0].values.length > 0) continue;

      if (hasStableId) {
        db.run(
          `INSERT INTO tournaments (stable_id, event_name, date, time, buyin, starting_chips, level_duration, game_variant, venue, notes, prize_pool, is_restart, is_deepstack, source_pdf)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [stableId, t.name, dateStr, t.time, t.buyin, t.chips, t.levels, t.variant, 'South Point', t.notes || null, t.gtd, t.isRestart ? 1 : 0, t.isDeepstack ? 1 : 0, 'South Point Summer Events 2026']
        );
      } else {
        db.run(
          `INSERT INTO tournaments (event_name, date, time, buyin, starting_chips, level_duration, game_variant, venue, notes, source_pdf)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [t.name, dateStr, t.time, t.buyin, t.chips, t.levels, t.variant, 'South Point', t.notes || null, 'South Point Summer Events 2026']
        );
      }
      events.push(`${dateStr} ${t.time} - ${t.name}`);
    }
  }

  // Save
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  console.log(`Inserted ${events.length} South Point events`);
}

main().catch(console.error);
