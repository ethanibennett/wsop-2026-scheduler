// Training (M3) — ported from reference/lift-log.html, backed by IndexedDB
// (lifts / benchmarks / prehab stores) instead of the prototype's window.storage.
// Mon/Wed/Fri sessions with the real lift menu, last-session reference +
// progressive-overload, a pre-op/build mode toggle, benchmarks, prehab, history.
// Lift menu + benchmarks from docs/plan/training-plan.md.

import { useEffect, useMemo, useState } from 'react'
import { getAll, putRecord } from '../db/idb'
import type { LiftEntry, Benchmark, PrehabTick } from '../db/types'
import { uid, todayISO, fmtDate } from '../engine/format'
import { liftStats, trainingConsistency, type LiftStats } from '../engine/training'
import { useToast } from '../components/Toast'

type DayKey = 'mon' | 'wed' | 'fri'
type Tab = DayKey | 'bench' | 'hist'
type Mode = 'preop' | 'build'

interface LiftDef {
  slug: string
  name: string
}
interface SessionDef {
  title: string
  lifts: LiftDef[]
  prehab: string[]
}

const SESSIONS: Record<DayKey, SessionDef> = {
  mon: {
    title: 'Monday',
    lifts: [
      { slug: 'leg-press', name: 'Leg press' },
      { slug: 'hip-thrust', name: 'Hip thrust' },
      { slug: 'machine-chest', name: 'Machine / DB chest press' },
      { slug: 'cs-row', name: 'Chest-supported row' },
      { slug: 'pallof', name: 'Pallof press' },
    ],
    prehab: ['Calf raises', 'Step-downs', 'Glute-med', 'Face pulls'],
  },
  wed: {
    title: 'Wednesday',
    lifts: [
      { slug: 'split-squat', name: 'Bulgarian split squat' },
      { slug: 'leg-curl', name: 'Leg curl + back ext' },
      { slug: 'incline-db', name: 'Incline DB press' },
      { slug: 'lat-pulldown', name: 'Lat pulldown' },
      { slug: 'dead-bug', name: 'Dead bug' },
    ],
    prehab: ['Seated calf', 'Spanish squat / TKE', 'Foot work', 'Face pulls'],
  },
  fri: {
    title: 'Friday',
    lifts: [
      { slug: 'goblet-squat', name: 'Goblet / hack squat' },
      { slug: 'hinge-fri', name: 'Trap-bar DL (build) / Leg curl (pre-op)' },
      { slug: 'db-shoulder', name: 'DB shoulder press' },
      { slug: 'cable-row', name: 'Seated cable row' },
      { slug: 'bird-dog', name: 'Bird dog' },
    ],
    prehab: ['Calf raises', 'Step-downs', 'Face pulls'],
  },
}

interface BenchDef {
  slug: string
  name: string
  unit: string
}
const BENCHMARKS: BenchDef[] = [
  { slug: 'pushups', name: 'Push-ups (max)', unit: 'reps' },
  { slug: 'pullups', name: 'Pull-ups (max)', unit: 'reps' },
  { slug: 'plank', name: 'Plank hold', unit: 'sec' },
  { slug: 'squat-hold', name: 'Deep-squat hold', unit: 'sec' },
  { slug: 'toe-touch', name: 'Toe-touch reach', unit: 'cm +/-' },
  { slug: 'bodyweight', name: 'Bodyweight', unit: 'lb' },
  { slug: 'waist', name: 'Waist', unit: 'in' },
]

const LIFT_NAME: Record<string, string> = Object.fromEntries(
  Object.values(SESSIONS).flatMap((s) => s.lifts.map((l) => [l.slug, l.name])),
)

function fmtLift(e: LiftEntry): string {
  const parts: string[] = []
  if (e.weight) parts.push(`${e.weight}lb`)
  if (e.reps) parts.push(`×${e.reps}`)
  const tail = parts.join(' ')
  return (e.sets ? `${e.sets} sets ` : '') + tail
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'mon', label: 'Mon' },
  { id: 'wed', label: 'Wed' },
  { id: 'fri', label: 'Fri' },
  { id: 'bench', label: 'Bench' },
  { id: 'hist', label: 'History' },
]

