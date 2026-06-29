import { describe, it, expect } from 'vitest'
import { buildSeries, normalize, dateDomain } from './series'
import type { Session, HealthMetric } from '../db/types'

function sess(p: Partial<Session>): Session {
  return {
    id: Math.random().toString(36).slice(2),
    date: '2026-08-01', channel: 'live', isMTT: false, format: 'PLO',
    gameLabel: '', venue: '', stakeLevel: '5/5/10', buyInTotal: 0, cashOut: 0,
    hours: 5, result: 0, ...p,
  }
}
const hm = (date: string, f: Partial<HealthMetric>): HealthMetric => ({ id: date, date, ...f })

describe('buildSeries', () => {
  it('builds separate cumulative cash and MTT P&L lines', () => {
    const s = buildSeries({
      sessions: [
        sess({ date: '2026-08-01', result: 500 }),
        sess({ date: '2026-08-02', result: -200 }),
        sess({ date: '2026-08-03', result: 1000, isMTT: true }),
      ],
      metrics: [],
    })
    const cash = s.find((x) => x.key === 'cash')!
    const mtt = s.find((x) => x.key === 'mtt')!
    expect(cash.points.map((p) => p.value)).toEqual([500, 300])
    expect(cash.latest).toBe(300)
    expect(mtt.latest).toBe(1000)
  })

  it('builds health series and drops missing values', () => {
    const s = buildSeries({
      sessions: [],
      metrics: [hm('2026-08-01', { weight: 180, sleepScore: 82 }), hm('2026-08-02', { weight: 179 })],
    })
    expect(s.find((x) => x.key === 'weight')!.points).toHaveLength(2)
    expect(s.find((x) => x.key === 'sleepScore')!.points).toHaveLength(1) // only one logged
  })

  it('omits series with no data entirely', () => {
    const s = buildSeries({ sessions: [], metrics: [hm('2026-08-01', { weight: 180 })] })
    expect(s.some((x) => x.key === 'rhr')).toBe(false)
    expect(s.some((x) => x.key === 'weight')).toBe(true)
  })

  it('averages mood per day from sessions', () => {
    const s = buildSeries({
      sessions: [sess({ date: '2026-08-01', moodRating: 4 }), sess({ date: '2026-08-01', moodRating: 2 })],
      metrics: [],
    })
    expect(s.find((x) => x.key === 'mood')!.points[0].value).toBe(3)
  })
})

describe('normalize', () => {
  it('maps values into [0,1] by their own range', () => {
    const n = normalize([
      { date: 'a', value: 100 },
      { date: 'b', value: 200 },
      { date: 'c', value: 150 },
    ])
    expect(n.map((p) => p.t)).toEqual([0, 1, 0.5])
  })
  it('flat series → mid-line (no divide-by-zero)', () => {
    expect(normalize([{ date: 'a', value: 5 }, { date: 'b', value: 5 }]).every((p) => p.t === 0.5)).toBe(true)
  })
})

describe('dateDomain', () => {
  it('spans min→max across all series', () => {
    const s = buildSeries({
      sessions: [sess({ date: '2026-08-01', result: 1 }), sess({ date: '2026-08-10', result: 1 })],
      metrics: [],
    })
    const d = dateDomain(s)!
    expect(d[0]).toBeLessThan(d[1])
  })
  it('null when no points', () => {
    expect(dateDomain([])).toBeNull()
  })
})
