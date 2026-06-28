import { describe, it, expect } from 'vitest'
import {
  bigBlind,
  winRateByGroup,
  cumulativePnl,
  monthlyBreakdown,
  mttStats,
  taxEstimate,
  wakeAnchorStreak,
  rhythmEdge,
  moodEdge,
} from './analytics'
import { localDate } from './format'
import type { Session, RoutineLog } from '../db/types'

// Minimal session factory.
function sess(p: Partial<Session>): Session {
  const buyInTotal = p.buyInTotal ?? 0
  const cashOut = p.cashOut ?? 0
  return {
    id: Math.random().toString(36).slice(2),
    date: '2026-08-01',
    channel: 'live',
    isMTT: false,
    format: 'PLO',
    gameLabel: '',
    venue: '',
    stakeLevel: '5/5/10',
    buyInTotal,
    cashOut,
    hours: 0,
    result: p.result ?? cashOut - buyInTotal,
    ...p,
  }
}

describe('bigBlind', () => {
  it('takes the BB (2nd number) for SB/BB/straddle, not the straddle', () => {
    expect(bigBlind('2/2/5')).toBe(2)
    expect(bigBlind('5/5/10')).toBe(5)
    expect(bigBlind('5/10/30')).toBe(10)
    expect(bigBlind('10/20/40')).toBe(20)
  })
  it('takes the last for two-number NLH', () => {
    expect(bigBlind('1/2')).toBe(2)
    expect(bigBlind('1/3')).toBe(3)
  })
  it('returns 0 for missing/unparseable', () => {
    expect(bigBlind(undefined)).toBe(0)
    expect(bigBlind('')).toBe(0)
  })
})

describe('winRateByGroup', () => {
  it('computes $/hr and bb/hr per group', () => {
    const g = winRateByGroup([
      sess({ stakeLevel: '5/5/10', hours: 10, result: 1000 }), // bb=5
    ])
    expect(g[0].perHour).toBe(100)
    expect(g[0].bbPerHour).toBe(20) // 100 / 5
  })

  it('bb/100 uses ONLY hands-tracked sessions (no channel mixing)', () => {
    // online: +$500 over 1000 hands at bb=5 → 10 bb/100.
    // live same stake: +$500, no hands → must NOT inflate the numerator.
    const g = winRateByGroup([
      sess({ channel: 'online', stakeLevel: '5/5/10', hours: 5, result: 500, hands: 1000 }),
      sess({ channel: 'live', stakeLevel: '5/5/10', hours: 5, result: 500 }),
    ])
    expect(g[0].bbPer100).toBeCloseTo(10, 5) // 500 / 5 / (1000/100)
  })

  it('bb/100 is null when no hands logged', () => {
    const g = winRateByGroup([sess({ hours: 5, result: 200 })])
    expect(g[0].bbPer100).toBeNull()
  })

  it('flags small samples under 20h', () => {
    const g = winRateByGroup([sess({ hours: 3, result: 50 })])
    expect(g[0].smallSample).toBe(true)
  })
})

describe('cumulativePnl', () => {
  it('runs a sorted cumulative total and excludes WSOP-fund', () => {
    const pts = cumulativePnl([
      sess({ date: '2026-08-02', result: 200 }),
      sess({ date: '2026-08-01', result: 100 }),
      sess({ date: '2026-08-03', result: 999, isWsopFund: true }),
    ])
    expect(pts.map((p) => p.cum)).toEqual([100, 300])
  })
})

describe('monthlyBreakdown', () => {
  it('groups by month with per-hour', () => {
    const m = monthlyBreakdown([
      sess({ date: '2026-08-01', hours: 5, result: 500 }),
      sess({ date: '2026-08-20', hours: 5, result: -100 }),
    ])
    expect(m[0].month).toBe('2026-08')
    expect(m[0].result).toBe(400)
    expect(m[0].perHour).toBe(40)
  })
})

describe('mttStats', () => {
  it('computes ROI and ITM', () => {
    const s = mttStats([
      sess({ isMTT: true, buyInTotal: 100, cashOut: 300, result: 200 }),
      sess({ isMTT: true, buyInTotal: 100, cashOut: 0, result: -100 }),
    ])!
    expect(s.tournaments).toBe(2)
    expect(s.itmPct).toBe(50)
    expect(s.roi).toBe(50) // net 100 / buyIns 200
  })
  it('returns null with no MTTs', () => {
    expect(mttStats([sess({})])).toBeNull()
  })
})

