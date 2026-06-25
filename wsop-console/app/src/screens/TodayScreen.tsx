import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { useToast } from '../components/Toast'
import { Sheet } from '../components/Sheet'
import { SessionForm } from '../components/SessionForm'
import type { Session, RoutineLog, ChecklistTick } from '../db/types'
import { todayISO, moneyK, fmtHours } from '../engine/format'
import { phaseState, getNudges } from '../engine/phase'
import { computeBankroll } from '../engine/bankroll'
import {
  cashHoursThisWeek,
  wakeAnchorStreak,
} from '../engine/analytics'

// Nudge ids that also map onto the RoutineLog (so streaks count).
const ROUTINE_MAP: Record<string, keyof RoutineLog> = {
  wake: 'wakeAnchor',
  winddown: 'windDown',
  meditation: 'meditation',
  movement: 'movement',
  'log-session': 'sessionLogged',
}

export function TodayScreen() {
  const { sessions, adjustments, settings, routine, checklist, put, putByDate } = useStore()
  const toast = useToast()
  const [logOpen, setLogOpen] = useState(false)
  const today = todayISO()

  const ps = phaseState(new Date(), settings.phaseOverride)
  const nudges = useMemo(
    () => getNudges(new Date(), settings.phaseOverride),
    [settings.phaseOverride],
  )

  const todayTicks = checklist.find((c) => c.date === today)?.items ?? {}
  const todayRoutine = routine.find((r) => r.date === today)

  const bankroll = useMemo(
    () => computeBankroll(sessions, adjustments, settings.startingRoll),
    [sessions, adjustments, settings.startingRoll],
  )
  const cashHrs = cashHoursThisWeek(sessions)
  const target = ps.phase?.weeklyCashHours ?? 0
  const anchor = wakeAnchorStreak(routine)

  const toggle = async (id: string) => {
    const next = !todayTicks[id]
    const tick: ChecklistTick = {
      date: today,
      items: { ...todayTicks, [id]: next },
    }
    await putByDate('checklist', tick)
    // Mirror keystone items into RoutineLog for streaks.
    const field = ROUTINE_MAP[id]
    if (field) {
      const r: RoutineLog = { ...(todayRoutine ?? { date: today }), [field]: next }
      await putByDate('routine', r)
    }
  }

  const save = async (s: Session) => {
    await put('sessions', s)
    // Logging a session satisfies the session nudge + routine flag.
    const tick: ChecklistTick = {
      date: today,
      items: { ...todayTicks, 'log-session': true },
    }
    await putByDate('checklist', tick)
    await putByDate('routine', { ...(todayRoutine ?? { date: today }), sessionLogged: true })
    setLogOpen(false)
    toast('Session logged')
  }

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="screen">
      <h1 className="screen-title">Today</h1>
      <div className="screen-sub">{dateLabel}</div>

      {/* Phase / week banner */}
      <div className="phase-banner">
        <div className="ph">
          {ps.phase
            ? `Phase ${ps.phase.id} · Week ${ps.week}`
            : ps.prePhase
              ? 'Pre-Phase 1'
              : 'Off-plan'}
        </div>
        <div className="ph-name">{ps.phase?.name ?? 'No active phase'}</div>
        <div className="ph-theme">
          {ps.phase?.theme ?? 'Set a phase override in Settings to preview the plan.'}
        </div>
      </div>

      {/* Quick stats */}
      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-label">Roll</div>
          <div className="stat-big" style={{ fontSize: 22 }}>{moneyK(bankroll.playingRoll)}</div>
        </div>
        <div className="card">
          <div className="card-label">Wk hrs</div>
          <div className="stat-big" style={{ fontSize: 22 }}>
            {fmtHours(cashHrs)}
            <span className="muted" style={{ fontSize: 13 }}>
              /{target || '—'}
            </span>
          </div>
        </div>
        <div className="card">
          <div className="card-label">Anchor</div>
          <div className="stat-big" style={{ fontSize: 22, color: 'var(--chip)' }}>
            {anchor}
            <span className="muted" style={{ fontSize: 13 }}>d</span>
          </div>
        </div>
      </div>

      {/* Log session CTA */}
      <button className="btn btn-primary btn-block" onClick={() => setLogOpen(true)} style={{ marginBottom: 16 }}>
        ◎ Log session
      </button>

      {/* Today checklist (active nudges, ramped) */}
      <div className="card">
        <div className="card-head">
          <span className="card-label">Today’s checklist</span>
          <span className="mono muted">{nudges.length} active</span>
        </div>
        {nudges.map((n) => {
          const done = !!todayTicks[n.id]
          return (
            <button
              key={n.id}
              className={`check${done ? ' done' : ''}`}
              onClick={() => toggle(n.id)}
              style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', textAlign: 'left' }}
            >
              <span className="box">{done ? '✓' : ''}</span>
              <span className="ctext">
                <div className="row-split">
                  <span>{n.title}</span>
                  <span className="ctime">{n.time}</span>
                </div>
                <div className="cbody">{n.body}</div>
              </span>
            </button>
          )
        })}
      </div>

      <div className="placeholder-note">
        Morning / evening <strong>routine checklists</strong> and the day-type
        template (cash / MTT / study / recovery) come from{' '}
        <code>phase-1-playbook.md</code> Parts 4 &amp; 5 — drop that doc in and
        wire it here (M4/M5).
      </div>

      <Sheet open={logOpen} onClose={() => setLogOpen(false)} title="Log session">
        <SessionForm onSave={save} onCancel={() => setLogOpen(false)} />
      </Sheet>
    </div>
  )
}
