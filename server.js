const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { PDFParse } = require('pdf-parse');
const initSqlJs = require('sql.js');
const { parseWSOP2025Schedule, getWSOPRake } = require('./parsers/wsop-parser');
const { parseGenericSchedule, detectFormat } = require('./parsers/generic-parser');
const sampleTournaments = require('./sample-data');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Health check for zero-downtime deploys
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Serve frontend — static assets can cache, but HTML must not
app.use(express.static(path.join(__dirname, 'public'), {
  index: false, // Don't auto-serve index.html — we handle it explicitly below
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
    }
  }
}));

// Serve index.html with injected build version to bust any cache
const BUILD_VERSION = Date.now().toString();
function serveIndex(req, res) {
  const fs = require('fs');
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html.replace('</head>', `<meta name="build-version" content="${BUILD_VERSION}">\n</head>`);
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('ETag', BUILD_VERSION);
  res.type('html').send(html);
}
app.get('/', serveIndex);

// File upload configuration
const upload = multer({ dest: 'uploads/' });

// Database initialization
let db;
let SQL;
const DB_PATH = process.env.DB_PATH || 'poker-tournaments.db';

async function initDatabase() {
  SQL = await initSqlJs();

  // Try to load existing database
  try {
    const filebuffer = await fs.readFile(DB_PATH);
    db = new SQL.Database(filebuffer);
    console.log(`Loaded database from ${DB_PATH}`);
  } catch (err) {
    // Create new database
    db = new SQL.Database();
    console.log(`Created new database (will save to ${DB_PATH})`);
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

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
      late_reg_end TEXT,
      game_variant TEXT NOT NULL,
      venue TEXT NOT NULL,
      notes TEXT,
      category TEXT,
      is_satellite INTEGER DEFAULT 0,
      target_event TEXT,
      is_restart INTEGER DEFAULT 0,
      parent_event TEXT,
      day_length TEXT,
      structure_sheet_path TEXT,
      source_pdf TEXT,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )
  `);

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

  db.run(`
    CREATE TABLE IF NOT EXISTS share_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      responded_at DATETIME,
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (to_user_id) REFERENCES users(id),
      UNIQUE(from_user_id, to_user_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS share_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS schedule_conditions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tournament_id INTEGER NOT NULL,
      depends_on_tournament_id INTEGER,
      condition_type TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 1,
      profit_threshold INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      FOREIGN KEY (depends_on_tournament_id) REFERENCES tournaments(id),
      UNIQUE(user_id, tournament_id)
    )
  `);

  // Migrate: add profit_threshold column if missing (existing DBs)
  try {
    db.run('ALTER TABLE schedule_conditions ADD COLUMN profit_threshold INTEGER');
  } catch (e) {
    // Column already exists — ignore
  }

  // Migrate: add total_entries column for POY points calculation
  try {
    db.run('ALTER TABLE tournaments ADD COLUMN total_entries INTEGER');
  } catch (e) {
    // Column already exists — ignore
  }

  // Migrate: add conditions JSON column for multi-condition support
  try {
    db.run('ALTER TABLE schedule_conditions ADD COLUMN conditions TEXT');
  } catch (e) {
    // Column already exists — ignore
  }

  // Migrate legacy single-condition rows to JSON conditions column
  try {
    const migStmt = db.prepare('SELECT id, condition_type, depends_on_tournament_id, profit_threshold FROM schedule_conditions WHERE conditions IS NULL AND condition_type IS NOT NULL');
    const legacyRows = [];
    while (migStmt.step()) legacyRows.push(migStmt.getAsObject());
    migStmt.free();
    for (const row of legacyRows) {
      const cond = { type: row.condition_type };
      if (row.depends_on_tournament_id) cond.dependsOnId = row.depends_on_tournament_id;
      if (row.profit_threshold) cond.profitThreshold = row.profit_threshold;
      db.run('UPDATE schedule_conditions SET conditions = ? WHERE id = ?', [JSON.stringify([cond]), row.id]);
    }
    if (legacyRows.length > 0) {
      await saveDatabase();
      console.log(`Migrated ${legacyRows.length} legacy condition rows to JSON format`);
    }
  } catch (e) {
    // ignore migration errors
  }

  // Migrate: add is_anchor column for must-play events
  try {
    db.run('ALTER TABLE user_schedules ADD COLUMN is_anchor INTEGER DEFAULT 0');
  } catch (e) {
    // Column already exists — ignore
  }

  // Migrate: add planned_entries column for max entries per event
  try {
    db.run('ALTER TABLE user_schedules ADD COLUMN planned_entries INTEGER DEFAULT 1');
  } catch (e) {
    // Column already exists — ignore
  }

  // Migrate: add rake breakdown columns for tournament cost analysis
  const rakeColumns = [
    ['prize_pool', 'INTEGER'],
    ['house_fee', 'INTEGER'],
    ['opt_add_on', 'INTEGER'],
    ['rake_pct', 'REAL'],
    ['rake_dollars', 'INTEGER']
  ];
  for (const [col, type] of rakeColumns) {
    try {
      db.run(`ALTER TABLE tournaments ADD COLUMN ${col} ${type}`);
    } catch (e) {
      // Column already exists — ignore
    }
  }

  // Backfill rake data for existing WSOP events that are missing it
  try {
    const backfillStmt = db.prepare(
      `SELECT id, event_number, buyin FROM tournaments
       WHERE buyin > 0 AND rake_pct IS NULL
       AND (venue LIKE '%WSOP%' OR venue LIKE '%Horseshoe%' OR venue LIKE '%Paris Las Vegas%')`
    );
    let backfillCount = 0;
    while (backfillStmt.step()) {
      const row = backfillStmt.getAsObject();
      const rake = getWSOPRake(row.buyin, row.event_number);
      if (rake.rakePct !== null) {
        db.run(
          `UPDATE tournaments SET prize_pool = ?, house_fee = ?, opt_add_on = ?,
           rake_pct = ?, rake_dollars = ? WHERE id = ?`,
          [rake.prizePool, rake.houseFee, rake.optAddOn, rake.rakePct, rake.rakeDollars, row.id]
        );
        backfillCount++;
      }
    }
    backfillStmt.free();
    if (backfillCount > 0) {
      console.log(`Backfilled rake data for ${backfillCount} WSOP events`);
    }
  } catch (e) {
    console.log('Rake backfill skipped:', e.message);
  }

  // Migrate: add is_deepstack column
  try {
    db.run('ALTER TABLE tournaments ADD COLUMN is_deepstack INTEGER DEFAULT 0');
  } catch (e) {
    // Column already exists — ignore
  }

  // Migrate: add last_seen_shares to users
  try {
    db.run('ALTER TABLE users ADD COLUMN last_seen_shares DATETIME');
  } catch (e) {
    // Column already exists — ignore
  }

  // Migrate: add avatar to users
  try {
    db.run('ALTER TABLE users ADD COLUMN avatar TEXT');
  } catch (e) {
    // Column already exists — ignore
  }

  // Migrate: move schedule_permissions into share_requests
  try {
    const migChk = db.prepare("SELECT COUNT(*) as cnt FROM share_requests");
    migChk.step();
    const { cnt: srCount } = migChk.getAsObject();
    migChk.free();
    if (srCount === 0) {
      const oldPerms = db.prepare("SELECT owner_id, viewer_id, granted_at FROM schedule_permissions");
      let migrated = 0;
      while (oldPerms.step()) {
        const { owner_id, viewer_id, granted_at } = oldPerms.getAsObject();
        db.run(
          "INSERT OR IGNORE INTO share_requests (from_user_id, to_user_id, status, created_at, responded_at) VALUES (?, ?, 'accepted', ?, ?)",
          [owner_id, viewer_id, granted_at, granted_at]
        );
        migrated++;
      }
      oldPerms.free();
      if (migrated > 0) {
        console.log(`Migrated ${migrated} old permissions to share_requests`);
        await saveDatabase();
      }
    }
  } catch (e) {
    console.log('Permission migration skipped:', e.message);
  }

  // Cleanup: remove pending share requests from users with email-like usernames
  try {
    const cleaned = db.run(
      `DELETE FROM share_requests WHERE status = 'pending'
       AND from_user_id IN (SELECT id FROM users WHERE username LIKE '%@%')`
    );
    const chkClean = db.prepare("SELECT changes() AS cnt");
    chkClean.step();
    const { cnt: cleanCount } = chkClean.getAsObject();
    chkClean.free();
    if (cleanCount > 0) {
      console.log(`Cleaned ${cleanCount} pending requests from email-username accounts`);
      await saveDatabase();
    }
  } catch (e) {
    console.log('Cleanup skipped:', e.message);
  }

  // Auto-seed extra venue data from JSON seed files
  const seedFiles = [
    { file: 'deepstack-events.json', label: 'deepstacks', check: "is_deepstack = 1" },
    { file: 'ipo-events.json', label: 'Irish Poker Open', check: "venue = 'Irish Poker Open'" },
    { file: 'turning-stone-events.json', label: 'Turning Stone', check: "venue = 'Turning Stone Casino'" },
  ];
  for (const seed of seedFiles) {
    try {
      const chk = db.prepare(`SELECT COUNT(*) as cnt FROM tournaments WHERE ${seed.check}`);
      chk.step();
      const { cnt } = chk.getAsObject();
      chk.free();
      if (cnt === 0) {
        const seedPath = path.join(__dirname, seed.file);
        if (require('fs').existsSync(seedPath)) {
          const rows = JSON.parse(require('fs').readFileSync(seedPath, 'utf8'));
          for (const t of rows) {
            db.run(
              `INSERT INTO tournaments (event_number, event_name, date, time, buyin,
               starting_chips, level_duration, reentry, late_reg, late_reg_end,
               game_variant, venue, notes, category, is_satellite, target_event,
               is_restart, parent_event, prize_pool, house_fee, opt_add_on,
               rake_pct, rake_dollars, source_pdf, is_deepstack)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                t.event_number || '', t.event_name, t.date, t.time, t.buyin,
                t.starting_chips, t.level_duration, t.reentry,
                t.late_reg, t.late_reg_end, t.game_variant, t.venue,
                t.notes, t.category, t.is_satellite || 0, t.target_event,
                t.is_restart || 0, t.parent_event, t.prize_pool, t.house_fee,
                t.opt_add_on, t.rake_pct, t.rake_dollars, t.source_pdf,
                t.is_deepstack || 0
              ]
            );
          }
          console.log(`Seeded ${rows.length} ${seed.label} events`);
          await saveDatabase();
        }
      }
    } catch (e) {
      console.log(`${seed.label} seeding skipped:`, e.message);
    }
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS tracking_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tournament_id INTEGER NOT NULL,
      num_entries INTEGER NOT NULL DEFAULT 1,
      cashed INTEGER NOT NULL DEFAULT 0,
      finish_place INTEGER,
      cash_amount INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      UNIQUE(user_id, tournament_id)
    )
  `);

  // Auto-seed WSOP 2026 schedule if tournaments table is empty
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM tournaments');
  countStmt.step();
  const { count } = countStmt.getAsObject();
  countStmt.free();

  if (count === 0) {
    console.log(`Seeding ${sampleTournaments.length} WSOP 2026 tournaments...`);
    for (const t of sampleTournaments) {
      db.run(
        `INSERT INTO tournaments (
          event_number, event_name, date, time, buyin,
          starting_chips, level_duration, reentry, late_reg, late_reg_end,
          game_variant, venue, notes, category, is_satellite, target_event,
          is_restart, parent_event, prize_pool, house_fee, opt_add_on,
          rake_pct, rake_dollars, source_pdf
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.eventNumber, t.eventName, t.date, t.time, t.buyin,
          t.startingChips || null, t.levelDuration || null,
          t.reentry || null, t.lateReg || null, t.lateRegEnd || null,
          t.gameVariant, t.venue, t.notes || null,
          t.category || null, t.isSatellite ? 1 : 0, t.targetEvent || null,
          t.isRestart ? 1 : 0, t.parentEvent || null,
          t.prizePool || null, t.houseFee || null, t.optAddOn || null,
          t.rakePct || null, t.rakeDollars || null,
          'WSOP 2026 Official Schedule'
        ]
      );
    }
    await saveDatabase();
    console.log('WSOP 2026 schedule seeded successfully');
  }

  console.log('Database initialized');
}