describe('taxEstimate (2026 OBBBA phantom income)', () => {
  it('break-even year still has phantom income = 10% of losses', () => {
    const t = taxEstimate(
      [
        sess({ date: '2026-03-01', result: 250000 }),
        sess({ date: '2026-09-01', result: -250000 }),
      ],
      2026,
    )
    expect(t.net).toBe(0)
    expect(t.deductibleLosses).toBe(225000) // 90% of 250k, capped at winnings
    expect(t.taxable).toBe(25000)
    expect(t.phantom).toBe(25000)
  })
  it('only counts the requested year', () => {
    const t = taxEstimate([sess({ date: '2025-12-31', result: 9999 })], 2026)
    expect(t.winnings).toBe(0)
  })
})

describe('rhythmEdge', () => {
  const routine: RoutineLog[] = [
    { date: '2026-08-01', wakeAnchor: true },
    { date: '2026-08-02', wakeAnchor: true },
    { date: '2026-08-03', wakeAnchor: true },
    // 08-04..06 not held
  ]
  it('splits $/hr by whether the anchor held, with delta when both sides have data', () => {
    const s = rhythmEdge(
      [
        sess({ date: '2026-08-01', hours: 5, result: 500 }), // held
        sess({ date: '2026-08-02', hours: 5, result: 500 }), // held
        sess({ date: '2026-08-03', hours: 5, result: 500 }), // held → +100/h
        sess({ date: '2026-08-04', hours: 5, result: 0 }), // missed
        sess({ date: '2026-08-05', hours: 5, result: 0 }), // missed
        sess({ date: '2026-08-06', hours: 5, result: 0 }), // missed → 0/h
      ],
      routine,
    )
    expect(s.a.perHour).toBe(100)
    expect(s.b.perHour).toBe(0)
    expect(s.delta).toBe(100)
  })
  it('delta is null when a side is too small', () => {
    const s = rhythmEdge([sess({ date: '2026-08-01', hours: 5, result: 500 })], routine)
    expect(s.delta).toBeNull()
  })
})

describe('moodEdge', () => {
  it('excludes neutral (3) and unrated, compares 4–5 vs 1–2', () => {
    const s = moodEdge([
      sess({ hours: 5, result: 500, moodRating: 5 }),
      sess({ hours: 5, result: 500, moodRating: 4 }),
      sess({ hours: 5, result: 500, moodRating: 4 }),
      sess({ hours: 5, result: -250, moodRating: 1 }),
      sess({ hours: 5, result: -250, moodRating: 2 }),
      sess({ hours: 5, result: -250, moodRating: 2 }),
      sess({ hours: 5, result: 9999, moodRating: 3 }), // excluded
      sess({ hours: 5, result: 9999 }), // unrated, excluded
    ])
    expect(s.a.n).toBe(3)
    expect(s.b.n).toBe(3)
    expect(s.a.perHour).toBe(100)
    expect(s.b.perHour).toBe(-50)
    expect(s.delta).toBe(150)
  })
})

describe('wakeAnchorStreak', () => {
  function dayOffset(n: number): string {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - n)
    return localDate(d)
  }
  it('counts consecutive days ending today (local-date keyed)', () => {
    const logs: RoutineLog[] = [
      { date: dayOffset(0), wakeAnchor: true },
      { date: dayOffset(1), wakeAnchor: true },
      { date: dayOffset(2), wakeAnchor: true },
    ]
    expect(wakeAnchorStreak(logs)).toBe(3)
  })
  it('today unlogged does not break the streak', () => {
    const logs: RoutineLog[] = [{ date: dayOffset(1), wakeAnchor: true }]
    expect(wakeAnchorStreak(logs)).toBe(1)
  })
  it('a gap stops the count', () => {
    const logs: RoutineLog[] = [
      { date: dayOffset(0), wakeAnchor: true },
      { date: dayOffset(3), wakeAnchor: true },
    ]
    expect(wakeAnchorStreak(logs)).toBe(1)
  })
})
