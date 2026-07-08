// ── Oura Ring → WSOP Console health sync ────────────────────────────────────
//
// Pulls Ethan's Oura Cloud API v2 data and AUTHORS `health` records into the
// server's `console_records` table with a fresh `updated_at`, so they sync DOWN
// to every device on its next POST /console/api/sync (last-write-wins by
// updatedAt). No client change is required: the fields written here are already
// consumed by the console's series/trends (sleepScore, rhr, sleepHours) and the
// extended series (hrv, readinessScore, tempDeviation are already defined in the
// console's series.ts, so they render too).
//
// KEY INVARIANTS (see design doc — every one of these is a real trap):
//  • Day mapping uses Oura's local `day` string VERBATIM (already YYYY-MM-DD in
//    the user's tz). We NEVER derive the calendar day from record.timestamp —
//    daily_sleep/daily_readiness emit `<day>T00:00:00+00:00` (midnight UTC), so
//    Date-parsing would shift the record a day off for America/New_York.
//  • Deterministic id `oura-<day>` for both the console_records id AND the
//    HealthMetric.date. Re-fetching a day overwrites the SAME row (no dup).
//  • The sync endpoint's ON CONFLICT REPLACES the whole `data` blob (no field
//    merge). So we READ the existing `oura-<day>` row, merge our fields onto the
//    prior JSON, and stamp a fresh `updatedAt` INSIDE the JSON before writing.
//  • `updatedAt` lives INSIDE the JSON data (the client's applySyncRecords does
//    JSON.parse(data) then db.put with keyPath 'id' — it does NOT re-stamp).
//  • Skip a day whose sleepScore is null (Oura hasn't finished processing the
//    night). The trailing window backfills it on a later run.
//  • `/v2/usercollection/sleep` can return >1 period/day (naps). We roll up to
//    the main sleep (type 'long_sleep', else max time_in_bed) before mapping.
//
// This module is dependency-light: it uses the caller-provided sql.js `db` +
// `saveDatabase` (the same handles server.js uses) and Node's global `fetch`
// (Node 18+; the server runs Node 25). Nothing here throws to the cron caller —
// a down Oura / missing PAT / HTTP error is logged and becomes a no-op.

const OURA_BASE = 'https://api.ouraring.com';
const HEALTH_STORE = 'health';

// ── Small date helpers on the ET wall clock ─────────────────────────────────
// We format "today" and "today - N" as YYYY-MM-DD in America/New_York so the
// trailing fetch window matches the user's local calendar, independent of the
// server's own timezone. (Per-record day mapping still comes from Oura's `day`.)
const CONSOLE_TZ = 'America/New_York';

function etDayString(date = new Date()) {
  // en-CA yields YYYY-MM-DD; the timeZone option pins it to ET wall clock.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CONSOLE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Subtract `days` calendar days from a YYYY-MM-DD string (UTC-noon math avoids
// DST edge cases — we only care about the date components).
function shiftDay(dayStr, days) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// ── One paged Oura GET (follows next_token until exhausted) ─────────────────
// Returns the concatenated `data` array. Throws on missing PAT or HTTP error so
// the caller's try/catch turns the whole run into a logged no-op.
async function ouraGet(pathName, startDay, endDay, pat) {
  const all = [];
  let nextToken = null;
  // Bound the paging loop so a misbehaving API can't spin forever; a ~1-month
  // window is only a handful of pages at Oura's default page size.
  for (let page = 0; page < 50; page++) {
    const url = new URL(`${OURA_BASE}${pathName}`);
    url.searchParams.set('start_date', startDay);
    url.searchParams.set('end_date', endDay);
    if (nextToken) url.searchParams.set('next_token', nextToken);

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${pat}` },
    });

    if (resp.status === 429) {
      // Rate limited (5000/5min — we shouldn't hit this). Fail soft: abort the
      // whole run, cron retries tomorrow.
      const err = new Error('Oura rate limited (HTTP 429)');
      err.code = 'RATE_LIMITED';
      throw err;
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Oura ${pathName} HTTP ${resp.status}: ${body.slice(0, 300)}`);
    }

    const json = await resp.json();
    if (Array.isArray(json.data)) all.push(...json.data);
    nextToken = json.next_token || null;
    if (!nextToken) break;
  }
  return all;
}

