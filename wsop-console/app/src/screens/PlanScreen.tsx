// Plan (M4) — ported from reference/year-plan-timeline.html and
// reference/phase-1-detail.html. Two views (Year · Phase 1), a shared
// track filter, tap-to-expand cards, and the standard-week grid.

import { useState } from 'react'
import { PHASES } from '../db/seed'
import {
  PHASE_DETAIL,
  TRACK_ORDER,
  TRACK_LABEL,
  YEAR_NORTHSTAR,
  YEAR_GOALS,
  YEAR_LEGEND,
  YEAR_ENDCAP,
  PHASE1_SUB,
  PHASE1_ARC,
  STANDARD_WEEK,
  STANDARD_WEEK_NOTE,
  PHASE1_WEEKS,
  PHASE1_FOOT,
  type TrackKey,
} from '../db/plan'
import { phaseState } from '../engine/phase'
import { useStore } from '../store'
import { fmtDate } from '../engine/format'

type Filter = 'all' | TrackKey

function TrackFilter({ active, onPick }: { active: Filter; onPick: (f: Filter) => void }) {
  return (
    <div className="pl-filters">
      <button
        className={`pl-chip all${active === 'all' ? ' on' : ''}`}
        onClick={() => onPick('all')}
      >
        <span className="pl-dot" style={{ background: 'var(--bone)' }} />
        All
      </button>
      {TRACK_ORDER.map((k) => (
        <button
          key={k}
          className={`pl-chip${active === k ? ' on' : ''}`}
          style={{ color: `var(--t-${k})` }}
          onClick={() => onPick(k)}
        >
          <span className="pl-dot" style={{ background: `var(--t-${k})` }} />
          {TRACK_LABEL[k]}
        </button>
      ))}
    </div>
  )
}

function Tracks({ tracks, active }: { tracks: Partial<Record<TrackKey, string>>; active: Filter }) {
  return (
    <>
      {TRACK_ORDER.filter((k) => tracks[k]).map((k) => {
        const dim = active !== 'all' && active !== k
        return (
          <div key={k} className={`pl-track t-${k}${dim ? ' dim' : ''}`}>
            <div className="pl-tl" />
            <div className="pl-tc">
              <div className="pl-tn">{TRACK_LABEL[k]}</div>
              <div className="pl-tt">{tracks[k]}</div>
            </div>
          </div>
        )
      })}
    </>
  )
}

