// Client → server bridge for backer notifications. Ethan reviews the computed
// cuts, then this POSTs them to the gated endpoint, which records each backer's
// event, bumps their running total, and fires their web-push. The server is
// authoritative for the cumulative (dedupes on token+session so a re-send never
// double-counts) and returns per-recipient results.

import type { Session } from './types'
import type { Backer, BackerCut } from './backers'
import { sessionGameLabel, cutsForSession } from './backers'
import { getAll } from './idb'
import { readLocal, writeLocal } from './syncLocal'

export interface NotifyRecipientResult {
  token: string
  name: string
  sent: number // push subscriptions successfully delivered
  subs: number // subscriptions on file (0 = backer hasn't enabled push yet)
  cumulativeCents: number // their running share AFTER this event
  duplicate?: boolean // this session was already recorded for them
  sms?: 'sent' | 'unconfigured' | 'error' | 'none' // per-session text status
}

export interface NotifyResult {
  ok: boolean
  results?: NotifyRecipientResult[]
  error?: string
}

const cents = (dollars: number) => Math.round(dollars * 100)

const NOTIFIED_KEY = 'wsop-notified-sessions'

/**
 * Notify every staked backer for a session automatically (used on save, so a
 * logged session reaches its backers with no extra tap). No-ops cleanly when no
 * backer is staked in the game. Marks the session notified so the manual panel
 * shows its status. Never throws — a notify failure must not fail the save.
 */
export async function autoNotifyForSession(
  session: Session,
): Promise<{ notified: number; ok: boolean }> {
  try {
    const backers = await getAll<Backer>('backers')
    const cuts = cutsForSession(backers, session)
    if (!cuts.length) return { notified: 0, ok: true }
    const res = await notifyBackers(session, cuts)
    if (res.ok) {
      const set = readLocal<string[]>(NOTIFIED_KEY, [])
      if (!set.includes(session.id)) writeLocal(NOTIFIED_KEY, [...set, session.id])
    }
    return { notified: cuts.length, ok: res.ok }
  } catch {
    return { notified: 0, ok: false }
  }
}

export async function notifyBackers(session: Session, cuts: BackerCut[]): Promise<NotifyResult> {
  if (!cuts.length) return { ok: true, results: [] }
  const body = {
    session: {
      id: session.id,
      date: session.date,
      game: sessionGameLabel(session),
      venue: session.venue,
      hours: session.hours,
      resultCents: cents(session.result),
    },
    recipients: cuts.map((c) => ({
      token: c.backer.token,
      name: c.backer.name,
      pct: c.pct,
      shareCents: cents(c.share),
      sms: c.backer.delivery?.sms || undefined, // per-session text destination
      openingCents: cents(c.backer.opening || 0), // carry-in, so "Running" includes it
    })),
  }
  try {
    const res = await fetch('/console/api/backers/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    })
    if (!res.ok) return { ok: false, error: `Server ${res.status}` }
    const data = (await res.json()) as { results?: NotifyRecipientResult[] }
    return { ok: true, results: data.results ?? [] }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}
