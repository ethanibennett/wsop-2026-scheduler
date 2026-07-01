// Business & Admin (plan layer) — tax estimator (reads the session logs), the
// Phase-1 setup checklist, a staking/action-sale calculator, and the reference
// landscape. Checks + staking deals persist in localStorage (setup state, not
// daily logs). Content from db/admin.ts. NOT tax/legal/financial advice.

import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { money, uid } from '../engine/format'
import { taxEstimate } from '../engine/analytics'
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
  const [event, setEvent] = useState('')
  const [buyIn, setBuyIn] = useState('')
  const [pctSold, setPctSold] = useState('60')
  const [markup, setMarkup] = useState('1.15')

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
      },
    ])
    setEvent('')
    setBuyIn('')
  }
  const remove = (id: string) => onChange(deals.filter((d) => d.id !== id))

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
            return (
              <div className="session-item" key={d.id} onClick={() => remove(d.id)} style={{ cursor: 'pointer' }} title="Tap to remove">
                <div className="sess-main">
                  <div className="sess-label">{d.event}</div>
                  <div className="sess-meta">
                    {money(d.buyIn)} · {d.pctSold}% @ {d.markup}× · keep {c.retainedPct}%
                  </div>
                </div>
                <div className="sess-result">{money(c.yourCost)}</div>
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
