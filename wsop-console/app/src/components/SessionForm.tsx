import { useState } from 'react'
import type { Session, Channel, Format, MoodRating } from '../db/types'
import { readIntention } from '../db/intention'
import { uid, todayISO, money } from '../engine/format'

const FORMATS: Format[] = [
  'PLO',
  'PLO8',
  'NLH',
  'mixed',
  'stud8',
  'razz',
  '2-7',
  'BigO',
  'other',
]
const STAKES = ['1/2', '2/2/5', '5/5/10', '5/10/30', '5/10', '10/20', '10/20/40']

// One-tap presets for the games actually played most.
interface Preset {
  label: string
  patch: Partial<Session>
  custom?: boolean
}

const BUILTIN_PRESETS: Preset[] = [
  { label: 'Parx 5/5/10', patch: { channel: 'live', isMTT: false, format: 'PLO', stakeLevel: '5/5/10', venue: 'Parx', gameLabel: '5/5/10 PLO' } },
  { label: 'WSOP.com 1/2 PLO', patch: { channel: 'online', isMTT: false, format: 'PLO', stakeLevel: '1/2', venue: 'WSOP.com', gameLabel: '1/2 PLO' } },
  { label: 'Phenom 5/10 mix', patch: { channel: 'online', isMTT: false, format: 'mixed', stakeLevel: '5/10', venue: 'Phenom', gameLabel: '5/10 mixed' } },
]

const PRESET_KEY = 'wsop-session-presets'

function loadCustomPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESET_KEY)
    return raw ? (JSON.parse(raw) as Preset[]).map((p) => ({ ...p, custom: true })) : []
  } catch {
    return []
  }
}

const blank = (): Session => ({
  id: uid(),
  date: todayISO(),
  channel: 'live',
  isMTT: false,
  format: 'PLO',
  gameLabel: '',
  venue: '',
  stakeLevel: '2/2/5',
  buyInTotal: 0,
  cashOut: 0,
  hours: 0,
  result: 0,
})

interface Props {
  initial?: Session
  draft?: Partial<Session> // pre-fill for a NEW session (e.g. live-mode end: hours from the clock)
  onSave: (s: Session) => void
  onCancel: () => void
  onDelete?: (id: string) => void
}

