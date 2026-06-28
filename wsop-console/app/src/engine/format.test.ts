import { describe, it, expect } from 'vitest'
import { todayISO, localDate, daysSince, isThisWeek, money, moneyK, weekStart } from './format'

describe('localDate / todayISO', () => {
  it('formats a Date as local YYYY-MM-DD', () => {
    expect(localDate(new Date(2026, 7, 4))).toBe('2026-08-04') // month is 0-based
  })
  it('todayISO equals localDate(now) — local, not UTC', () => {
    expect(todayISO()).toBe(localDate(new Date()))
  })
})

describe('daysSince', () => {
  it('null for missing/invalid', () => {
    expect(daysSince(undefined)).toBeNull()
    expect(daysSince('not-a-date')).toBeNull()
  })
  it('0 for now', () => {
    expect(daysSince(new Date().toISOString())).toBe(0)
  })
})

describe('isThisWeek', () => {
  it('todayISO is in this week', () => {
    expect(isThisWeek(todayISO())).toBe(true)
  })
  it('start of this week (local) is in this week', () => {
    expect(isThisWeek(localDate(weekStart()))).toBe(true)
  })
  it('a date well in the past is not', () => {
    expect(isThisWeek('2020-01-01')).toBe(false)
  })
})

describe('money formatting', () => {
  it('money signs and rounds', () => {
    expect(money(1234)).toBe('$1,234')
    expect(money(1234, { sign: true })).toBe('+$1,234')
    expect(money(-500)).toBe('-$500')
  })
  it('moneyK abbreviates thousands', () => {
    expect(moneyK(50000)).toBe('$50k')
    expect(moneyK(-25000)).toBe('-$25k')
  })
})
