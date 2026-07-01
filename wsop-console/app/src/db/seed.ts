// Static plan data — seeded once into memory (not user data, so not in IDB).
//
// SOURCE OF TRUTH. PHASES + BASE_NUDGES are ported verbatim from
// `push-service/schedule.js` so the app and the push service agree. PLAN_WEEKS
// is the real Phase-1 nine-week grid from `docs/plan/phase-1-playbook.md`.
// weeklyCashHours comes from the volume-ramp table in
// `docs/plan/bankroll-framework.md`. The engine (engine/phase.ts) consumes this
// data as-is — edit values here, not logic there.

import type { Phase, PlanWeek, Nudge } from './types'

// Track keys match the design-token track colors (--t-*).
export const TRACKS = [
  { key: 'health', label: 'Health', color: 'var(--t-health)' },
  { key: 'mind', label: 'Mind', color: 'var(--t-mind)' },
  { key: 'bank', label: 'Bankroll', color: 'var(--t-bank)' },
  { key: 'skill', label: 'Skill', color: 'var(--t-skill)' },
  { key: 'partner', label: 'Partner', color: 'var(--t-partner)' },
  { key: 'admin', label: 'Admin', color: 'var(--t-admin)' },
] as const

// 6-phase WSOP 2027 cycle — dates/labels are the real rotation map from
// schedule.js. weeklyCashHours = cash-volume ramp target (bankroll-framework.md):
// P1 ~10–15 → P2 ~20 → P3 ~25 → P4 ~30 (ceiling ~35). Cash pauses for the
// series (P5) and the landing/reset (P6), so their cash target is 0.
export const PHASES: Phase[] = [
  {
    id: 1,
    name: 'Foundation & Reset',
    start: '2026-07-21',
    end: '2026-09-21',
    theme: 'Install the rhythm and the rules while you’re home. Repair, then the Tue/Sat Parx anchor from ~W6. Discipline, not grind.',
    weeklyCashHours: 12,
  },
  {
    id: 2,
    name: 'First Sprint — Monterey',
    start: '2026-09-22',
    end: '2026-10-25',
    theme: 'First solo ramp on your edge games, live + online. Start feeding the WSOP fund.',
    weeklyCashHours: 20,
  },
  {
    id: 3,
    name: 'Home Season',
    start: '2026-10-26',
    end: '2027-02-07',
    theme: 'The big build — grind the rotation weeks, protect the holiday gap. Move up a rung when the roll and edge-rate support it.',
    weeklyCashHours: 25,
  },
  {
    id: 4,
    name: 'Grind Season',
    start: '2027-02-08',
    end: '2027-05-02',
    theme: 'Peak volume, Ellie away — the bulk of the rebuild and the WSOP-fund accumulation. Disciplined stake progression.',
    weeklyCashHours: 30,
  },
  {
    id: 5,
    name: 'WSOP 2027',
    start: '2027-05-03',
    end: '2027-07-18',
    theme: 'Deploy the fund, play the slate, action sold on the $10ks. Cash games pause.',
    weeklyCashHours: 0,
  },
  {
    id: 6,
    name: 'Landing',
    start: '2027-07-19',
    end: '2027-08-12',
    theme: 'Assess what survived. Reset for the next cycle.',
    weeklyCashHours: 0,
  },
]