// ── Fetch the 3 endpoints for a day window ──────────────────────────────────
// Returns the raw record arrays; buildHealthRecords does the mapping so it's
// unit-testable without network.
async function fetchOuraWindow(startDay, endDay, pat) {
  const [dailySleep, sleep, dailyReadiness] = await Promise.all([
    ouraGet('/v2/usercollection/daily_sleep', startDay, endDay, pat),
    ouraGet('/v2/usercollection/sleep', startDay, endDay, pat),
    ouraGet('/v2/usercollection/daily_readiness', startDay, endDay, pat),
  ]);
  return { dailySleep, sleep, dailyReadiness };
}

// ── Roll the per-period `sleep` records up to one main sleep per day ─────────
// Oura's /sleep returns one record per sleep PERIOD (naps included). We pick the
// canonical night: prefer type 'long_sleep', else the longest time_in_bed.
function indexMainSleepByDay(sleepRecords) {
  const byDay = new Map();
  for (const rec of sleepRecords || []) {
    const day = rec && rec.day;
    if (!day) continue;
    const existing = byDay.get(day);
    if (!existing) {
      byDay.set(day, rec);
      continue;
    }
    const recIsLong = rec.type === 'long_sleep';
    const exIsLong = existing.type === 'long_sleep';
    if (recIsLong && !exIsLong) {
      byDay.set(day, rec); // long_sleep always beats a nap
    } else if (recIsLong === exIsLong) {
      // Same class → keep the one with more time in bed.
      if ((rec.time_in_bed || 0) > (existing.time_in_bed || 0)) byDay.set(day, rec);
    }
  }
  return byDay;
}

function indexByDay(records) {
  const byDay = new Map();
  for (const rec of records || []) {
    if (rec && rec.day && !byDay.has(rec.day)) byDay.set(rec.day, rec);
  }
  return byDay;
}

// A finite number or undefined (so we can drop null/absent fields cleanly and
// never write `null`/`NaN` into a numeric health field).
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

// ── Build HealthMetric-shaped patches from the raw Oura arrays ──────────────
// One patch per day that has a non-null daily_sleep score. Each patch carries
// ONLY the Oura-owned fields (undefined fields are omitted by the caller's
// merge). `extended` toggles hrv/readiness/tempDeviation (all already supported
// by the client — default on).
function buildHealthRecords({ dailySleep, sleep, dailyReadiness }, { extended = true } = {}) {
  const sleepByDay = indexMainSleepByDay(sleep);
  const readyByDay = indexByDay(dailyReadiness);

  const out = [];
  for (const ds of dailySleep || []) {
    const day = ds && ds.day;
    if (!day) continue;

    const sleepScore = num(ds.score);
    // Null-until-synced guard: if Oura hasn't scored the night yet, skip the
    // whole day — the trailing window will backfill it once processed.
    if (sleepScore === undefined) continue;

    const s = sleepByDay.get(day);
    const rhr = s ? num(s.lowest_heart_rate) : undefined;
    const totalSec = s ? num(s.total_sleep_duration) : undefined;
    const sleepHours = totalSec === undefined ? undefined : Math.round((totalSec / 3600) * 100) / 100;

    // Only the Oura-owned fields. date === id day so the client dedups by id.
    const fields = { sleepScore };
    if (rhr !== undefined) fields.rhr = rhr;
    if (sleepHours !== undefined) fields.sleepHours = sleepHours;

    if (extended) {
      const hrv = s ? num(s.average_hrv) : undefined;
      if (hrv !== undefined) fields.hrv = hrv;

      const r = readyByDay.get(day);
      if (r) {
        const readinessScore = num(r.score);
        if (readinessScore !== undefined) fields.readinessScore = readinessScore;
        const tempDeviation = num(r.temperature_deviation);
        if (tempDeviation !== undefined) fields.tempDeviation = tempDeviation;
      }
    }

    out.push({ day, fields });
  }
  return out;
}

