// CSV export of the session log — the human/CPA-friendly counterpart to the
// JSON backup. Clean records are the spine of the admin/tax layer
// (business-admin.md), and the CPA wants a spreadsheet, not a restore blob.

import type { Session } from '../db/types'

const COLUMNS: { header: string; get: (s: Session) => string | number }[] = [
  { header: 'Date', get: (s) => s.date },
  { header: 'Channel', get: (s) => s.channel },
  { header: 'Type', get: (s) => (s.isMTT ? 'MTT' : 'cash') },
  { header: 'Format', get: (s) => s.format },
  { header: 'Stake', get: (s) => s.stakeLevel ?? '' },
  { header: 'Game', get: (s) => s.gameLabel ?? '' },
  { header: 'Venue', get: (s) => s.venue ?? '' },
  { header: 'BuyIn', get: (s) => s.buyInTotal },
  { header: 'CashOut', get: (s) => s.cashOut },
  { header: 'Hours', get: (s) => s.hours },
  { header: 'Hands', get: (s) => s.hands ?? '' },
  { header: 'Result', get: (s) => s.result },
  { header: 'WSOPFund', get: (s) => (s.isWsopFund ? 'yes' : '') },
  { header: 'Entries', get: (s) => s.entries ?? '' },
  { header: 'Place', get: (s) => s.place ?? '' },
  { header: 'Field', get: (s) => s.fieldSize ?? '' },
  { header: 'Mood', get: (s) => s.moodRating ?? '' },
  { header: 'Tags', get: (s) => (s.tags ?? []).join('; ') },
  { header: 'TiltNote', get: (s) => s.tiltNote ?? '' },
]

// RFC-4180-ish escaping: wrap in quotes if the value has a comma, quote, or
// newline; double any embedded quotes.
function cell(v: string | number): string {
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Sessions → CSV string, newest first. Header row + one row per session. */
export function sessionsToCSV(sessions: Session[]): string {
  const rows = [...sessions].sort((a, b) => b.date.localeCompare(a.date))
  const lines = [COLUMNS.map((c) => c.header).join(',')]
  for (const s of rows) {
    lines.push(COLUMNS.map((c) => cell(c.get(s))).join(','))
  }
  return lines.join('\n')
}
