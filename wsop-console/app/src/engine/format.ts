// Small formatting + date helpers shared across screens.

// LOCAL calendar date (YYYY-MM-DD). All record keys use local dates so "today"
// and "this week" (weekStart/isThisWeek, which are local) agree — a UTC key
// would drop an evening-EST session out of the current week near boundaries.
export function localDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return localDate(new Date())
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

export function uid(): string {
  // crypto.randomUUID is available in all PWA-capable browsers.
  return crypto.randomUUID()
}

export function money(n: number, opts: { sign?: boolean } = {}): string {
  const sign = opts.sign && n > 0 ? '+' : ''
  const neg = n < 0
  const abs = Math.abs(Math.round(n))
  const s = abs.toLocaleString('en-US')
  return `${neg ? '-' : sign}$${s}`
}

export function moneyK(n: number): string {
  const k = n / 1000
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(k)
  const s = abs >= 100 ? abs.toFixed(0) : abs.toFixed(1).replace(/\.0$/, '')
  return `${sign}$${s}k`
}

export function fmtDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function fmtHours(h: number): string {
  return `${h % 1 === 0 ? h : h.toFixed(1)}h`
}

// Monday-anchored week start for "this week" rollups.
export function weekStart(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const dow = (x.getDay() + 6) % 7 // 0 = Monday
  x.setDate(x.getDate() - dow)
  return x
}

/** Whole days between `iso` and now (0 = today). Returns null for missing/bad input. */
export function daysSince(iso?: string): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000))
}

export function isThisWeek(iso: string): boolean {
  const start = weekStart()
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  const d = new Date(iso + 'T00:00:00') // parse as LOCAL midnight, matching weekStart()
  return d >= start && d < end
}
