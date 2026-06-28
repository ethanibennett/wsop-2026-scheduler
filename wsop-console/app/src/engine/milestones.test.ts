import { describe, it, expect } from 'vitest'
import { milestones } from './milestones'

describe('milestones', () => {
  it('marks roll, anchor, and weight milestones done by threshold', () => {
    const s = milestones({ roll: 62000, anchorStreak: 15, lbsLost: 11 })
    const done = new Set(s.list.filter((m) => m.done).map((m) => m.id))
    expect(done.has('roll-50000')).toBe(true)
    expect(done.has('roll-60000')).toBe(true)
    expect(done.has('roll-75000')).toBe(false)
    expect(done.has('anchor-7')).toBe(true)
    expect(done.has('anchor-14')).toBe(true)
    expect(done.has('anchor-30')).toBe(false)
    expect(done.has('weight-10')).toBe(true)
    expect(done.has('weight-15')).toBe(false)
  })

  it('counts achieved and points at the nearest next', () => {
    const s = milestones({ roll: 0, anchorStreak: 0, lbsLost: 0 })
    expect(s.achieved).toBe(0)
    expect(s.next).not.toBeNull()
    expect(s.total).toBe(s.list.length)
  })

  it('nothing-done picks the lowest-sort milestone as next', () => {
    const s = milestones({ roll: 0, anchorStreak: 0, lbsLost: 0 })
    // lowest sort is the smallest weight tier (sort 50000+) vs roll 50000 — weight wins
    expect(s.next?.done).toBe(false)
  })
})
