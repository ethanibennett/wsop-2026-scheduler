// schedule.js — the plan, as data.
//
// This is the one file you'll edit most. Two things live here:
//   1) PHASES  — the year mapped to Ellie's rotations (drives the phase label).
//   2) NUDGES  — the push notifications and when they fire.
//
// Times are in the server's timezone (set TZ in .env). cron format: m h dom mon dow.
// During Phase 1 the base nudges RAMP ON BY WEEK (see getNudges + fromWeek), so the
// app installs the system in the same order the playbook does — one or two at a time.

const PHASES = [
  { id: 1, label: "Foundation & Reset", start: "2026-07-21", end: "2026-09-21" },
  { id: 2, label: "First Sprint — Monterey", start: "2026-09-22", end: "2026-10-25" },
  { id: 3, label: "Home Season", start: "2026-10-26", end: "2027-02-07" },
  { id: 4, label: "Grind Season", start: "2027-02-08", end: "2027-05-02" },
  { id: 5, label: "WSOP 2027", start: "2027-05-03", end: "2027-07-18" },
  { id: 6, label: "Landing", start: "2027-07-19", end: "2027-08-12" },
];

// Base daily nudges — the real Phase 1 times, on your clock (wake 10:00 / bed 2:00).
// `time` is display-only; `cron` is what fires. `fromWeek` = the Phase 1 week each
// switches on (the install ramp). Live cash (Tue/Sat Parx) and the Sunday MTT grind
// become the spine from ~W6 — those aren't push nudges, they're calendar anchors.
const BASE_NUDGES = [
  {
    id: "wake-anchor",
    time: "10:00",
    cron: "0 10 * * *",
    fromWeek: 1,
    title: "Wake anchor",
    body: "Up. Daylight, 5–10 min of movement, protein. Same time even after a late one — this is the keystone.",
  },
  {
    id: "movement-floor",
    time: "16:30",
    cron: "30 16 * * *",
    fromWeek: 5,
    title: "Movement floor",
    body: "Walk + the strength set on lifting days — before the evening, not after. The win is the streak.",
  },
  {
    id: "caffeine-cutoff",
    time: "18:00",
    cron: "0 18 * * *",
    fromWeek: 3,
    title: "Caffeine cutoff",
    body: "Last caffeine. It's a sleep lever — protect tonight's rhythm.",
  },
  {
    id: "session-cap",
    time: "01:30",
    cron: "30 1 * * *",
    fromWeek: 3,
    title: "Session cap",
    body: "Wind down. No hand review, dim the lights, close it in your head. (Sundays: a deep MTT run is the one allowed exception.)",
  },
  {
    id: "weekly-review",
    time: "13:00",
    cron: "0 13 * * 0", // Sunday, pre-MTT-grind
    fromWeek: 7,
    title: "Weekly review",
    body: "10 min before the grind: did the anchor hold? what slipped? pick the one thing to tighten. Then play.",
  },
];

// Home + ops nudges — fire on their own cron regardless of the Phase-1 install
// ramp (kept OUT of BASE_NUDGES / getNudges, so they never show in the Today
// rhythm checklist).
const HOME_NUDGES = [
  {
    id: "home-check",
    time: "11:00",
    cron: "0 11 * * *",
    title: "Home",
    body: "One thing you can take off Ellie's plate today — no questions asked. Open the Home list.",
  },
  {
    id: "backup-reminder",
    time: "Sun 12:00",
    cron: "0 12 * * 0",
    title: "Backup",
    body: "Sunday: export a backup (Settings → Export JSON). Local-first data has no other safety net.",
  },
];

// Per-phase overrides go here as you build the later phases out.
// e.g. PHASE_NUDGES[5] = [ ...WSOP-day nudges... ]
const PHASE_NUDGES = {
  // 1: [...], 2: [...], etc.
};

// The nudge cron fires on this wall-clock (server.js CONSOLE_TZ), so phase/week
// gating must use the SAME zone — UTC dates drift a day on boundary nights
// (e.g. the 01:30 ET cap is the next UTC day) and mis-ramp the nudge set.
const SCHEDULE_TZ = process.env.CONSOLE_TZ || "America/New_York";

function ymdInTZ(date, tz = SCHEDULE_TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date); // YYYY-MM-DD
}

// Whole days between two plain YYYY-MM-DD dates (b - a), free of TZ/DST skew.
function daysBetweenYMD(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.floor((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function getCurrentPhase(date = new Date()) {
  const d = ymdInTZ(date);
  return PHASES.find((p) => d >= p.start && d <= p.end) || null;
}

// 1-indexed week within a phase (W1 = the first 7 days from start).
function weekInPhase(phase, date = new Date()) {
  const days = daysBetweenYMD(phase.start, ymdInTZ(date));
  return Math.floor(days / 7) + 1;
}

// Returns the nudge set active for a given date.
// Phase 1 ramps the base nudges on by week; later phases use their override set
// (or the full base set until you define one).
function getNudges(date = new Date()) {
  const phase = getCurrentPhase(date);
  if (phase && PHASE_NUDGES[phase.id]) return PHASE_NUDGES[phase.id];
  if (phase && phase.id === 1) {
    const wk = weekInPhase(phase, date);
    return BASE_NUDGES.filter((n) => (n.fromWeek || 1) <= wk);
  }
  return BASE_NUDGES;
}

module.exports = { PHASES, BASE_NUDGES, HOME_NUDGES, PHASE_NUDGES, getCurrentPhase, weekInPhase, getNudges };
