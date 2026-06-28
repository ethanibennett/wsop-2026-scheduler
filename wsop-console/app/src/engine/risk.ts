// Bankroll risk engine — turns the framework's rules-of-thumb (risk of ruin,
// move-down floors, time to the WSOP-fund checkpoints) into real numbers via a
// Monte-Carlo forward simulation of the playing roll. NOT a forecast: it
// assumes a stable edge + normal weekly variance, which a real downswing or a
// game-quality shift will violate. A planning lens, not a promise.

import type { Session } from '../db/types'

export interface RateEstimate {
  perHour: number // $/hr win rate
  sdPerHour: number // $/hr standard deviation (one hour of play)
  hours: number
  sessions: number
  enough: boolean // enough sample to trust the estimate
}

// Estimate win rate + hourly variance from logged cash sessions (non-MTT,
// non-WSOP). Model: result_i ~ Normal(μ·hours_i, σ²·hours_i), so the residual
// e_i = result_i − μ·hours_i has variance σ²·hours_i ⇒ σ² = mean(e_i²/hours_i).
export function estimateRate(sessions: Session[]): RateEstimate {
  const cash = sessions.filter((s) => !s.isMTT && !s.isWsopFund && s.hours > 0)
  const hours = cash.reduce((a, s) => a + s.hours, 0)
  const result = cash.reduce((a, s) => a + s.result, 0)
  const perHour = hours > 0 ? result / hours : 0
  let v = 0
  for (const s of cash) {
    const e = s.result - perHour * s.hours
    v += (e * e) / s.hours
  }
  const denom = Math.max(1, cash.length - 1)
  const sdPerHour = cash.length >= 2 ? Math.sqrt(v / denom) : 0
  return {
    perHour,
    sdPerHour,
    hours,
    sessions: cash.length,
    // Need a real sample before the variance estimate means anything.
    enough: cash.length >= 10 && hours >= 30,
  }
}

// ── Win-rate significance: is the edge real, or just a small lucky sample? ──
// The framework's discipline: don't move up off a winning sample that variance
// could have produced. SE of the hourly rate = σ/√hours; 95% CI = μ ± 1.96·SE.
export type RateVerdict = 'winning' | 'likely-winning' | 'inconclusive' | 'losing'

export interface RateConfidence {
  perHour: number
  sdPerHour: number
  hours: number
  sessions: number
  se: number // standard error of the hourly rate
  margin: number // 1.96·SE (95% half-width)
  low: number // perHour − margin
  high: number // perHour + margin
  verdict: RateVerdict
  extraHoursToSignif: number | null // more hours to make a positive rate significant
}

export function rateConfidence(sessions: Session[]): RateConfidence {
  const e = estimateRate(sessions)
  const se = e.hours > 0 && e.sdPerHour > 0 ? e.sdPerHour / Math.sqrt(e.hours) : 0
  const margin = 1.96 * se
  const low = e.perHour - margin
  const high = e.perHour + margin

  let verdict: RateVerdict
  if (se === 0 || e.sessions < 2) verdict = 'inconclusive'
  else if (low > 0) verdict = 'winning'
  else if (high < 0) verdict = 'losing'
  else if (e.perHour > 0) verdict = 'likely-winning'
  else verdict = 'inconclusive'

  // Hours where μ·√h = 1.96·σ ⇒ h = (1.96σ/μ)². Only meaningful for a positive rate.
  let extraHoursToSignif: number | null = null
  if (e.perHour > 0 && e.sdPerHour > 0 && verdict !== 'winning') {
    const hNeeded = Math.pow((1.96 * e.sdPerHour) / e.perHour, 2)
    extraHoursToSignif = Math.max(0, Math.ceil(hNeeded - e.hours))
  }

  return {
    perHour: e.perHour,
    sdPerHour: e.sdPerHour,
    hours: e.hours,
    sessions: e.sessions,
    se,
    margin,
    low,
    high,
    verdict,
    extraHoursToSignif,
  }
}

export interface SimParams {
  startingRoll: number
  perHour: number
  sdPerHour: number
  hoursPerWeek: number
  weeks: number
  hardFloor: number // move-down-hard floor (~$25k)
  softFloor: number // move-down-soft floor (~$40k)
  targets: number[] // checkpoints to measure, e.g. [100000, 135000]
  paths?: number // simulation paths (default 2000)
  rng?: () => number // injectable for tests; defaults to Math.random
}

export interface SimResult {
  paths: number
  pHardFloor: number // P(roll ever touches the hard floor)
  pSoftFloor: number // P(roll ever touches the soft floor)
  pTargets: { target: number; p: number }[] // P(roll ever reaches each target)
  median: number // median ending roll
  p5: number
  p95: number
  medianMaxDrawdown: number // median of each path's worst peak-to-trough drop
  mean: number
}

// Standard normal via Box–Muller, driven by an injectable uniform RNG.
function gaussian(rng: () => number): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function quantile(sortedAsc: number[], q: number): number {
  if (!sortedAsc.length) return 0
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(q * (sortedAsc.length - 1))))
  return sortedAsc[i]
}

export function simulateBankroll(p: SimParams): SimResult {
  const rng = p.rng ?? Math.random
  const paths = Math.max(1, p.paths ?? 2000)
  const weeklyMean = p.perHour * p.hoursPerWeek
  const weeklySd = p.sdPerHour * Math.sqrt(Math.max(0, p.hoursPerWeek))

  const endings: number[] = []
  const drawdowns: number[] = []
  let hardHits = 0
  let softHits = 0
  const targetHits = p.targets.map(() => 0)

  for (let i = 0; i < paths; i++) {
    let roll = p.startingRoll
    let peak = roll
    let maxDd = 0
    let touchedHard = false
    let touchedSoft = false
    const reached = p.targets.map(() => false)

    for (let w = 0; w < p.weeks; w++) {
      roll += weeklyMean + weeklySd * gaussian(rng)
      if (roll > peak) peak = roll
      const dd = peak - roll
      if (dd > maxDd) maxDd = dd
      if (roll <= p.hardFloor) touchedHard = true
      if (roll <= p.softFloor) touchedSoft = true
      for (let t = 0; t < p.targets.length; t++) {
        if (roll >= p.targets[t]) reached[t] = true
      }
    }

    endings.push(roll)
    drawdowns.push(maxDd)
    if (touchedHard) hardHits++
    if (touchedSoft) softHits++
    for (let t = 0; t < p.targets.length; t++) if (reached[t]) targetHits[t]++
  }

  endings.sort((a, b) => a - b)
  drawdowns.sort((a, b) => a - b)
  const mean = endings.reduce((a, b) => a + b, 0) / endings.length

  return {
    paths,
    pHardFloor: hardHits / paths,
    pSoftFloor: softHits / paths,
    pTargets: p.targets.map((target, t) => ({ target, p: targetHits[t] / paths })),
    median: quantile(endings, 0.5),
    p5: quantile(endings, 0.05),
    p95: quantile(endings, 0.95),
    medianMaxDrawdown: quantile(drawdowns, 0.5),
    mean,
  }
}