// Phase-1 nine-week grid (phase-1-playbook.md, Part 1). Shape:
// land + re-entry (W1) → install (W2–3) → repair (W4) → recover & rebuild
// (W5–6) → humming (W7) → solo dress-rehearsal (W8) → close & hand off (W9).
export const PLAN_WEEKS: PlanWeek[] = [
  {
    n: 1,
    dates: 'Jul 21 – Jul 27',
    headline: 'Land & re-enter — knock the rust off, start the one keystone, nothing else.',
    ramp: 'Wake anchor on',
    event: '◆ Borgata soft re-entry',
    tracks: {
      health: 'Wake anchor (10:00) only — ±1 hr counts',
      admin: 'Log every Borgata session the same night',
      partner: 'Fit time with Ellie around her studying',
    },
  },
  {
    n: 2,
    dates: 'Jul 28 – Aug 3',
    headline: 'Settle & set up — series done, stand up the infrastructure.',
    tracks: {
      health: 'Wake anchor to ~80%; gentle movement only (pre-op)',
      admin: 'Session-tracking + segregated accounts (roll / fund / tax / life)',
      bank: 'Set starting rung off the post-WSOP number',
      mind: 'Book the therapy intake while it’s calm',
      partner: 'The conversation — co-create the year ahead',
    },
  },
  {
    n: 3,
    dates: 'Aug 4 – Aug 10',
    headline: 'Sleep bookends + pre-op — close the sleep system before surgery.',
    ramp: 'Sleep system on (cap · wind-down · caffeine cutoff)',
    tracks: {
      health: 'Session cap 1:30, wind-down, caffeine cutoff 6pm',
      skill: 'Advanced PLO Mastery (mod 1) + daily range drills',
      mind: 'Daily meditation floor begins',
      admin: 'Proactive CPA session; confirm surgery coverage',
    },
  },
  {
    n: 4,
    dates: 'Aug 11 – Aug 17',
    headline: 'The repair — surgery week. Let the machine idle.',
    ramp: 'Hold only — protect anchor + sleep',
    event: '◆ Hernia repair',
    tracks: {
      health: 'Hold wake anchor gently; no training, walking as cleared',
      partner: 'Lean on Ellie through the first recovery days',
      skill: 'Light reading / a few review hands, no pressure',
    },
  },
  {
    n: 5,
    dates: 'Aug 18 – Aug 24',
    headline: 'Gentle return — ease back in, in the order your body allows.',
    ramp: 'Movement floor on',
    tracks: {
      health: 'Daily movement floor (walk-based)',
      skill: 'Resume study block + range drills; first coaching',
      bank: 'Online volume resumes gently — low stakes, edge games',
    },
  },
  {
    n: 6,
    dates: 'Aug 25 – Aug 31',
    headline: 'Rebuild — body back online, the poker machine starts producing.',
    ramp: 'Tue/Sat live anchor begins · 30/40/20 rules',
    tracks: {
      health: 'Reintroduce light strength (hernia-aware ramp)',
      bank: 'Install 30/40/20; build the neglected online volume',
      skill: 'Deepen B-game fundamentals; light solver-dev',
      partner: 'Seed the non-Ellie social anchor',
    },
  },
  {
    n: 7,
    dates: 'Sep 1 – Sep 7',
    headline: 'Humming — full system running; prove the cadence.',
    ramp: 'Sunday review on',
    tracks: {
      health: 'Add post-session reset / tilt practice',
      admin: 'Open the retirement vehicle (SEP-IRA / Solo 401k)',
      mind: 'Start the Sunday review (pre-grind)',
      partner: 'Pre-Monterey break may begin — it takes priority',
    },
  },
  {
    n: 8,
    dates: 'Sep 8 – Sep 14',
    headline: 'Solo dress-rehearsal — run the system as if she’s already gone.',
    ramp: 'Full system dry-run',
    tracks: {
      bank: 'Lock the online routine; set up the WSOP-fund bucket',
      skill: 'The study + drill cadence you’ll keep solo',
      mind: 'Audit: what holds on your structure alone?',
    },
  },
  {
    n: 9,
    dates: 'Sep 15 – Sep 21',
    headline: 'Close & hand off — consolidate, set the distance rhythm before she leaves.',
    ramp: 'Consolidate',
    tracks: {
      bank: 'Set Phase 2 volume-ramp targets',
      mind: 'Honest review: automatic vs. propped up by being home',
      partner: 'The pre-Monterey break + send-off; she leaves ~Sep 22',
    },
  },
]

// Ramped nudges — ported verbatim from push-service/schedule.js BASE_NUDGES.
// `fromWeek` gates each one on during Phase 1 (engine/phase.ts getNudges).
// Times are on the wake-10:00 / bed-2:00 clock. Sunday's 1:30 cap is soft —
// a Sunday-MTT deep run is the sanctioned exception.
export const BASE_NUDGES: Nudge[] = [
  {
    id: 'wake-anchor',
    cron: '0 10 * * *',
    time: '10:00',
    title: 'Wake anchor',
    body: 'Up. Daylight, 5–10 min of movement, protein. Same time even after a late one — this is the keystone.',
    fromWeek: 1,
  },
  {
    id: 'caffeine-cutoff',
    cron: '0 18 * * *',
    time: '18:00',
    title: 'Caffeine cutoff',
    body: 'Last caffeine. It’s a sleep lever — protect tonight’s rhythm.',
    fromWeek: 3,
  },
  {
    id: 'session-cap',
    cron: '30 1 * * *',
    time: '01:30',
    title: 'Session cap',
    body: 'Wind down. No hand review, dim the lights, close it in your head. (Sundays: a deep MTT run is the one allowed exception.)',
    fromWeek: 3,
  },
  {
    id: 'movement-floor',
    cron: '30 16 * * *',
    time: '16:30',
    title: 'Movement floor',
    body: 'Walk + the strength set on lifting days — before the evening, not after. The win is the streak.',
    fromWeek: 5,
  },
  {
    id: 'weekly-review',
    cron: '0 13 * * 0',
    time: 'Sun 13:00',
    title: 'Weekly review',
    body: '10 min before the grind: did the anchor hold? what slipped? pick the one thing to tighten. Then play.',
    fromWeek: 7,
  },
]
