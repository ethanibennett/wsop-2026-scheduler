// Nutrition (M5) — "The 45 Layer". Mostly reference (defaults, not a meal plan)
// plus a standing shopping list whose checks persist in localStorage (weekly
// ephemeral state — no DB migration needed). Content from db/nutrition.ts.

import { useState } from 'react'
import { useToast } from '../components/Toast'
import {
  PROTEIN_TARGET,
  PRINCIPLES,
  DAY_EATING,
  DEFAULT_PLATES,
  SHOPPING_LIST,
  PHASING,
  SURGERY_NOTE,
  LAZY_HEROES,
  SHOP_TIMING,
} from '../db/nutrition'

const SHOP_KEY = 'wsop-nut-shop'

function loadChecks(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SHOP_KEY) || '{}')
  } catch {
    return {}
  }
}

export function NutritionView() {
  const toast = useToast()
  const [checks, setChecks] = useState<Record<string, boolean>>(loadChecks)
  const [showPrinciples, setShowPrinciples] = useState(false)

  const allItems = SHOPPING_LIST.flatMap((c) => c.items)
  const checkedCount = allItems.filter((i) => checks[i]).length

  // Send the ticked items (the cart) to the share sheet — text Ellie the list.
  const shareList = async () => {
    const lines: string[] = []
    for (const cat of SHOPPING_LIST) {
      const picked = cat.items.filter((i) => checks[i])
      if (picked.length) lines.push(`${cat.category.split(' (')[0]}: ${picked.join(', ')}`)
    }
    if (!lines.length) {
      toast('Tick what you need first')
      return
    }
    const text = `Groceries —\n${lines.join('\n')}`
    try {
      if (navigator.share) {
        await navigator.share({ text })
      } else {
        await navigator.clipboard.writeText(text)
        toast('List copied')
      }
    } catch {
      /* share sheet dismissed */
    }
  }

  const toggle = (item: string) => {
    setChecks((cur) => {
      const next = { ...cur, [item]: !cur[item] }
      localStorage.setItem(SHOP_KEY, JSON.stringify(next))
      return next
    })
  }
  const clearChecks = () => {
    setChecks({})
    localStorage.setItem(SHOP_KEY, '{}')
  }

  return (
    <>
      {/* Protein target — the headline lever */}
      <div className="card">
        <div className="card-label" style={{ marginBottom: 6 }}>Protein target</div>
        <div className="stat-big" style={{ fontSize: 20 }}>{PROTEIN_TARGET}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Lose 30 lbs while preserving muscle. Protein-first + a modest deficit is the whole
          game — aggressive cutting at 45 costs muscle you can’t easily rebuild.
        </div>
      </div>

      {/* Principles (collapsible) */}
      <div className="card">
        <button
          className="row-split"
          onClick={() => setShowPrinciples((v) => !v)}
          style={{ width: '100%', background: 'none', border: 'none', color: 'inherit', textAlign: 'left', padding: 0, cursor: 'pointer' }}
        >
          <span className="card-label">The principles</span>
          <span className="mono muted">{showPrinciples ? '−' : '+'}</span>
        </button>
        {showPrinciples &&
          PRINCIPLES.map((p) => (
            <div key={p.title} style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{p.title}</div>
              <div className="muted" style={{ fontSize: 13 }}>{p.body}</div>
            </div>
          ))}
      </div>

      {/* Eating on the Phase-1 day */}
      <div className="card">
        <div className="card-label" style={{ marginBottom: 4 }}>Eating on the day</div>
        {DAY_EATING.map((m) => (
          <div className="ladder-step" key={m.title} style={{ padding: '10px 0', alignItems: 'flex-start' }}>
            <div className="ladder-meta">
              <div className="ladder-name">{m.title}</div>
              <div className="muted" style={{ fontSize: 13 }}>{m.body}</div>
            </div>
            <div className="mono muted" style={{ fontSize: 12, whiteSpace: 'nowrap', marginLeft: 8 }}>
              {m.when}
            </div>
          </div>
        ))}
      </div>

      {/* Default plates */}
      <div className="card">
        <div className="card-label" style={{ marginBottom: 4 }}>Default plates</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          So the lazy choice is the good one — shapes to stock for, not a meal plan.
        </div>
        {DEFAULT_PLATES.map((p) => (
          <div key={p.label} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{p.label}</div>
            <div className="muted" style={{ fontSize: 13 }}>{p.body}</div>
          </div>
        ))}
        <div className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>{LAZY_HEROES}</div>
      </div>

      {/* Standing shopping list — interactive */}
      <div className="card">
        <div className="card-head">
          <span className="card-label">Standing shopping list</span>
          <span className="mono muted">{checkedCount}/{allItems.length}</span>
        </div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          Staples to keep stocked. Tick what you need, build the cart, clear when done.
        </div>
        {SHOPPING_LIST.map((cat) => (
          <div key={cat.category} style={{ marginBottom: 12 }}>
            <div className="card-label" style={{ fontSize: 11, marginBottom: 6 }}>{cat.category}</div>
            {cat.items.map((item) => {
              const done = !!checks[item]
              return (
                <button
                  key={item}
                  className={`check${done ? ' done' : ''}`}
                  onClick={() => toggle(item)}
                  style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', textAlign: 'left' }}
                >
                  <span className="box">{done ? '✓' : ''}</span>
                  <span className="ctext">{item}</span>
                </button>
              )
            })}
          </div>
        ))}
        {checkedCount > 0 && (
          <div className="field-row" style={{ marginTop: 4 }}>
            <button className="btn btn-block" onClick={() => void shareList()}>
              ↗ Share list ({checkedCount})
            </button>
            <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} onClick={clearChecks}>
              Clear
            </button>
          </div>
        )}
        <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>{SHOP_TIMING}</div>
      </div>

      {/* Phasing */}
      <div className="card">
        <div className="card-label" style={{ marginBottom: 4 }}>How it phases</div>
        {PHASING.map((p) => (
          <div className="ladder-step" key={p.phase} style={{ padding: '8px 0', alignItems: 'flex-start' }}>
            <div className="ladder-meta">
              <div className="ladder-name">{p.phase}</div>
              <div className="muted" style={{ fontSize: 13 }}>{p.note}</div>
            </div>
          </div>
        ))}
        <div
          style={{
            marginTop: 10,
            padding: '9px 11px',
            borderRadius: 8,
            border: '1px solid var(--warn)',
            color: 'var(--muted)',
            fontSize: 13,
          }}
        >
          <strong style={{ color: 'var(--warn)' }}>Around surgery (W4): </strong>
          {SURGERY_NOTE}
        </div>
      </div>
    </>
  )
}
