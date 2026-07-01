import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { useToast } from '../components/Toast'
import { Sheet } from '../components/Sheet'
import { SessionForm } from '../components/SessionForm'
import { HomeCard } from './HomeCard'
import { getRecord, putRecord } from '../db/idb'
import type { Session, RoutineLog, ChecklistTick } from '../db/types'
import { todayISO, moneyK, fmtHours, daysSince } from '../engine/format'
import { phaseState, getNudges } from '../engine/phase'
import { computeBankroll, recommendStake } from '../engine/bankroll'
import {
  cashHoursThisWeek,
  wakeAnchorStreak,
  downswingState,
  downswingSeverity,
} from '../engine/analytics'

// Nudge ids that also map onto the RoutineLog (so streaks count).
// Keys MUST match the BASE_NUDGES ids (seed.ts) — they were renamed and this
// map was left stale, which silently broke the wake-anchor streak. Caffeine
// cutoff + weekly review have no routine-streak field, so they're not mapped.
const ROUTINE_MAP: Record<string, keyof RoutineLog> = {
  'wake-anchor': 'wakeAnchor',
  'session-cap': 'windDown',
  'movement-floor': 'movement',
}

export function TodayScreen() {
  const { sessions, adjustments, settings, routine, checklist, reloadAll } = useStore()
  const toast = useToast()
  const [logOpen, setLogOpen] = useState(false)
  const today = todayISO()

  // Serialize mutations so rapid taps can't clobber each other: each op reads
  // the freshest persisted record (not a stale render closure) before merging.
  const writeChain = useRef<Promise<unknown>>(Promise.resolve())
  const enqueue = (op: () => Promise<void>) => {
    const run = writeChain.current.then(op, op)
    writeChain.current = run
    return run
  }

  const ps = phaseState(new Date(), settings.phaseOverride)
  const nudges = useMemo(
    () => getNudges(new Date(), settings.phaseOverride),
    [settings.phaseOverride],
  )

  const todayTicks = checklist.find((c) => c.date === today)?.items ?? {}

  const bankroll = useMemo(
    () => computeBankroll(sessions, adjustments, settings.startingRoll),
    [sessions, adjustments, settings.startingRoll],
  )
  const cashHrs = cashHoursThisWeek(sessions)
  const target = ps.phase?.weeklyCashHours ?? 0
  const anchor = wakeAnchorStreak(routine)
  const rec = useMemo(() => recommendStake(bankroll.playingRoll), [bankroll.playingRoll])
  const swing = useMemo(() => downswingState(sessions), [sessions])
  const swingLevel = downswingSeverity(swing, rec.sit?.buyIn ?? 0)

  // Backup reminder: local-first data has no safety net but a manual export.
  const backupDays = daysSince(settings.lastBackupAt)
  const backupOverdue = sessions.length > 0 && (backupDays == null || backupDays >= 14)

  const toggle = (id: string) =>
    enqueue(async () => {
      const cur =
        (await getRecord<ChecklistTick>('checklist', today)) ?? { date: today, items: {} }
      const next = !cur.items[id]
      await putRecord('checklist', { date: today, items: { ...cur.items, [id]: next } })
      // Mirror keystone items into RoutineLog for streaks.
      const field = ROUTINE_MAP[id]
      if (field) {
        const r = (await getRecord<RoutineLog>('routine', today)) ?? { date: today }
        await putRecord('routine', { ...r, [field]: next })
      }
      await reloadAll()
    })

  const save = (s: Session) =>
    enqueue(async () => {
      await putRecord('sessions', s)
      // Logging a session sets the routine flag (no 'log-session' nudge exists —
      // the old orphan checklist tick was dead weight, so it's gone).
      const r = (await getRecord<RoutineLog>('routine', today)) ?? { date: today }
      await putRecord('routine', { ...r, sessionLogged: true })
      await reloadAll()
      setLogOpen(false)
      toast('Session logged')
    })

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="screen">
      <h1 className="screen-title">Today</h1>
      <div className="screen-sub">{dateLabel}</div>

      {backupOverdue && (
        <div
          style={{
            fontSize: 13,
            margin: '0 0 14px',
            padding: '9px 11px',
            borderRadius: 8,
            border: '1px solid var(--bad)',
            color: 'var(--bad)',
          }}
        >
          ⚠ Backup overdue
          {backupDays == null ? ' — never exported' : ` — ${backupDays} days`}. Settings →
          Export JSON.
        </div>
      )}

      {sessions.length === 0 && (
        <div className="card">
          <div className="card-label" style={{ marginBottom: 8 }}>Getting started</div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            <div>1 · Set your starting roll in <strong>Settings</strong>.</div>
            <div>2 · Log a session with <strong>◎ Log session</strong> (try a preset).</div>
            <div>3 · Set <strong>Ellie home/away</strong> on the Home card below.</div>
            <div>4 · Drop your <strong>Oura sleep score</strong> into Health → Body metrics.</div>
            <div>5 · Watch it all come together on the <strong>Dash</strong> tab.</div>
          </div>
        </div>
      )}

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

      {/* Downswing circuit-breaker */}
      {swingLevel !== 'none' && (
        <div
          style={{
            fontSize: 13,
            margin: '0 0 14px',
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px solid ${swingLevel === 'deep' ? 'var(--bad)' : 'var(--warn)'}`,
            color: swingLevel === 'deep' ? 'var(--bad)' : 'var(--warn)',
          }}
        >
          <strong>{swingLevel === 'deep' ? 'In a downswing' : 'Rough patch'}</strong>
          {swing.lossStreak >= 2 ? ` · ${swing.lossStreak} losing sessions` : ''}
          {swing.drawdown > 0 ? ` · ${moneyK(swing.drawdown)} off peak` : ''}. It’s math, not a
          verdict — hold the rules, don’t chase{rec.belowFloor !== 'none' ? ', move down' : ''}.
          Protocol in Health.
        </div>
      )}

      {/* Tonight's game — one-line read of the bankroll rules */}
      {rec.sit && rec.belowFloor !== 'hard' && (
        <div className="card" style={{ marginBottom: 14, padding: '10px 12px' }}>
          <div className="row-split" style={{ alignItems: 'baseline' }}>
            <span className="card-label">Tonight</span>
            <span className="mono" style={{ fontSize: 13 }}>
              sit <strong>{rec.sit.name}</strong>
              {rec.shotEarmark > 0 && rec.next ? ` · shot ${rec.next.name}` : ''}
              {rec.belowFloor === 'soft' ? ' · ▼ rebuild' : ''}
            </span>
          </div>
        </div>
      )}

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

      {/* Home — household contributions, surfaced so they don't fall on Ellie */}
      <HomeCard />

      <Sheet open={logOpen} onClose={() => setLogOpen(false)} title="Log session">
        <SessionForm onSave={save} onCancel={() => setLogOpen(false)} />
      </Sheet>
    </div>
  )
}
