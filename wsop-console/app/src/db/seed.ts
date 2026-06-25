// Static plan data — seeded once into memory (not user data, so not in IDB).
//
// ⚠️ PLACEHOLDER CONTENT. The real values live in `push-service/schedule.js`
// (the PHASES array + ramped BASE_NUDGES) and `reference/phase-1-detail.html`
// (the 9-week grid). Those assets were NOT present when this was scaffolded.
// When you drop them into the repo, replace PHASES / BASE_NUDGES / PLAN_WEEKS
// below with the real data — the engine (engine/phase.ts) consumes them as-is,
// so no logic changes are needed, only the data.

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

// 6-phase WSOP 2027 cycle. weeklyCashHours = the volume ramp target
// (P1 ~10–15 → P4 ~30; bankroll-framework.md).
export const PHASES: Phase[] = [
  {
    id: 1,
    name: 'Foundation',
    start: '2026-06-22',
    end: '2026-08-23',
    theme: 'Install the rhythm. Clean session logs. Rebuild the base.',
    weeklyCashHours: 12,
  },
  {
    id: 2,
    name: 'Build',
    start: '2026-08-24',
    end: '2026-11-01',
    theme: 'Ramp volume. Tighten game selection. Move up when cleared.',
    weeklyCashHours: 18,
  },
  {
    id: 3,
    name: 'Grind',
    start: '2026-11-02',
    end: '2027-01-31',
    theme: 'Bankroll engine running. Study compounds. Hold the floor.',
    weeklyCashHours: 24,
  },
  {
    id: 4,
    name: 'Volume Peak',
    start: '2027-02-01',
    end: '2027-04-04',
    theme: 'Max hours. Edge confirmed. WSOP fund opens.',
    weeklyCashHours: 30,
  },
  {
    id: 5,
    name: 'Sharpen',
    start: '2027-04-05',
    end: '2027-05-23',
    theme: 'Taper volume, sharpen game. Mixed reps for the series.',
    weeklyCashHours: 24,
  },
  {
    id: 6,
    name: 'WSOP',
    start: '2027-05-24',
    end: '2027-07-18',
    theme: 'Series. Rested, rolled, ready.',
    weeklyCashHours: 20,
  },
]

// Phase-1 nine-week grid. Headlines/ramp badges are placeholders — replace
// with `phase-1-detail.html` + `phase-1-playbook.md`.
export const PLAN_WEEKS: PlanWeek[] = [
  {
    n: 1,
    dates: 'Jun 22 – Jun 28',
    headline: 'Set the wake anchor. Log every session, no exceptions.',
    ramp: 'Wake anchor on',
    tracks: {
      health: 'Wake anchor + morning movement',
      bank: 'Log 100% of sessions',
      mind: 'Box breathing before each session',
    },
  },
  {
    n: 2,
    dates: 'Jun 29 – Jul 5',
    headline: 'Add the wind-down. Bankroll baseline locked.',
    ramp: 'Wind-down on',
    tracks: { health: 'Wind-down routine', bank: 'Confirm $50k baseline', skill: '2h study' },
  },
  {
    n: 3,
    dates: 'Jul 6 – Jul 12',
    headline: 'Lift block starts (Mon/Wed/Fri).',
    ramp: 'Strength on',
    tracks: { health: 'Lift M/W/F', skill: '3h study', mind: 'Meditation 5 min' },
  },
  {
    n: 4,
    dates: 'Jul 13 – Jul 19',
    headline: 'Hold the four anchors. First win-rate read.',
    tracks: { bank: 'Review $/hr by game', skill: 'Solver reps', partner: 'Weekly check-in' },
  },
  {
    n: 5,
    dates: 'Jul 20 – Jul 26',
    headline: 'Nutrition defaults in. Volume nudges up.',
    ramp: 'Nutrition on',
    tracks: { health: 'Nutrition defaults', bank: 'Hit weekly hour target' },
  },
  {
    n: 6,
    dates: 'Jul 27 – Aug 2',
    headline: 'Admin layer: track P&L for taxes.',
    ramp: 'Admin on',
    tracks: { admin: 'Tax log started', bank: 'Stake clearance check' },
  },
  {
    n: 7,
    dates: 'Aug 3 – Aug 9',
    headline: 'Sunday review becomes routine.',
    ramp: 'Review on',
    tracks: { mind: 'Sunday review', skill: 'Coaching session' },
  },
  {
    n: 8,
    dates: 'Aug 10 – Aug 16',
    headline: 'Full rhythm. Stress-test a heavy week.',
    tracks: { health: 'Full stack held', bank: 'Push to ramp ceiling' },
  },
  {
    n: 9,
    dates: 'Aug 17 – Aug 23',
    headline: 'Consolidate. Carry the habits into Phase 2.',
    tracks: { mind: 'Phase retro', bank: 'Confirm checkpoint position' },
  },
]

// Ramped nudges. `fromWeek` gates each one on during Phase 1 (getNudges).
// Times/copy are placeholders — replace with `schedule.js` BASE_NUDGES.
export const BASE_NUDGES: Nudge[] = [
  {
    id: 'wake',
    cron: '0 7 * * *',
    time: '07:00',
    title: 'Wake anchor',
    body: 'Up, light, water. The keystone — hold it every day.',
    fromWeek: 1,
  },
  {
    id: 'log-session',
    cron: '0 23 * * *',
    time: '23:00',
    title: 'Log today’s session',
    body: 'Buy-in, cash-out, hours, mood. Clean logs run the whole plan.',
    fromWeek: 1,
  },
  {
    id: 'movement',
    cron: '30 7 * * *',
    time: '07:30',
    title: 'Morning movement',
    body: '10 minutes. Get the body online before the grind.',
    fromWeek: 1,
  },
  {
    id: 'winddown',
    cron: '0 22 * * *',
    time: '22:00',
    title: 'Wind-down',
    body: 'Screens down, caffeine long gone. Protect tomorrow’s anchor.',
    fromWeek: 2,
  },
  {
    id: 'lift',
    cron: '0 9 * * 1,3,5',
    time: '09:00',
    title: 'Lift (M/W/F)',
    body: 'Progressive overload. Last session’s numbers are in Training.',
    fromWeek: 3,
  },
  {
    id: 'study',
    cron: '0 14 * * *',
    time: '14:00',
    title: 'Study block',
    body: 'Solver, review, or coaching. Sharpen the edge you sell.',
    fromWeek: 4,
  },
  {
    id: 'meditation',
    cron: '0 8 * * *',
    time: '08:00',
    title: 'Meditation',
    body: '5 minutes. Steady the mind before the table.',
    fromWeek: 3,
  },
  {
    id: 'review',
    cron: '0 11 * * 0',
    time: 'Sun 11:00',
    title: 'Sunday review',
    body: 'Anchor hold? What slipped? One thing to tighten.',
    fromWeek: 7,
  },
]
