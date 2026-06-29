// Dashboard series — turn each tracked thing into a {date, value} time series so
// they can be overlaid on one chart. Different units (dollars, sleep score,
// pounds, bpm) → the chart normalizes each line to its own range, so the SHAPES
// overlay and you can eyeball correlation (does P&L track sleep?).

import type { Session, HealthMetric } from '../db/types'

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

export function buildSeries(opts: { sessions: Session[]; metrics: HealthMetric[] }): Series[] {
  const { sessions, metrics } = opts
  const cash = sessions.filter((s) => !s.isMTT && !s.isWsopFund)
  const mtt = sessions.filter((s) => s.isMTT)

  const defs: Series[] = [
    { key: 'cash', label: 'Cash P&L', color: '#5a9e7a', unit: '$', cumulative: true, points: runningTotal(cash), latest: null },
    { key: 'mtt', label: 'MTT P&L', color: '#c9a24b', unit: '$', cumulative: true, points: runningTotal(mtt), latest: null },
    { key: 'sleepScore', label: 'Sleep score', color: '#6f9bd1', unit: '', cumulative: false, points: metricSeries(metrics, (m) => m.sleepScore), latest: null },
    { key: 'sleepHours', label: 'Sleep hrs', color: '#8e7cc4', unit: 'h', cumulative: false, points: metricSeries(metrics, (m) => m.sleepHours), latest: null },
    { key: 'weight', label: 'Weight', color: '#c97f7f', unit: 'lb', cumulative: false, points: metricSeries(metrics, (m) => m.weight), latest: null },
    { key: 'rhr', label: 'Resting HR', color: '#cf8a5a', unit: 'bpm', cumulative: false, points: metricSeries(metrics, (m) => m.rhr), latest: null },
    { key: 'mood', label: 'Mood', color: '#9aa0a6', unit: '/5', cumulative: false, points: moodByDay(sessions), latest: null },
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

// Overall date domain (ms) across the given series, for a shared x-axis.
export function dateDomain(series: Series[]): [number, number] | null {
  const times: number[] = []
  for (const s of series) for (const p of s.points) times.push(new Date(p.date + 'T00:00:00').getTime())
  if (!times.length) return null
  return [Math.min(...times), Math.max(...times)]
}
