import { describe, it, expect } from 'vitest'
import { estimateRate, simulateBankroll } from './risk'
import type { Session } from '../db/types'

function sess(result: number, hours: number, extra: Partial<Session> = {}): Session {
  return {
    id: Math.random().toString(36).slice(2),
    date: '2026-08-01',
    channel: 'live',
    isMTT: false,
    format: 'PLO',
    gameLabel: '',
    venue: '',
    stakeLevel: '5/5/10',
    buyInTotal: 0,
    cashOut: result,
    hours,
    result,
    ...extra,
  }
}

// Deterministic uniform RNG (mulberry32) for repeatable simulations.
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('estimateRate', () => {
  it('computes $/hr and flags small samples', () => {
    const r = estimateRate([sess(500, 5), sess(-100, 5)])
    expect(r.perHour).toBe(40) // 400 / 10
    expect(r.hours).toBe(10)
    expect(r.sessions).toBe(2)
    expect(r.enough).toBe(false) // < 10 sessions / < 30h
  })
  it('excludes MTT and WSOP-fund sessions', () => {
    const r = estimateRate([
      sess(1000, 10),
      sess(9999, 10, { isMTT: true }),
      sess(9999, 10, { isWsopFund: true }),
    ])
    expect(r.perHour).toBe(100)
    expect(r.sessions).toBe(1)
  })
  it('sd is 0 for a single session and positive with spread', () => {
    expect(estimateRate([sess(100, 5)]).sdPerHour).toBe(0)
    const r = estimateRate([sess(500, 5), sess(-500, 5), sess(200, 5)])
    expect(r.sdPerHour).toBeGreaterThan(0)
  })
})

describe('simulateBankroll', () => {
  const base = {
    startingRoll: 50000,
    perHour: 50,
    sdPerHour: 0,
    hoursPerWeek: 20,
    weeks: 10,
    hardFloor: 25000,
    softFloor: 40000,
    targets: [100000],
    paths: 500,
  }

  it('with zero variance is deterministic: roll grows by mean each week', () => {
    const r = simulateBankroll({ ...base, rng: seeded(1) })
    // 50k + 50*20*10 = 50k + 10k = 60k, no floor touched, target 100k not reached
    expect(r.median).toBeCloseTo(60000, 0)
    expect(r.p5).toBeCloseTo(60000, 0)
    expect(r.pHardFloor).toBe(0)
    expect(r.pSoftFloor).toBe(0)
    expect(r.pTargets[0].p).toBe(0)
    expect(r.medianMaxDrawdown).toBe(0)
  })

  it('a losing zero-variance roll touches both floors', () => {
    const r = simulateBankroll({
      ...base,
      perHour: -200, // -4k/week → 50k down to 10k over 10 weeks
      rng: seeded(2),
    })
    expect(r.pSoftFloor).toBe(1)
    expect(r.pHardFloor).toBe(1)
    expect(r.median).toBeLessThan(25000)
  })

  it('probabilities are in [0,1] and a positive edge reaches the target sometimes', () => {
    const r = simulateBankroll({
      ...base,
      perHour: 80,
      sdPerHour: 400,
      weeks: 30,
      paths: 1000,
      rng: seeded(7),
    })
    for (const x of [r.pHardFloor, r.pSoftFloor, r.pTargets[0].p]) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
    }
    expect(r.p5).toBeLessThanOrEqual(r.median)
    expect(r.median).toBeLessThanOrEqual(r.p95)
    expect(r.pTargets[0].p).toBeGreaterThan(0)
  })

  it('higher variance raises the chance of touching the hard floor', () => {
    const lo = simulateBankroll({ ...base, perHour: 30, sdPerHour: 300, weeks: 40, paths: 1500, rng: seeded(11) })
    const hi = simulateBankroll({ ...base, perHour: 30, sdPerHour: 1200, weeks: 40, paths: 1500, rng: seeded(11) })
    expect(hi.pHardFloor).toBeGreaterThan(lo.pHardFloor)
  })
})
