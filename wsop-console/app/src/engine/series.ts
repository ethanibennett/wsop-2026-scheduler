// Dashboard series — turn each tracked thing into a {date, value} time series so
// they can be overlaid on one chart. Different units (dollars, sleep score,
// pounds, bpm) → the chart normalizes each line to its own range, so the SHAPES
// overlay and you can eyeball correlation (does P&L track sleep?).

import type { Session, HealthMetric, RoutineLog } from '../db/types'

export interface SeriesPoint {
  date: string
  value: number
}

export interface Series {
  key: string
  label: string
  color: string
  unit: string
  cumulative: boolean // running total (P&L) vs point-in-time (weight, sleep)
  points: SeriesPoint[]
  latest: number | null
}

const sortByDate = <T extends { date: string }>(a: T[]) =>
  [...a].sort((x, y) => x.date.localeCompare(y.date))

function runningTotal(sessions: Session[]): SeriesPoint[] {
  let cum = 0
  return sortByDate(sessions).map((s) => {
    cum += s.result
    return { date: s.date, value: cum }
  })
}

// Point series from health metrics for a given field (skips missing values).
function metricSeries(metrics: HealthMetric[], pick: (m: HealthMetric) => number | undefined): SeriesPoint[] {
  return sortByDate(metrics)
    .map((m) => ({ date: m.date, value: pick(m) }))
    .filter((p): p is SeriesPoint => p.value != null && !Number.isNaN(p.value))
}

// Per-day average mood from sessions that recorded it.
function moodByDay(sessions: Session[]): SeriesPoint[] {
  const byDate = new Map<string, number[]>()
  for (const s of sessions) {
    if (s.moodRating == null) continue
    const arr = byDate.get(s.date) ?? []
    arr.push(s.moodRating)
    byDate.set(s.date, arr)
  }
  return [...byDate.entries()]
    .map(([date, arr]) => ({ date, value: arr.reduce((a, b) => a + b, 0) / arr.length }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

const last = (p: SeriesPoint[]) => (p.length ? p[p.length - 1].value : null)

// Total hours played per day.
function hoursByDay(sessions: Session[]): SeriesPoint[] {
  const byDate = new Map<string, number>()
  for (const s of sessions) byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.hours)
  return [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date))
}

export function buildSeries(opts: { sessions: Session[]; metrics: HealthMetric[]; routine?: RoutineLog[] }): Series[] {
  const { sessions, metrics, routine = [] } = opts
  const cash = sessions.filter((s) => !s.isMTT && !s.isWsopFund)
  const mtt = sessions.filter((s) => s.isMTT)
  const anchorPts = sortByDate(routine)
    .map((r) => ({ date: r.date, value: r.wakeAnchor ? 1 : 0 }))

  const defs: Series[] = [
    { key: 'cash', label: 'Cash P&L', color: '#5a9e7a', unit: '$', cumulative: true, points: runningTotal(cash), latest: null },
    { key: 'mtt', label: 'MTT P&L', color: '#c9a24b', unit: '$', cumulative: true, points: runningTotal(mtt), latest: null },
    { key: 'sleepScore', label: 'Sleep score', color: '#6f9bd1', unit: '', cumulative: false, points: metricSeries(metrics, (m) => m.sleepScore), latest: null },
    { key: 'sleepHours', label: 'Sleep hrs', color: '#8e7cc4', unit: 'h', cumulative: false, points: metricSeries(metrics, (m) => m.sleepHours), latest: null },
    { key: 'weight', label: 'Weight', color: '#c97f7f', unit: 'lb', cumulative: false, points: metricSeries(metrics, (m) => m.weight), latest: null },
    { key: 'rhr', label: 'Resting HR', color: '#cf8a5a', unit: 'bpm', cumulative: false, points: metricSeries(metrics, (m) => m.rhr), latest: null },
    { key: 'mood', label: 'Mood', color: '#9aa0a6', unit: '/5', cumulative: false, points: moodByDay(sessions), latest: null },
    { key: 'hours', label: 'Hours/day', color: '#b07cc6', unit: 'h', cumulative: false, points: hoursByDay(sessions), latest: null },
    { key: 'anchor', label: 'Wake anchor', color: '#7a9e5a', unit: '', cumulative: false, points: anchorPts, latest: null },
  ]
  for (const s of defs) s.latest = last(s.points)
  // Only surface series that actually have data.
  return defs.filter((s) => s.points.length > 0)
}

// ── Normalization for overlay: map a series' values into [0,1] by its own range.
export function normalize(points: SeriesPoint[]): { date: string; t: number }[] {
  if (points.length === 0) return []
  const vals = points.map((p) => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min
  return points.map((p) => ({ date: p.date, t: span === 0 ? 0.5 : (p.value - min) / span }))
}

// ── Correlation between two series (the "do they move together?" number) ──
// Cumulative series (P&L) are first-differenced to their daily change, so we
// correlate "up days" with the metric — not the monotonic running total.
function signal(s: Series): Map<string, number> {
  const m = new Map<string, number>()
  if (s.cumulative) {
    let prev = 0
    for (const p of s.points) {
      m.set(p.date, p.value - prev)
      prev = p.value
    }
  } else {
    for (const p of s.points) m.set(p.date, p.value)
  }
  return m
}

export interface Correlation {
  r: number // Pearson, −1..1
  n: number // overlapping days
}

/** Pearson r over the days both series share. null if < 3 shared days. */
export function correlate(a: Series, b: Series): Correlation | null {
  const ma = signal(a)
  const mb = signal(b)
  const xs: number[] = []
  const ys: number[] = []
  for (const [date, va] of ma) {
    const vb = mb.get(date)
    if (vb != null) {
      xs.push(va)
      ys.push(vb)
    }
  }
  const n = xs.length
  if (n < 3) return null
  const mean = (arr: number[]) => arr.reduce((p, c) => p + c, 0) / arr.length
  const mx = mean(xs)
  const my = mean(ys)
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  if (vx === 0 || vy === 0) return { r: 0, n }
  return { r: cov / Math.sqrt(vx * vy), n }
}

/** Plain-English read of a correlation coefficient. */
export function correlationWord(r: number): string {
  const a = Math.abs(r)
  const strength = a < 0.2 ? 'no real' : a < 0.4 ? 'a weak' : a < 0.6 ? 'a moderate' : 'a strong'
  if (a < 0.2) return 'no real link'
  return `${strength} ${r > 0 ? 'positive' : 'negative'} link`
}

// Overall date domain (ms) across the given series, for a shared x-axis.
export function dateDomain(series: Series[]): [number, number] | null {
  const times: number[] = []
  for (const s of series) for (const p of s.points) times.push(new Date(p.date + 'T00:00:00').getTime())
  if (!times.length) return null
  return [Math.min(...times), Math.max(...times)]
}
