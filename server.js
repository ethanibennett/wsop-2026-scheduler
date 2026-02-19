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
const { parseWSOP2025Schedule } = require('./parsers/wsop-parser');
const sampleTournaments = require('./sample-data');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// File upload configuration
const upload = multer({ dest: 'uploads/' });

// Database initialization
let db;
let SQL;

async function initDatabase() {
  SQL = await initSqlJs();
  
  // Try to load existing database
  try {
    const filebuffer = await fs.readFile('poker-tournaments.db');
    db = new SQL.Database(filebuffer);
  } catch (err) {
    // Create new database
    db = new SQL.Database();
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
      depends_on_tournament_id INTEGER NOT NULL,
      condition_type TEXT NOT NULL CHECK(condition_type IN ('IF_WIN_SEAT', 'IF_NO_SEAT')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      FOREIGN KEY (depends_on_tournament_id) REFERENCES tournaments(id),
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
          is_restart, parent_event, source_pdf
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.eventNumber, t.eventName, t.date, t.time, t.buyin,
          t.startingChips || null, t.levelDuration || null,
          t.reentry || null, t.lateReg || null, t.lateRegEnd || null,
          t.gameVariant, t.venue, t.notes || null,
          t.category || null, t.isSatellite ? 1 : 0, t.targetEvent || null,
          t.isRestart ? 1 : 0, t.parentEvent || null,
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
  await fs.writeFile('poker-tournaments.db', buffer);
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
    
    res.json({ token, username: user.username, userId: user.id });
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

    // Parse tournaments from PDF (using 2026 year)
    const tournaments = parseWSOP2025Schedule(pdfText, 2026);

    // Insert tournaments into database
    for (const tournament of tournaments) {
      db.run(
        `INSERT INTO tournaments (event_number, event_name, date, time, buyin, starting_chips, level_duration, reentry, late_reg, game_variant, venue, notes, uploaded_by, source_pdf)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    
    let query = 'SELECT * FROM tournaments WHERE 1=1';
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
    const { dependsOnTournamentId, conditionType } = req.body;

    // Verify event is on user's schedule
    const checkStmt = db.prepare('SELECT 1 FROM user_schedules WHERE user_id = ? AND tournament_id = ?');
    checkStmt.bind([req.user.id, tournamentId]);
    const onSchedule = checkStmt.step();
    checkStmt.free();
    if (!onSchedule) {
      return res.status(400).json({ error: 'Event not on your schedule' });
    }

    // Upsert: delete existing then insert
    db.run('DELETE FROM schedule_conditions WHERE user_id = ? AND tournament_id = ?', [req.user.id, tournamentId]);
    db.run(
      'INSERT INTO schedule_conditions (user_id, tournament_id, depends_on_tournament_id, condition_type) VALUES (?, ?, ?, ?)',
      [req.user.id, tournamentId, dependsOnTournamentId, conditionType]
    );

    await saveDatabase();
    res.json({ message: 'Condition set' });
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

// Get user's schedule
app.get('/api/my-schedule', authenticateToken, (req, res) => {
  try {
    const query = `
      SELECT t.*, us.added_at,
             sc.condition_type,
             sc.depends_on_tournament_id,
             dep.event_number AS depends_on_event_number,
             dep.event_name AS depends_on_event_name
      FROM tournaments t
      JOIN user_schedules us ON t.id = us.tournament_id
      LEFT JOIN schedule_conditions sc ON sc.tournament_id = t.id AND sc.user_id = us.user_id
      LEFT JOIN tournaments dep ON dep.id = sc.depends_on_tournament_id
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

// Grant schedule viewing permission
app.post('/api/permissions', authenticateToken, async (req, res) => {
  try {
    const { viewerUsername } = req.body;
    
    // Find viewer by username
    const stmt = db.prepare('SELECT id FROM users WHERE username = ?');
    stmt.bind([viewerUsername]);
    
    let viewer = null;
    if (stmt.step()) {
      viewer = stmt.getAsObject();
    }
    stmt.free();
    
    if (!viewer) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    db.run(
      'INSERT OR IGNORE INTO schedule_permissions (owner_id, viewer_id) VALUES (?, ?)',
      [req.user.id, viewer.id]
    );
    
    await saveDatabase();
    
    res.json({ message: 'Permission granted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get schedules user has permission to view
app.get('/api/shared-schedules', authenticateToken, (req, res) => {
  try {
    const query = `
      SELECT u.id, u.username, sp.granted_at
      FROM schedule_permissions sp
      JOIN users u ON sp.owner_id = u.id
      WHERE sp.viewer_id = ?
    `;
    
    const stmt = db.prepare(query);
    stmt.bind([req.user.id]);
    
    const users = [];
    while (stmt.step()) {
      users.push(stmt.getAsObject());
    }
    stmt.free();
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific user's schedule (if permission granted)
app.get('/api/schedule/:userId', authenticateToken, (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check permission
    const permStmt = db.prepare(
      'SELECT * FROM schedule_permissions WHERE owner_id = ? AND viewer_id = ?'
    );
    permStmt.bind([userId, req.user.id]);
    
    let hasPermission = false;
    if (permStmt.step()) {
      hasPermission = true;
    }
    permStmt.free();
    
    if (!hasPermission && parseInt(userId) !== req.user.id) {
      return res.status(403).json({ error: 'No permission to view this schedule' });
    }
    
    const query = `
      SELECT t.*,
             sc.condition_type,
             sc.depends_on_tournament_id,
             dep.event_number AS depends_on_event_number,
             dep.event_name AS depends_on_event_name
      FROM tournaments t
      JOIN user_schedules us ON t.id = us.tournament_id
      LEFT JOIN schedule_conditions sc ON sc.tournament_id = t.id AND sc.user_id = us.user_id
      LEFT JOIN tournaments dep ON dep.id = sc.depends_on_tournament_id
      WHERE us.user_id = ?
      ORDER BY t.date, t.time
    `;

    const stmt = db.prepare(query);
    stmt.bind([userId]);
    
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

// ── Share Token Endpoints ─────────────────────────────────────

// Public shared schedule view (no auth required)
app.get('/api/shared/:token', (req, res) => {
  try {
    const { token } = req.params;
    const tokenStmt = db.prepare(
      'SELECT st.user_id, u.username FROM share_tokens st JOIN users u ON st.user_id = u.id WHERE st.token = ?'
    );
    tokenStmt.bind([token]);
    let tokenRow = null;
    if (tokenStmt.step()) { tokenRow = tokenStmt.getAsObject(); }
    tokenStmt.free();

    if (!tokenRow) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    const schedStmt = db.prepare(`
      SELECT t.*,
             sc.condition_type,
             sc.depends_on_tournament_id,
             dep.event_number AS depends_on_event_number,
             dep.event_name AS depends_on_event_name
      FROM tournaments t
      JOIN user_schedules us ON t.id = us.tournament_id
      LEFT JOIN schedule_conditions sc ON sc.tournament_id = t.id AND sc.user_id = us.user_id
      LEFT JOIN tournaments dep ON dep.id = sc.depends_on_tournament_id
      WHERE us.user_id = ?
      ORDER BY t.date, t.time
    `);
    schedStmt.bind([tokenRow.user_id]);
    const tournaments = [];
    while (schedStmt.step()) { tournaments.push(schedStmt.getAsObject()); }
    schedStmt.free();

    res.json({ username: tokenRow.username, tournaments });
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

// Get users I've granted permission to
app.get('/api/permissions/mine', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT u.id, u.username, sp.granted_at
      FROM schedule_permissions sp
      JOIN users u ON sp.viewer_id = u.id
      WHERE sp.owner_id = ?
    `);
    stmt.bind([req.user.id]);
    const viewers = [];
    while (stmt.step()) { viewers.push(stmt.getAsObject()); }
    stmt.free();
    res.json(viewers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Revoke permission from a viewer
app.delete('/api/permissions/:viewerId', authenticateToken, async (req, res) => {
  try {
    db.run(
      'DELETE FROM schedule_permissions WHERE owner_id = ? AND viewer_id = ?',
      [req.user.id, req.params.viewerId]
    );
    await saveDatabase();
    res.json({ message: 'Permission revoked' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available game variants
app.get('/api/game-variants', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('SELECT DISTINCT game_variant FROM tournaments ORDER BY game_variant');
    
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
    const stmt = db.prepare('SELECT DISTINCT venue FROM tournaments ORDER BY venue');
    
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

// SPA catch-all for /shared/* routes
app.get('/shared/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
