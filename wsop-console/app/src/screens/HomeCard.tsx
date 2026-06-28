// The Home card on Today — surfaces household contributions so the remembering
// doesn't fall on Ellie. Rotation toggle (home/away), the daily mental-load
// prompt, the suggestion checklist, and quick one-offs she mentions.
// Completions + one-offs persist in localStorage (date-keyed checklist state).

import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { todaysHome, homeContribution, mentalPromptFor } from '../engine/home'
import { CATEGORY_META } from '../db/home'
import { todayISO, isThisWeek, uid } from '../engine/format'

const DONE_KEY = 'wsop-home-done' // { [dateISO]: taskId[] }
const TODOS_KEY = 'wsop-home-todos' // { id, title, done }[]

type DoneMap = Record<string, string[]>
interface HomeTodo {
  id: string
  title: string
  done: boolean
  date: string
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function HomeCard() {
  const { settings, updateSettings } = useStore()
  const away = !!settings.ellieAway
  const today = todayISO()

  const [doneMap, setDoneMap] = useState<DoneMap>(() => load<DoneMap>(DONE_KEY, {}))
  const [todos, setTodos] = useState<HomeTodo[]>(() => load<HomeTodo[]>(TODOS_KEY, []))
  const [newTodo, setNewTodo] = useState('')
  const [showAll, setShowAll] = useState(false)

  const doneToday = useMemo(() => new Set(doneMap[today] ?? []), [doneMap, today])
  const doneThisWeek = useMemo(() => {
    const s = new Set<string>()
    for (const [date, ids] of Object.entries(doneMap)) {
      if (isThisWeek(date)) ids.forEach((id) => s.add(id))
    }
    return s
  }, [doneMap])

  const suggestions = useMemo(
    () => todaysHome({ away, doneToday, doneThisWeek }),
    [away, doneToday, doneThisWeek],
  )
  const weeklyTodoDone = todos.filter((t) => t.done && isThisWeek(t.date)).length
  const count = homeContribution(doneThisWeek) + weeklyTodoDone
  const prompt = mentalPromptFor(today)

  const persistDone = (next: DoneMap) => {
    setDoneMap(next)
    localStorage.setItem(DONE_KEY, JSON.stringify(next))
  }
  const toggle = (id: string) => {
    const cur = doneMap[today] ?? []
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    persistDone({ ...doneMap, [today]: next })
  }

  const persistTodos = (next: HomeTodo[]) => {
    setTodos(next)
    localStorage.setItem(TODOS_KEY, JSON.stringify(next))
  }
  const addTodo = () => {
    const t = newTodo.trim()
    if (!t) return
    persistTodos([...todos, { id: uid(), title: t, done: false, date: today }])
    setNewTodo('')
  }
  const toggleTodo = (id: string) =>
    persistTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  const clearDoneTodos = () => persistTodos(todos.filter((t) => !t.done))

  const visible = showAll ? suggestions : suggestions.slice(0, 5)
  const hiddenCount = suggestions.length - visible.length

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-label">Home</span>
        <span className="mono muted" style={{ fontSize: 12 }}>{count} this wk</span>
      </div>

      {/* Rotation toggle */}
      <div className="pill-row" style={{ marginBottom: 12 }}>
        <span className="card-label" style={{ alignSelf: 'center', marginRight: 2 }}>Ellie</span>
        <button className={`pill${!away ? ' on' : ''}`} onClick={() => updateSettings({ ellieAway: false })}>
          Home
        </button>
        <button className={`pill${away ? ' on' : ''}`} onClick={() => updateSettings({ ellieAway: true })}>
          Away
        </button>
      </div>

      {/* The daily mental-load prompt */}
      <div
        style={{
          fontSize: 13,
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid var(--chip)',
          color: 'var(--text)',
          marginBottom: 12,
        }}
      >
        {prompt}
      </div>

      {/* One-offs she mentioned */}
      {todos.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {todos.map((t) => (
            <button
              key={t.id}
              className={`check${t.done ? ' done' : ''}`}
              onClick={() => toggleTodo(t.id)}
              style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', textAlign: 'left' }}
            >
              <span className="box">{t.done ? '✓' : ''}</span>
              <span className="ctext">{t.title}</span>
            </button>
          ))}
          {todos.some((t) => t.done) && (
            <button className="btn btn-ghost btn-block" onClick={clearDoneTodos} style={{ marginTop: 6 }}>
              Clear done
            </button>
          )}
        </div>
      )}

      <div className="field-row" style={{ marginBottom: 8 }}>
        <input
          className="input"
          placeholder="Something she mentioned…"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTodo()}
        />
        <button className="btn" onClick={addTodo} style={{ flex: '0 0 auto' }}>Add</button>
      </div>

      {/* Suggestions */}
      {visible.map((t) => (
        <button
          key={t.id}
          className={`check${t.done ? ' done' : ''}`}
          onClick={() => toggle(t.id)}
          style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', textAlign: 'left' }}
        >
          <span className="box">{t.done ? '✓' : ''}</span>
          <span className="ctext">
            <div className="row-split">
              <span>{t.title}</span>
              <span className="tag" style={{ flex: '0 0 auto' }}>{CATEGORY_META[t.category].label}</span>
            </div>
            <div className="cbody">{t.detail}</div>
          </span>
        </button>
      ))}
      {hiddenCount > 0 && (
        <button className="btn btn-ghost btn-block" onClick={() => setShowAll(true)} style={{ marginTop: 8 }}>
          + {hiddenCount} more
        </button>
      )}
      {showAll && suggestions.length > 5 && (
        <button className="btn btn-ghost btn-block" onClick={() => setShowAll(false)} style={{ marginTop: 8 }}>
          Show less
        </button>
      )}
    </div>
  )
}
