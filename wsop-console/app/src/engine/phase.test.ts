import { describe, it, expect } from 'vitest'
import { getCurrentPhase, weekInPhase, getNudges } from './phase'
import { PHASES } from '../db/seed'

const p1 = PHASES[0]

describe('getCurrentPhase', () => {
  it('returns null before Phase 1 starts', () => {
    expect(getCurrentPhase(new Date('2026-07-01T12:00:00'))).toBeNull()
  })
  it('matches a date inside Phase 1', () => {
    const ph = getCurrentPhase(new Date(p1.start + 'T12:00:00'))
    expect(ph?.id).toBe(1)
  })
  it('honors an explicit override', () => {
    expect(getCurrentPhase(new Date('2026-07-01T12:00:00'), 3)?.id).toBe(3)
  })
})

describe('weekInPhase', () => {
  it('day 0 is week 1, day 7 is week 2', () => {
    const start = new Date(p1.start + 'T12:00:00')
    const plus7 = new Date(start)
    plus7.setDate(plus7.getDate() + 7)
    expect(weekInPhase(start, p1)).toBe(1)
    expect(weekInPhase(plus7, p1)).toBe(2)
  })
})

describe('getNudges ramp', () => {
  it('Phase 1 week 1 only has the wake anchor (fromWeek 1)', () => {
    const ids = getNudges(new Date(p1.start + 'T12:00:00')).map((n) => n.id)
    expect(ids).toContain('wake-anchor')
    expect(ids).not.toContain('caffeine-cutoff') // fromWeek 3
  })
  it('later phases get the full base set', () => {
    const ids = getNudges(new Date('2026-07-01T12:00:00'), 3).map((n) => n.id)
    expect(ids).toContain('caffeine-cutoff')
    expect(ids).toContain('weekly-review')
  })
})