export function TrainingScreen() {
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('build')
  const [tab, setTab] = useState<Tab>('mon')
  const [lifts, setLifts] = useState<LiftEntry[]>([])
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([])

  const reload = async () => {
    const [l, b] = await Promise.all([getAll<LiftEntry>('lifts'), getAll<Benchmark>('benchmarks')])
    // getAll returns key (random uuid) order — add an id tiebreaker so same-date
    // ordering (and the "last set" reference it feeds) is stable across reloads.
    setLifts(l.sort((a, c) => a.date.localeCompare(c.date) || a.id.localeCompare(c.id)))
    setBenchmarks(b.sort((a, c) => a.date.localeCompare(c.date) || a.id.localeCompare(c.id)))
  }
  useEffect(() => {
    void reload()
  }, [])

  const lastBench = (slug: string): Benchmark | null => {
    const a = benchmarks.filter((e) => e.slug === slug)
    return a.length ? a[a.length - 1] : null
  }

  return (
    <div className="screen">
      <h1 className="screen-title">Training</h1>
      {(() => {
        const c = trainingConsistency(lifts)
        return (
          <div className="screen-sub">
            Phase 1 · strength log
            {lifts.length > 0 && (
              <span className="mono muted"> · {c.thisWeek} this wk{c.weekStreak >= 2 ? ` · ${c.weekStreak}-wk streak` : ''}</span>
            )}
          </div>
        )
      })()}

      <div className="pill-row" style={{ marginBottom: 12 }}>
        <span className="card-label" style={{ alignSelf: 'center', marginRight: 2 }}>
          Mode
        </span>
        <button className={`pill${mode === 'preop' ? ' on' : ''}`} onClick={() => setMode('preop')}>
          Pre-op (light)
        </button>
        <button className={`pill${mode === 'build' ? ' on' : ''}`} onClick={() => setMode('build')}>
          Build
        </button>
      </div>

      <div className="tr-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tr-tab${tab === t.id ? ' on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'bench' ? (
        <BenchPanel benchmarks={BENCHMARKS} lastOf={lastBench} onSaved={reload} toast={toast} />
      ) : tab === 'hist' ? (
        <HistoryPanel lifts={lifts} />
      ) : (
        <SessionPanel
          key={tab + mode}
          day={tab}
          mode={mode}
          statsOf={(slug) => liftStats(lifts, slug)}
          onSaved={reload}
          toast={toast}
        />
      )}
    </div>
  )
}

