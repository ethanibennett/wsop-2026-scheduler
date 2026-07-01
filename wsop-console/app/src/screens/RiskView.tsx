// Bankroll → Risk: a Monte-Carlo lens on the framework's rules-of-thumb. Pulls
// the win rate + variance from logged cash sessions when there's enough sample,
// otherwise lets you dial assumptions. Sim math + tests live in engine/risk.ts.

import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { money, moneyK } from '../engine/format'
import { computeBankroll, FLOOR_SOFT, FLOOR_HARD, WSOP_FUND_OPEN_AT } from '../engine/bankroll'
import { estimateRate, simulateBankroll } from '../engine/risk'
import { phaseState } from '../engine/phase'

const WSOP_READY = 135000

function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

export function RiskView() {
  const { sessions, adjustments, settings } = useStore()

  const roll = useMemo(
    () => computeBankroll(sessions, adjustments, settings.startingRoll).playingRoll,
    [sessions, adjustments, settings.startingRoll],
  )
  const est = useMemo(() => estimateRate(sessions), [sessions])
  const ps = phaseState(new Date(), settings.phaseOverride)
  const phaseHrs = ps.phase?.weeklyCashHours ?? 25

  // Editable assumptions — seeded from the data estimate when it's trustworthy,
  // otherwise sensible PLO-ish defaults the user can dial.
  const [perHour, setPerHour] = useState(() =>
    est.enough && est.perHour ? Math.round(est.perHour) : 40,
  )
  const [sdPerHour, setSdPerHour] = useState(() =>
    est.enough && est.sdPerHour ? Math.round(est.sdPerHour) : 600,
  )
  const [hoursPerWeek, setHoursPerWeek] = useState(phaseHrs)
  const [weeks, setWeeks] = useState(44) // ~to WSOP 2027 from a mid-2026 start

  const sim = useMemo(
    () =>
      simulateBankroll({
        startingRoll: roll,
        perHour,
        sdPerHour,
        hoursPerWeek,
        weeks,
        hardFloor: FLOOR_HARD,
        softFloor: FLOOR_SOFT,
        targets: [WSOP_FUND_OPEN_AT, WSOP_READY],
        paths: 3000,
      }),
    [roll, perHour, sdPerHour, hoursPerWeek, weeks],
  )

  const num = (v: string) => Number(v) || 0

  return (
    <>
      <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
        A model, not a forecast — it assumes a stable edge and normal weekly variance.
        A real downswing or a softer/tougher game breaks those. Treat it as a planning lens.
      </div>

      {/* Assumptions */}
      <div className="card">
        <div className="card-head">
          <span className="card-label">Assumptions</span>
          <span className="mono muted" style={{ fontSize: 12 }}>
            {est.enough
              ? `from ${est.sessions} sessions`
              : 'edit these — not enough data yet'}
          </span>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Win rate $/hr</label>
            <input className="input" type="number" inputMode="decimal" value={perHour}
              onChange={(e) => setPerHour(num(e.target.value))} />
          </div>
          <div className="field">
            <label>Std dev $/hr</label>
            <input className="input" type="number" inputMode="decimal" value={sdPerHour}
              onChange={(e) => setSdPerHour(num(e.target.value))} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Hours / week</label>
            <input className="input" type="number" inputMode="decimal" value={hoursPerWeek}
              onChange={(e) => setHoursPerWeek(num(e.target.value))} />
          </div>
          <div className="field">
            <label>Horizon (weeks)</label>
            <input className="input" type="number" inputMode="numeric" value={weeks}
              onChange={(e) => setWeeks(num(e.target.value))} />
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          Starting from your current roll of <strong>{money(roll)}</strong>. {sim.paths.toLocaleString()} simulated paths.
        </div>
      </div>

      {/* Risk readouts */}
      <div className="card">
        <div className="card-label" style={{ marginBottom: 10 }}>Risk over {weeks} weeks</div>
        <div className="stat-row" style={{ marginBottom: 12 }}>
          <div className="card card-2">
            <div className="card-label">Hit ${moneyK(FLOOR_HARD).replace('$', '')} floor</div>
            <div className="stat-big" style={{ fontSize: 22, color: sim.pHardFloor > 0.1 ? 'var(--bad)' : 'var(--text)' }}>
              {pct(sim.pHardFloor)}
            </div>
            <div className="sess-meta">move-down-hard / reset risk</div>
          </div>
          <div className="card card-2">
            <div className="card-label">Touch ${moneyK(FLOOR_SOFT).replace('$', '')}</div>
            <div className="stat-big" style={{ fontSize: 22, color: sim.pSoftFloor > 0.3 ? 'var(--warn)' : 'var(--text)' }}>
              {pct(sim.pSoftFloor)}
            </div>
            <div className="sess-meta">move-down-soft at some point</div>
          </div>
        </div>
        <div className="hl-row">
          <span className="muted">Reach {moneyK(WSOP_FUND_OPEN_AT)} (fund opens)</span>
          <span className="mono">{pct(sim.pTargets[0].p)}</span>
        </div>
        <div className="hl-row">
          <span className="muted">Reach {moneyK(WSOP_READY)} (WSOP-ready)</span>
          <span className="mono">{pct(sim.pTargets[1].p)}</span>
        </div>
      </div>

      {/* Ending-roll distribution */}
      <div className="card">
        <div className="card-label" style={{ marginBottom: 10 }}>Where the roll lands</div>
        <div className="hl-row">
          <span className="muted">Unlucky (5th pct)</span>
          <span className={`mono ${sim.p5 >= roll ? 'pos' : 'neg'}`}>{money(sim.p5)}</span>
        </div>
        <div className="hl-row">
          <span style={{ fontWeight: 600 }}>Median</span>
          <span className="mono" style={{ fontWeight: 700 }}>{money(sim.median)}</span>
        </div>
        <div className="hl-row">
          <span className="muted">Lucky (95th pct)</span>
          <span className="mono pos">{money(sim.p95)}</span>
        </div>
        <div className="divider" />
        <div className="hl-row">
          <span className="muted">Typical worst drawdown</span>
          <span className="mono neg">−{money(sim.medianMaxDrawdown)}</span>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          {sim.pHardFloor > 0.05
            ? 'The hard-floor risk is the number that matters — if it’s uncomfortable, the lever is lower variance (sell more action, drop a stake) or more hours, not hope.'
            : 'Low ruin risk at these inputs — the move-down discipline is doing its job. Variance still bites; the drawdown number is what to stomach.'}
        </div>
      </div>
    </>
  )
}
