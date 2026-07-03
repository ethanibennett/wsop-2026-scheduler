// Live session mode — the in-the-moment layer. Start a clock when you sit,
// carry a visible stop-loss line, capture "hands to review" as they happen,
// and end into a pre-filled session log. State survives reloads (localStorage).

const LIVE_KEY = 'wsop-live-session'

export interface LiveSession {
  startedAt: string // ISO datetime
  stopLoss?: number // visible discipline line ($), not auto-enforced
  hands: string[] // quick "hand to review" notes → study log on end
}

export function readLive(): LiveSession | null {
  try {
    const raw = localStorage.getItem(LIVE_KEY)
    return raw ? (JSON.parse(raw) as LiveSession) : null
  } catch {
    return null
  }
}

export function saveLive(s: LiveSession): void {
  localStorage.setItem(LIVE_KEY, JSON.stringify(s))
}

export function clearLive(): void {
  localStorage.removeItem(LIVE_KEY)
}

/** Elapsed hours since start, rounded to the half hour (min 0.5 once started). */
export function elapsedHalfHours(startedAtISO: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(startedAtISO).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0.5
  return Math.max(0.5, Math.round((ms / 3_600_000) * 2) / 2)
}

/** "2h 15m" display for the live banner. */
export function elapsedLabel(startedAtISO: string, now: Date = new Date()): string {
  const ms = Math.max(0, now.getTime() - new Date(startedAtISO).getTime())
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
