import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { useToast } from '../components/Toast'
import { Sheet } from '../components/Sheet'
import { SessionForm } from '../components/SessionForm'
import { HomeCard } from './HomeCard'
import { getRecord, putRecord } from '../db/idb'
import { readIntention, saveIntention } from '../db/intention'
import {
  readLive,
  saveLive,
  clearLive,
  elapsedHalfHours,
  elapsedLabel,
  type LiveSession,
} from '../db/liveSession'
import type { StudyLog } from '../db/types'
import type { Session, RoutineLog, ChecklistTick } from '../db/types'
import { todayISO, moneyK, money, fmtHours, daysSince, daysUntil, uid } from '../engine/format'
import { PHASES } from '../db/seed'
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
  const { sessions, adjustments, settings, routine, checklist, reviews, reloadAll } = useStore()
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

  // Close the review loop: the Sunday review's "one thing to tighten" sits here
  // all week instead of being written once and never seen again.
  const focus = useMemo(() => {
    const r = reviews[0] // store keeps reviews date-desc
    if (!r?.oneThing) return null
    const days = daysSince(r.date)
    return days != null && days <= 9 ? r.oneThing : null
  }, [reviews])

  // ── Live session mode: clock + stop-loss + hand capture, in the moment ──
  const [live, setLive] = useState<LiveSession | null>(() => readLive())
  const [handNote, setHandNote] = useState('')
  // Re-render every 30s while live so the elapsed label ticks.
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setLive((cur) => (cur ? { ...cur } : cur)), 30_000)
    return () => clearInterval(t)
  }, [live?.startedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateLive = (next: LiveSession) => {
    saveLive(next)
    setLive(next)
  }
  const startLive = () => updateLive({ startedAt: new Date().toISOString(), hands: [] })
  const addHand = () => {
    if (!live) return
    const note = handNote.trim()
    if (!note) return
    updateLive({ ...live, hands: [...live.hands, note] })
    setHandNote('')
  }
  const discardLive = () => {
    if (confirm('Discard this live session? (Nothing gets logged.)')) {
      clearLive()
      setLive(null)
    }
  }

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
      // Close out a live session: captured hands become study-log review items.
      const liveNow = readLive()
      if (liveNow) {
        for (const note of liveNow.hands) {
          const entry: StudyLog = { id: uid(), date: today, type: 'review', detail: `Hand: ${note}` }
          await putRecord('study', entry)
        }
        clearLive()
        setLive(null)
        if (liveNow.hands.length) toast(`${liveNow.hands.length} hand(s) queued for review`)
      }
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
        {(() => {
          // The countdown line — the marathon, made visible.
          const wsop = PHASES.find((p) => p.id === 5)
          const wsopDays = wsop ? daysUntil(wsop.start) : -1
          const bits: string[] = []
          if (wsopDays > 0) bits.push(`WSOP 2027 in ${wsopDays}d`)
          if (ps.prePhase) {
            const d = daysUntil(PHASES[0].start)
            if (d > 0) bits.push(`Phase 1 in ${d}d`)
          } else if (ps.phase && ps.phase.id < 6) {
            const next = PHASES.find((p) => p.id === ps.phase!.id + 1)
            const d = next ? daysUntil(next.start) : 0
            if (d > 0) bits.push(`${next!.name} in ${d}d`)
          }
          return bits.length ? (
            <div className="mono muted" style={{ fontSize: 11, marginTop: 8 }}>{bits.join(' · ')}</div>
          ) : null
        })()}
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

      {/* This week's focus — the Sunday review's "one thing to tighten" */}
      {focus && (
        <div
          style={{
            fontSize: 13,
            margin: '0 0 14px',
            padding: '9px 11px',
            borderRadius: 8,
            border: '1px solid var(--chip)',
          }}
        >
          <span className="card-label" style={{ marginRight: 8 }}>This week</span>
          {focus}
        </div>
      )}

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

      {/* Tonight's game — one-line read of the bankroll rules + the pre-session
          intention (playbook W1: set it BEFORE you sit, not at log time) */}
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
          <IntentionInput date={today} />
        </div>
      )}

      {/* Live session / log CTA */}
      {live ? (
        <div className="card" style={{ marginBottom: 16, border: '1px solid var(--chip)' }}>
          <div className="row-split" style={{ alignItems: 'baseline', marginBottom: 8 }}>
            <span className="card-label">● Live session</span>
            <span className="stat-big mono" style={{ fontSize: 20 }}>{elapsedLabel(live.startedAt)}</span>
          </div>
          <div className="field-row" style={{ alignItems: 'center', marginBottom: 8 }}>
            <label className="muted" style={{ fontSize: 13, flex: 1 }}>
              Stop-loss{live.stopLoss ? `: walk at −${money(live.stopLoss)}` : ' (set the line)'}
            </label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              placeholder="$"
              style={{ flex: '0 0 100px' }}
              value={live.stopLoss || ''}
              onChange={(e) => updateLive({ ...live, stopLoss: Number(e.target.value) || undefined })}
            />
          </div>
          <div className="field-row" style={{ marginBottom: 8 }}>
            <input
              className="input"
              placeholder="Hand to review — jot it now, study it later…"
              value={handNote}
              onChange={(e) => setHandNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addHand()}
            />
            <button className="btn" style={{ flex: '0 0 auto' }} onClick={addHand}>+</button>
          </div>
          {live.hands.length > 0 && (
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              {live.hands.length} hand{live.hands.length === 1 ? '' : 's'} queued for review
            </div>
          )}
          <div className="field-row">
            <button className="btn btn-primary btn-block" onClick={() => setLogOpen(true)}>
              ■ End session
            </button>
            <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} onClick={discardLive}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <div className="field-row" style={{ marginBottom: 16 }}>
          <button className="btn btn-primary btn-block" onClick={startLive}>
            ▶ Start session
          </button>
          <button className="btn btn-block" onClick={() => setLogOpen(true)}>
            ◎ Log past
          </button>
        </div>
      )}

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

      <Sheet open={logOpen} onClose={() => setLogOpen(false)} title={live ? 'End session' : 'Log session'}>
        <SessionForm
          draft={live ? { date: today, hours: elapsedHalfHours(live.startedAt) } : undefined}
          onSave={save}
          onCancel={() => setLogOpen(false)}
        />
      </Sheet>
    </div>
  )
}

// The pre-session intention — one line, set before you sit. The post-session
// two-line journal (SessionForm) closes the loop against it.
function IntentionInput({ date }: { date: string }) {
  const [text, setText] = useState(() => readIntention(date))
  const save = (v: string) => {
    setText(v)
    saveIntention(date, v)
  }
  return (
    <input
      className="input"
      style={{ marginTop: 8, fontSize: 13 }}
      placeholder="Tonight’s intention — one line, before you sit…"
      value={text}
      onChange={(e) => save(e.target.value)}
    />
  )
}
