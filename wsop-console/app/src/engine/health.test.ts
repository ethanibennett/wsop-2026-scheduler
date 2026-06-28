import { describe, it, expect } from 'vitest'
import { weightProgress } from './health'
import type { HealthMetric } from '../db/types'

function m(date: string, weight: number): HealthMetric {
  return { id: Math.random().toString(36).slice(2), date, weight }
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
