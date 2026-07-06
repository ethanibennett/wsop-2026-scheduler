// Backer notifications UI. Two pieces:
//   • BackersManager — Admin: define backers (name + per-game % stakes), copy
//     each one's private link to share.
//   • BackerNotify — the Sessions edit sheet: review the computed cuts for a
//     session and send each staked backer their push (review-then-send).
// Backers persist through the store (synced across devices); the send goes to
// the gated server endpoint, which is authoritative for each backer's total.

import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { useToast } from '../components/Toast'
import { getAll } from '../db/idb'
import { uid, money, fmtDate } from '../engine/format'
import { useSyncedLocal } from '../db/syncLocal'
import {
  type Backer,
  type BackerStake,
  newToken,
  backerLink,
  stakesSummary,
  deliveryChannels,
  cutsForSession,
  sessionGameLabel,
  STAKE_FORMAT_OPTIONS,
  STAKE_CHANNEL_OPTIONS,
} from '../db/backers'
import { notifyBackers, type NotifyResult } from '../db/backerClient'
import type { Session } from '../db/types'

// ── Manager (Admin) ──
export function BackersManager() {
  const { put, remove } = useStore()
  const toast = useToast()
  const [backers, setBackers] = useState<Backer[]>([])
  const [name, setName] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setBackers((await getAll<Backer>('backers')).sort((a, b) => a.name.localeCompare(b.name)))
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])

  const addBacker = async () => {
    const n = name.trim()
    if (!n) return
    const b: Backer = { id: uid(), token: newToken(), name: n, stakes: [], createdAt: Date.now() }
    await put('backers', b)
    setName('')
    await reload()
    setOpenId(b.id)
  }
  const saveBacker = async (b: Backer) => {
    await put('backers', b)
    await reload()
  }
  const del = async (b: Backer) => {
    if (confirm(`Remove ${b.name}? Their private link stops updating (past pushes stay sent).`)) {
      await remove('backers', b.id)
      await reload()
    }
  }
  const copyLink = async (b: Backer) => {
    try {
      await navigator.clipboard?.writeText(backerLink(b.token))
      toast('Private link copied')
    } catch {
      toast('Copy failed — long-press the link')
    }
  }

  return (
    <div className="card">
      <div className="card-label" style={{ marginBottom: 4 }}>Backers &amp; notifications</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Give a backer a % in specific games. Logging a session of that game lets you push them the
        result + their cut. Share each backer their private link; they can turn on notifications from it.
      </div>

      {backers.map((b) => {
        const open = openId === b.id
        return (
          <div key={b.id} className={`pl-card${open ? ' open' : ''}`} style={{ marginBottom: 8 }}>
            <button
              className="pl-head"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : b.id)}
            >
              <div className="pl-ptop">
                <span className="pl-pname" style={{ fontSize: 15 }}>{b.name}</span>
                <span className="pl-pdate">{open ? 'close' : 'edit'}</span>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{stakesSummary(b)}</div>
              <div className="pill-row" style={{ marginTop: 6 }}>
                {deliveryChannels(b).map((c) => (
                  <span key={c} className="tag">{c}</span>
                ))}
              </div>
            </button>
            {open && (
              <div className="pl-bodyinner" style={{ padding: '0 14px 14px' }}>
                <BackerEditor backer={b} onChange={saveBacker} />
                <div className="field" style={{ marginTop: 10 }}>
                  <label>Private link — send this to {b.name}</label>
                  <div className="field-row" style={{ alignItems: 'center' }}>
                    <input className="input mono" style={{ fontSize: 12 }} readOnly value={backerLink(b.token)} />
                    <button className="btn" style={{ flex: '0 0 auto' }} onClick={() => void copyLink(b)}>Copy</button>
                    <a
                      className="btn"
                      style={{ flex: '0 0 auto' }}
                      href={backerLink(b.token)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Preview
                    </a>
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                    Preview shows {b.name}&rsquo;s page exactly as they&rsquo;ll see it — check it before you send.
                  </div>
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ color: 'var(--muted)', marginTop: 4 }}
                  onClick={() => void del(b)}
                >
                  Remove backer
                </button>
              </div>
            )}
          </div>
        )
      })}

      <div className="field-row" style={{ marginTop: 4, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Add a backer</label>
          <input
            className="input"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addBacker()}
          />
        </div>
        <button className="btn" style={{ flex: '0 0 auto' }} onClick={() => void addBacker()}>+ Add</button>
      </div>
    </div>
  )
}

