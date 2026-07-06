import { describe, it, expect } from 'vitest'
import {
  matchPct,
  backerShare,
  cutsForSession,
  sessionGameLabel,
  deliveryChannels,
  newToken,
  type Backer,
} from './backers'
import type { Session } from './types'

const mk = (stakes: Backer['stakes'], name = 'B'): Backer => ({
  id: 'b1', token: 'abc123def4567890', name, stakes, createdAt: 0,
})

const sess = (p: Partial<Session> = {}): Session => ({
  id: 's1', date: '2026-07-05', channel: 'live', isMTT: false, format: 'PLO',
  gameLabel: '5/5/10 PLO', venue: 'Parx', stakeLevel: '5/5/10',
  buyInTotal: 1000, cashOut: 2240, hours: 5.2, result: 1240, ...p,
})

describe('matchPct — which stake applies to a session', () => {
  it('matches an exact format', () => {
    expect(matchPct(mk([{ format: 'PLO', channel: 'any', pct: 20 }]), sess())).toBe(20)
  })
  it('does not match a different format', () => {
    expect(matchPct(mk([{ format: 'NLH', channel: 'any', pct: 20 }]), sess())).toBeNull()
  })
  it('matches the "all games" wildcard', () => {
    expect(matchPct(mk([{ format: 'all', channel: 'any', pct: 10 }]), sess())).toBe(10)
  })
  it('respects the channel scope', () => {
    const b = mk([{ format: 'PLO', channel: 'online', pct: 20 }])
    expect(matchPct(b, sess({ channel: 'live' }))).toBeNull()
    expect(matchPct(b, sess({ channel: 'online' }))).toBe(20)
  })
  it('prefers the most specific matching stake over the wildcard', () => {
    const b = mk([
      { format: 'all', channel: 'any', pct: 10 },
      { format: 'PLO', channel: 'any', pct: 25 },
    ])
    expect(matchPct(b, sess())).toBe(25)
  })
  it('prefers an exact channel over "any" at equal format specificity', () => {
    const b = mk([
      { format: 'PLO', channel: 'any', pct: 15 },
      { format: 'PLO', channel: 'live', pct: 22 },
    ])
    expect(matchPct(b, sess({ channel: 'live' }))).toBe(22)
  })
})

describe('backerShare — the money', () => {
  it('computes the cut of a winning session', () => {
    expect(backerShare(mk([{ format: 'PLO', channel: 'any', pct: 20 }]), sess())).toBeCloseTo(248, 6)
  })
  it('is negative on a losing session (makeup)', () => {
    const s = sess({ cashOut: 0, buyInTotal: 1000, result: -1000 })
    expect(backerShare(mk([{ format: 'PLO', channel: 'any', pct: 20 }]), s)).toBeCloseTo(-200, 6)
  })
  it('returns null when not staked', () => {
    expect(backerShare(mk([{ format: 'NLH', channel: 'any', pct: 20 }]), sess())).toBeNull()
  })
})

describe('cutsForSession — everyone staked, biggest first', () => {
  it('includes only matching backers, sorted by |share|', () => {
    const backers = [
      mk([{ format: 'PLO', channel: 'any', pct: 10 }], 'Small'),
      mk([{ format: 'PLO', channel: 'any', pct: 30 }], 'Big'),
      mk([{ format: 'NLH', channel: 'any', pct: 50 }], 'Other'),
    ]
    const cuts = cutsForSession(backers, sess())
    expect(cuts.map((c) => c.backer.name)).toEqual(['Big', 'Small'])
    expect(cuts[0].share).toBeCloseTo(372, 6)
  })
})

describe('sessionGameLabel', () => {
  it('labels a cash game with its stake', () => {
    expect(sessionGameLabel(sess())).toBe('5/5/10 PLO')
  })
  it('labels an MTT', () => {
    expect(sessionGameLabel(sess({ isMTT: true, stakeLevel: undefined, gameLabel: 'Sunday Major' })))
      .toContain('MTT')
  })
})

describe('deliveryChannels', () => {
  it('always includes the link, adds text/email when set', () => {
    expect(deliveryChannels(mk([]))).toEqual(['link'])
    expect(deliveryChannels({ ...mk([]), delivery: { sms: '+1' } })).toEqual(['link', 'text'])
    expect(deliveryChannels({ ...mk([]), delivery: { email: 'a@b.c' } })).toEqual(['link', 'email digest'])
    expect(deliveryChannels({ ...mk([]), delivery: { sms: '+1', email: 'a@b.c' } }))
      .toEqual(['link', 'text', 'email digest'])
  })
})

describe('newToken', () => {
  it('is 8 base62 chars and unique', () => {
    const a = newToken()
    const b = newToken()
    expect(a).toMatch(/^[A-Za-z0-9]{8}$/)
    expect(a).not.toBe(b)
  })
})
