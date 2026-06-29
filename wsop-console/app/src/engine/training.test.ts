import { describe, it, expect } from 'vitest'
import { e1rm, liftStats, trainingConsistency } from './training'
import { localDate } from './format'
import type { LiftEntry } from '../db/types'

let n = 0
function lift(date: string, slug: string, weight: number, reps: number): LiftEntry {
  return { id: `${date}-${n++}`, date, liftSlug: slug, weight, reps }
}

describe('e1rm', () => {
  it('Epley: weight × (1 + reps/30)', () => {
    expect(e1rm(100, 5)).toBeCloseTo(116.67, 1)
    expect(e1rm(200, 1)).toBe(200)
  })
  it('0 for empty/zero weight', () => {
    expect(e1rm(undefined, 5)).toBe(0)
    expect(e1rm(0, 5)).toBe(0)
  })
})

describe('liftStats', () => {
  it('tracks last, best, and flags a new PR', () => {
    const entries = [
      lift('2026-08-01', 'squat', 225, 5), // e1RM ~262.5
      lift('2026-08-08', 'squat', 245, 3), // e1RM ~269.5 → PR over prior
      lift('2026-08-15', 'squat', 135, 8), // e1RM ~171 → not a PR
    ]
    const s = liftStats(entries, 'squat')
    expect(s.count).toBe(3)
    expect(s.last?.date).toBe('2026-08-15')
    expect(s.best?.date).toBe('2026-08-08')
    expect(s.lastIsPR).toBe(false)
  })
  it('most-recent set beating all priors is a PR', () => {
    const s = liftStats(
      [lift('2026-08-01', 'dl', 315, 3), lift('2026-08-08', 'dl', 335, 3)],
      'dl',
    )
    expect(s.lastIsPR).toBe(true)
  })
  it('a single entry is not a PR (no prior to beat)', () => {
    expect(liftStats([lift('2026-08-01', 'ohp', 95, 5)], 'ohp').lastIsPR).toBe(false)
  })
  it('unknown slug → empty', () => {
    expect(liftStats([], 'none').best).toBeNull()
  })
})

describe('trainingConsistency', () => {
  const now = new Date('2026-08-12T12:00:00')
  const off = (d: number) => {
    const x = new Date(now)
    x.setDate(x.getDate() + d)
    return localDate(x)
  }
  it('counts distinct lifting days this week + the week streak', () => {
    const c = trainingConsistency(
      [lift(off(0), 'squat', 225, 5), lift(off(0), 'bench', 185, 5), lift(off(-7), 'dl', 315, 3)],
      now,
    )
    expect(c.thisWeek).toBe(1) // two lifts on one day = one lifting day
    expect(c.weekStreak).toBe(2)
  })
})
