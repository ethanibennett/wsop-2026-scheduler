// Review (M6) — the Sunday review. Pulls the week's sessions / hours / mood /
// anchor-streak, prompts the three questions (anchor hold? what slipped? one
// thing to tighten), and saves a dated ReviewEntry. Prompts from
// docs/plan/mental-health-and-game.md.

import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { ReviewEntry } from '../db/types'
import { phaseState } from '../engine/phase'
import { hoursThisWeek, cashHoursThisWeek, wakeAnchorStreak } from '../engine/analytics'
import { isThisWeek, todayISO, uid, fmtDate, fmtHours } from '../engine/format'

export function ReviewScreen() {
  const { sessions, routine, reviews, settings, put } = useStore()
  const ps = phaseState(new Date(), settings.phaseOverride)

  const week = useMemo(() => {
    const wk = sessions.filter((s) => isThisWeek(s.date))
    const moods = wk
      .map((s) => s.moodRating)
      .filter((m): m is NonNullable<typeof m> => m != null)
    const avgMood = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null
    return {
      count: wk.length,
      hours: hoursThisWeek(sessions),
      cashHours: cashHoursThisWeek(sessions),
      pnl: wk.reduce((a, s) => a + s.result, 0),
      avgMood,
    }
  }, [sessions])

  const anchorStreak = wakeAnchorStreak(routine)

  const [anchorHeld, setAnchorHeld] = useState<boolean | undefined>(undefined)
  const [whatSlipped, setWhatSlipped] = useState('')
  const [oneThing, setOneThing] = useState('')

  const save = async () => {
    const entry: ReviewEntry = {
      id: uid(),
      date: todayISO(),
      weekN: ps.phase?.id === 1 ? ps.week : 0,
      anchorHeld,
      whatSlipped: whatSlipped.trim(),
      oneThing: oneThing.trim(),
    }
    await put('reviews', entry)
    setAnchorHeld(undefined)
    setWhatSlipped('')
    setOneThing('')
  }

  const canSave = whatSlipped.trim() || oneThing.trim() || anchorHeld != null

  return (
    <div className="screen">
      <h1 className="screen-title">Review</h1>
      <div className="screen-sub">the Sunday review · pre-grind</div>

      {/* Week at a glance */}
      <div className="card">
        <div className="card-label" style={{ marginBottom: 12 }}>
          This week
        </div>
        <div className="rv-stats">
          <div>
            <div className="rv-num mono">{week.count}</div>
            <div className="rv-lbl">sessions</div>
          </div>
          <div>
            <div className="rv-num mono">{fmtHours(week.hours)}</div>
            <div className="rv-lbl">hours</div>
          </div>
          <div>
            <div className={`rv-num mono ${week.pnl >= 0 ? 'pos' : 'neg'}`}>
              {week.pnl >= 0 ? '+' : '−'}${Math.abs(Math.round(week.pnl)).toLocaleString('en-US')}
            </div>
            <div className="rv-lbl">result</div>
          </div>
          <div>
            <div className="rv-num mono">{week.avgMood ? week.avgMood.toFixed(1) : '—'}</div>
            <div className="rv-lbl">avg mood</div>
          </div>
          <div>
            <div className="rv-num mono">{anchorStreak}</div>
            <div className="rv-lbl">anchor streak</div>
          </div>
          <div>
            <div className="rv-num mono">{fmtHours(week.cashHours)}</div>
            <div className="rv-lbl">cash hrs</div>
          </div>
        </div>
      </div>

      {/* The three prompts */}
      <div className="card">
        <div className="field">
          <label>Did the wake anchor hold?</label>
          <div className="pill-row" style={{ marginBottom: 0 }}>
            <button
              className={`pill${anchorHeld === true ? ' on' : ''}`}
              onClick={() => setAnchorHeld(true)}
            >
              Held
            </button>
            <button
              className={`pill${anchorHeld === false ? ' on' : ''}`}
              onClick={() => setAnchorHeld(false)}
            >
              Slipped
            </button>
          </div>
        </div>
        <div className="field">
          <label>What slipped?</label>
          <textarea
            className="textarea"
            rows={3}
            value={whatSlipped}
            placeholder="The one thing that wobbled this week…"
            onChange={(e) => setWhatSlipped(e.target.value)}
          />
        </div>
        <div className="field">
          <label>One thing to tighten</label>
          <textarea
            className="textarea"
            rows={2}
            value={oneThing}
            placeholder="Pick one. Then play."
            onChange={(e) => setOneThing(e.target.value)}
          />
        </div>
        <button className="btn btn-gold btn-block" disabled={!canSave} onClick={save}>
          Save review
        </button>
      </div>

      {/* Past reviews */}
      {reviews.length > 0 && (
        <div className="card">
          <div className="card-label" style={{ marginBottom: 8 }}>
            Past reviews
          </div>
          {reviews.map((r) => (
            <div className="rv-past" key={r.id}>
              <div className="rv-past-head">
                <span className="mono muted">{fmtDate(r.date)}</span>
                {r.anchorHeld != null && (
                  <span className={`tag ${r.anchorHeld ? 'pos' : 'neg'}`}>
                    {r.anchorHeld ? 'anchor held' : 'anchor slipped'}
                  </span>
                )}
              </div>
              {r.oneThing && <div className="rv-past-one">→ {r.oneThing}</div>}
              {r.whatSlipped && <div className="muted" style={{ fontSize: 13 }}>{r.whatSlipped}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
