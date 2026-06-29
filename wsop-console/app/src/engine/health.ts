// Health-metric math — progress toward the nutrition goal: lose ~30 lb while
// preserving muscle (so a slow, steady rate is the win, not speed).
// Source: docs/plan/nutrition.md.

import type { HealthMetric, StudyLog } from '../db/types'
import { localDate, weekStart } from './format'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
export const DEFAULT_GOAL_LOSS_LB = 30

export interface WeightProgress {
  start: number | null // earliest logged weight
  current: number | null // latest logged weight
  goal: number | null // start − goalLossLb
  lost: number // start − current (positive = lost)
  remaining: number // current − goal (≥ 0)
  pctToGoal: number // 0..1
  lbsPerWeek: number | null // recent trend (negative = losing)
  weeksToGoal: number | null // at the current rate, if losing
  healthyRate: boolean | null // ≤ ~1.5 lb/wk preserves muscle at 45
}

export function weightProgress(
  metrics: HealthMetric[],
  goalLossLb: number = DEFAULT_GOAL_LOSS_LB,
): WeightProgress {
  const weighed = metrics
    .filter((m) => m.weight != null)
    .sort((a, b) => a.date.localeCompare(b.date))

  if (weighed.length === 0) {
    return {
      start: null, current: null, goal: null, lost: 0, remaining: 0,
      pctToGoal: 0, lbsPerWeek: null, weeksToGoal: null, healthyRate: null,
    }
  }

  const start = weighed[0].weight!
  const current = weighed[weighed.length - 1].weight!
  const goal = start - goalLossLb
  const lost = start - current
  const remaining = Math.max(0, current - goal)
  const pctToGoal = Math.min(1, Math.max(0, lost / goalLossLb))

  let lbsPerWeek: number | null = null
  let weeksToGoal: number | null = null
  let healthyRate: boolean | null = null
  if (weighed.length >= 2) {
    const first = weighed[0]
    const last = weighed[weighed.length - 1]
    const weeks =
      (new Date(last.date + 'T00:00:00').getTime() -
        new Date(first.date + 'T00:00:00').getTime()) /
      WEEK_MS
    if (weeks > 0) {
      lbsPerWeek = (current - start) / weeks // negative = losing
      healthyRate = lbsPerWeek <= 0 && Math.abs(lbsPerWeek) <= 1.5
      if (lbsPerWeek < 0 && remaining > 0) weeksToGoal = remaining / -lbsPerWeek
    }
  }

  return { start, current, goal, lost, remaining, pctToGoal, lbsPerWeek, weeksToGoal, healthyRate }
}

// ── Study cadence: the skills track is a pillar; consistency is the metric ──
export interface StudyCadence {
  thisWeek: number // study logs this week
  weekStreak: number // consecutive weeks (ending now) with ≥1 study
  total: number
}

// Generic weekly cadence from a list of dates — count this week + the streak of
// consecutive weeks (ending now) with at least one. Shared by study + training.
export function weekCadence(dates: string[], now: Date = new Date()): StudyCadence {
  const weekKey = (iso: string) => localDate(weekStart(new Date(iso + 'T00:00:00')))
  const weeks = new Set(dates.map(weekKey))
  const nowWeek = localDate(weekStart(now))
  const thisWeek = dates.filter((d) => weekKey(d) === nowWeek).length

  let weekStreak = 0
  let allowSkip = true // current week may be empty without breaking the streak
  const d = weekStart(now)
  for (;;) {
    if (weeks.has(localDate(d))) {
      weekStreak++
      allowSkip = false
    } else if (allowSkip) {
      allowSkip = false
    } else {
      break
    }
    d.setDate(d.getDate() - 7)
    if (weekStreak > 300) break
  }

  return { thisWeek, weekStreak, total: dates.length }
}

export function studyCadence(logs: StudyLog[], now: Date = new Date()): StudyCadence {
  return weekCadence(logs.map((l) => l.date), now)
}

// ── Metric trend — recent vs prior window average (sleep score, RHR, …) ──
export interface MetricTrend {
  recent: number | null
  prior: number | null
  delta: number | null // recent − prior
  n: number // points in the recent window
}

export function metricTrend(
  metrics: HealthMetric[],
  pick: (m: HealthMetric) => number | undefined,
  window = 7,
): MetricTrend {
  const vals = metrics
    .filter((m) => pick(m) != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((m) => pick(m) as number)
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
  const recentArr = vals.slice(0, window)
  const recent = avg(recentArr)
  const prior = avg(vals.slice(window, window * 2))
  return { recent, prior, delta: recent != null && prior != null ? recent - prior : null, n: recentArr.length }
}
