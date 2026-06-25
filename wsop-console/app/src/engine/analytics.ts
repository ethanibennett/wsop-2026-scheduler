// Win-rate + volume + streak analytics — the "where's my edge actually" read
// that feeds game selection and the Sunday review.

import type { Session, RoutineLog } from '../db/types'
import { isThisWeek } from './format'

export interface GroupStat {
  key: string // "PLO · 5/5/10"
  format: string
  stakeLevel: string
  sessions: number
  hours: number
  result: number
  perHour: number // $/hr — the headline edge read
}

/** Win-rate grouped by format + stakeLevel (cash) or format (MTT). */
export function winRateByGroup(sessions: Session[]): GroupStat[] {
  const map = new Map<string, GroupStat>()
  for (const s of sessions) {
    const stake = s.isMTT ? 'MTT' : s.stakeLevel || '—'
    const key = `${s.format} · ${stake}`
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        format: s.format,
        stakeLevel: stake,
        sessions: 0,
        hours: 0,
        result: 0,
        perHour: 0,
      }
      map.set(key, g)
    }
    g.sessions += 1
    g.hours += s.hours
    g.result += s.result
  }
  const out = [...map.values()]
  for (const g of out) g.perHour = g.hours > 0 ? g.result / g.hours : 0
  // Most-played first.
  return out.sort((a, b) => b.hours - a.hours)
}

export interface Totals {
  sessions: number
  hours: number
  result: number
  perHour: number
}

export function totals(sessions: Session[]): Totals {
  const hours = sessions.reduce((a, s) => a + s.hours, 0)
  const result = sessions.reduce((a, s) => a + s.result, 0)
  return {
    sessions: sessions.length,
    hours,
    result,
    perHour: hours > 0 ? result / hours : 0,
  }
}

/** Cash hours logged this week (live + online, non-MTT). */
export function cashHoursThisWeek(sessions: Session[]): number {
  return sessions
    .filter((s) => !s.isMTT && isThisWeek(s.date))
    .reduce((a, s) => a + s.hours, 0)
}

/** All hours (cash + MTT) this week. */
export function hoursThisWeek(sessions: Session[]): number {
  return sessions.filter((s) => isThisWeek(s.date)).reduce((a, s) => a + s.hours, 0)
}

// ── Streaks (RoutineLog) — wake anchor is the headline metric ──
function streak(logs: RoutineLog[], pick: (l: RoutineLog) => boolean | undefined): number {
  const byDate = new Map(logs.map((l) => [l.date, l]))
  let count = 0
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  // Allow today to be unlogged without breaking the streak.
  let allowSkipToday = true
  for (;;) {
    const key = d.toISOString().slice(0, 10)
    const log = byDate.get(key)
    if (log && pick(log)) {
      count += 1
      allowSkipToday = false
    } else if (allowSkipToday) {
      allowSkipToday = false
    } else {
      break
    }
    d.setDate(d.getDate() - 1)
    if (count > 400) break
  }
  return count
}

export function wakeAnchorStreak(logs: RoutineLog[]): number {
  return streak(logs, (l) => l.wakeAnchor)
}

export function windDownStreak(logs: RoutineLog[]): number {
  return streak(logs, (l) => l.windDown)
}
