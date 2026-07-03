import { describe, it, expect } from 'vitest'
import { elapsedHalfHours, elapsedLabel } from './liveSession'

const start = '2026-08-01T19:00:00'

describe('elapsedHalfHours', () => {
  it('rounds to the half hour', () => {
    expect(elapsedHalfHours(start, new Date('2026-08-01T21:10:00'))).toBe(2) // 2h10m → 2
    expect(elapsedHalfHours(start, new Date('2026-08-01T21:20:00'))).toBe(2.5) // 2h20m → 2.5
    expect(elapsedHalfHours(start, new Date('2026-08-02T01:00:00'))).toBe(6)
  })
  it('floors at 0.5 for a just-started or bad clock', () => {
    expect(elapsedHalfHours(start, new Date('2026-08-01T19:05:00'))).toBe(0.5)
    expect(elapsedHalfHours(start, new Date('2026-08-01T18:00:00'))).toBe(0.5) // clock skew
  })
})

describe('elapsedLabel', () => {
  it('formats h/m', () => {
    expect(elapsedLabel(start, new Date('2026-08-01T21:15:00'))).toBe('2h 15m')
    expect(elapsedLabel(start, new Date('2026-08-01T19:40:00'))).toBe('40m')
  })
})
