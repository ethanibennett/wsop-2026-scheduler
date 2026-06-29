import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { useToast } from '../components/Toast'
import { Sheet } from '../components/Sheet'
import { SessionForm } from '../components/SessionForm'
import type { Session } from '../db/types'
import { money, fmtDate, fmtHours } from '../engine/format'
import {
  winRateByGroup,
  totals,
  cashHoursThisWeek,
  cumulativePnl,
  monthlyBreakdown,
  mttStats,
  byVenue,
  byWeekday,
  rhythmEdge,
  moodEdge,
  type EdgeSplit,
} from '../engine/analytics'
import { rateConfidence, type RateVerdict } from '../engine/risk'

const VERDICT: Record<RateVerdict, { label: string; color: string; note: (h: number | null) => string }> = {
  winning: {
    label: 'Edge is real',
    color: 'var(--good)',
    note: () => 'Significant at this sample — the win rate clears zero with 95% confidence.',
  },
  'likely-winning': {
    label: 'Positive, not yet proven',
    color: 'var(--warn)',
    note: (h) =>
      `Up, but variance could explain it — ~${h ?? '?'}h more to call it real. Don't move up off this sample.`,
  },
  inconclusive: {
    label: 'Too little data',
    color: 'var(--muted)',
    note: () => 'Not enough sample to read the edge yet. Keep logging.',
  },
  losing: {
    label: 'Losing this sample',
    color: 'var(--bad)',
    note: () => 'Significantly negative — tighten game selection or move down.',
  },
}
import { phaseState } from '../engine/phase'

// Inline cumulative-P&L sparkline. Baseline at 0; green above, red below.
function Sparkline({ data }: { data: { cum: number }[] }) {
  if (data.length < 2) return null
  const W = 300
  const H = 64
  const vals = data.map((d) => d.cum)
  const min = Math.min(0, ...vals)
  const max = Math.max(0, ...vals)
  const span = max - min || 1
  const x = (i: number) => (i / (data.length - 1)) * W
  const y = (v: number) => H - ((v - min) / span) * H
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.cum).toFixed(1)}`).join(' ')
  const last = vals[vals.length - 1]
  const stroke = last >= 0 ? 'var(--good)' : 'var(--bad)'
  const zeroY = y(0)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--line)" strokeWidth="1" />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

function monthLabel(m: string): string {
  const [y, mo] = m.split('-')
  const d = new Date(Number(y), Number(mo) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

type Filter = 'all' | 'live' | 'online' | 'cash' | 'mtt'

// One edge-driver row: the two sides' $/hr and the delta (green = the
// good-condition side earns more, i.e. the system pays).
function EdgeRow({ split }: { split: EdgeSplit }) {
  return (
    <div className="ladder-step" style={{ padding: '9px 0', alignItems: 'flex-start' }}>
      <div className="ladder-meta">
        <div className="ladder-name">
          {split.label} <span className="muted">vs</span> {split.altLabel}
        </div>
        <div className="sess-meta">
          {money(split.a.perHour, { sign: true })}/h ({split.a.n}) ·{' '}
          {money(split.b.perHour, { sign: true })}/h ({split.b.n})
        </div>
      </div>
      {split.delta == null ? (
        <span className="mono muted" style={{ fontSize: 12 }}>need 3+ each</span>
      ) : (
        <span className={`mono ${split.delta >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
          {money(split.delta, { sign: true })}/h
        </span>
      )}
    </div>
  )
}