function SessionPanel({
  day,
  mode,
  statsOf,
  onSaved,
  toast,
}: {
  day: DayKey
  mode: Mode
  statsOf: (slug: string) => LiftStats
  onSaved: () => Promise<void>
  toast: (m: string) => void
}) {
  const S = SESSIONS[day]
  const [date, setDate] = useState(todayISO())
  const [vals, setVals] = useState<Record<string, { weight: string; reps: string; sets: string }>>({})
  const [prehab, setPrehab] = useState<Record<number, boolean>>({})

  const setField = (slug: string, f: 'weight' | 'reps' | 'sets', v: string) =>
    setVals((s) => {
      const cur = s[slug] ?? { weight: '', reps: '', sets: '' }
      return { ...s, [slug]: { ...cur, [f]: v } }
    })

  const save = async () => {
    const entries: LiftEntry[] = []
    for (const l of S.lifts) {
      const v = vals[l.slug]
      if (v && (v.weight || v.reps || v.sets)) {
        entries.push({
          id: uid(),
          date,
          liftSlug: l.slug,
          weight: v.weight ? Number(v.weight) : undefined,
          reps: v.reps ? Number(v.reps) : undefined,
          sets: v.sets ? Number(v.sets) : undefined,
        })
      }
    }
    if (!entries.length) {
      toast('Nothing entered yet')
      return
    }
    for (const e of entries) await putRecord('lifts', e)
    const items: Record<string, boolean> = {}
    S.prehab.forEach((name, i) => {
      if (prehab[i]) items[name] = true
    })
    // Composite key (date:day) so Mon + Wed logged on one calendar date don't
    // overwrite each other (the store is keyed by `date`).
    const tick: PrehabTick = { date: `${date}:${day}`, day, items }
    await putRecord('prehab', tick)
    setVals({})
    setPrehab({})
    await onSaved()
    toast(`${S.title}'s session saved ✓`)
  }

  return (
    <>
      <div className="field" style={{ maxWidth: 200 }}>
        <label>Session date</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {mode === 'preop' && (
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 12px' }}>
          Pre-op: light, supported, submaximal — groove the pattern, no heavy bracing or
          breath-holding. Core stays gentle (stop at any pull near the site).
        </p>
      )}

      {S.lifts.map((l) => {
        const st = statsOf(l.slug)
        const last = st.last
        const v = vals[l.slug] ?? { weight: '', reps: '', sets: '' }
        return (
          <div className="tr-lift" key={l.slug}>
            <div className="tr-ln">
              {l.name}
              {st.lastIsPR && (
                <span className="tag pos" style={{ marginLeft: 6 }}>PR</span>
              )}
            </div>
            <div className="tr-last">
              {last ? (
                <>
                  last: <b>{fmtLift(last)}</b> · {last.date}
                  {st.best && st.best !== last && (
                    <> · best: <b>{fmtLift(st.best)}</b></>
                  )}
                </>
              ) : (
                'last: —'
              )}
            </div>
            <div className="tr-inputs">
              {(['weight', 'reps', 'sets'] as const).map((f) => (
                <div className="tr-fld" key={f}>
                  <label>{f}</label>
                  <input
                    inputMode={f === 'weight' ? 'decimal' : 'numeric'}
                    value={v[f]}
                    placeholder={last && last[f] != null ? String(last[f]) : '—'}
                    onChange={(e) => setField(l.slug, f, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <div className="tr-prehab">
        <div className="tr-ph-t">Prehab — tick when done</div>
        <div className="tr-chk">
          {S.prehab.map((x, i) => (
            <button
              key={x}
              className={prehab[i] ? 'done' : ''}
              onClick={() => setPrehab((s) => ({ ...s, [i]: !s[i] }))}
            >
              {x}
            </button>
          ))}
        </div>
      </div>

      <button className="btn btn-primary btn-block" onClick={save}>
        Save {S.title}'s session
      </button>
    </>
  )
}

function BenchPanel({
  benchmarks,
  lastOf,
  onSaved,
  toast,
}: {
  benchmarks: BenchDef[]
  lastOf: (slug: string) => Benchmark | null
  onSaved: () => Promise<void>
  toast: (m: string) => void
}) {
  const [date, setDate] = useState(todayISO())
  const [vals, setVals] = useState<Record<string, string>>({})

  const save = async () => {
    const entries: Benchmark[] = []
    for (const b of benchmarks) {
      const v = vals[b.slug]
      if (v) entries.push({ id: uid(), date, slug: b.slug, value: Number(v) })
    }
    if (!entries.length) {
      toast('Nothing entered yet')
      return
    }
    for (const e of entries) await putRecord('benchmarks', e)
    setVals({})
    await onSaved()
    toast('Benchmarks saved ✓')
  }

  return (
    <>
      <div className="field" style={{ maxWidth: 200 }}>
        <label>Date</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {benchmarks.map((b) => {
        const last = lastOf(b.slug)
        return (
          <div className="tr-lift" key={b.slug}>
            <div className="tr-ln">{b.name}</div>
            <div className="tr-last">
              {last ? (
                <>
                  last: <b>{last.value} {b.unit}</b> · {last.date}
                </>
              ) : (
                'last: —'
              )}
            </div>
            <div className="tr-inputs" style={{ gridTemplateColumns: '1fr' }}>
              <div className="tr-fld">
                <label>{b.unit}</label>
                <input
                  inputMode="decimal"
                  value={vals[b.slug] ?? ''}
                  placeholder={last ? String(last.value) : '—'}
                  onChange={(e) => setVals((s) => ({ ...s, [b.slug]: e.target.value }))}
                />
              </div>
            </div>
          </div>
        )
      })}
      <button className="btn btn-primary btn-block" onClick={save}>
        Save benchmarks
      </button>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 10 }}>
        Retest at each phase boundary. The scale understates fat loss while you build — read weight +
        waist together.
      </p>
    </>
  )
}

function HistoryPanel({ lifts }: { lifts: LiftEntry[] }) {
  const bySlug = useMemo(() => {
    const m = new Map<string, LiftEntry[]>()
    for (const e of lifts) {
      const a = m.get(e.liftSlug) ?? []
      a.push(e)
      m.set(e.liftSlug, a)
    }
    return m
  }, [lifts])

  if (!bySlug.size) {
    return (
      <div className="empty">
        <div className="big">⬓</div>
        No sessions logged yet. Your lift history and progression will build here.
      </div>
    )
  }
  return (
    <>
      {[...bySlug.entries()].map(([slug, entries]) => {
        const recent = entries.slice().reverse().slice(0, 8)
        return (
          <div className="card" key={slug}>
            <div className="card-label" style={{ marginBottom: 8 }}>
              {LIFT_NAME[slug] ?? slug}
            </div>
            {recent.map((e) => (
              <div className="tr-hrow" key={e.id}>
                <span className="muted mono">{fmtDate(e.date)}</span>
                <span className="mono">{fmtLift(e) || '—'}</span>
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