export function SessionForm({ initial, draft, onSave, onCancel, onDelete }: Props) {
  const [s, setS] = useState<Session>(initial ?? { ...blank(), ...draft })
  const [customs, setCustoms] = useState<Preset[]>(loadCustomPresets)

  const persistCustoms = (next: Preset[]) => {
    setCustoms(next)
    localStorage.setItem(PRESET_KEY, JSON.stringify(next.map(({ custom: _c, ...p }) => p)))
  }
  // Save the current game setup (not the money/hours) as a one-tap preset.
  const saveAsPreset = () => {
    const label = (s.venue || s.gameLabel || `${s.format} ${s.stakeLevel ?? ''}`).trim().slice(0, 24)
    if (!label || customs.some((p) => p.label === label) || BUILTIN_PRESETS.some((p) => p.label === label)) return
    persistCustoms([
      ...customs,
      {
        label,
        patch: {
          channel: s.channel, isMTT: s.isMTT, format: s.format,
          stakeLevel: s.stakeLevel, venue: s.venue, gameLabel: s.gameLabel,
        },
        custom: true,
      },
    ])
  }
  const set = <K extends keyof Session>(k: K, v: Session[K]) =>
    setS((cur) => ({ ...cur, [k]: v }))

  const result = (Number(s.cashOut) || 0) - (Number(s.buyInTotal) || 0)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      ...s,
      buyInTotal: Number(s.buyInTotal) || 0,
      cashOut: Number(s.cashOut) || 0,
      hours: Number(s.hours) || 0,
      hands: s.channel === 'online' && !s.isMTT && s.hands ? Number(s.hands) : undefined,
      result,
      stakeLevel: s.isMTT ? undefined : s.stakeLevel,
    })
  }

  return (
    <form onSubmit={submit}>
      {!initial && (
        <div className="pill-row" style={{ marginBottom: 12 }}>
          {[...BUILTIN_PRESETS, ...customs].map((p) => (
            <span key={p.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <button type="button" className="pill" onClick={() => setS((cur) => ({ ...cur, ...p.patch }))}>
                {p.label}
              </button>
              {p.custom && (
                <button
                  type="button"
                  className="pill"
                  style={{ padding: '7px 8px', color: 'var(--muted)' }}
                  title="Remove preset"
                  onClick={() => persistCustoms(customs.filter((c) => c.label !== p.label))}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {(s.venue || s.gameLabel) && (
            <button type="button" className="pill" style={{ borderStyle: 'dashed' }} onClick={saveAsPreset}>
              ☆ save preset
            </button>
          )}
        </div>
      )}
      <div className="field-row">
        <div className="field">
          <label>Date</label>
          <input
            className="input"
            type="date"
            value={s.date}
            onChange={(e) => set('date', e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: '0 0 auto' }}>
          <label>Hours</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            step="0.5"
            style={{ width: 90 }}
            value={s.hours || ''}
            onChange={(e) => set('hours', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="pill-row" style={{ marginBottom: 10 }}>
        {(['live', 'online'] as Channel[]).map((c) => (
          <button
            type="button"
            key={c}
            className={`pill${s.channel === c ? ' on' : ''}`}
            onClick={() => set('channel', c)}
          >
            {c}
          </button>
        ))}
        <button
          type="button"
          className={`pill${s.isMTT ? ' on' : ''}`}
          onClick={() => set('isMTT', !s.isMTT)}
        >
          {s.isMTT ? 'MTT ✓' : 'cash / MTT'}
        </button>
        <button
          type="button"
          className={`pill${s.isWsopFund ? ' on' : ''}`}
          onClick={() => set('isWsopFund', !s.isWsopFund)}
          title="Settle this session against the WSOP fund bucket"
        >
          {s.isWsopFund ? 'WSOP fund ✓' : 'WSOP fund'}
        </button>
      </div>

      <div className="field-row">
        <div className="field">
          <label>Format</label>
          <select
            className="select"
            value={s.format}
            onChange={(e) => set('format', e.target.value as Format)}
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        {!s.isMTT && (
          <div className="field">
            <label>Stake</label>
            <select
              className="select"
              value={s.stakeLevel}
              onChange={(e) => set('stakeLevel', e.target.value)}
            >
              {STAKES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="field">
        <label>Game label</label>
        <input
          className="input"
          placeholder='e.g. "5/5/10 PLO", "Sunday Major"'
          value={s.gameLabel}
          onChange={(e) => set('gameLabel', e.target.value)}
        />
      </div>

      <div className="field">
        <label>Venue</label>
        <input
          className="input"
          placeholder="Parx · Delaware Park · WSOP.com · BetRivers"
          value={s.venue}
          onChange={(e) => set('venue', e.target.value)}
        />
      </div>

      {s.channel === 'online' && !s.isMTT && (
        <div className="field">
          <label>Hands (optional — enables bb/100)</label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            placeholder="e.g. 1200"
            value={s.hands || ''}
            onChange={(e) => set('hands', Number(e.target.value))}
          />
        </div>
      )}

      <div className="field-row">
        <div className="field">
          <label>Buy-in (incl. rebuys)</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={s.buyInTotal || ''}
            onChange={(e) => set('buyInTotal', Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Cash-out</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={s.cashOut || ''}
            onChange={(e) => set('cashOut', Number(e.target.value))}
          />
        </div>
      </div>

      {s.isMTT && (
        <div className="field-row">
          <div className="field">
            <label>Entries</label>
            <input
              className="input"
              type="number"
              value={s.entries || ''}
              onChange={(e) => set('entries', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Place</label>
            <input
              className="input"
              type="number"
              value={s.place || ''}
              onChange={(e) => set('place', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Field</label>
            <input
              className="input"
              type="number"
              value={s.fieldSize || ''}
              onChange={(e) => set('fieldSize', Number(e.target.value))}
            />
          </div>
        </div>
      )}

      <div
        className="card card-2 row-split"
        style={{ marginBottom: 14, marginTop: 2 }}
      >
        <span className="card-label">Result</span>
        <span
          className={`stat-big ${result >= 0 ? 'pos' : 'neg'}`}
          style={{ fontSize: 24 }}
        >
          {money(result, { sign: true })}
        </span>
      </div>

      {/* Mental-game capture (feeds the Sunday review) */}
      <div className="field">
        <label>Mood</label>
        <div className="pill-row" style={{ marginBottom: 0 }}>
          {([1, 2, 3, 4, 5] as MoodRating[]).map((m) => (
            <button
              type="button"
              key={m}
              className={`pill${s.moodRating === m ? ' on' : ''}`}
              onClick={() => set('moodRating', m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Tilt / note</label>
        <textarea
          className="textarea"
          rows={2}
          placeholder="Anything that pulled you off A-game?"
          value={s.tiltNote || ''}
          onChange={(e) => set('tiltNote', e.target.value)}
        />
      </div>

      {/* The post-session two-line journal (playbook W1) — closes the loop on
          the pre-session intention set on Today. */}
      <div className="field">
        <label>
          Post-session journal
          {(() => {
            const intent = readIntention(s.date)
            return intent ? <span className="muted"> — intention was: “{intent}”</span> : null
          })()}
        </label>
        <textarea
          className="textarea"
          rows={2}
          placeholder="Two lines: how it went · one takeaway."
          value={s.journal || ''}
          onChange={(e) => set('journal', e.target.value)}
        />
      </div>

      <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 6 }}>
        {initial ? 'Save changes' : 'Log session'}
      </button>
      <div className="field-row" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-ghost btn-block" onClick={onCancel}>
          Cancel
        </button>
        {initial && onDelete && (
          <button
            type="button"
            className="btn btn-ghost btn-danger btn-block"
            onClick={() => onDelete(initial.id)}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  )
}
