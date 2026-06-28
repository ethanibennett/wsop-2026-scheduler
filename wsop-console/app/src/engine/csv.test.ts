import { describe, it, expect } from 'vitest'
import { sessionsToCSV } from './csv'
import type { Session } from '../db/types'

function sess(p: Partial<Session>): Session {
  return {
    id: 'x',
    date: '2026-08-01',
    channel: 'live',
    isMTT: false,
    format: 'PLO',
    gameLabel: '',
    venue: '',
    stakeLevel: '5/5/10',
    buyInTotal: 2000,
    cashOut: 2500,
    hours: 5,
    result: 500,
    ...p,
  }
}

describe('sessionsToCSV', () => {
  it('emits a header and one row per session, newest first', () => {
    const csv = sessionsToCSV([
      sess({ date: '2026-08-01', result: 500 }),
      sess({ date: '2026-08-03', result: -200 }),
    ])
    const lines = csv.split('\n')
    expect(lines[0]).toContain('Date,Channel,Type')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('2026-08-03') // newest first
  })

  it('escapes commas, quotes, and newlines', () => {
    const csv = sessionsToCSV([
      sess({ venue: 'Parx, PA', tiltNote: 'said "nice hand"', gameLabel: 'line1\nline2' }),
    ])
    const row = csv.split('\n').slice(1).join('\n')
    expect(row).toContain('"Parx, PA"')
    expect(row).toContain('"said ""nice hand"""')
    expect(row).toContain('"line1\nline2"')
  })

  it('escapes carriage returns (Windows/rich-text paste) so rows don’t split', () => {
    const csv = sessionsToCSV([sess({ tiltNote: 'line1\rline2' })])
    expect(csv.split('\n').slice(1).join('\n')).toContain('"line1\rline2"')
  })

  it('renders flags and optional fields cleanly', () => {
    const csv = sessionsToCSV([sess({ isMTT: true, isWsopFund: true, entries: 2, place: 5, moodRating: 4 })])
    const row = csv.split('\n')[1]
    expect(row).toContain('MTT')
    expect(row).toContain('yes') // WSOPFund
  })
})
