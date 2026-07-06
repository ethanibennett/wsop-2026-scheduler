// Backers & per-session notifications.
//
// A backer holds a STANDING percentage in one or more games (by format, and
// optionally scoped to live/online). When a session of a matching game is
// logged, that backer is owed `pct × result` and can be notified. Each backer
// has an unguessable `token` that keys their private link (futurega.me/b/<token>)
// and their server-side push subscription — backers never see the gated app,
// only their own feed. This file is the pure client model + share math; the
// send + backer-facing page live on the server.

import type { Session, Format, Channel } from './types'

export interface BackerStake {
  format: Format | 'all'
  channel: Channel | 'any'
  pct: number
}

// How a backer is reached, on top of the always-available private link + push.
// sms = a per-session text; email = a weekly digest. Empty/undefined = off.
export interface BackerDelivery {
  sms?: string // phone number for per-session texts
  email?: string // address for the weekly digest
}

export interface Backer {
  id: string
  token: string // unguessable — keys the private link + push subscription
  name: string
  stakes: BackerStake[]
  delivery?: BackerDelivery
  createdAt: number
  // updatedAt is stamped by putRecord (drives last-write-wins sync)
}

/** Short labels for the channels a backer will actually receive on. */
export function deliveryChannels(backer: Backer): string[] {
  const out = ['link'] // the private link + push is always available
  if (backer.delivery?.sms) out.push('text')
  if (backer.delivery?.email) out.push('email digest')
  return out
}

export const FORMAT_LABEL: Record<Format, string> = {
  PLO: 'PLO',
  PLO8: 'PLO8',
  NLH: 'NLH',
  mixed: 'Mixed',
  stud8: 'Stud8',
  razz: 'Razz',
  '2-7': '2-7',
  BigO: 'Big O',
  other: 'Other',
}

// Options for the stake editor: 'all' (every game) + each concrete format.
export const STAKE_FORMAT_OPTIONS: { v: BackerStake['format']; label: string }[] = [
  { v: 'all', label: 'All games' },
  { v: 'PLO', label: 'PLO' },
  { v: 'PLO8', label: 'PLO8' },
  { v: 'NLH', label: 'NLH' },
  { v: 'mixed', label: 'Mixed' },
  { v: 'stud8', label: 'Stud8' },
  { v: 'razz', label: 'Razz' },
  { v: '2-7', label: '2-7' },
  { v: 'BigO', label: 'Big O' },
  { v: 'other', label: 'Other' },
]

export const STAKE_CHANNEL_OPTIONS: { v: BackerStake['channel']; label: string }[] = [
  { v: 'any', label: 'Live + online' },
  { v: 'live', label: 'Live only' },
  { v: 'online', label: 'Online only' },
]

/** 128-bit URL-safe token for a backer's private link. */
export function newToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

/**
 * The backer's applicable % for a session, or null if not staked in it.
 * When several of a backer's stakes match, the most specific wins (exact
 * format beats "all"; exact channel beats "any"); ties break to the larger %.
 */
export function matchPct(backer: Backer, session: Session): number | null {
  let best: number | null = null
  let bestScore = -1
  for (const st of backer.stakes) {
    const fOk = st.format === 'all' || st.format === session.format
    const cOk = st.channel === 'any' || st.channel === session.channel
    if (!fOk || !cOk) continue
    const score = (st.format !== 'all' ? 2 : 0) + (st.channel !== 'any' ? 1 : 0)
    if (score > bestScore || (score === bestScore && st.pct > (best ?? -Infinity))) {
      best = st.pct
      bestScore = score
    }
  }
  return best
}

/** Dollar amount owed to (or, if negative, by) the backer for this session. */
export function backerShare(backer: Backer, session: Session): number | null {
  const pct = matchPct(backer, session)
  return pct == null ? null : (session.result * pct) / 100
}

/** Backers staked in a session, with their pct + share, sorted by size. */
export interface BackerCut {
  backer: Backer
  pct: number
  share: number
}
export function cutsForSession(backers: Backer[], session: Session): BackerCut[] {
  const out: BackerCut[] = []
  for (const b of backers) {
    const pct = matchPct(b, session)
    if (pct == null) continue
    out.push({ backer: b, pct, share: (session.result * pct) / 100 })
  }
  return out.sort((a, b) => Math.abs(b.share) - Math.abs(a.share))
}

/** A concise "game being played" label for the notification. */
export function sessionGameLabel(session: Session): string {
  const fmt = FORMAT_LABEL[session.format] ?? session.format
  const stake = session.stakeLevel || (session.gameLabel && !session.gameLabel.includes(fmt) ? session.gameLabel : '')
  const kind = session.isMTT ? `${fmt} MTT` : fmt
  return stake ? `${stake} ${kind}` : kind
}

/** The backer's private link. */
export function backerLink(token: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://futurega.me'
  return `${origin}/b/${token}`
}

/** Human summary of a backer's stakes, e.g. "20% PLO · 10% NLH (online)". */
export function stakesSummary(backer: Backer): string {
  if (!backer.stakes.length) return 'no stakes set'
  return backer.stakes
    .map((s) => {
      const f = s.format === 'all' ? 'all games' : FORMAT_LABEL[s.format]
      const c = s.channel === 'any' ? '' : ` (${s.channel})`
      return `${s.pct}% ${f}${c}`
    })
    .join(' · ')
}
