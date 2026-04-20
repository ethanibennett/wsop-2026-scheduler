#!/usr/bin/env node
// Add missing Day 2 restart cards for multi-flight events at WSOPC Cherokee,
// WSOPC Horseshoe Las Vegas, and Turning Stone Casino.
// Also fixes Venetian MSPT Heart Poker Championship Day 2 name and Orleans orphaned flight.

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'poker-tournaments.db');

async function run() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  const inserts = [
    // ── WSOPC Cherokee ──────────────────────────────────────────────
    {
      event_name: 'NLH Mini Main - Day 2',
      date: '2026-05-10',
      time: '1:00 PM',
      buyin: 400,
      game_variant: 'NLH',
      venue: 'WSOPC Cherokee',
      house_fee: 49,
      reentry: null,
      is_restart: 1,
      stable_id: 'WSOP-2D2-May 10, 2026',
    },
    {
      event_name: 'NLH Monster Stack - Day 2',
      date: '2026-05-14',
      time: '1:00 PM',
      buyin: 400,
      game_variant: 'NLH',
      venue: 'WSOPC Cherokee',
      house_fee: 49,
      reentry: null,
      is_restart: 1,
      stable_id: 'WSOP-7D2-May 14, 2026',
    },
    {
      event_name: 'NLH - Day 2',
      date: '2026-05-15',
      time: '1:00 PM',
      buyin: 1100,
      game_variant: 'NLH',
      venue: 'WSOPC Cherokee',
      house_fee: 92,
      reentry: null,
      is_restart: 1,
      stable_id: 'WSOP-9D2-May 15, 2026',
    },
    {
      event_name: 'NLH Main Event - Day 2',
      date: '2026-05-17',
      time: '1:00 PM',
      buyin: 1700,
      game_variant: 'NLH',
      venue: 'WSOPC Cherokee',
      house_fee: 137,
      reentry: null,
      is_restart: 1,
      stable_id: 'WSOP-12D2-May 17, 2026',
    },

    // ── WSOPC Horseshoe Las Vegas ────────────────────────────────────
    {
      event_name: 'NLH Mini Main - Day 2',
      date: '2026-07-17',
      time: '1:00 PM',
      buyin: 400,
      game_variant: 'NLH',
      venue: 'WSOPC Horseshoe Las Vegas',
      house_fee: 49,
      reentry: null,
      is_restart: 1,
      stable_id: 'WSOPCH-1D2-July 17, 2026',
    },
    {
      event_name: 'NLH Monster Stack - Day 2',
      date: '2026-07-20',
      time: '1:00 PM',
      buyin: 600,
      game_variant: 'NLH',
      venue: 'WSOPC Horseshoe Las Vegas',
      house_fee: 67,
      reentry: null,
      is_restart: 1,
      stable_id: 'WSOPCH-5D2-July 20, 2026',
    },
    {
      event_name: 'NLH Main Event - Day 2',
      date: '2026-07-23',
      time: '1:00 PM',
      buyin: 1700,
      game_variant: 'NLH',
      venue: 'WSOPC Horseshoe Las Vegas',
      house_fee: 137,
      reentry: null,
      is_restart: 1,
      stable_id: 'WSOPCH-11D2-July 23, 2026',
    },

    // ── Turning Stone Casino ─────────────────────────────────────────
    {
      event_name: 'NLH Mini Main - Day 2',
      date: 'March 15, 2026',
      time: '1:00 PM',
      buyin: 400,
      game_variant: 'NLH',
      venue: 'Turning Stone Casino',
      house_fee: null,
      reentry: null,
      is_restart: 1,
      stable_id: 'WSOPC-TS-TS-2D2-March 15, 2026',
    },
    {
      event_name: 'NLH Monster Stack - Day 2',
      date: 'March 19, 2026',
      time: '1:00 PM',
      buyin: 400,
      game_variant: 'NLH',
      venue: 'Turning Stone Casino',
      house_fee: null,
      reentry: null,
      is_restart: 1,
      stable_id: 'WSOPC-TS-TS-8D2-March 19, 2026',
    },
    {
      event_name: 'NLH Main Event - Day 2',
      date: 'March 22, 2026',
      time: '1:00 PM',
      buyin: 1700,
      game_variant: 'NLH',
      venue: 'Turning Stone Casino',
      house_fee: null,
      reentry: null,
      is_restart: 1,
      stable_id: 'WSOPC-TS-TS-10D2-March 22, 2026',
    },
  ];

  let inserted = 0;
  for (const ev of inserts) {
    // Skip if already exists
    const exists = db.exec(
      'SELECT COUNT(*) FROM tournaments WHERE stable_id=?',
      [ev.stable_id]
    );
    if (exists[0].values[0][0] > 0) {
      console.log('  skip (exists):', ev.stable_id);
      continue;
    }
    db.run(
      `INSERT INTO tournaments
        (event_name, date, time, buyin, game_variant, venue, house_fee, reentry, is_restart, stable_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ev.event_name, ev.date, ev.time, ev.buyin, ev.game_variant,
        ev.venue, ev.house_fee ?? null, ev.reentry ?? null, ev.is_restart, ev.stable_id,
      ]
    );
    console.log('  inserted:', ev.event_name, ev.date, ev.venue);
    inserted++;
  }

  // Fix Venetian MSPT Heart Poker Championship Day 2 name
  db.run(
    "UPDATE tournaments SET event_name='NLH MSPT Heart Poker Championship - Day 2' WHERE stable_id='VEN-91D2-2026-07-19'"
  );
  const venetianFixed = db.exec(
    "SELECT changes()"
  );
  if (venetianFixed[0].values[0][0] > 0) {
    console.log('  renamed: NLH MSPT - Day 2 (Jul 19) → NLH MSPT Heart Poker Championship - Day 2');
  }

  // Fix orphaned Orleans Mega Stack Flight B → plain Mega Stack
  db.run(
    "UPDATE tournaments SET event_name='NLH Mega Stack' WHERE id=30401 AND event_name='NLH Mega Stack - Flight B'"
  );
  const orleansFixed = db.exec("SELECT changes()");
  if (orleansFixed[0].values[0][0] > 0) {
    console.log('  renamed: Orleans NLH Mega Stack - Flight B → NLH Mega Stack');
  }

  const out = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(out));
  console.log(`\nDone. ${inserted} new Day 2 cards inserted.`);
  db.close();
}

run().catch(err => { console.error(err); process.exit(1); });