export function SessionsScreen() {
  const { sessions, routine, put, remove, settings } = useStore()
  const toast = useToast()
  const [editing, setEditing] = useState<Session | null>(null)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (filter === 'live') return s.channel === 'live'
      if (filter === 'online') return s.channel === 'online'
      if (filter === 'cash') return !s.isMTT
      if (filter === 'mtt') return s.isMTT
      return true
    })
  }, [sessions, filter])

  const groups = useMemo(() => winRateByGroup(sessions), [sessions])
  const all = useMemo(() => totals(sessions), [sessions])
  const pnl = useMemo(() => cumulativePnl(sessions), [sessions])
  const months = useMemo(() => monthlyBreakdown(sessions), [sessions])
  const mtt = useMemo(() => mttStats(sessions), [sessions])
  const venues = useMemo(() => byVenue(sessions), [sessions])
  const weekdays = useMemo(() => byWeekday(sessions).filter((d) => d.sessions > 0), [sessions])
  const anchorEdge = useMemo(() => rhythmEdge(sessions, routine), [sessions, routine])
  const moodSplit = useMemo(() => moodEdge(sessions), [sessions])
  const showEdge = anchorEdge.delta != null || moodSplit.delta != null
  const conf = useMemo(() => rateConfidence(sessions), [sessions])

  const ps = phaseState(new Date(), settings.phaseOverride)
  const target = ps.phase?.weeklyCashHours ?? 0
  const cashHrs = cashHoursThisWeek(sessions)
  const pct = target > 0 ? Math.min(100, (cashHrs / target) * 100) : 0

  const save = async (s: Session) => {
    await put('sessions', s)
    setEditing(null)
    setAdding(false)
    toast(editing ? 'Session updated' : 'Session logged')
  }
  const del = async (id: string) => {
    await remove('sessions', id)
    setEditing(null)
    toast('Session deleted')
  }

  return (
    <div className="screen">
      <h1 className="screen-title">Sessions</h1>
      <div className="screen-sub">the keystone · log everything</div>

      {/* Hours vs ramp */}
      <div className="card">
        <div className="row-split" style={{ marginBottom: 8 }}>
          <span className="card-label">Cash hours this week</span>
          <span className="mono">
            {fmtHours(cashHrs)} / {target ? fmtHours(target) : '—'}
          </span>
        </div>
        <div className="bar">
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Win-rate by group */}
      {groups.length > 0 && (
        <div className="card">
          <div className="card-head">
            <span className="card-label">$/hr by game</span>
            <span className="mono muted">{all.sessions} sessions</span>
          </div>
          {groups.map((g) => (
            <div className="ladder-step" key={g.key} style={{ padding: '9px 0' }}>
              <div className="ladder-meta">
                <div className="ladder-name">
                  {g.key}
                  {g.smallSample && (
                    <span className="tag" style={{ marginLeft: 6 }} title="Under 20 hours — too small to read edge">
                      small
                    </span>
                  )}
                </div>
                <div className="sess-meta">
                  {fmtHours(g.hours)} · {g.sessions} sess
                  {g.bbPer100 != null
                    ? ` · ${g.bbPer100 >= 0 ? '+' : ''}${g.bbPer100.toFixed(1)} bb/100`
                    : g.bbPerHour
                      ? ` · ${g.bbPerHour >= 0 ? '+' : ''}${g.bbPerHour.toFixed(2)} bb/h`
                      : ''}
                </div>
              </div>
              <div className={`mono ${g.perHour >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
                {money(g.perHour, { sign: true })}/h
              </div>
            </div>
          ))}
          <div className="divider" />
          <div className="row-split">
            <span className="card-label">All-in</span>
            <span className="mono">
              <span className={all.result >= 0 ? 'pos' : 'neg'}>
                {money(all.result, { sign: true })}
              </span>{' '}
              <span className="muted">· {money(all.perHour, { sign: true })}/h</span>
            </span>
          </div>
        </div>
      )}

      {/* Is your edge real? — win-rate significance */}
      {conf.sessions > 0 && (
        <div className="card">
          <div className="card-head">
            <span className="card-label">Is your edge real?</span>
            <span className="mono muted" style={{ fontSize: 12 }}>
              {conf.sessions} sess · {Math.round(conf.hours)}h
            </span>
          </div>
          <div className="row-split" style={{ alignItems: 'baseline', marginBottom: 6 }}>
            <span className="stat-big" style={{ fontSize: 20, color: VERDICT[conf.verdict].color }}>
              {VERDICT[conf.verdict].label}
            </span>
            {conf.margin > 0 && (
              <span className="mono" style={{ fontSize: 13 }}>
                {money(conf.perHour, { sign: true })}/h ± {money(conf.margin)}
              </span>
            )}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {VERDICT[conf.verdict].note(conf.extraHoursToSignif)}
          </div>
        </div>
      )}

      {/* Cumulative P&L trend */}
      {pnl.length >= 2 && (
        <div className="card">
          <div className="card-head">
            <span className="card-label">Cumulative P&L</span>
            <span className={`mono ${pnl[pnl.length - 1].cum >= 0 ? 'pos' : 'neg'}`}>
              {money(pnl[pnl.length - 1].cum, { sign: true })}
            </span>
          </div>
          <Sparkline data={pnl} />
          <div className="sess-meta" style={{ marginTop: 4 }}>
            {fmtDate(pnl[0].date)} → {fmtDate(pnl[pnl.length - 1].date)} · excludes WSOP-fund
          </div>
        </div>
      )}

      {/* Monthly breakdown */}
      {months.length > 0 && (
        <div className="card">
          <div className="card-head">
            <span className="card-label">By month</span>
          </div>
          {months.map((m) => (
            <div className="ladder-step" key={m.month} style={{ padding: '8px 0' }}>
              <div className="ladder-meta">
                <div className="ladder-name">{monthLabel(m.month)}</div>
                <div className="sess-meta">
                  {fmtHours(m.hours)} · {m.sessions} sess · {money(m.perHour, { sign: true })}/h
                </div>
              </div>
              <div className={`mono ${m.result >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
                {money(m.result, { sign: true })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* By venue — game selection by room */}
      {venues.length > 1 && (
        <div className="card">
          <div className="card-head">
            <span className="card-label">By venue</span>
          </div>
          {venues.map((v) => (
            <div key={v.venue} className="ladder-step" style={{ padding: '8px 0' }}>
              <div className="ladder-meta">
                <div className="ladder-name">{v.venue}</div>
                <div className="sess-meta">{fmtHours(v.hours)} · {v.sessions} sess</div>
              </div>
              <div className={`mono ${v.perHour >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
                {money(v.perHour, { sign: true })}/h
              </div>
            </div>
          ))}
        </div>
      )}

      {/* By weekday — which nights run best */}
      {weekdays.length > 1 && (
        <div className="card">
          <div className="card-head">
            <span className="card-label">By night</span>
          </div>
          {weekdays.map((d) => (
            <div key={d.weekday} className="ladder-step" style={{ padding: '7px 0' }}>
              <div className="ladder-meta">
                <div className="ladder-name">{d.label}</div>
                <div className="sess-meta">{fmtHours(d.hours)} · {d.sessions} sess</div>
              </div>
              <div className={`mono ${d.perHour >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
                {money(d.perHour, { sign: true })}/h
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edge drivers — does the life-system pay? */}
      {showEdge && (
        <div className="card">
          <div className="card-head">
            <span className="card-label">Edge drivers</span>
            <span className="mono muted" style={{ fontSize: 12 }}>$/hr split</span>
          </div>
          <EdgeRow split={anchorEdge} />
          <EdgeRow split={moodSplit} />
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Cash only. A positive delta is your own data backing the plan’s bet — rhythm and
            headspace showing up in the win rate.
          </div>
        </div>
      )}

      {/* MTT ROI / ITM */}
      {mtt && (
        <div className="card">
          <div className="card-head">
            <span className="card-label">MTT</span>
            <span className="mono muted">{mtt.tournaments} played</span>
          </div>
          <div className="stat-row">
            <div className="card card-2">
              <div className="card-label">ROI</div>
              <div className={`stat-big ${mtt.roi >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 20 }}>
                {mtt.roi >= 0 ? '+' : ''}{mtt.roi.toFixed(0)}%
              </div>
            </div>
            <div className="card card-2">
              <div className="card-label">ITM</div>
              <div className="stat-big" style={{ fontSize: 20 }}>{mtt.itmPct.toFixed(0)}%</div>
            </div>
            <div className="card card-2">
              <div className="card-label">Net</div>
              <div className={`stat-big ${mtt.result >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 20 }}>
                {money(mtt.result, { sign: true })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="pill-row">
        {(['all', 'live', 'online', 'cash', 'mtt'] as Filter[]).map((f) => (
          <button
            key={f}
            className={`pill${filter === f ? ' on' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty">
            <div className="big">▤</div>
            No sessions yet. Tap + to log your first.
          </div>
        ) : (
          filtered.map((s) => (
            <button className="session-item" key={s.id} onClick={() => setEditing(s)}>
              <div className="sess-main">
                <div className="sess-label">
                  {s.isMTT && <span className="tag">MTT</span>}
                  {s.isWsopFund && <span className="tag">WSOP</span>}
                  {s.gameLabel || `${s.format}${s.stakeLevel ? ' ' + s.stakeLevel : ''}`}
                </div>
                <div className="sess-meta">
                  {fmtDate(s.date)} · {s.venue || s.channel} · {fmtHours(s.hours)}
                </div>
              </div>
              <div className={`sess-result ${s.result >= 0 ? 'pos' : 'neg'}`}>
                {money(s.result, { sign: true })}
              </div>
            </button>
          ))
        )}
      </div>

      <button
        className="btn btn-primary btn-block"
        onClick={() => setAdding(true)}
        style={{ position: 'sticky', bottom: 0 }}
      >
        + Log session
      </button>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Log session">
        <SessionForm onSave={save} onCancel={() => setAdding(false)} />
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Edit session">
        {editing && (
          <SessionForm
            initial={editing}
            onSave={save}
            onCancel={() => setEditing(null)}
            onDelete={del}
          />
        )}
      </Sheet>
    </div>
  )
}