function YearView({ active, currentId }: { active: Filter; currentId?: number }) {
  const [open, setOpen] = useState<Record<number, boolean>>({})
  return (
    <>
      <p className="pl-northstar">{YEAR_NORTHSTAR}</p>
      <div className="pl-goals">
        {YEAR_GOALS.map((g) => (
          <span key={g}>{g}</span>
        ))}
      </div>
      <div className="pl-legend">
        {YEAR_LEGEND.map((l) => (
          <span key={l.rotation}>
            <i className={`r-${l.rotation}`} />
            {l.t}
          </span>
        ))}
      </div>
      <p className="pl-hint">Tap a phase to open it · filter by track</p>

      <div className="pl-timeline">
        {PHASES.map((p) => {
          const d = PHASE_DETAIL[p.id]
          const here = currentId === p.id
          const isOpen = !!open[p.id]
          return (
            <div key={p.id} className={`pl-phase r-${d.rotation}${here ? ' here' : ''}`}>
              <span className="pl-node" />
              <div className={`pl-card${isOpen ? ' open' : ''}`}>
                <button
                  className="pl-head"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}
                >
                  <div className="pl-pnum">
                    PHASE {p.id}
                    {here && <span className="pl-now">NOW</span>}
                  </div>
                  <div className="pl-ptop">
                    <span className="pl-pname">{p.name}</span>
                    <span className="pl-pdate">
                      {fmtDate(p.start)} – {fmtDate(p.end)}
                    </span>
                  </div>
                  <div className="pl-ptheme">{p.theme}</div>
                  <span className={`pl-badge r-${d.rotation}`}>{d.badge}</span>
                </button>
                <div className="pl-body">
                  <div className="pl-bodyinner">
                    <div className="pl-segs">
                      {d.segs.map((s) => (
                        <div key={s.t} className={`pl-seg${s.free ? ' free' : ''}`}>
                          <b>{s.t}</b>
                          {s.d}
                        </div>
                      ))}
                    </div>
                    <Tracks tracks={d.tracks} active={active} />
                    {d.marker && <div className="pl-marker">{d.marker}</div>}
                    {d.series && (
                      <>
                        <div className="pl-serieslabel">On the calendar</div>
                        {d.series.map((s) => (
                          <div key={s.name} className="pl-series">
                            <div className="pl-stop">
                              <span className="pl-sname">{s.name}</span>
                              <span className="pl-sdate">{s.date}</span>
                            </div>
                            <div className="pl-snote">{s.note}</div>
                            <span className={`pl-stag ${s.tag[0]}`}>{s.tag[1]}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="pl-endcap">{YEAR_ENDCAP}</div>
    </>
  )
}

function PhaseView({ active, currentWeek }: { active: Filter; currentWeek?: number }) {
  const [open, setOpen] = useState<Record<number, boolean>>({})
  const p1 = PHASES[0]
  return (
    <>
      <p className="pl-dates">
        {fmtDate(p1.start)} – {fmtDate(p1.end)}, 2026 · 9 weeks · Ellie in school (pre-rotation)
      </p>
      <p className="pl-sub">{PHASE1_SUB}</p>

      <div className="pl-arc">
        {PHASE1_ARC.map((s) => (
          <div key={s.w} className={`pl-step${s.hot ? ' hot' : ''}`}>
            {s.w}
            <b>{s.t}</b>
          </div>
        ))}
      </div>

      <div className="pl-gridpanel">
        <h2>The standard week (W6+ steady state)</h2>
        <div className="pl-week">
          {STANDARD_WEEK.map((d) => (
            <div key={d.d} className={`pl-day ${d.k}`}>
              <div className="pl-dn">{d.d}</div>
              <div className="pl-dt">{d.t}</div>
            </div>
          ))}
        </div>
        <p className="pl-gridnote">{STANDARD_WEEK_NOTE}</p>
      </div>

      <p className="pl-hint">Tap a week to open it · filter by track</p>

      <div className="pl-timeline">
        {PHASE1_WEEKS.map((w) => {
          const here = currentWeek === w.n
          const isOpen = !!open[w.n]
          return (
            <div key={w.n} className={`pl-wk${w.cls ? ' ' + w.cls : ''}${here ? ' here' : ''}`}>
              <span className="pl-node" />
              <div className={`pl-card${isOpen ? ' open' : ''}`}>
                <button
                  className="pl-head"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((o) => ({ ...o, [w.n]: !o[w.n] }))}
                >
                  <div className="pl-htop">
                    <span className="pl-wn">
                      WEEK {w.n}
                      {here && <span className="pl-now">NOW</span>}
                    </span>
                    <span className="pl-wd">{w.dates}</span>
                  </div>
                  <div className="pl-hl">{w.hl}</div>
                  {(w.event || w.ramp) && (
                    <div className="pl-tagrow">
                      {w.event && <span className="pl-ev">◆ {w.event}</span>}
                      {w.ramp && <span className="pl-ramp">{w.ramp}</span>}
                    </div>
                  )}
                </button>
                <div className="pl-body">
                  <div className="pl-bodyinner">
                    <Tracks tracks={w.tracks} active={active} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="pl-foot">{PHASE1_FOOT}</div>
    </>
  )
}

export function PlanScreen() {
  const [view, setView] = useState<'year' | 'phase'>('year')
  const [active, setActive] = useState<Filter>('all')
  const { settings } = useStore()
  const ps = phaseState(new Date(), settings.phaseOverride)

  return (
    <div className="screen plan">
      <h1 className="screen-title">Plan</h1>
      <div className="screen-sub">the year · the phase</div>

      <div className="pill-row">
        <button className={`pill${view === 'year' ? ' on' : ''}`} onClick={() => setView('year')}>
          Year
        </button>
        <button className={`pill${view === 'phase' ? ' on' : ''}`} onClick={() => setView('phase')}>
          Phase 1
        </button>
      </div>

      <TrackFilter active={active} onPick={setActive} />

      {view === 'year' ? (
        <YearView active={active} currentId={ps.phase?.id} />
      ) : (
        <PhaseView active={active} currentWeek={ps.phase?.id === 1 ? ps.week : undefined} />
      )}
    </div>
  )
}
