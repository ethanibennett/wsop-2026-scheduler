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
} from '../engine/analytics'
import { phaseState } from '../engine/phase'

type Filter = 'all' | 'live' | 'online' | 'cash' | 'mtt'

export function SessionsScreen() {
  const { sessions, put, remove, settings } = useStore()
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
                <div className="ladder-name">{g.key}</div>
                <div className="sess-meta">
                  {fmtHours(g.hours)} · {g.sessions} sess
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
