// The Home card on Today — household contributions, so the remembering doesn't
// fall on Ellie. Three lists behind a toggle:
//   Today   — rotation-aware suggestions (built-in + your regulars), tap to do
//   Regular — your own recurring tasks (+ the built-in library for reference)
//   Needs doing — a longer-term backlog of one-offs that persist until done
// All state in localStorage (date-keyed checklist + two editable lists).

import { useMemo, useState } from 'react'
import { useStore } from '../store'
import {
  todaysHome,
  homeContribution,
  mentalPromptFor,
  customRegularsToTasks,
  type CustomRegular,
} from '../engine/home'
import { CATEGORY_META, HOME_LIBRARY, type HomeCadence, type HomeCategory } from '../db/home'
import { updateAppBadge } from '../db/badge'
import { todayISO, isThisWeek, uid } from '../engine/format'

const DONE_KEY = 'wsop-home-done' // { [dateISO]: taskId[] }
const REGULAR_KEY = 'wsop-home-regular' // CustomRegular[]
const BACKLOG_KEY = 'wsop-home-backlog' // BacklogItem[]
const LEGACY_TODOS = 'wsop-home-todos' // migrated → backlog

type DoneMap = Record<string, string[]>
interface BacklogItem {
  id: string
  title: string
  note?: string
  done: boolean
  created: string
}
type Section = 'today' | 'regular' | 'todo'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

// One-time migration of the old flat quick-adds into the backlog.
function initialBacklog(): BacklogItem[] {
  const current = load<BacklogItem[]>(BACKLOG_KEY, [])
  const legacy = load<{ id: string; title: string; done: boolean; date?: string }[]>(LEGACY_TODOS, [])
  if (legacy.length && current.length === 0) {
    const migrated = legacy.map((t) => ({
      id: t.id,
      title: t.title,
      done: t.done,
      created: t.date ?? todayISO(),
    }))
    localStorage.setItem(BACKLOG_KEY, JSON.stringify(migrated))
    localStorage.removeItem(LEGACY_TODOS)
    return migrated
  }
  return current
}

const CADENCES: HomeCadence[] = ['daily', 'weekly']
const CATEGORIES: HomeCategory[] = ['load', 'errand', 'mental', 'connection']

export function HomeCard() {
  const { settings, updateSettings } = useStore()
  const away = !!settings.ellieAway
  const today = todayISO()

  const [section, setSection] = useState<Section>('today')
  const [doneMap, setDoneMap] = useState<DoneMap>(() => load<DoneMap>(DONE_KEY, {}))
  const [regulars, setRegulars] = useState<CustomRegular[]>(() => load<CustomRegular[]>(REGULAR_KEY, []))
  const [backlog, setBacklog] = useState<BacklogItem[]>(initialBacklog)

  const doneToday = useMemo(() => new Set(doneMap[today] ?? []), [doneMap, today])
  const doneThisWeek = useMemo(() => {
    const s = new Set<string>()
    for (const [date, ids] of Object.entries(doneMap)) {
      if (isThisWeek(date)) ids.forEach((id) => s.add(id))
    }
    return s
  }, [doneMap])

  const library = useMemo(() => [...HOME_LIBRARY, ...customRegularsToTasks(regulars)], [regulars])
  const suggestions = useMemo(
    () => todaysHome({ away, doneToday, doneThisWeek, library }),
    [away, doneToday, doneThisWeek, library],
  )
  const count = homeContribution(doneThisWeek)
  const openBacklog = backlog.filter((b) => !b.done).length

  // ── persistence helpers ──
  const persistDone = (next: DoneMap) => {
    setDoneMap(next)
    localStorage.setItem(DONE_KEY, JSON.stringify(next))
  }
  const toggleDone = (id: string) => {
    const cur = doneMap[today] ?? []
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    persistDone({ ...doneMap, [today]: next })
  }
  const persistRegulars = (next: CustomRegular[]) => {
    setRegulars(next)
    localStorage.setItem(REGULAR_KEY, JSON.stringify(next))
  }
  const persistBacklog = (next: BacklogItem[]) => {
    setBacklog(next)
    localStorage.setItem(BACKLOG_KEY, JSON.stringify(next))
    updateAppBadge()
  }

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-label">Home</span>
        <span className="mono muted" style={{ fontSize: 12 }}>{count} this wk</span>
      </div>

      <div className="pill-row">
        <button className={`pill${section === 'today' ? ' on' : ''}`} onClick={() => setSection('today')}>Today</button>
        <button className={`pill${section === 'regular' ? ' on' : ''}`} onClick={() => setSection('regular')}>Regular</button>
        <button className={`pill${section === 'todo' ? ' on' : ''}`} onClick={() => setSection('todo')}>
          Needs doing{openBacklog ? ` (${openBacklog})` : ''}
        </button>
      </div>

      {section === 'today' && (
        <TodaySection
          away={away}
          prompt={mentalPromptFor(today)}
          suggestions={suggestions}
          onToggle={toggleDone}
          onSetAway={(v) => updateSettings({ ellieAway: v })}
          openBacklog={openBacklog}
          onGoBacklog={() => setSection('todo')}
        />
      )}
      {section === 'regular' && (
        <RegularSection regulars={regulars} onChange={persistRegulars} />
      )}
      {section === 'todo' && (
        <BacklogSection backlog={backlog} onChange={persistBacklog} />
      )}
    </div>
  )
}

