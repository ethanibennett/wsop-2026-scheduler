// M3–M6 screens — scaffolded with clear pointers to the source assets they
// port from. Each renders something useful (the seeded plan data) so the tab
// is not dead, and flags exactly which missing asset fills it in.

import { useState } from 'react'
import { PHASES, PLAN_WEEKS, TRACKS } from '../db/seed'
import { phaseState } from '../engine/phase'
import { useStore } from '../store'
import { fmtDate } from '../engine/format'

export function TrainingScreen() {
  return (
    <div className="screen">
      <h1 className="screen-title">Training</h1>
      <div className="screen-sub">M3 · strength log</div>
      <div className="placeholder-note">
        Port <code>reference/lift-log.html</code> here: Mon/Wed/Fri sessions with
        the specific lifts, last-session reference, progressive-overload display,
        the pre-op/build toggle, benchmarks, and the prehab checklist.
        <br />
        <br />
        Data model is ready in <code>db/types.ts</code> (
        <code>LiftEntry</code>, <code>Benchmark</code>, <code>PrehabTick</code>)
        and the IndexedDB stores (<code>lifts</code>, <code>benchmarks</code>,{' '}
        <code>prehab</code>) already exist. Swap the prototype’s{' '}
        <code>window.storage</code> for these.
        <br />
        <br />
        Source: <code>docs/plan/training-plan.md</code>.
      </div>
    </div>
  )
}

export function PlanScreen() {
  const [view, setView] = useState<'year' | 'phase'>('year')
  const { settings } = useStore()
  const ps = phaseState(new Date(), settings.phaseOverride)

  return (
    <div className="screen">
      <h1 className="screen-title">Plan</h1>
      <div className="screen-sub">M4 · the year, the phase</div>

      <div className="pill-row">
        <button className={`pill${view === 'year' ? ' on' : ''}`} onClick={() => setView('year')}>
          Year
        </button>
        <button className={`pill${view === 'phase' ? ' on' : ''}`} onClick={() => setView('phase')}>
          Phase 1
        </button>
      </div>

      {view === 'year' ? (
        <div className="card">
          <div className="card-label" style={{ marginBottom: 10 }}>6 phases</div>
          {PHASES.map((p) => {
            const here = ps.phase?.id === p.id
            return (
              <div
                key={p.id}
                className={`ladder-step${here ? ' current' : ''}`}
              >
                <span
                  className="ladder-dot"
                  style={here ? { background: 'var(--chip)', borderColor: 'var(--chip)' } : undefined}
                />
                <div className="ladder-meta">
                  <div className="ladder-name">
                    P{p.id} · {p.name}
                  </div>
                  <div className="sess-meta">
                    {fmtDate(p.start)} – {fmtDate(p.end)} · {p.theme}
                  </div>
                </div>
                {here && <span className="ladder-cleared-tag">NOW</span>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card">
          <div className="card-label" style={{ marginBottom: 10 }}>Phase 1 · 9 weeks</div>
          {PLAN_WEEKS.map((w) => (
            <div className="ladder-step" key={w.n} style={{ alignItems: 'flex-start' }}>
              <span className="ladder-amt" style={{ width: 40 }}>W{w.n}</span>
              <div className="ladder-meta">
                <div className="ladder-name">{w.headline}</div>
                <div className="sess-meta">{w.dates}</div>
                {w.ramp && (
                  <span
                    className="tag"
                    style={{ marginTop: 6, color: 'var(--chip)', background: 'var(--surface-2)' }}
                  >
                    ⤴ {w.ramp}
                  </span>
                )}
                <div style={{ marginTop: 6 }}>
                  {Object.entries(w.tracks).map(([k, v]) => {
                    const tr = TRACKS.find((t) => t.key === k)
                    return (
                      <div key={k} className="sess-meta" style={{ marginTop: 2 }}>
                        <span style={{ color: tr?.color }}>● </span>
                        {v}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="placeholder-note">
        These render the <strong>seeded placeholder</strong> plan data. Port the
        real graphics from <code>reference/year-plan-timeline.html</code> and{' '}
        <code>reference/phase-1-detail.html</code> (track filters, tap-to-expand,
        the standard-week grid, day templates), with content from{' '}
        <code>docs/plan/phase-1-playbook.md</code>.
      </div>
    </div>
  )
}

export function ReviewScreen() {
  return (
    <div className="screen">
      <h1 className="screen-title">Review</h1>
      <div className="screen-sub">M6 · the Sunday review</div>
      <div className="placeholder-note">
        Build the Sunday review here: pull the week’s sessions / hours / mood /
        anchor-streak and prompt the three questions — <em>anchor hold? what
        slipped? one thing to tighten</em> — then save a dated{' '}
        <code>ReviewEntry</code> (store + type already exist).
        <br />
        <br />
        Prompts source: <code>docs/plan/mental-health-and-game.md</code>.
      </div>
    </div>
  )
}
