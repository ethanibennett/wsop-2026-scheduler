import { describe, it, expect } from 'vitest'
import {
  ladderLookup,
  nextCheckpoint,
  computeBankroll,
  bankrollAlerts,
  recommendStake,
  fundProjection,
} from './bankroll'
import type { Session, BankrollAdjustment } from '../db/types'

function sess(result: number, extra: Partial<Session> = {}): Session {
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
    hours: 0,
    result,
    ...extra,
  }
}

describe('ladder lookup', () => {
  it('finds the highest rung at or below the roll', () => {
    expect(ladderLookup(50000)?.cleared).toBe('2/2/5')
    expect(ladderLookup(60000)?.cleared).toBe('5/5/10')
    expect(ladderLookup(75000)?.cleared).toBe('5/5/10') // 5/10/30 is a shot at $75k
    expect(ladderLookup(100000)?.cleared).toBe('5/10/30') // cleared at $100k (40 bi)
    expect(ladderLookup(40000)).toBeNull() // below the first rung
  })
  it('next checkpoint is the first rung above the roll', () => {
    expect(nextCheckpoint(50000)?.amount).toBe(60000)
    expect(nextCheckpoint(150000)).toBeNull()
  })
})

describe('computeBankroll', () => {
  it('derives playing roll from start + session pnl + adjustments', () => {
    const b = computeBankroll([sess(5000), sess(-2000)], [], 50000)
    expect(b.sessionPnl).toBe(3000)
    expect(b.playingRoll).toBe(53000)
    expect(b.wsopFund).toBe(0)
  })
  it('wsop-fund transfers move money out of the roll into the fund', () => {
    const adj: BankrollAdjustment[] = [
      { id: '1', date: '2026-08-01', amount: 10000, type: 'wsop-fund-transfer' },
    ]
    const b = computeBankroll([], adj, 100000)
    expect(b.playingRoll).toBe(90000)
    expect(b.wsopFund).toBe(10000)
  })
  it('wsop-fund-flagged sessions feed the fund, not the playing roll', () => {
    const b = computeBankroll([sess(8000, { isWsopFund: true })], [], 50000)
    expect(b.playingRoll).toBe(50000)
    expect(b.wsopFund).toBe(8000)
  })
})

describe('recommendStake', () => {
  it('$50k: sit 2/2/5, shot 5/5/10 sanctioned', () => {
    const r = recommendStake(50000)
    expect(r.sit?.key).toBe('2/2/5')
    expect(r.next?.key).toBe('5/5/10')
    expect(r.canMoveUp).toBe(false)
    expect(r.shotEarmark).toBeGreaterThan(0)
    expect(r.belowFloor).toBe('none')
  })
  it('$60k: sit 5/5/10, no surplus for a shot yet', () => {
    const r = recommendStake(60000)
    expect(r.sit?.key).toBe('5/5/10')
    expect(r.shotEarmark).toBe(0)
  })
  it('$75k: standard 5/5/10, 5/10/30 shot earmark up to 5 bi', () => {
    const r = recommendStake(75000)
    expect(r.sit?.key).toBe('5/5/10')
    expect(r.next?.key).toBe('5/10/30')
    expect(r.shotEarmark).toBe(12500) // min(5×2500, surplus 15000)
  })
  it('$100k: 5/10/30 cleared as standard', () => {
    expect(recommendStake(100000).sit?.key).toBe('5/10/30')
  })
  it('$35k: rebuild at 2/2/5 with a soft-floor flag', () => {
    const r = recommendStake(35000)
    expect(r.sit?.key).toBe('2/2/5')
    expect(r.belowFloor).toBe('soft')
  })
  it('$20k: under the hard floor, no stake', () => {
    const r = recommendStake(20000)
    expect(r.sit).toBeNull()
    expect(r.belowFloor).toBe('hard')
  })
})

describe('fundProjection', () => {
  const now = new Date('2026-08-01T00:00:00')
  const wsop = new Date('2027-05-03T00:00:00') // ~9 months out
  const transfer = (date: string, amount: number): BankrollAdjustment => ({
    id: Math.random().toString(36).slice(2),
    date,
    amount,
    type: 'wsop-fund-transfer',
  })

  it('no transfers: required feed = remaining / months, no observed pace', () => {
    const f = fundProjection(0, [], now, wsop, 65000)
    expect(f.remaining).toBe(65000)
    expect(f.monthsLeft).toBeCloseTo(9, 0)
    expect(f.requiredMonthly).toBeGreaterThan(6500)
    expect(f.requiredMonthly).toBeLessThan(7600)
    expect(f.observedMonthly).toBe(0)
    expect(f.onTrack).toBe(false)
  })

  it('observed pace projects forward and flags a shortfall', () => {
    const f = fundProjection(
      10000,
      [transfer('2026-06-01', 5000), transfer('2026-07-01', 5000)], // ~$5k/mo over 2 mo
      now,
      wsop,
      65000,
    )
    expect(f.observedMonthly).toBeCloseTo(5000, -2) // ~5k/month
    expect(f.projected).toBeGreaterThan(10000)
    expect(f.onTrack).toBe(false)
    expect(f.shortfall).toBeGreaterThan(0)
  })

  it('a strong pace reads as on track', () => {
    const f = fundProjection(
      30000,
      [transfer('2026-06-01', 10000), transfer('2026-07-01', 10000)],
      now,
      wsop,
      65000,
    )
    expect(f.onTrack).toBe(true)
    expect(f.shortfall).toBe(0)
  })
})

describe('bankrollAlerts', () => {
  it('flags a fresh upward checkpoint crossing', () => {
    const a = bankrollAlerts(60000, 59000)
    expect(a.some((x) => x.level === 'good' && /cleared for 5\/5\/10/i.test(x.text))).toBe(true)
  })
  it('hard floor warning under $25k', () => {
    const a = bankrollAlerts(20000)
    expect(a[0].level).toBe('bad')
  })
  it('soft floor warning under $40k', () => {
    const a = bankrollAlerts(35000)
    expect(a[0].level).toBe('warn')
  })
})