function TodaySection({
  away, prompt, suggestions, onToggle, onSetAway, openBacklog, onGoBacklog,
}: {
  away: boolean
  prompt: string
  suggestions: ReturnType<typeof todaysHome>
  onToggle: (id: string) => void
  onSetAway: (v: boolean) => void
  openBacklog: number
  onGoBacklog: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? suggestions : suggestions.slice(0, 6)
  const hidden = suggestions.length - visible.length

  return (
    <>
      <div className="pill-row" style={{ marginBottom: 12 }}>
        <span className="card-label" style={{ alignSelf: 'center', marginRight: 2 }}>Ellie</span>
        <button className={`pill${!away ? ' on' : ''}`} onClick={() => onSetAway(false)}>Home</button>
        <button className={`pill${away ? ' on' : ''}`} onClick={() => onSetAway(true)}>Away</button>
      </div>

      <div style={{ fontSize: 13, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--chip)', marginBottom: 12 }}>
        {prompt}
      </div>

      {visible.map((t) => (
        <button
          key={t.id}
          className={`check${t.done ? ' done' : ''}`}
          onClick={() => onToggle(t.id)}
          style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', textAlign: 'left' }}
        >
          <span className="box">{t.done ? '✓' : ''}</span>
          <span className="ctext">
            <div className="row-split">
              <span>{t.title}</span>
              <span className="tag" style={{ flex: '0 0 auto' }}>{CATEGORY_META[t.category].label}</span>
            </div>
            {t.detail && <div className="cbody">{t.detail}</div>}
          </span>
        </button>
      ))}
      {hidden > 0 && (
        <button className="btn btn-ghost btn-block" onClick={() => setShowAll(true)} style={{ marginTop: 8 }}>+ {hidden} more</button>
      )}
      {showAll && suggestions.length > 6 && (
        <button className="btn btn-ghost btn-block" onClick={() => setShowAll(false)} style={{ marginTop: 8 }}>Show less</button>
      )}
      {openBacklog > 0 && (
        <button className="btn btn-ghost btn-block" onClick={onGoBacklog} style={{ marginTop: 8 }}>
          {openBacklog} thing{openBacklog === 1 ? '' : 's'} on the needs-doing list →
        </button>
      )}
    </>
  )
}

function RegularSection({
  regulars, onChange,
}: {
  regulars: CustomRegular[]
  onChange: (next: CustomRegular[]) => void
}) {
  const [title, setTitle] = useState('')
  const [cadence, setCadence] = useState<HomeCadence>('weekly')
  const [category, setCategory] = useState<HomeCategory>('load')
  const [showBuiltins, setShowBuiltins] = useState(false)

  const add = () => {
    const t = title.trim()
    if (!t) return
    onChange([...regulars, { id: uid(), title: t, cadence, category }])
    setTitle('')
  }

  return (
    <>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Your recurring tasks — they show up in Today’s list on their cadence, alongside the built-ins.
      </div>

      {regulars.map((r) => (
        <div key={r.id} className="ladder-step" style={{ padding: '8px 0' }}>
          <div className="ladder-meta">
            <div className="ladder-name">{r.title}</div>
            <div className="sess-meta">{r.cadence}{r.category ? ` · ${CATEGORY_META[r.category].label}` : ''}</div>
          </div>
          <button className="btn btn-ghost" style={{ flex: '0 0 auto', color: 'var(--bad)' }} onClick={() => onChange(regulars.filter((x) => x.id !== r.id))}>
            Remove
          </button>
        </div>
      ))}

      <div className="field" style={{ marginTop: 10 }}>
        <label>Add a regular task</label>
        <input className="input" placeholder="e.g. Water the plants" value={title}
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Cadence</label>
          <select className="select" value={cadence} onChange={(e) => setCadence(e.target.value as HomeCadence)}>
            {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Area</label>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value as HomeCategory)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
          </select>
        </div>
      </div>
      <button className="btn btn-block" onClick={add}>+ Add regular task</button>

      <button className="row-split" onClick={() => setShowBuiltins((v) => !v)}
        style={{ width: '100%', background: 'none', border: 'none', color: 'inherit', textAlign: 'left', padding: '12px 0 0', cursor: 'pointer' }}>
        <span className="card-label">Built-in suggestions</span>
        <span className="mono muted">{showBuiltins ? '−' : '+'}</span>
      </button>
      {showBuiltins &&
        CATEGORIES.map((cat) => (
          <div key={cat} style={{ marginTop: 8 }}>
            <div className="card-label" style={{ fontSize: 11, marginBottom: 4 }}>{CATEGORY_META[cat].label}</div>
            {HOME_LIBRARY.filter((t) => t.category === cat).map((t) => (
              <div key={t.id} className="sess-meta" style={{ padding: '2px 0' }}>· {t.title} <span className="muted">({t.cadence})</span></div>
            ))}
          </div>
        ))}
    </>
  )
}

function BacklogSection({
  backlog, onChange,
}: {
  backlog: BacklogItem[]
  onChange: (next: BacklogItem[]) => void
}) {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')

  const sorted = [...backlog].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return b.created.localeCompare(a.created)
  })

  const add = () => {
    const t = title.trim()
    if (!t) return
    onChange([...backlog, { id: uid(), title: t, note: note.trim() || undefined, done: false, created: todayISO() }])
    setTitle('')
    setNote('')
  }
  const toggle = (id: string) => onChange(backlog.map((b) => (b.id === id ? { ...b, done: !b.done } : b)))
  const clearDone = () => onChange(backlog.filter((b) => !b.done))

  return (
    <>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        The longer-term list — bigger or one-off stuff that needs doing eventually. It stays here until you check it off.
      </div>

      {sorted.length === 0 ? (
        <div className="empty" style={{ padding: '12px 0' }}>Nothing on the list. Add what’s been nagging at you.</div>
      ) : (
        sorted.map((b) => (
          <button
            key={b.id}
            className={`check${b.done ? ' done' : ''}`}
            onClick={() => toggle(b.id)}
            style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', textAlign: 'left' }}
          >
            <span className="box">{b.done ? '✓' : ''}</span>
            <span className="ctext">
              <span>{b.title}</span>
              {b.note && <div className="cbody">{b.note}</div>}
            </span>
          </button>
        ))
      )}
      {backlog.some((b) => b.done) && (
        <button className="btn btn-ghost btn-block" onClick={clearDone} style={{ marginTop: 6 }}>Clear done</button>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <label>Add to the list</label>
        <input className="input" placeholder="e.g. Sort out the garage" value={title}
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      </div>
      <div className="field">
        <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button className="btn btn-block" onClick={add}>+ Add</button>
    </>
  )
}
