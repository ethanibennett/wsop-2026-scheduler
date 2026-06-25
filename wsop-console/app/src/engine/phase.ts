// Phase + week engine. Ported in spirit from `schedule.js`
// (getCurrentPhase / weekInPhase / getNudges). Everything in the app keys off
// "what phase / week is it." When the real schedule.js lands, only db/seed.ts
// changes — this logic is data-driven and stays put.

import { PHASES, BASE_NUDGES } from '../db/seed'
import type { Phase, Nudge } from '../db/types'

const MS_WEEK = 7 * 24 * 60 * 60 * 1000

function asDate(iso: string): Date {
  return new Date(iso + 'T00:00:00')
}

/** The phase containing `date`, or null if before P1 / after the last phase. */
export function getCurrentPhase(date: Date = new Date(), override?: number): Phase | null {
  if (override != null) {
    return PHASES.find((p) => p.id === override) ?? null
  }
  const t = date.getTime()
  for (const p of PHASES) {
    const start = asDate(p.start).getTime()
    const end = asDate(p.end).getTime() + MS_WEEK / 7 // inclusive of end day
    if (t >= start && t <= end) return p
  }
  return null
}

/** 1-based week number within the given phase (clamped to phase length). */
export function weekInPhase(date: Date = new Date(), phase?: Phase | null): number {
  const p = phase ?? getCurrentPhase(date)
  if (!p) return 0
  const start = asDate(p.start).getTime()
  const diff = date.getTime() - start
  const week = Math.floor(diff / MS_WEEK) + 1
  const totalWeeks = Math.max(
    1,
    Math.round((asDate(p.end).getTime() - start) / MS_WEEK) + 1,
  )
  return Math.min(Math.max(week, 1), totalWeeks)
}

/**
 * Active nudges for `date`. During Phase 1 they ramp on by `fromWeek`; in
 * later phases the full set is live. Mirror of the push service's gating so
 * the in-app Today checklist matches what would fire.
 */
export function getNudges(date: Date = new Date(), override?: number): Nudge[] {
  const phase = getCurrentPhase(date, override)
  if (!phase) return BASE_NUDGES.filter((n) => n.fromWeek <= 1)
  if (phase.id > 1) return BASE_NUDGES
  const week = weekInPhase(date, phase)
  return BASE_NUDGES.filter((n) => n.fromWeek <= week)
}

export interface PhaseState {
  phase: Phase | null
  week: number
  prePhase: boolean
}

export function phaseState(date: Date = new Date(), override?: number): PhaseState {
  const phase = getCurrentPhase(date, override)
  return {
    phase,
    week: phase ? weekInPhase(date, phase) : 0,
    prePhase: !phase && date.getTime() < asDate(PHASES[0].start).getTime(),
  }
}
