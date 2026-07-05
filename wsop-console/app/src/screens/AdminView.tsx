// Business & Admin (plan layer) — tax estimator (reads the session logs), the
// Phase-1 setup checklist, a staking/action-sale calculator, and the reference
// landscape. Checks + staking deals persist in localStorage (setup state, not
// daily logs). Content from db/admin.ts. NOT tax/legal/financial advice.

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { getAll, putRecord, deleteRecord } from '../db/idb'
import type { Expense, ExpenseCategory } from '../db/types'
import { money, uid, todayISO, fmtDate } from '../engine/format'
import { taxEstimate, expenseTotals } from '../engine/analytics'
import {
  ADMIN_CHECKLIST,
  ADMIN_REFERENCE,
  ADMIN_DISCLAIMER,
} from '../db/admin'

const CHECK_KEY = 'wsop-admin-checklist'
const RATE_KEY = 'wsop-admin-taxrate'
const STAKE_KEY = 'wsop-staking'

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

interface StakeDeal {
  id: string
  event: string
  buyIn: number
  pctSold: number
  markup: number
  backer?: string // who owns the sold piece (the per-entry ledger)
  settled?: boolean // cashed + backers paid (settlement adjustment logged)
}

export function AdminView() {
  const { sessions } = useStore()

  // Tax year: default to the latest logged session's year, else 2026.
  const years = useMemo(() => {
    const set = new Set<number>([2026])
    for (const s of sessions) set.add(Number(s.date.slice(0, 4)))
    return [...set].sort((a, b) => b - a)
  }, [sessions])
  const [year, setYear] = useState(years[0])
  const [ratePct, setRatePct] = useState<number>(() => loadJSON(RATE_KEY, 30))
  const tax = useMemo(() => taxEstimate(sessions, year), [sessions, year])
  const setAside = (tax.taxable * ratePct) / 100

  const updateRate = (v: number) => {
    setRatePct(v)
    localStorage.setItem(RATE_KEY, JSON.stringify(v))
  }

  // Setup checklist.
  const [checks, setChecks] = useState<Record<string, boolean>>(() =>
    loadJSON(CHECK_KEY, {}),
  )
  const toggleCheck = (id: string) => {
    setChecks((cur) => {
      const next = { ...cur, [id]: !cur[id] }
      localStorage.setItem(CHECK_KEY, JSON.stringify(next))
      return next
    })
  }
  const allTasks = ADMIN_CHECKLIST.flatMap((g) => g.tasks)
  const doneCount = allTasks.filter((t) => checks[t.id]).length

  // Staking ledger.
  const [deals, setDeals] = useState<StakeDeal[]>(() => loadJSON<StakeDeal[]>(STAKE_KEY, []))
  const saveDeals = (next: StakeDeal[]) => {
    setDeals(next)
    localStorage.setItem(STAKE_KEY, JSON.stringify(next))
  }

  return (
    <>
      <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
        {ADMIN_DISCLAIMER}
      </div>

      {/* Tax estimator */}
      <div className="card">
        <div className="card-head">
          <span className="card-label">Tax read · phantom income</span>
          <select
            className="select"
            style={{ width: 'auto', padding: '4px 8px' }}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          OBBBA (TY2026): losses only 90% deductible. A break-even year can still owe tax.
        </div>
        <div className="hl-row"><span className="muted">Winnings</span><span className="mono pos">{money(tax.winnings)}</span></div>
        <div className="hl-row"><span className="muted">Losses</span><span className="mono neg">{money(tax.losses)}</span></div>
        <div className="hl-row"><span className="muted">Net (actual)</span><span className={`mono ${tax.net >= 0 ? 'pos' : 'neg'}`}>{money(tax.net, { sign: true })}</span></div>
        <div className="hl-row"><span className="muted">Deductible losses (90%)</span><span className="mono">{money(tax.deductibleLosses)}</span></div>
        <div className="hl-row"><span className="muted">Taxable</span><span className="mono">{money(tax.taxable)}</span></div>
        <div className="divider" />
        <div className="hl-row">
          <span style={{ color: 'var(--warn)' }}>Phantom income</span>
          <span className="mono" style={{ color: 'var(--warn)', fontWeight: 700 }}>{money(tax.phantom)}</span>
        </div>
        <div className="muted" style={{ fontSize: 12, margin: '4px 0 12px' }}>
          Income you’re taxed on but never pocketed (10% of losses, up to winnings).
        </div>
        <div className="field-row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '0 0 110px' }}>
            <label>Set-aside %</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={ratePct}
              onChange={(e) => updateRate(Number(e.target.value) || 0)}
            />
          </div>
          <div className="card card-2" style={{ flex: 1 }}>
            <div className="card-label">Reserve for taxes</div>
            <div className="stat-big" style={{ fontSize: 20 }}>{money(setAside)}</div>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Rough set-aside on taxable at your blended rate — size the real quarterly estimates with the CPA.
        </div>
      </div>

      {/* Setup checklist */}
      <div className="card">
        <div className="card-head">
          <span className="card-label">Setup checklist</span>
          <span className="mono muted">{doneCount}/{allTasks.length}</span>
        </div>
        {ADMIN_CHECKLIST.map((g) => (
          <div key={g.phase} style={{ marginBottom: 10 }}>
            <div className="card-label" style={{ fontSize: 11, margin: '8px 0 4px' }}>{g.phase}</div>
            {g.tasks.map((t) => {
              const done = !!checks[t.id]
              return (
                <button
                  key={t.id}
                  className={`check${done ? ' done' : ''}`}
                  onClick={() => toggleCheck(t.id)}
                  style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', textAlign: 'left' }}
                >
                  <span className="box">{done ? '✓' : ''}</span>
                  <span className="ctext">
                    <div style={{ fontWeight: 600 }}>{t.label}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{t.detail}</div>
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Business expenses — the deduction half of the tax picture */}
      <ExpenseLog year={year} />

      {/* Staking calculator */}
      <StakingCalculator deals={deals} onChange={saveDeals} />

      {/* Reference landscape */}
      <div className="card">
        <div className="card-label" style={{ marginBottom: 4 }}>The landscape</div>
        {ADMIN_REFERENCE.map((r) => (
          <div key={r.title} style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{r.title}</div>
            <div className="muted" style={{ fontSize: 13 }}>{r.body}</div>
          </div>
        ))}
      </div>
    </>
  )
}

function StakingCalculator({
  deals,
  onChange,
}: {
  deals: StakeDeal[]
  onChange: (next: StakeDeal[]) => void
}) {
  const { put } = useStore()
  const [event, setEvent] = useState('')
  const [buyIn, setBuyIn] = useState('')
  const [pctSold, setPctSold] = useState('60')
  const [markup, setMarkup] = useState('1.15')
  const [backer, setBacker] = useState('')
  const [settlingId, setSettlingId] = useState<string | null>(null)
  const [prize, setPrize] = useState('')

  const calc = (d: StakeDeal) => {
    const faceSold = d.buyIn * (d.pctSold / 100)
    const backerPays = faceSold * d.markup
    const premium = backerPays - faceSold
    const yourCost = d.buyIn - faceSold - premium // retained face minus markup premium
    return { faceSold, backerPays, premium, yourCost, retainedPct: 100 - d.pctSold }
  }

  const totals = deals.reduce(
    (a, d) => {
      const c = calc(d)
      a.face += d.buyIn
      a.backerPays += c.backerPays
      a.yourCost += c.yourCost
      return a
    },
    { face: 0, backerPays: 0, yourCost: 0 },
  )

  const add = () => {
    const bi = Number(buyIn) || 0
    if (!event.trim() || bi <= 0) return
    onChange([
      ...deals,
      {
        id: uid(),
        event: event.trim(),
        buyIn: bi,
        pctSold: Number(pctSold) || 0,
        markup: Number(markup) || 1,
        backer: backer.trim() || undefined,
      },
    ])
    setEvent('')
    setBuyIn('')
    setBacker('')
  }
  const remove = (id: string) => onChange(deals.filter((d) => d.id !== id))

  // Event cashed → pay backers their sold % of the prize, as a real
  // backer-settlement adjustment (comes out of the WSOP-fund bucket).
  const settle = async (d: StakeDeal) => {
    const p = Number(prize) || 0
    if (p <= 0) return
    const share = Math.round(p * (d.pctSold / 100))
    await put('adjustments', {
      id: uid(),
      date: todayISO(),
      amount: -share,
      type: 'backer-settlement' as const,
      note: `${d.event}: backers' ${d.pctSold}% of ${money(p)}${d.backer ? ` → ${d.backer}` : ''}`,
    })
    onChange(deals.map((x) => (x.id === d.id ? { ...x, settled: true } : x)))
    setSettlingId(null)
    setPrize('')
  }

  // Live preview of the row being entered.
  const previewBi = Number(buyIn) || 0
  const preview =
    previewBi > 0
      ? calc({ id: '', event, buyIn: previewBi, pctSold: Number(pctSold) || 0, markup: Number(markup) || 1 })
      : null

  return (
    <div className="card">
      <div className="card-label" style={{ marginBottom: 4 }}>Action-sale calculator</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Plan the ~$130k slate sale. Markup over face is your buffer; selling shrinks both capital and variance.
      </div>
      <div className="field">
        <label>Event</label>
        <input className="input" placeholder="$10k 2-7 Champ" value={event} onChange={(e) => setEvent(e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field"><label>Buy-in</label>
          <input className="input" type="number" inputMode="decimal" value={buyIn} onChange={(e) => setBuyIn(e.target.value)} /></div>
        <div className="field" style={{ flex: '0 0 90px' }}><label>% sold</label>
          <input className="input" type="number" inputMode="decimal" value={pctSold} onChange={(e) => setPctSold(e.target.value)} /></div>
        <div className="field" style={{ flex: '0 0 90px' }}><label>Markup</label>
          <input className="input" type="number" inputMode="decimal" step="0.05" value={markup} onChange={(e) => setMarkup(e.target.value)} /></div>
      </div>
      <div className="field">
        <label>Backer(s) — the per-entry ledger of who owns what</label>
        <input className="input" placeholder="e.g. J.R. 40%, platform 20%" value={backer} onChange={(e) => setBacker(e.target.value)} />
      </div>
      {preview && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Backers pay {money(preview.backerPays)} · your net cost {money(preview.yourCost)} · you keep {preview.retainedPct}% of the action
        </div>
      )}
      <button className="btn btn-block" onClick={add}>+ Add to slate</button>

      {deals.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {deals.map((d) => {
            const c = calc(d)
            const settling = settlingId === d.id
            const share = Math.round((Number(prize) || 0) * (d.pctSold / 100))
            return (
              <div key={d.id} style={{ opacity: d.settled ? 0.55 : 1 }}>
                <div className="session-item" style={{ cursor: 'default' }}>
                  <div className="sess-main">
                    <div className="sess-label">
                      {d.event}
                      {d.settled && <span className="tag pos" style={{ marginLeft: 6 }}>settled</span>}
                    </div>
                    <div className="sess-meta">
                      {money(d.buyIn)} · {d.pctSold}% @ {d.markup}× · keep {c.retainedPct}%
                      {d.backer ? ` · ${d.backer}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: '0 0 auto' }}>
                    {!d.settled && (
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 8px', fontSize: 12 }}
                        onClick={() => {
                          setSettlingId(settling ? null : d.id)
                          setPrize('')
                        }}
                      >
                        {settling ? 'Cancel' : 'Settle'}
                      </button>
                    )}
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '4px 8px', color: 'var(--muted)' }}
                      onClick={() => remove(d.id)}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {settling && (
                  <div className="field-row" style={{ padding: '6px 0 10px', alignItems: 'center' }}>
                    <input
                      className="input"
                      type="number"
                      inputMode="decimal"
                      placeholder="Cashed for ($ prize)"
                      value={prize}
                      onChange={(e) => setPrize(e.target.value)}
                    />
                    <button
                      className="btn"
                      style={{ flex: '0 0 auto' }}
                      disabled={share <= 0}
                      onClick={() => void settle(d)}
                    >
                      Pay backers {share > 0 ? money(share) : ''}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          <div className="divider" />
          <div className="hl-row"><span className="muted">Total face</span><span className="mono">{money(totals.face)}</span></div>
          <div className="hl-row"><span className="muted">Backers cover</span><span className="mono">{money(totals.backerPays)}</span></div>
          <div className="hl-row"><span style={{ fontWeight: 600 }}>Your net cost</span><span className="mono" style={{ fontWeight: 700 }}>{money(totals.yourCost)}</span></div>
        </div>
      )}
    </div>
  )
}

const EXPENSE_CATEGORIES: { v: ExpenseCategory; label: string }[] = [
  { v: 'travel', label: 'Travel' },
  { v: 'lodging', label: 'Lodging' },
  { v: 'meals', label: 'Meals' },
  { v: 'coaching', label: 'Coaching / study' },
  { v: 'equipment', label: 'Equipment' },
  { v: 'fees', label: 'Fees' },
  { v: 'other', label: 'Other' },
]

// Schedule C expense log — clean records for the CPA. Whether/how each deducts
// under the 90% rule is exactly the CPA-session agenda, so this tracks, it
// doesn't compute tax.
function ExpenseLog({ year }: { year: number }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const reload = async () =>
    setExpenses((await getAll<Expense>('expenses')).sort((a, b) => b.date.localeCompare(a.date)))
  useEffect(() => {
    void reload()
  }, [])

  const [date, setDate] = useState(todayISO())
  const [category, setCategory] = useState<ExpenseCategory>('travel')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const totals = expenseTotals(expenses, year)

  const add = async () => {
    const n = Number(amount) || 0
    if (n <= 0) return
    await putRecord('expenses', {
      id: uid(), date, category, amount: n, note: note.trim() || undefined,
    } satisfies Expense)
    setAmount('')
    setNote('')
    await reload()
  }

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-label">Business expenses · {year}</span>
        <span className="mono" style={{ fontWeight: 700 }}>{money(totals.total)}</span>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        The deduction half of the tax picture — log as you go, hand the CPA clean records.
      </div>

      {totals.count > 0 && (
        <div className="pill-row" style={{ marginBottom: 10 }}>
          {EXPENSE_CATEGORIES.filter((c) => totals.byCategory[c.v]).map((c) => (
            <span key={c.v} className="tag">
              {c.label} · {money(totals.byCategory[c.v]!)}
            </span>
          ))}
        </div>
      )}

      <div className="field-row">
        <div className="field">
          <label>Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Category</label>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.v} value={c.v}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: '0 0 100px' }}>
          <label>Amount</label>
          <input className="input" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <input className="input" placeholder="Note (what / who / why)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button className="btn btn-block" onClick={add}>+ Log expense</button>

      {expenses.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {expenses.slice(0, 6).map((e) => (
            <button
              key={e.id}
              className="session-item"
              title="Tap to delete"
              onClick={async () => {
                if (confirm(`Delete ${money(e.amount)} ${e.category}?`)) {
                  await deleteRecord('expenses', e.id)
                  await reload()
                }
              }}
            >
              <div className="sess-main">
                <div className="sess-label">{EXPENSE_CATEGORIES.find((c) => c.v === e.category)?.label ?? e.category}</div>
                <div className="sess-meta">{fmtDate(e.date)}{e.note ? ` · ${e.note}` : ''}</div>
              </div>
              <div className="sess-result neg">−{money(e.amount)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
