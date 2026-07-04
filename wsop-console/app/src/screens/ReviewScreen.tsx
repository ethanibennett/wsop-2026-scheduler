// Review (M6) — the Sunday review. Pulls the week's sessions / hours / mood /
// anchor-streak, prompts the three questions (anchor hold? what slipped? one
// thing to tighten), and saves a dated ReviewEntry. Prompts from
// docs/plan/mental-health-and-game.md.

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { getAll } from '../db/idb'
import type { ReviewEntry, HealthMetric } from '../db/types'
import { phaseState } from '../engine/phase'
import {
  hoursThisWeek,
  cashHoursThisWeek,
  wakeAnchorStreak,
  weeklyReadout,
  lifetimeStats,
  longestStreak,
  winRateByGroup,
} from '../engine/analytics'
import { useToast } from '../components/Toast'
import { computeBankroll } from '../engine/bankroll'
import { weightProgress } from '../engine/health'
import { milestones } from '../engine/milestones'
import { HOME_LIBRARY, CATEGORY_META, type HomeCategory } from '../db/home'
import { isThisWeek, todayISO, uid, fmtDate, fmtHours, money } from '../engine/format'

export function ReviewScreen() {
  const { sessions, adjustments, routine, reviews, settings, put } = useStore()
  const ps = phaseState(new Date(), settings.phaseOverride)
  const toast = useToast()

  const [metrics, setMetrics] = useState<HealthMetric[]>([])
  useEffect(() => {
    void getAll<HealthMetric>('health').then(setMetrics)
  }, [])

  // Home contributions this week (read from the Home card's localStorage).
  const homeWeek = useMemo(() => {
    let doneMap: Record<string, string[]> = {}
    try {
      doneMap = JSON.parse(localStorage.getItem('wsop-home-done') || '{}')
    } catch {
      doneMap = {}
    }
    const ids = new Set<string>()
    for (const [date, list] of Object.entries(doneMap)) {
      if (isThisWeek(date)) (list as string[]).forEach((id) => ids.add(id))
    }
    const byCat: Record<HomeCategory, number> = { load: 0, errand: 0, mental: 0, connection: 0 }
    for (const id of ids) {
      const t = HOME_LIBRARY.find((x) => x.id === id)
      if (t) byCat[t.category]++
    }
    return { total: ids.size, byCat }
  }, [sessions]) // recompute when the screen re-renders on data change

  // The weekly recap, as a shareable line — Wrapped for the grind week.
  const shareRecap = async () => {
    const wk = sessions.filter((s) => isThisWeek(s.date))
    const anchorDays = routine.filter((r) => isThisWeek(r.date) && r.wakeAnchor).length
    const best = winRateByGroup(wk).filter((g) => g.hours >= 2)[0]
    const bits = [
      `${week.count} session${week.count === 1 ? '' : 's'} · ${fmtHours(week.hours)}`,
      `${week.pnl >= 0 ? '+' : '−'}$${Math.abs(Math.round(week.pnl)).toLocaleString('en-US')}`,
      `anchor ${anchorDays}/7`,
    ]
    if (homeWeek.total > 0) bits.push(`${homeWeek.total} home contribution${homeWeek.total === 1 ? '' : 's'}`)
    if (best) bits.push(`best: ${best.key} ${money(best.perHour, { sign: true })}/h`)
    const text = `The week — ${bits.join(' · ')}`
    try {
      if (navigator.share) {
        await navigator.share({ text })
      } else {
        await navigator.clipboard.writeText(text)
        toast('Recap copied')
      }
    } catch {
      /* share sheet dismissed */
    }
  }

  const climb = useMemo(() => {
    const roll = computeBankroll(sessions, adjustments, settings.startingRoll).playingRoll
    const lbsLost = Math.max(0, weightProgress(metrics).lost)
    return milestones({ roll, anchorStreak: wakeAnchorStreak(routine), lbsLost })
  }, [sessions, adjustments, settings.startingRoll, metrics, routine])

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
  const readout = useMemo(
    () => weeklyReadout(sessions, routine, ps.phase?.weeklyCashHours ?? 0),
    [sessions, routine, ps.phase?.weeklyCashHours],
  )

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
        <div className="card-head">
          <span className="card-label">This week</span>
          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => void shareRecap()}>
            ↗ Share recap
          </button>
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

      {/* The climb — cross-domain milestones */}
      <div className="card">
        <div className="card-head">
          <span className="card-label">The climb</span>
          <span className="mono muted">{climb.achieved}/{climb.total} cleared</span>
        </div>
        {climb.list
          .filter((m) => m.done)
          .slice(-4)
          .reverse()
          .map((m) => (
            <div key={m.id} className="hl-row" style={{ padding: '4px 0', borderBottom: 'none' }}>
              <span className="pos" style={{ marginRight: 8 }}>✓</span>
              <span style={{ fontSize: 13 }}>{m.label}</span>
            </div>
          ))}
        {climb.next && (
          <div className="hl-row" style={{ padding: '6px 0 0', borderBottom: 'none' }}>
            <span className="muted" style={{ marginRight: 8 }}>▸</span>
            <span style={{ fontSize: 13 }} className="muted">Next: {climb.next.label}</span>
          </div>
        )}
      </div>

      {/* The long game — lifetime miles, for the rebuild's impatient days */}
      {(() => {
        const lt = lifetimeStats(sessions)
        if (lt.sessions < 3) return null
        const bestAnchor = longestStreak(routine, (r) => r.wakeAnchor)
        return (
          <div className="card">
            <div className="card-head">
              <span className="card-label">The long game</span>
              <span className={`mono ${lt.net >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
                {money(lt.net, { sign: true })}
              </span>
            </div>
            <div className="hl-row"><span className="muted">Career volume</span>
              <span className="mono">{fmtHours(lt.hours)} · {lt.sessions} sessions</span></div>
            {lt.biggestWin && (
              <div className="hl-row"><span className="muted">Biggest win</span>
                <span className="mono pos">{money(lt.biggestWin.result, { sign: true })} · {fmtDate(lt.biggestWin.date)}</span></div>
            )}
            {lt.bestMonth && (
              <div className="hl-row"><span className="muted">Best month</span>
                <span className="mono pos">{money(lt.bestMonth.result, { sign: true })}</span></div>
            )}
            {bestAnchor >= 3 && (
              <div className="hl-row"><span className="muted">Longest anchor streak</span>
                <span className="mono">{bestAnchor}d</span></div>
            )}
          </div>
        )
      })()}

      {/* Auto-readout — the week, half-written for you */}
      <div className="card">
        <div className="card-label" style={{ marginBottom: 10 }}>This week’s read</div>
        {readout.map((ins, i) => (
          <div key={i} className="hl-row" style={{ alignItems: 'flex-start', borderBottom: 'none', padding: '4px 0' }}>
            <span
              style={{
                color:
                  ins.tone === 'good' ? 'var(--good)' : ins.tone === 'bad' ? 'var(--bad)' : 'var(--muted)',
                marginRight: 8,
              }}
            >
              {ins.tone === 'good' ? '▲' : ins.tone === 'bad' ? '▼' : '•'}
            </span>
            <span style={{ fontSize: 13 }}>{ins.text}</span>
          </div>
        ))}
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          The data half of the review — read it, then answer the three below.
        </div>
      </div>

      {/* Home this week — contribution to the household */}
      <div className="card">
        <div className="card-head">
          <span className="card-label">Home this week</span>
          <span className="mono muted">{homeWeek.total} contributions</span>
        </div>
        {homeWeek.total === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>
            Nothing logged from the Home list yet this week — an easy place to show up for Ellie.
          </div>
        ) : (
          <div className="pill-row" style={{ marginBottom: 0 }}>
            {(Object.keys(homeWeek.byCat) as HomeCategory[])
              .filter((c) => homeWeek.byCat[c] > 0)
              .map((c) => (
                <span key={c} className="tag">
                  {CATEGORY_META[c].label} · {homeWeek.byCat[c]}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Mental game — what tilted you (the review's mental-game line) */}
      {(() => {
        const tilts = sessions.filter((s) => s.tiltNote?.trim()).slice(0, 4)
        if (tilts.length === 0) return null
        return (
          <div className="card">
            <div className="card-head">
              <span className="card-label">Mental game</span>
              {week.avgMood != null && <span className="mono muted">mood {week.avgMood.toFixed(1)}/5 this wk</span>}
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>What pulled you off A-game lately:</div>
            {tilts.map((s) => (
              <div key={s.id} className="hl-row" style={{ alignItems: 'flex-start', padding: '5px 0' }}>
                <span className="muted mono" style={{ fontSize: 11, marginRight: 8, flex: '0 0 auto' }}>{fmtDate(s.date)}</span>
                <span style={{ fontSize: 13 }}>{s.tiltNote}</span>
              </div>
            ))}
          </div>
        )
      })()}

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