// ── Read-modify-write one day's `oura-<day>` row into console_records ───────
// The sync endpoint's upsert REPLACES the whole data blob, so we must merge onto
// whatever is already stored (an earlier partial run, or a manual field if the
// id is ever shared) and re-stamp updatedAt so LWW makes our write win and sync
// down. `db` + helpers are the caller's sql.js handles. Returns true if written.
function upsertOuraDay(db, day, fields) {
  const id = `oura-${day}`;

  // Read the existing row (if any) so we field-merge rather than clobber.
  let prev = {};
  try {
    const stmt = db.prepare(
      "SELECT data FROM console_records WHERE store = ? AND id = ? AND deleted = 0"
    );
    stmt.bind([HEALTH_STORE, id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      if (row && typeof row.data === 'string') {
        try {
          const parsed = JSON.parse(row.data);
          if (parsed && typeof parsed === 'object') prev = parsed;
        } catch {
          /* corrupt prior blob → treat as empty, we'll rewrite it clean */
        }
      }
    }
    stmt.free();
  } catch (err) {
    console.error('[oura] read existing row failed:', err.message);
  }

  const now = Date.now();
  // Merge: prior fields first, then our fresh Oura fields override, then pin the
  // identity fields + fresh stamp. updatedAt lives INSIDE the JSON (client does
  // not re-stamp on apply).
  const merged = { ...prev, ...fields, id, date: day, updatedAt: now };

  const json = JSON.stringify(merged);
  db.run(
    `INSERT INTO console_records (store, id, data, updated_at, deleted)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(store, id) DO UPDATE SET
       data = excluded.data,
       updated_at = excluded.updated_at,
       deleted = 0
     WHERE excluded.updated_at >= console_records.updated_at`,
    [HEALTH_STORE, id, json, now]
  );
  return db.getRowsModified() > 0;
}

// Write a batch of {day, fields} patches. Persists to disk ONCE if anything
// changed. Returns the count written.
async function writeHealthRecords(db, saveDatabase, records) {
  let written = 0;
  for (const rec of records) {
    try {
      if (upsertOuraDay(db, rec.day, rec.fields)) written++;
    } catch (err) {
      console.error(`[oura] upsert ${rec.day} failed:`, err.message);
    }
  }
  if (written) await saveDatabase();
  return written;
}

// ── The end-to-end job (fetch → build → write) ──────────────────────────────
// `opts.days` sets the trailing window length (default 4 for steady state; the
// first-run backfill passes ~14). Returns a small summary object. NEVER throws:
// all failure modes are caught and logged so the cron/route stays alive.
async function runOuraSync(db, saveDatabase, opts = {}) {
  const pat = process.env.OURA_PAT;
  if (!pat) {
    console.log('[oura] disabled — no OURA_PAT env var set');
    return { ok: false, reason: 'no_pat', written: 0 };
  }

  const days = Math.max(1, Math.min(60, opts.days || 4));
  const extended = opts.extended !== false;
  const endDay = etDayString();
  const startDay = shiftDay(endDay, -(days - 1));

  try {
    const raw = await fetchOuraWindow(startDay, endDay, pat);
    const patches = buildHealthRecords(raw, { extended });
    const written = await writeHealthRecords(db, saveDatabase, patches);
    console.log(
      `[oura] sync ${startDay}..${endDay}: ${patches.length} scored day(s), ${written} record(s) written`
    );
    return { ok: true, startDay, endDay, scored: patches.length, written };
  } catch (err) {
    // Down Oura, bad PAT, 429, network — all logged, all no-op.
    console.error(`[oura] sync failed (${startDay}..${endDay}):`, err.message);
    return { ok: false, reason: err.code || 'error', error: err.message, written: 0 };
  }
}

// ── Daily cron: 10:30am ET, after the ring has uploaded overnight data ───────
// Self-disables (with a log) when OURA_PAT is unset, so a deploy without the
// secret is a loud no-op rather than a crash. Wire from the same init block as
// setupConsoleNudgeCron().
function setupOuraSyncCron(cron, db, saveDatabase, tz = CONSOLE_TZ) {
  if (!process.env.OURA_PAT) {
    console.log('[oura] cron not scheduled — no OURA_PAT env var set');
    return false;
  }
  cron.schedule(
    '30 10 * * *',
    () => {
      runOuraSync(db, saveDatabase, { days: 4 }).catch((err) =>
        console.error('[oura] cron run error:', err && err.message)
      );
    },
    { timezone: tz }
  );
  console.log(`[oura] scheduled daily sync cron 10:30 ${tz}`);
  return true;
}

module.exports = {
  runOuraSync,
  setupOuraSyncCron,
  // Exported for tests / manual use:
  fetchOuraWindow,
  buildHealthRecords,
  writeHealthRecords,
  indexMainSleepByDay,
  etDayString,
  shiftDay,
};
