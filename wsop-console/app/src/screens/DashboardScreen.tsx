// Dashboard — overlay every tracked series on one chart, toggle each on/off.
// Cash P&L, MTT P&L, Oura sleep score, sleep hours, weight, RHR, mood. Each
// line is normalized to its own range so the SHAPES overlay — eyeball whether
// the roll tracks your sleep, etc. ("compare shapes, not absolute values.")

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { getAll } from '../db/idb'
import type { HealthMetric } from '../db/types'
import { buildSeries, normalize, dateDomain, type Series } from '../engine/series'
import { fmtDate, money } from '../engine/format'

function MultiLineChart({ series, domain, height = 190 }: { series: Series[]; domain: [number, number]; height?: number }) {
  const W = 340
  const padTop = 8
  const padBottom = 8
  const [tMin, tMax] = domain
  const tSpan = tMax - tMin || 1
  const x = (date: string) => ((new Date(date + 'T00:00:00').getTime() - tMin) / tSpan) * W
  const y = (t: number) => padTop + (1 - t) * (height - padTop - padBottom)

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block' }}>
      {series.map((s) => {
        const norm = normalize(s.points)
        if (norm.length === 0) return null
        if (norm.length === 1) {
          return <circle key={s.key} cx={x(norm[0].date)} cy={y(norm[0].t)} r={3} fill={s.color} />
        }
        const pts = norm.map((p) => `${x(p.date).toFixed(1)},${y(p.t).toFixed(1)}`).join(' ')
        return <polyline key={s.key} points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      })}
    </svg>
  )
}

function fmtLatest(s: Series): string {
  if (s.latest == null) return '—'
  if (s.unit === '$') return money(s.latest, { sign: true })
  if (s.unit === '/5') return `${s.latest.toFixed(1)}/5`
  return `${Math.round(s.latest * 10) / 10}${s.unit}`
}

export function DashboardScreen() {
  const { sessions } = useStore()
  const [metrics, setMetrics] = useState<HealthMetric[]>([])
  useEffect(() => {
    void getAll<HealthMetric>('health').then(setMetrics)
  }, [])

  const series = useMemo(() => buildSeries({ sessions, metrics }), [sessions, metrics])

  // Default a couple of complementary lines on (the question this answers:
  // does the roll move with sleep?).
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set())
  const initKey = series.map((s) => s.key).join(',')
  useEffect(() => {
    setEnabled((cur) => {
      if (cur.size) return cur
      const prefer = ['cash', 'sleepScore'].filter((k) => series.some((s) => s.key === k))
      const start = prefer.length ? prefer : series.slice(0, 2).map((s) => s.key)
      return new Set(start)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initKey])

  const shown = series.filter((s) => enabled.has(s.key))
  const domain = useMemo(() => dateDomain(shown), [shown])

  const toggle = (key: string) =>
    setEnabled((cur) => {
      const next = new Set(cur)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  return (
    <div className="screen">
      <h1 className="screen-title">Dashboard</h1>
      <div className="screen-sub">everything, overlaid</div>

      {series.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="big">▦</div>
            Nothing to chart yet. Log sessions and health metrics and they’ll appear here.
          </div>
        </div>
      ) : (
        <>
          {/* The overlay chart */}
          <div className="card">
            {domain && shown.length > 0 ? (
              <>
                <MultiLineChart series={shown} domain={domain} />
                <div className="row-split" style={{ marginTop: 6 }}>
                  <span className="mono muted" style={{ fontSize: 11 }}>{fmtDate(new Date(domain[0]).toISOString().slice(0, 10))}</span>
                  <span className="mono muted" style={{ fontSize: 11 }}>{fmtDate(new Date(domain[1]).toISOString().slice(0, 10))}</span>
                </div>
              </>
            ) : (
              <div className="muted" style={{ fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
                Toggle a series on below.
              </div>
            )}
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Each line is scaled to its own range — compare the <strong>shapes</strong>, not the values.
              Tap a series to overlay or hide it.
            </div>
          </div>

          {/* Legend / toggles */}
          <div className="card">
            <div className="card-label" style={{ marginBottom: 10 }}>Series</div>
            {series.map((s) => {
              const on = enabled.has(s.key)
              return (
                <button
                  key={s.key}
                  onClick={() => toggle(s.key)}
                  className="row-split"
                  style={{
                    width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--line)',
                    padding: '10px 0', cursor: 'pointer', textAlign: 'left', opacity: on ? 1 : 0.45,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 14, height: 3, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                    <span style={{ fontSize: 14 }}>{s.label}</span>
                    <span className="mono muted" style={{ fontSize: 11 }}>{s.points.length}pt</span>
                  </span>
                  <span className="mono" style={{ fontSize: 13 }}>
                    {fmtLatest(s)} <span className="muted">{on ? '●' : '○'}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