// The per-backer stake editor: rows of {game, channel, %}. Local draft is the
// source of truth while editing; discrete changes (add/remove/select) commit
// immediately, free-text (name, %) commits on blur — so we don't persist +
// re-render on every keystroke. Mounted fresh per backer (parent keys by id).
function BackerEditor({ backer, onChange }: { backer: Backer; onChange: (b: Backer) => void }) {
  const [name, setName] = useState(backer.name)
  const [rows, setRows] = useState<BackerStake[]>(backer.stakes)
  const [sms, setSms] = useState(backer.delivery?.sms ?? '')
  const [email, setEmail] = useState(backer.delivery?.email ?? '')

  const persist = (
    nextRows: BackerStake[] = rows,
    nextName: string = name,
    nextSms: string = sms,
    nextEmail: string = email,
  ) =>
    onChange({
      ...backer,
      name: nextName.trim() || backer.name,
      stakes: nextRows,
      delivery: { sms: nextSms.trim() || undefined, email: nextEmail.trim() || undefined },
    })
  const addRow = () => {
    const n = [...rows, { format: 'PLO' as const, channel: 'any' as const, pct: 20 }]
    setRows(n)
    persist(n)
  }
  const setRow = (i: number, patch: Partial<BackerStake>, commit: boolean) => {
    const n = rows.map((s, j) => (j === i ? { ...s, ...patch } : s))
    setRows(n)
    if (commit) persist(n)
  }
  const removeRow = (i: number) => {
    const n = rows.filter((_, j) => j !== i)
    setRows(n)
    persist(n)
  }

  return (
    <>
      <div className="field">
        <label>Name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== backer.name && persist(rows, name)}
        />
      </div>
      <div className="field">
        <label>Stakes — a % per game</label>
        {rows.length === 0 && (
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>No games yet — add one below.</div>
        )}
        {rows.map((s, i) => (
          <div className="field-row" key={i} style={{ alignItems: 'center', marginBottom: 6 }}>
            <select
              className="select"
              value={s.format}
              onChange={(e) => setRow(i, { format: e.target.value as BackerStake['format'] }, true)}
            >
              {STAKE_FORMAT_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>{o.label}</option>
              ))}
            </select>
            <select
              className="select"
              value={s.channel}
              onChange={(e) => setRow(i, { channel: e.target.value as BackerStake['channel'] }, true)}
            >
              {STAKE_CHANNEL_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>{o.label}</option>
              ))}
            </select>
            <div className="field" style={{ flex: '0 0 70px' }}>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={s.pct}
                onChange={(e) => setRow(i, { pct: Number(e.target.value) || 0 }, false)}
                onBlur={() => persist(rows)}
              />
            </div>
            <button
              className="btn btn-ghost"
              style={{ flex: '0 0 auto', color: 'var(--muted)', padding: '4px 8px' }}
              onClick={() => removeRow(i)}
            >
              ×
            </button>
          </div>
        ))}
        <button className="btn btn-ghost" style={{ marginTop: 2 }} onClick={addRow}>+ Add game</button>
      </div>

      <div className="field">
        <label>Delivery — how they hear about it</label>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Their private link + push always works. Add a phone for a text each session, or an email
          for a weekly digest. Leave blank to skip.
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Text (per session)</label>
          <input
            className="input"
            type="tel"
            inputMode="tel"
            placeholder="+1 215 555 0199"
            value={sms}
            onChange={(e) => setSms(e.target.value)}
            onBlur={() => persist(rows, name, sms, email)}
          />
        </div>
        <div className="field">
          <label>Email (weekly digest)</label>
          <input
            className="input"
            type="email"
            inputMode="email"
            placeholder="backer@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => persist(rows, name, sms, email)}
          />
        </div>
      </div>
    </>
  )
}

// ── Notify panel (Sessions edit sheet) ──
export function BackerNotify({ session }: { session: Session }) {
  const toast = useToast()
  const [backers, setBackers] = useState<Backer[]>([])
  const [notified, setNotified] = useSyncedLocal<string[]>('wsop-notified-sessions', [])
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<NotifyResult | null>(null)

  useEffect(() => {
    void (async () => setBackers(await getAll<Backer>('backers')))()
  }, [])

  const cuts = cutsForSession(backers, session)
  const already = notified.includes(session.id)

  if (backers.length === 0) return null
  if (cuts.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 12, marginTop: 12, padding: '0 2px' }}>
        No backers staked in {sessionGameLabel(session)}.
      </div>
    )
  }

  const send = async () => {
    setSending(true)
    const res = await notifyBackers(session, cuts)
    setSending(false)
    setResult(res)
    if (res.ok) {
      if (!already) setNotified([...notified, session.id])
      const noPush = (res.results ?? []).filter((r) => r.subs === 0).length
      toast(noPush ? `Sent · ${noPush} not on push yet` : 'Backers notified')
    } else {
      toast(res.error || 'Notify failed')
    }
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <span className="card-label">Backers · {sessionGameLabel(session)}</span>
        {already && <span className="tag pos">notified</span>}
      </div>
      {(result?.results ?? cuts.map((c) => ({
        token: c.backer.token,
        name: c.backer.name,
        sent: 0,
        subs: -1,
        cumulativeCents: 0,
        duplicate: false,
        sms: 'none' as const,
      }))).map((r, i) => {
        const cut = cuts.find((c) => c.backer.token === r.token) ?? cuts[i]
        const share = cut ? cut.share : 0
        return (
          <div key={r.token} className="ladder-step" style={{ padding: '8px 0' }}>
            <div className="ladder-meta">
              <div className="ladder-name">{r.name}</div>
              <div className="sess-meta">
                {cut ? `${cut.pct}% of ${money(session.result, { sign: true })}` : ''}
                {result && r.subs === 0 ? ' · not on push yet (share their link)' : ''}
                {result && r.subs > 0 ? ` · pushed to ${r.sent}/${r.subs}` : ''}
                {result && r.sms === 'sent' ? ' · texted' : ''}
                {result && r.sms === 'unconfigured' ? ' · text not set up' : ''}
                {result && r.sms === 'error' ? ' · text failed' : ''}
                {result && r.duplicate ? ' · already recorded' : ''}
              </div>
            </div>
            <span className={`mono ${share >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
              {money(share, { sign: true })}
            </span>
          </div>
        )
      })}
      <button
        className="btn btn-primary btn-block"
        style={{ marginTop: 10 }}
        disabled={sending}
        onClick={() => void send()}
      >
        {sending ? 'Sending…' : already ? 'Re-send to backers' : `Notify ${cuts.length} backer${cuts.length > 1 ? 's' : ''}`}
      </button>
      {already && !result && (
        <div className="muted" style={{ fontSize: 11.5, textAlign: 'center', marginTop: 6 }}>
          Already sent {fmtDate(session.date)}. Re-send won't double-count their running total.
        </div>
      )}
    </div>
  )
}
