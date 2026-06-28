// Health (M5) — rhythm/streaks + body metrics + study log. Consolidates the
// three M5 surfaces that don't fit the other tabs. Body metrics use the IDB
// `health` store, study the `study` store; routine/streaks come from the store
// context (`routine`). Sources: health-plan-wsop-2027.md, mental-health-and-game.md.

import { useEffect, useMemo, useState } from 'react'
import { getAll, putRecord } from '../db/idb'
import type { HealthMetric, StudyLog, RoutineLog, Session, BankrollAdjustment } from '../db/types'
import { useStore } from '../store'
import { useToast } from '../components/Toast'
import {
  wakeAnchorStreak,
  windDownStreak,
  downswingState,
  downswingSeverity,
} from '../engine/analytics'
import { computeBankroll, recommendStake } from '../engine/bankroll'
import { uid, todayISO, fmtDate, isThisWeek, moneyK } from '../engine/format'
import { DOWNSWING_PROTOCOL } from '../db/protocol'
import { NutritionView } from './NutritionView'

const STUDY_TYPES: StudyLog['type'][] = ['course', 'coaching', 'solver', 'library', 'review']

type HealthView = 'vitals' | 'food'

export function HealthScreen() {
  const { routine, putByDate, sessions, adjustments, settings } = useStore()
  const toast = useToast()
  const [view, setView] = useState<HealthView>('vitals')
  const [metrics, setMetrics] = useState<HealthMetric[]>([])
  const [study, setStudy] = useState<StudyLog[]>([])

  // Meditation has no nudge (the others are toggled from Today's checklist), so
  // it needs a manual logger here — otherwise the streak below is always 0.
  const today = todayISO()
  const todayRoutine = routine.find((r) => r.date === today)
  const medToday = !!todayRoutine?.meditation
  const toggleMed = async () => {
    await putByDate('routine', { ...(todayRoutine ?? { date: today }), meditation: !medToday })
  }

  const reload = async () => {
    const [h, s] = await Promise.all([getAll<HealthMetric>('health'), getAll<StudyLog>('study')])
    setMetrics(h.sort((a, b) => b.date.localeCompare(a.date)))
    setStudy(s.sort((a, b) => b.date.localeCompare(a.date)))
  }
  useEffect(() => {
    void reload()
  }, [])

  // ── Rhythm ──
  const wake = wakeAnchorStreak(routine)
  const wind = windDownStreak(routine)
  const weekRoutine = useMemo(() => {
    const wk = routine.filter((r) => isThisWeek(r.date))
    const count = (k: keyof RoutineLog) => wk.filter((r) => Boolean(r[k])).length
    return {
      wake: count('wakeAnchor'),
      wind: count('windDown'),
      move: count('movement'),
      med: count('meditation'),
    }
  }, [routine])

  return (
    <div className="screen">
      <h1 className="screen-title">Health</h1>
      <div className="screen-sub">rhythm · body · study · food</div>

      <div className="pill-row">
        <button className={`pill${view === 'vitals' ? ' on' : ''}`} onClick={() => setView('vitals')}>
          Vitals
        </button>
        <button className={`pill${view === 'food' ? ' on' : ''}`} onClick={() => setView('food')}>
          Food
        </button>
      </div>

      {view === 'food' && <NutritionView />}

      {view === 'vitals' && (
        <>
      {/* Rhythm */}
      <div className="card">
        <div className="card-label" style={{ marginBottom: 12 }}>
          Rhythm
        </div>
        <div className="stat-row" style={{ marginBottom: 14 }}>
          <div className="card card-2">
            <div className="card-label">Wake-anchor streak</div>
            <div className="stat-big">
              {wake}
              <span style={{ fontSize: 14, color: 'var(--muted)' }}> d</span>
            </div>
          </div>
          <div className="card card-2">
            <div className="card-label">Wind-down streak</div>
            <div className="stat-big">
              {wind}
              <span style={{ fontSize: 14, color: 'var(--muted)' }}> d</span>
            </div>
          </div>
        </div>
        <div className="hl-week">
          {([
            ['Wake', weekRoutine.wake],
            ['Wind-down', weekRoutine.wind],
            ['Movement', weekRoutine.move],
            ['Meditation', weekRoutine.med],
          ] as const).map(([label, n]) => (
            <div className="hl-wk" key={label}>
              <div className="hl-wk-n mono">{n}/7</div>
              <div className="hl-wk-l">{label}</div>
            </div>
          ))}
        </div>
        <button
          className={`check${medToday ? ' done' : ''}`}
          onClick={toggleMed}
          style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', marginTop: 10 }}
        >
          <span className="box">{medToday ? '✓' : ''}</span>
          <span className="ctext">Meditation floor — today</span>
        </button>
      </div>

      <BodyMetrics metrics={metrics} onSaved={reload} toast={toast} />
      <StudyCard study={study} onSaved={reload} toast={toast} />
      <DownswingCard sessions={sessions} adjustments={adjustments} startingRoll={settings.startingRoll} />
        </>
      )}
    </div>
  )
}

