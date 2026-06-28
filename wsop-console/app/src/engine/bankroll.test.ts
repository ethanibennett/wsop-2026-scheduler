import { describe, it, expect } from 'vitest'
import {
  ladderLookup,
  nextCheckpoint,
  computeBankroll,
  bankrollAlerts,
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
