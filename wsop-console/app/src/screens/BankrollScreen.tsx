import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { useToast } from '../components/Toast'
import { Sheet } from '../components/Sheet'
import type { BankrollAdjustment, AdjustmentType } from '../db/types'
import { money, moneyK, fmtDate, uid, todayISO, isThisWeek } from '../engine/format'
import {
  computeBankroll,
  bankrollAlerts,
  LADDER,
  WSOP_FUND_TARGET,
  WSOP_FUND_OPEN_AT,
} from '../engine/bankroll'
import { phaseState } from '../engine/phase'
import { cashHoursThisWeek } from '../engine/analytics'
import { AdminView } from './AdminView'

const ADJ_TYPES: { v: AdjustmentType; label: string }[] = [
  { v: 'deposit', label: 'Deposit' },
  { v: 'withdrawal', label: 'Withdrawal' },
  { v: 'wsop-fund-transfer', label: 'WSOP fund transfer' },
  { v: 'backer-settlement', label: 'Backer settlement' },
  { v: 'correction', label: 'Correction' },
]

export function BankrollScreen() {
  const { sessions, adjustments, settings, put } = useStore()
  const toast = useToast()
  const [adjOpen, setAdjOpen] = useState(false)
  const [view, setView] = useState<'roll' | 'admin'>('roll')

  const state = useMemo(
    () => computeBankroll(sessions, adjustments, settings.startingRoll),
    [sessions, adjustments, settings.startingRoll],
  )

  // Roll as of start of this week — drives "fresh crossing" alerts.
  const prevRoll = useMemo(() => {
    const past = sessions.filter((s) => !isThisWeek(s.date))
    const pastAdj = adjustments.filter((a) => !isThisWeek(a.date))
    return computeBankroll(past, pastAdj, settings.startingRoll).playingRoll
  }, [sessions, adjustments, settings.startingRoll])

  const alerts = useMemo(
    () => bankrollAlerts(state.playingRoll, prevRoll),
    [state.playingRoll, prevRoll],
  )

  const ps = phaseState(new Date(), settings.phaseOverride)
  const target = ps.phase?.weeklyCashHours ?? 0
  const cashHrs = cashHoursThisWeek(sessions)
  const pct = target > 0 ? Math.min(100, (cashHrs / target) * 100) : 0

  return (
    <div className="screen">
      <h1 className="screen-title">Bankroll</h1>
      <div className="screen-sub">roll · fund · clearance · admin</div>

      <div className="pill-row">
        <button className={`pill${view === 'roll' ? ' on' : ''}`} onClick={() => setView('roll')}>
          Roll
        </button>
        <button className={`pill${view === 'admin' ? ' on' : ''}`} onClick={() => setView('admin')}>
          Admin
        </button>
      </div>

      {view === 'admin' && <AdminView />}

      {view === 'roll' && (
        <>
      {/* Buckets */}
      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-label">Playing roll</div>
          <div className="stat-big">{moneyK(state.playingRoll)}</div>
          <div className="sess-meta">
            <span className={state.sessionPnl >= 0 ? 'pos' : 'neg'}>
              {money(state.sessionPnl, { sign: true })}
            </span>{' '}
            from play
          </div>
        </div>
        <div className="card">
          <div className="card-label">WSOP fund</div>
          <div className="stat-big" style={{ color: 'var(--chip)' }}>
            {moneyK(state.wsopFund)}
          </div>
          <div className="sess-meta">
            {state.playingRoll >= 100000 ? 'fund open' : 'opens at $100k'}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.map((a, i) => (
        <div key={i} className={`alert alert-${a.level}`}>
          <span className="ai">{a.icon}</span>
          <span>{a.text}</span>
        </div>
      ))}

      {/* WSOP fund tracker */}
      <div className="card">
        <div className="row-split" style={{ marginBottom: 8 }}>
          <span className="card-label">WSOP fund → {moneyK(WSOP_FUND_TARGET)} net</span>
          <span className="mono">
            {moneyK(state.wsopFund)} / {moneyK(WSOP_FUND_TARGET)}
          </span>
        </div>
        <div className="bar">
          <span
            style={{
              width: `${Math.min(100, (state.wsopFund / WSOP_FUND_TARGET) * 100)}%`,
              background: 'var(--chip)',
            }}
          />
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {state.playingRoll >= WSOP_FUND_OPEN_AT
            ? 'Carve a fixed monthly slice off cash profit. ~$200k slate sold down to this net target.'
            : `Opens once the playing roll clears ${moneyK(WSOP_FUND_OPEN_AT)} — then feed it monthly toward the ~$200k slate sold to net.`}
        </div>
      </div>

      {/* Checkpoint ladder */}
      <div className="card">
        <div className="card-head">
          <span className="card-label">Checkpoint ladder</span>
          {state.next && (
            <span className="mono muted">{money(state.toNext)} to {state.next.name}</span>
          )}
        </div>
        {[...LADDER].reverse().map((c) => {
          const cleared = state.playingRoll >= c.amount
          const current = state.current?.key === c.key
          return (
            <div
              key={c.key}
              className={`ladder-step${cleared ? ' cleared' : ''}${current ? ' current' : ''}`}
            >
              <span className="ladder-dot" />
              <span className="ladder-amt">{moneyK(c.amount)}</span>
              <div className="ladder-meta">
                <div className="ladder-name">{c.name}</div>
                <div className="sess-meta">{c.note}</div>
              </div>
              {current && <span className="ladder-cleared-tag">YOU ARE HERE</span>}
            </div>
          )
        })}
      </div>

      {/* Volume ramp */}
      <div className="card">
        <div className="row-split" style={{ marginBottom: 8 }}>
          <span className="card-label">
            Volume ramp{ps.phase ? ` · ${ps.phase.name}` : ''}
          </span>
          <span className="mono">
            {cashHrs}h / {target ? target + 'h' : '—'}
          </span>
        </div>
        <div className="bar">
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Recent adjustments */}
      <div className="card">
        <div className="card-head">
          <span className="card-label">Adjustments</span>
        </div>
        {adjustments.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>
            No deposits, withdrawals, or transfers logged.
          </div>
        ) : (
          adjustments.slice(0, 8).map((a) => (
            <div className="session-item" key={a.id} style={{ cursor: 'default' }}>
              <div className="sess-main">
                <div className="sess-label">{a.type.replace(/-/g, ' ')}</div>
                <div className="sess-meta">
                  {fmtDate(a.date)}
                  {a.note ? ` · ${a.note}` : ''}
                </div>
              </div>
              <div className={`sess-result ${a.amount >= 0 ? 'pos' : 'neg'}`}>
                {money(a.amount, { sign: true })}
              </div>
            </div>
          ))
        )}
      </div>

      <button className="btn btn-gold btn-block" onClick={() => setAdjOpen(true)}>
        + Add adjustment
      </button>
        </>
      )}

      <Sheet open={adjOpen} onClose={() => setAdjOpen(false)} title="Bankroll adjustment">
        <AdjustmentForm
          onSave={async (a) => {
            await put('adjustments', a)
            setAdjOpen(false)
            toast('Adjustment saved')
          }}
          onCancel={() => setAdjOpen(false)}
        />
      </Sheet>
    </div>
  )
}

function AdjustmentForm({
  onSave,
  onCancel,
}: {
  onSave: (a: BankrollAdjustment) => void
  onCancel: () => void
}) {
  const [type, setType] = useState<AdjustmentType>('deposit')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(amount) || 0
    onSave({ id: uid(), date, type, amount: n, note: note || undefined })
  }

  const hint =
    type === 'wsop-fund-transfer'
      ? 'Positive = move this much from playing roll into the WSOP fund.'
      : type === 'withdrawal'
        ? 'Use a negative amount to reduce the roll.'
        : 'Positive adds to the roll, negative subtracts.'

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label>Type</label>
        <select className="select" value={type} onChange={(e) => setType(e.target.value as AdjustmentType)}>
          {ADJ_TYPES.map((t) => (
            <option key={t.v} value={t.v}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Amount</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{hint}</div>
      <div className="field">
        <label>Note</label>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-gold btn-block">
        Save adjustment
      </button>
      <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}