function BodyMetrics({
  metrics,
  onSaved,
  toast,
}: {
  metrics: HealthMetric[]
  onSaved: () => Promise<void>
  toast: (m: string) => void
}) {
  const [date, setDate] = useState(todayISO())
  const [weight, setWeight] = useState('')
  const [waist, setWaist] = useState('')
  const [sleep, setSleep] = useState('')
  const [rhr, setRhr] = useState('')

  const latest = metrics[0]
  const prevWeight = metrics.find((m) => m.weight != null && m !== latest)?.weight
  const wDelta =
    latest?.weight != null && prevWeight != null ? latest.weight - prevWeight : null

  const save = async () => {
    if (!weight && !waist && !sleep && !rhr) {
      toast('Nothing entered yet')
      return
    }
    const m: HealthMetric = {
      id: uid(),
      date,
      weight: weight ? Number(weight) : undefined,
      waist: waist ? Number(waist) : undefined,
      sleepHours: sleep ? Number(sleep) : undefined,
      rhr: rhr ? Number(rhr) : undefined,
    }
    await putRecord('health', m)
    setWeight('')
    setWaist('')
    setSleep('')
    setRhr('')
    await onSaved()
    toast('Logged ✓')
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-label">Body metrics</div>
        {latest?.weight != null && (
          <div className="mono" style={{ fontSize: 13 }}>
            {latest.weight} lb
            {wDelta != null && (
              <span className={wDelta <= 0 ? 'pos' : 'neg'} style={{ marginLeft: 6 }}>
                {wDelta <= 0 ? '▼' : '▲'} {Math.abs(wDelta).toFixed(1)}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="field" style={{ maxWidth: 200 }}>
        <label>Date</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Weight (lb)</label>
          <input className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="field">
          <label>Waist (in)</label>
          <input className="input" inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Sleep (hrs)</label>
          <input className="input" inputMode="decimal" value={sleep} onChange={(e) => setSleep(e.target.value)} />
        </div>
        <div className="field">
          <label>Resting HR</label>
          <input className="input" inputMode="numeric" value={rhr} onChange={(e) => setRhr(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-primary btn-block" onClick={save}>
        Log metrics
      </button>
      {metrics.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {metrics.slice(0, 5).map((m) => (
            <div className="hl-row" key={m.id}>
              <span className="muted mono">{fmtDate(m.date)}</span>
              <span className="mono">
                {[
                  m.weight != null ? `${m.weight}lb` : null,
                  m.waist != null ? `${m.waist}in` : null,
                  m.sleepHours != null ? `${m.sleepHours}h` : null,
                  m.rhr != null ? `${m.rhr}bpm` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StudyCard({
  study,
  onSaved,
  toast,
}: {
  study: StudyLog[]
  onSaved: () => Promise<void>
  toast: (m: string) => void
}) {
  const [type, setType] = useState<StudyLog['type']>('solver')
  const [detail, setDetail] = useState('')

  const save = async () => {
    if (!detail.trim()) {
      toast('Add a detail first')
      return
    }
    const s: StudyLog = { id: uid(), date: todayISO(), type, detail: detail.trim() }
    await putRecord('study', s)
    setDetail('')
    await onSaved()
    toast('Study logged ✓')
  }

  return (
    <div className="card">
      <div className="card-label" style={{ marginBottom: 12 }}>
        Study log
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: '0 0 38%' }}>
          <label>Type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as StudyLog['type'])}>
            {STUDY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>What</label>
          <input
            className="input"
            value={detail}
            placeholder="PLO module 3, solver dev…"
            onChange={(e) => setDetail(e.target.value)}
          />
        </div>
      </div>
      <button className="btn btn-block" onClick={save}>
        Log study
      </button>
      {study.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {study.slice(0, 6).map((s) => (
            <div className="hl-row" key={s.id}>
              <span className="muted mono">{fmtDate(s.date)}</span>
              <span>
                <span className="tag">{s.type}</span>
                {s.detail}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const SWING_LABEL = {
  none: { label: 'Steady', color: 'var(--good)' },
  watch: { label: 'Rough patch', color: 'var(--warn)' },
  deep: { label: 'In a downswing', color: 'var(--bad)' },
} as const

// The written downswing protocol — always here to review while calm, with a
// live state badge driven by the cash logs. "A math event, not a verdict."
function DownswingCard({
  sessions,
  adjustments,
  startingRoll,
}: {
  sessions: Session[]
  adjustments: BankrollAdjustment[]
  startingRoll: number
}) {
  const roll = computeBankroll(sessions, adjustments, startingRoll).playingRoll
  const buyIn = recommendStake(roll).sit?.buyIn ?? 0
  const state = downswingState(sessions)
  const level = downswingSeverity(state, buyIn)
  const s = SWING_LABEL[level]

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-label">Downswing protocol</span>
        <span className="mono" style={{ fontSize: 13, color: s.color, fontWeight: 700 }}>
          {s.label}
        </span>
      </div>
      {level !== 'none' && (
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          {state.lossStreak >= 2 ? `${state.lossStreak} losing sessions · ` : ''}
          {state.drawdown > 0 ? `${moneyK(state.drawdown)} off your peak. ` : ''}
          Run the protocol — it’s why you wrote it down ahead of time.
        </div>
      )}
      {DOWNSWING_PROTOCOL.map((p, i) => (
        <div key={p.title} className="ladder-step" style={{ padding: '9px 0', alignItems: 'flex-start' }}>
          <span className="mono muted" style={{ fontSize: 12, marginRight: 8, minWidth: 16 }}>{i + 1}</span>
          <div className="ladder-meta">
            <div className="ladder-name">{p.title}</div>
            <div className="muted" style={{ fontSize: 13 }}>{p.body}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
