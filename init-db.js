#!/usr/bin/env node

const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const sampleTournaments = require('./sample-data');

async function initializeDatabase() {
  console.log('🎰 Initializing Poker Tournament Scheduler Database...\n');

  const SQL = await initSqlJs();
  let db;

  try {
    // Try to load existing database
    const filebuffer = await fs.readFile('poker-tournaments.db');
    db = new SQL.Database(filebuffer);
    console.log('✓ Loaded existing database');
  } catch (err) {
    // Create new database
    db = new SQL.Database();
    console.log('✓ Created new database');
  }

  // Create tables
  console.log('\n📊 Creating tables...');

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ Users table ready');

  db.run(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_number TEXT,
      event_name TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      buyin INTEGER NOT NULL,
      starting_chips INTEGER,
      level_duration TEXT,
      reentry TEXT,
      late_reg TEXT,
      game_variant TEXT NOT NULL,
      venue TEXT NOT NULL,
      notes TEXT,
      day_length TEXT,
      structure_sheet_path TEXT,
      source_pdf TEXT,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )
  `);
  console.log('✓ Tournaments table ready');

  db.run(`
    CREATE TABLE IF NOT EXISTS user_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tournament_id INTEGER NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      UNIQUE(user_id, tournament_id)
    )
  `);
  console.log('✓ User schedules table ready');

  db.run(`
    CREATE TABLE IF NOT EXISTS schedule_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      viewer_id INTEGER NOT NULL,
      granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id),
      FOREIGN KEY (viewer_id) REFERENCES users(id),
      UNIQUE(owner_id, viewer_id)
    )
  `);
  console.log('✓ Schedule permissions table ready');

  db.run(`
    CREATE TABLE IF NOT EXISTS saved_hands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      hand_data TEXT NOT NULL,
      game_type TEXT NOT NULL,
      title TEXT,
      notes TEXT,
      is_public INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  console.log('✓ Saved hands table ready');

  // Check if we should seed sample data
  const args = process.argv.slice(2);
  const shouldSeed = args.includes('--seed');

  if (shouldSeed) {
    console.log('\n🌱 Seeding sample data...');

    // Create demo user
    const hashedPassword = await bcrypt.hash('demo123', 10);
    try {
      db.run(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        ['demo', 'demo@example.com', hashedPassword]
      );
      console.log('✓ Created demo user (email: demo@example.com, password: demo123)');
    } catch (err) {
      console.log('✓ Demo user already exists');
    }

    // Get user id
    const userStmt = db.prepare('SELECT id FROM users WHERE email = ?');
    userStmt.bind(['demo@example.com']);
    let userId = 1;
    if (userStmt.step()) {
      userId = userStmt.getAsObject().id;
    }
    userStmt.free();

    // Check if tournaments already exist
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM tournaments');
    countStmt.step();
    const count = countStmt.getAsObject().count;
    countStmt.free();

    if (count === 0) {
      console.log(`\n📅 Adding ${sampleTournaments.length} sample tournaments...`);

      for (const tournament of sampleTournaments) {
        db.run(
          `INSERT INTO tournaments (
            event_number, event_name, date, time, buyin,
            starting_chips, level_duration, reentry, late_reg,
            game_variant, venue, notes, uploaded_by, source_pdf
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tournament.eventNumber,
            tournament.eventName,
            tournament.date,
            tournament.time,
            tournament.buyin,
            tournament.startingChips,
            tournament.levelDuration,
            tournament.reentry,
            tournament.lateReg,
            tournament.gameVariant,
            tournament.venue,
            tournament.notes || null,
            userId,
            'WSOP 2026 Official Schedule'
          ]
        );
      }

      console.log(`✓ Added ${sampleTournaments.length} tournaments`);

      // Add some to demo user's schedule
      const tournamentIds = [1, 5, 10, 15, 20, 25];
      for (const tid of tournamentIds) {
        try {
          db.run(
            'INSERT INTO user_schedules (user_id, tournament_id) VALUES (?, ?)',
            [userId, tid]
          );
        } catch (err) {
          // Ignore duplicates
        }
      }
      console.log(`✓ Added ${tournamentIds.length} tournaments to demo user's schedule`);
    } else {
      console.log(`✓ Database already has ${count} tournaments (skipping seed)`);
    }
  }

  // Save database
  const data = db.export();
  const buffer = Buffer.from(data);
  await fs.writeFile('poker-tournaments.db', buffer);

  console.log('\n✅ Database initialization complete!');
  
  if (shouldSeed) {
    console.log('\n🎯 Quick Start:');
    console.log('   1. Run: npm start');
    console.log('   2. Open: public/index.html in your browser');
    console.log('   3. Login with:');
    console.log('      Email: demo@example.com');
    console.log('      Password: demo123');
  }

  console.log('\n');
  process.exit(0);
}

// Run initialization
initializeDatabase().catch(err => {
  console.error('❌ Error initializing database:', err);
  process.exit(1);
});