// Save database to file
async function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  await fs.writeFile(DB_PATH, buffer);
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// API Routes

// User registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate username
    if (!username || username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 2–20 characters' });
    }
    if (/@/.test(username)) {
      return res.status(400).json({ error: 'Username cannot be an email address' });
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, hyphens, and dots' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert user
    db.run(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );
    
    await saveDatabase();
    
    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    stmt.bind([email]);
    
    let user = null;
    while (stmt.step()) {
      user = stmt.getAsObject();
    }
    stmt.free();
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: '7d'
    });
    
    res.json({ token, username: user.username, userId: user.id, avatar: user.avatar || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload and parse PDF
app.post('/api/upload-schedule', authenticateToken, upload.single('pdf'), async (req, res) => {
  try {
    const dataBuffer = await fs.readFile(req.file.path);
    const uint8Array = new Uint8Array(dataBuffer);
    const parser = new PDFParse(uint8Array);
    const result = await parser.getText();
    const pdfText = result.text;

    // Auto-detect format and parse with appropriate parser
    const format = detectFormat(pdfText);
    const userVenue = req.body && req.body.venue ? req.body.venue : null;
    let tournaments;

    if (format === 'wsop') {
      tournaments = parseWSOP2025Schedule(pdfText, 2026);
    } else {
      tournaments = parseGenericSchedule(pdfText, { venue: userVenue });
    }

    // Insert tournaments into database
    for (const tournament of tournaments) {
      db.run(
        `INSERT INTO tournaments (event_number, event_name, date, time, buyin, starting_chips, level_duration, reentry, late_reg, game_variant, venue, notes, is_satellite, target_event, is_restart, parent_event, prize_pool, house_fee, opt_add_on, rake_pct, rake_dollars, uploaded_by, source_pdf)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tournament.eventNumber || '',
          tournament.eventName || 'Unknown Event',
          tournament.date,
          tournament.time || '12:00PM',
          tournament.buyin,
          tournament.startingChips || null,
          tournament.levelDuration || null,
          tournament.reentry || null,
          tournament.lateReg || null,
          tournament.gameVariant,
          tournament.venue || 'Horseshoe / Paris Las Vegas',
          tournament.notes || null,
          tournament.isSatellite ? 1 : 0,
          tournament.targetEvent || null,
          tournament.isRestart ? 1 : 0,
          tournament.parentEvent || null,
          tournament.prizePool || null,
          tournament.houseFee || null,
          tournament.optAddOn || null,
          tournament.rakePct || null,
          tournament.rakeDollars || null,
          req.user.id,
          req.file.originalname
        ]
      );
    }

    await saveDatabase();

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    res.json({
      message: 'Schedule uploaded successfully',
      format: format,
      tournamentsCount: tournaments.length,
      tournaments: tournaments.slice(0, 5) // Return first 5 as preview
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all tournaments with filters
app.get('/api/tournaments', authenticateToken, (req, res) => {
  try {
    const { minBuyin, maxBuyin, gameVariant, venue, startDate, endDate } = req.query;
    
    let query = "SELECT * FROM tournaments WHERE venue != 'Personal'";
    const params = [];
    
    if (minBuyin) {
      query += ' AND buyin >= ?';
      params.push(parseInt(minBuyin));
    }
    
    if (maxBuyin) {
      query += ' AND buyin <= ?';
      params.push(parseInt(maxBuyin));
    }
    
    if (gameVariant && gameVariant !== 'all') {
      query += ' AND game_variant = ?';
      params.push(gameVariant);
    }
    
    if (venue && venue !== 'all') {
      query += ' AND venue = ?';
      params.push(venue);
    }
    
    query += ' ORDER BY date, time';
    
    const stmt = db.prepare(query);
    stmt.bind(params);
    
    const tournaments = [];
    while (stmt.step()) {
      tournaments.push(stmt.getAsObject());
    }
    stmt.free();
    
    res.json(tournaments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add tournament to user's schedule
app.post('/api/schedule', authenticateToken, async (req, res) => {
  try {
    const { tournamentId } = req.body;
    
    db.run(
      'INSERT OR IGNORE INTO user_schedules (user_id, tournament_id) VALUES (?, ?)',
      [req.user.id, tournamentId]
    );
    
    await saveDatabase();
    
    res.json({ message: 'Tournament added to schedule' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove tournament from user's schedule
app.delete('/api/schedule/:tournamentId', authenticateToken, async (req, res) => {
  try {
    const { tournamentId } = req.params;

    db.run(
      'DELETE FROM schedule_conditions WHERE user_id = ? AND tournament_id = ?',
      [req.user.id, tournamentId]
    );
    db.run(
      'DELETE FROM user_schedules WHERE user_id = ? AND tournament_id = ?',
      [req.user.id, tournamentId]
    );

    await saveDatabase();

    res.json({ message: 'Tournament removed from schedule' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set or update a condition on a scheduled event
app.put('/api/schedule/:tournamentId/condition', authenticateToken, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { conditions, isPublic, dependsOnTournamentId, conditionType, profitThreshold } = req.body;
    const publicFlag = isPublic === undefined ? 1 : (isPublic ? 1 : 0);

    // Verify event is on user's schedule
    const checkStmt = db.prepare('SELECT 1 FROM user_schedules WHERE user_id = ? AND tournament_id = ?');
    checkStmt.bind([req.user.id, tournamentId]);
    const onSchedule = checkStmt.step();
    checkStmt.free();
    if (!onSchedule) {
      return res.status(400).json({ error: 'Event not on your schedule' });
    }

    // Build conditions JSON — support new array format or legacy single-condition format
    let conditionsJson;
    if (Array.isArray(conditions)) {
      conditionsJson = JSON.stringify(conditions);
    } else if (conditionType) {
      // Backward compat: construct array from legacy fields
      const cond = { type: conditionType };
      if (dependsOnTournamentId) cond.dependsOnId = dependsOnTournamentId;
      if (profitThreshold) cond.profitThreshold = profitThreshold;
      conditionsJson = JSON.stringify([cond]);
    } else {
      return res.status(400).json({ error: 'No conditions provided' });
    }

    // Upsert: delete existing then insert
    db.run('DELETE FROM schedule_conditions WHERE user_id = ? AND tournament_id = ?', [req.user.id, tournamentId]);
    db.run(
      'INSERT INTO schedule_conditions (user_id, tournament_id, condition_type, is_public, conditions) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, tournamentId, 'MULTI', publicFlag, conditionsJson]
    );

    await saveDatabase();
    res.json({ message: 'Condition set' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle anchor/must-play status on a scheduled event
app.put('/api/schedule/:tournamentId/anchor', authenticateToken, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { isAnchor } = req.body;
    db.run(
      'UPDATE user_schedules SET is_anchor = ? WHERE user_id = ? AND tournament_id = ?',
      [isAnchor ? 1 : 0, req.user.id, tournamentId]
    );
    await saveDatabase();
    res.json({ message: isAnchor ? 'Event locked in' : 'Event unlocked' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update planned entries for a scheduled event
app.put('/api/schedule/:tournamentId/entries', authenticateToken, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { plannedEntries } = req.body;
    const entries = Math.max(1, Math.min(99, parseInt(plannedEntries) || 1));
    db.run(
      'UPDATE user_schedules SET planned_entries = ? WHERE user_id = ? AND tournament_id = ?',
      [entries, req.user.id, tournamentId]
    );
    await saveDatabase();
    res.json({ message: 'Planned entries updated', plannedEntries: entries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove condition from a scheduled event (make it firm)
app.delete('/api/schedule/:tournamentId/condition', authenticateToken, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    db.run('DELETE FROM schedule_conditions WHERE user_id = ? AND tournament_id = ?', [req.user.id, tournamentId]);
    await saveDatabase();
    res.json({ message: 'Condition removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a personal event (Travel Day / Day Off)
app.post('/api/personal-event', authenticateToken, async (req, res) => {
  try {
    const { date, type, notes } = req.body;
    if (!['Travel Day', 'Day Off'].includes(type)) {
      return res.status(400).json({ error: 'Invalid event type' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Convert ISO to human-readable format
    const dateObj = new Date(date + 'T12:00:00');
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const humanDate = `${months[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}`;

    // Check for duplicate
    const dupStmt = db.prepare(
      `SELECT t.id FROM tournaments t
       JOIN user_schedules us ON t.id = us.tournament_id
       WHERE us.user_id = ? AND t.event_name = ? AND t.date = ? AND t.venue = 'Personal'`
    );
    dupStmt.bind([req.user.id, type, humanDate]);
    const isDup = dupStmt.step();
    dupStmt.free();
    if (isDup) {
      return res.status(409).json({ error: `${type} already exists on this date` });
    }

    // Insert synthetic tournament
    db.run(
      `INSERT INTO tournaments (event_number, event_name, date, time, buyin, game_variant, venue, notes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['', type, humanDate, '12:00 AM', 0, 'Personal', 'Personal', notes || '', req.user.id]
    );

    const idStmt = db.prepare('SELECT last_insert_rowid() as id');
    idStmt.step();
    const { id: tournamentId } = idStmt.getAsObject();
    idStmt.free();

    // Add to user's schedule
    db.run('INSERT INTO user_schedules (user_id, tournament_id) VALUES (?, ?)',
      [req.user.id, tournamentId]);

    await saveDatabase();
    res.status(201).json({ message: `${type} created`, tournamentId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a personal event (e.g. travel time notes)
app.put('/api/personal-event/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    // Verify this is a personal event owned by this user
    const checkStmt = db.prepare(
      `SELECT t.id FROM tournaments t
       JOIN user_schedules us ON t.id = us.tournament_id
       WHERE t.id = ? AND us.user_id = ? AND t.venue = 'Personal'`
    );
    checkStmt.bind([id, req.user.id]);
    const isOwned = checkStmt.step();
    checkStmt.free();

    if (!isOwned) {
      return res.status(404).json({ error: 'Personal event not found' });
    }

    db.run('UPDATE tournaments SET notes = ? WHERE id = ?', [notes || '', id]);
    await saveDatabase();
    res.json({ message: 'Personal event updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a personal event (removes tournament row + schedule link)
app.delete('/api/personal-event/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify this is a personal event owned by this user
    const checkStmt = db.prepare(
      `SELECT t.id FROM tournaments t
       JOIN user_schedules us ON t.id = us.tournament_id
       WHERE t.id = ? AND us.user_id = ? AND t.venue = 'Personal'`
    );
    checkStmt.bind([id, req.user.id]);
    const isOwned = checkStmt.step();
    checkStmt.free();

    if (!isOwned) {
      return res.status(404).json({ error: 'Personal event not found' });
    }

    db.run('DELETE FROM schedule_conditions WHERE tournament_id = ? AND user_id = ?', [id, req.user.id]);
    db.run('DELETE FROM user_schedules WHERE tournament_id = ? AND user_id = ?', [id, req.user.id]);
    db.run("DELETE FROM tournaments WHERE id = ? AND venue = 'Personal'", [id]);

    await saveDatabase();
    res.json({ message: 'Personal event deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's schedule
app.get('/api/my-schedule', authenticateToken, (req, res) => {
  try {
    const query = `
      SELECT t.*, us.added_at, us.is_anchor, us.planned_entries,
             sc.conditions AS conditions_json,
             sc.is_public AS condition_is_public
      FROM tournaments t
      JOIN user_schedules us ON t.id = us.tournament_id
      LEFT JOIN schedule_conditions sc ON sc.tournament_id = t.id AND sc.user_id = us.user_id
      WHERE us.user_id = ?
      ORDER BY t.date, t.time
    `;

    const stmt = db.prepare(query);
    stmt.bind([req.user.id]);

    const tournaments = [];
    while (stmt.step()) {
      tournaments.push(stmt.getAsObject());
    }
    stmt.free();
    
    res.json(tournaments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Avatar Endpoints ─────────────────────────────────────────

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  }
});

app.put('/api/avatar', authenticateToken, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    db.run('UPDATE users SET avatar = ? WHERE id = ?', [dataUri, req.user.id]);
    await saveDatabase();
    res.json({ avatar: dataUri });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/avatar', authenticateToken, async (req, res) => {
  try {
    db.run('UPDATE users SET avatar = NULL WHERE id = ?', [req.user.id]);
    await saveDatabase();
    res.json({ message: 'Avatar removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/avatar/:userId', (req, res) => {
  try {
    const stmt = db.prepare('SELECT avatar FROM users WHERE id = ?');
    stmt.bind([req.params.userId]);
    let avatar = null;
    if (stmt.step()) avatar = stmt.getAsObject().avatar;
    stmt.free();
    res.json({ avatar });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Share Request Endpoints ───────────────────────────────────

// Send a share request to another user
app.post('/api/share-request', authenticateToken, async (req, res) => {
  try {
    const { username } = req.body;
    const stmt = db.prepare('SELECT id FROM users WHERE username = ?');
    stmt.bind([username]);
    let target = null;
    if (stmt.step()) target = stmt.getAsObject();
    stmt.free();

    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.user.id) return res.status(400).json({ error: "Can't share with yourself" });

    // Check if already connected or pending (either direction)
    const chk = db.prepare(
      `SELECT id, status FROM share_requests
       WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)`
    );
    chk.bind([req.user.id, target.id, target.id, req.user.id]);
    let existing = null;
    if (chk.step()) existing = chk.getAsObject();
    chk.free();

    if (existing) {
      if (existing.status === 'accepted') return res.status(400).json({ error: 'Already connected' });
      if (existing.status === 'pending') return res.status(400).json({ error: 'Request already pending' });
    }

    db.run(
      "INSERT INTO share_requests (from_user_id, to_user_id, status) VALUES (?, ?, 'pending')",
      [req.user.id, target.id]
    );
    await saveDatabase();
    res.json({ message: `Request sent to ${username}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get share buddies + pending counts
app.get('/api/share-buddies', authenticateToken, (req, res) => {
  try {
    const uid = req.user.id;

    // Accepted buddies (either direction)
    const buddyStmt = db.prepare(`
      SELECT u.id, u.username, u.avatar, sr.responded_at AS since
      FROM share_requests sr
      JOIN users u ON u.id = CASE WHEN sr.from_user_id = ? THEN sr.to_user_id ELSE sr.from_user_id END
      WHERE sr.status = 'accepted'
        AND (sr.from_user_id = ? OR sr.to_user_id = ?)
    `);
    buddyStmt.bind([uid, uid, uid]);
    const buddies = [];
    while (buddyStmt.step()) buddies.push(buddyStmt.getAsObject());
    buddyStmt.free();

    // Pending incoming
    const pendStmt = db.prepare(`
      SELECT sr.id, u.id AS from_user_id, u.username, u.avatar, sr.created_at
      FROM share_requests sr
      JOIN users u ON sr.from_user_id = u.id
      WHERE sr.to_user_id = ? AND sr.status = 'pending'
    `);
    pendStmt.bind([uid]);
    const pendingIncoming = [];
    while (pendStmt.step()) pendingIncoming.push(pendStmt.getAsObject());
    pendStmt.free();

    // Pending outgoing
    const outStmt = db.prepare(`
      SELECT sr.id, u.id AS to_user_id, u.username, u.avatar, sr.created_at
      FROM share_requests sr
      JOIN users u ON sr.to_user_id = u.id
      WHERE sr.from_user_id = ? AND sr.status = 'pending'
    `);
    outStmt.bind([uid]);
    const pendingOutgoing = [];
    while (outStmt.step()) pendingOutgoing.push(outStmt.getAsObject());
    outStmt.free();

    // Last seen shares
    const lss = db.prepare('SELECT last_seen_shares FROM users WHERE id = ?');
    lss.bind([uid]);
    let lastSeenShares = null;
    if (lss.step()) lastSeenShares = lss.getAsObject().last_seen_shares;
    lss.free();

    // Build map of tournament_id -> buddies playing it
    const buddyEvents = {};
    for (const b of buddies) {
      const bsStmt = db.prepare('SELECT tournament_id, is_anchor FROM user_schedules WHERE user_id = ?');
      bsStmt.bind([b.id]);
      while (bsStmt.step()) {
        const row = bsStmt.getAsObject();
        const tid = row.tournament_id;
        if (!buddyEvents[tid]) buddyEvents[tid] = [];
        buddyEvents[tid].push({ id: b.id, username: b.username, avatar: b.avatar || null, isAnchor: !!row.is_anchor });
      }
      bsStmt.free();
    }

    res.json({ buddies, pendingIncoming, pendingOutgoing, lastSeenShares, buddyEvents });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Accept a share request
app.put('/api/share-request/:id/accept', authenticateToken, async (req, res) => {
  try {
    const sr = db.prepare('SELECT * FROM share_requests WHERE id = ? AND to_user_id = ? AND status = ?');
    sr.bind([req.params.id, req.user.id, 'pending']);
    let row = null;
    if (sr.step()) row = sr.getAsObject();
    sr.free();
    if (!row) return res.status(404).json({ error: 'Request not found' });

    db.run("UPDATE share_requests SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE id = ?", [row.id]);
    await saveDatabase();
    res.json({ message: 'Request accepted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reject a share request (deletes so sender can retry)
app.put('/api/share-request/:id/reject', authenticateToken, async (req, res) => {
  try {
    db.run('DELETE FROM share_requests WHERE id = ? AND to_user_id = ? AND status = ?',
      [req.params.id, req.user.id, 'pending']);
    await saveDatabase();
    res.json({ message: 'Request rejected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel an outgoing share request
app.delete('/api/share-request/:id', authenticateToken, async (req, res) => {
  try {
    db.run('DELETE FROM share_requests WHERE id = ? AND from_user_id = ? AND status = ?',
      [req.params.id, req.user.id, 'pending']);
    await saveDatabase();
    res.json({ message: 'Request cancelled' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove a share buddy (both directions)
app.delete('/api/share-buddy/:userId', authenticateToken, async (req, res) => {
  try {
    const other = req.params.userId;
    db.run(
      "DELETE FROM share_requests WHERE status = 'accepted' AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))",
      [req.user.id, other, other, req.user.id]
    );
    await saveDatabase();
    res.json({ message: 'Removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all shared schedules as seen
app.put('/api/seen-shares', authenticateToken, async (req, res) => {
  try {
    db.run('UPDATE users SET last_seen_shares = CURRENT_TIMESTAMP WHERE id = ?', [req.user.id]);
    await saveDatabase();
    res.json({ message: 'ok' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific user's schedule (if share buddy or own)
app.get('/api/schedule/:userId', authenticateToken, (req, res) => {
  try {
    const { userId } = req.params;

    // Check permission via share_requests
    if (parseInt(userId) !== req.user.id) {
      const permStmt = db.prepare(
        `SELECT id FROM share_requests
         WHERE status = 'accepted'
           AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))`
      );
      permStmt.bind([userId, req.user.id, req.user.id, userId]);
      let hasPermission = false;
      if (permStmt.step()) hasPermission = true;
      permStmt.free();

      if (!hasPermission) {
        return res.status(403).json({ error: 'No permission to view this schedule' });
      }
    }

    const query = `
      SELECT t.*, us.is_anchor, us.planned_entries,
             sc.conditions AS conditions_json,
             sc.is_public AS condition_is_public
      FROM tournaments t
      JOIN user_schedules us ON t.id = us.tournament_id
      LEFT JOIN schedule_conditions sc ON sc.tournament_id = t.id AND sc.user_id = us.user_id
      WHERE us.user_id = ?
      ORDER BY t.date, t.time
    `;

    const stmt = db.prepare(query);
    stmt.bind([userId]);

    const tournaments = [];
    while (stmt.step()) tournaments.push(stmt.getAsObject());
    stmt.free();

    res.json(tournaments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Share Token Endpoints ─────────────────────────────────────

// Public shared schedule view (no auth required)
app.get('/api/shared/:token', (req, res) => {
  try {
    const { token } = req.params;
    const tokenStmt = db.prepare(
      'SELECT st.user_id, u.username, u.avatar FROM share_tokens st JOIN users u ON st.user_id = u.id WHERE st.token = ?'
    );
    tokenStmt.bind([token]);
    let tokenRow = null;
    if (tokenStmt.step()) { tokenRow = tokenStmt.getAsObject(); }
    tokenStmt.free();

    if (!tokenRow) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    const schedStmt = db.prepare(`
      SELECT t.*, us.is_anchor, us.planned_entries,
             sc.conditions AS conditions_json,
             sc.is_public AS condition_is_public
      FROM tournaments t
      JOIN user_schedules us ON t.id = us.tournament_id
      LEFT JOIN schedule_conditions sc ON sc.tournament_id = t.id AND sc.user_id = us.user_id
      WHERE us.user_id = ?
      ORDER BY t.date, t.time
    `);
    schedStmt.bind([tokenRow.user_id]);
    const tournaments = [];
    while (schedStmt.step()) { tournaments.push(schedStmt.getAsObject()); }
    schedStmt.free();

    res.json({ username: tokenRow.username, avatar: tokenRow.avatar || null, tournaments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user's share token
app.get('/api/share-token', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('SELECT token FROM share_tokens WHERE user_id = ?');
    stmt.bind([req.user.id]);
    let existing = null;
    if (stmt.step()) { existing = stmt.getAsObject(); }
    stmt.free();
    res.json({ token: existing ? existing.token : null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate share token
app.post('/api/share-token', authenticateToken, async (req, res) => {
  try {
    const stmt = db.prepare('SELECT token FROM share_tokens WHERE user_id = ?');
    stmt.bind([req.user.id]);
    let existing = null;
    if (stmt.step()) { existing = stmt.getAsObject(); }
    stmt.free();

    if (existing) { return res.json({ token: existing.token }); }

    const token = crypto.randomBytes(16).toString('hex');
    db.run('INSERT INTO share_tokens (user_id, token) VALUES (?, ?)', [req.user.id, token]);
    await saveDatabase();
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Revoke share token
app.delete('/api/share-token', authenticateToken, async (req, res) => {
  try {
    db.run('DELETE FROM share_tokens WHERE user_id = ?', [req.user.id]);
    await saveDatabase();
    res.json({ message: 'Share link revoked' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available game variants
app.get('/api/game-variants', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare("SELECT DISTINCT game_variant FROM tournaments WHERE venue != 'Personal' ORDER BY game_variant");
    
    const variants = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      variants.push(row.game_variant);
    }
    stmt.free();
    
    res.json(variants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available venues
app.get('/api/venues', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare("SELECT DISTINCT venue FROM tournaments WHERE venue != 'Personal' ORDER BY venue");
    
    const venues = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      venues.push(row.venue);
    }
    stmt.free();
    
    res.json(venues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Tournament field size (for POY calculation) ─────────────

app.put('/api/tournaments/:id/total-entries', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { totalEntries } = req.body;
    if (!totalEntries || totalEntries < 1) {
      return res.status(400).json({ error: 'totalEntries must be a positive integer' });
    }
    const checkStmt = db.prepare('SELECT id FROM tournaments WHERE id = ?');
    checkStmt.bind([id]);
    const exists = checkStmt.step();
    checkStmt.free();
    if (!exists) return res.status(404).json({ error: 'Tournament not found' });

    db.run('UPDATE tournaments SET total_entries = ? WHERE id = ?', [parseInt(totalEntries), id]);
    await saveDatabase();
    res.json({ message: 'Total entries updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Tracking endpoints ──────────────────────────────────────

app.get('/api/tracking', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT te.*,
             t.event_number, t.event_name, t.date, t.time, t.buyin,
             t.game_variant, t.venue, t.is_satellite, t.total_entries
      FROM tracking_entries te
      JOIN tournaments t ON te.tournament_id = t.id
      WHERE te.user_id = ?
      ORDER BY t.date DESC, t.time DESC
    `);
    stmt.bind([req.user.id]);
    const entries = [];
    while (stmt.step()) { entries.push(stmt.getAsObject()); }
    stmt.free();
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tracking', authenticateToken, async (req, res) => {
  try {
    const { tournamentId, numEntries, cashed, finishPlace, cashAmount, notes } = req.body;
    const checkStmt = db.prepare('SELECT id FROM tournaments WHERE id = ?');
    checkStmt.bind([tournamentId]);
    const exists = checkStmt.step();
    checkStmt.free();
    if (!exists) return res.status(400).json({ error: 'Tournament not found' });

    db.run(
      'INSERT INTO tracking_entries (user_id, tournament_id, num_entries, cashed, finish_place, cash_amount, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, tournamentId, numEntries || 1, cashed ? 1 : 0, finishPlace || null, cashAmount || 0, notes || null]
    );
    await saveDatabase();
    res.status(201).json({ message: 'Entry tracked' });
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Entry already tracked for this tournament' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/tracking/:entryId', authenticateToken, async (req, res) => {
  try {
    const { entryId } = req.params;
    const { numEntries, cashed, finishPlace, cashAmount, notes } = req.body;
    const checkStmt = db.prepare('SELECT id FROM tracking_entries WHERE id = ? AND user_id = ?');
    checkStmt.bind([entryId, req.user.id]);
    const owns = checkStmt.step();
    checkStmt.free();
    if (!owns) return res.status(404).json({ error: 'Entry not found' });

    db.run(
      'UPDATE tracking_entries SET num_entries = ?, cashed = ?, finish_place = ?, cash_amount = ?, notes = ? WHERE id = ? AND user_id = ?',
      [numEntries || 1, cashed ? 1 : 0, finishPlace || null, cashAmount || 0, notes || null, entryId, req.user.id]
    );
    await saveDatabase();
    res.json({ message: 'Entry updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tracking/:entryId', authenticateToken, async (req, res) => {
  try {
    const { entryId } = req.params;
    db.run('DELETE FROM tracking_entries WHERE id = ? AND user_id = ?', [entryId, req.user.id]);
    await saveDatabase();
    res.json({ message: 'Entry removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SPA catch-all for /shared/* routes
app.get('/shared/:token', serveIndex);

// Start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
