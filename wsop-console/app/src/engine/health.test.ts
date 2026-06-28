import { describe, it, expect } from 'vitest'
import { weightProgress, studyCadence } from './health'
import { localDate } from './format'
import type { HealthMetric, StudyLog } from '../db/types'

function m(date: string, weight: number): HealthMetric {
  return { id: Math.random().toString(36).slice(2), date, weight }
}
function study(date: string): StudyLog {
  return { id: Math.random().toString(36).slice(2), date, type: 'solver', detail: 'x' }
}

describe('weightProgress', () => {
  it('empty metrics → nulls', () => {
    const p = weightProgress([])
    expect(p.start).toBeNull()
    expect(p.lbsPerWeek).toBeNull()
  })

  it('tracks lost / remaining / % toward a 30 lb goal', () => {
    const p = weightProgress([m('2026-08-01', 180), m('2026-08-29', 174)], 30) // 4 weeks, -6 lb
    expect(p.start).toBe(180)
    expect(p.current).toBe(174)
    expect(p.goal).toBe(150)
    expect(p.lost).toBe(6)
    expect(p.remaining).toBe(24)
    expect(p.pctToGoal).toBeCloseTo(0.2, 5)
  })

  it('projects a healthy rate and weeks-to-goal', () => {
    const p = weightProgress([m('2026-08-01', 180), m('2026-08-29', 174)], 30) // -1.5 lb/wk
    expect(p.lbsPerWeek).toBeCloseTo(-1.5, 5)
    expect(p.healthyRate).toBe(true)
    expect(p.weeksToGoal).toBeCloseTo(16, 0) // 24 remaining / 1.5
  })

  it('flags an aggressive (muscle-risking) rate', () => {
    const p = weightProgress([m('2026-08-01', 180), m('2026-08-15', 174)], 30) // -3 lb/wk over 2 wk
    expect(p.lbsPerWeek).toBeCloseTo(-3, 5)
    expect(p.healthyRate).toBe(false)
  })

  it('gaining weight → no weeks-to-goal', () => {
    const p = weightProgress([m('2026-08-01', 180), m('2026-08-15', 182)], 30)
    expect(p.weeksToGoal).toBeNull()
  })
})

describe('studyCadence', () => {
  const now = new Date('2026-08-12T12:00:00')
  const off = (days: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + days)
    return localDate(d)
  }

  it('counts a streak of consecutive weeks with study', () => {
    const c = studyCadence([study(off(0)), study(off(-7)), study(off(-14))], now)
    expect(c.weekStreak).toBe(3)
    expect(c.total).toBe(3)
  })

  it('an empty current week does not break the streak', () => {
    const c = studyCadence([study(off(-7)), study(off(-14))], now)
    expect(c.weekStreak).toBe(2)
  })

  it('a gap ends the streak', () => {
    const c = studyCadence([study(off(0)), study(off(-21))], now)
    expect(c.weekStreak).toBe(1)
  })

  it('empty logs → zero', () => {
    const c = studyCadence([], now)
    expect(c.weekStreak).toBe(0)
    expect(c.thisWeek).toBe(0)
  })

  it('counts this week from the real calendar', () => {
    expect(studyCadence([study(localDate(new Date()))]).thisWeek).toBe(1)
  })

  it('thisWeek uses the injected now consistently with the streak', () => {
    const c = studyCadence([study(off(0)), study(off(0)), study(off(-7))], now)
    expect(c.thisWeek).toBe(2) // both off(0) logs, not the prior-week one
  })
})
