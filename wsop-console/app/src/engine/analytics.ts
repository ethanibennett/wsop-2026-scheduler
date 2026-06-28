// Win-rate + volume + streak analytics — the "where's my edge actually" read
// that feeds game selection and the Sunday review.

import type { Session, RoutineLog } from '../db/types'
import { isThisWeek, localDate } from './format'

/**
 * Big blind parsed from a stake level. These PLO notations are SB/BB/straddle,
 * so the big blind is the SECOND number (not the straddle): "2/2/5" → 2,
 * "5/5/10" → 5, "5/10/30" → 10, "10/20/40" → 20. Two-number NLH ("1/2") → 2.
 * 0 if unparseable. (Approximation for normalized rate, not exact for every room.)
 */
export function bigBlind(stakeLevel?: string): number {
  if (!stakeLevel) return 0
  const nums = stakeLevel
    .split('/')
    .map((x) => parseFloat(x))
    .filter((n) => !Number.isNaN(n))
  if (!nums.length) return 0
  return nums.length >= 3 ? nums[1] : nums[nums.length - 1]
}

// Cash groups under this many hours are too small to read edge off.
export const SMALL_SAMPLE_HOURS = 20

export interface GroupStat {
  key: string // "PLO · 5/5/10"
  format: string
  stakeLevel: string
  sessions: number
  hours: number
  hands: number
  handsResult: number // result from ONLY the hands-tracked sessions (bb/100 numerator)
  result: number
  perHour: number // $/hr — the headline edge read
  bb: number // big blind for this group (0 for MTT / unparseable)
  bbPerHour: number // normalized rate — compares a soft 5/5/10 vs a tough 5/10/30
  bbPer100: number | null // true bb/100 from hands-tracked sessions only, else null
  smallSample: boolean // < SMALL_SAMPLE_HOURS and not MTT
}

/** Win-rate grouped by format + stakeLevel (cash) or format (MTT). */
export function winRateByGroup(sessions: Session[]): GroupStat[] {
  const map = new Map<string, GroupStat>()
  for (const s of sessions) {
    const stake = s.isMTT ? 'MTT' : s.stakeLevel || '—'
    const key = `${s.format} · ${stake}`
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        format: s.format,
        stakeLevel: stake,
        sessions: 0,
        hours: 0,
        hands: 0,
        handsResult: 0,
        result: 0,
        perHour: 0,
        bb: s.isMTT ? 0 : bigBlind(s.stakeLevel),
        bbPerHour: 0,
        bbPer100: null,
        smallSample: false,
      }
      map.set(key, g)
    }
    g.sessions += 1
    g.hours += s.hours
    g.result += s.result
    // bb/100 must use only sessions that logged hands, or live sessions sharing
    // the same stake string would inflate the numerator with no hands behind it.
    if (s.hands) {
      g.hands += s.hands
      g.handsResult += s.result
    }
  }
  const out = [...map.values()]
  for (const g of out) {
    g.perHour = g.hours > 0 ? g.result / g.hours : 0
    g.bbPerHour = g.bb > 0 && g.hours > 0 ? g.perHour / g.bb : 0
    g.bbPer100 =
      g.bb > 0 && g.hands > 0 ? g.handsResult / g.bb / (g.hands / 100) : null
    g.smallSample = g.bb > 0 && g.hours < SMALL_SAMPLE_HOURS
  }
  // Most-played first.
  return out.sort((a, b) => b.hours - a.hours)
}

// ── Cumulative P&L (the graph) ──
export interface PnlPoint {
  date: string
  cum: number
}

/** Running total over time. Excludes WSOP-fund sessions; cashOnly drops MTTs. */
export function cumulativePnl(
  sessions: Session[],
  opts: { cashOnly?: boolean } = {},
): PnlPoint[] {
  const list = sessions
    .filter((s) => !s.isWsopFund && (!opts.cashOnly || !s.isMTT))
    .sort((a, b) => a.date.localeCompare(b.date))
  let cum = 0
  return list.map((s) => {
    cum += s.result
    return { date: s.date, cum }
  })
}

// ── Monthly breakdown ──
export interface MonthStat {
  month: string // "2026-08"
  sessions: number
  hours: number
  result: number
  perHour: number
}

export function monthlyBreakdown(sessions: Session[]): MonthStat[] {
  const map = new Map<string, MonthStat>()
  for (const s of sessions) {
    if (s.isWsopFund) continue
    const month = s.date.slice(0, 7)
    const m =
      map.get(month) ?? { month, sessions: 0, hours: 0, result: 0, perHour: 0 }
    m.sessions += 1
    m.hours += s.hours
    m.result += s.result
    map.set(month, m)
  }
  const out = [...map.values()]
  for (const m of out) m.perHour = m.hours > 0 ? m.result / m.hours : 0
  return out.sort((a, b) => b.month.localeCompare(a.month))
}

// ── MTT-specific (ROI + ITM) ──
export interface MttStats {
  tournaments: number
  entries: number
  cashes: number
  itmPct: number // cashes / tournaments
  buyIns: number
  result: number
  roi: number // result / buyIns, %
}

export function mttStats(sessions: Session[]): MttStats | null {
  const mtts = sessions.filter((s) => s.isMTT)
  if (!mtts.length) return null
  const entries = mtts.reduce((a, s) => a + (s.entries || 1), 0)
  const cashes = mtts.filter((s) => s.cashOut > 0).length
  const buyIns = mtts.reduce((a, s) => a + s.buyInTotal, 0)
  const result = mtts.reduce((a, s) => a + s.result, 0)
  return {
    tournaments: mtts.length,
    entries,
    cashes,
    itmPct: (cashes / mtts.length) * 100,
    buyIns,
    result,
    roi: buyIns > 0 ? (result / buyIns) * 100 : 0,
  }
}

export interface Totals {
  sessions: number
  hours: number
  result: number
  perHour: number
}

export function totals(sessions: Session[]): Totals {
  const hours = sessions.reduce((a, s) => a + s.hours, 0)
  const result = sessions.reduce((a, s) => a + s.result, 0)
  return {
    sessions: sessions.length,
    hours,
    result,
    perHour: hours > 0 ? result / hours : 0,
  }
}

/** Cash hours logged this week (live + online, non-MTT). */
export function cashHoursThisWeek(sessions: Session[]): number {
  return sessions
    .filter((s) => !s.isMTT && isThisWeek(s.date))
    .reduce((a, s) => a + s.hours, 0)
}

/** All hours (cash + MTT) this week. */
export function hoursThisWeek(sessions: Session[]): number {
  return sessions.filter((s) => isThisWeek(s.date)).reduce((a, s) => a + s.hours, 0)
}

// ── Downswing detection: "a math event, not a verdict on you" ──
// You can't install a downswing protocol mid-downswing, so detect it early from
// the logs and surface the written one. Signals: drawdown from the cash-P&L
// peak, and the current losing-session streak.
export interface DownswingState {
  current: number // cumulative cash P&L now
  peak: number // its running peak (>= 0 baseline)
  drawdown: number // peak − current ($, ≥ 0)
  lossStreak: number // consecutive most-recent losing cash sessions
  sessionsSincePeak: number
}

export function downswingState(sessions: Session[]): DownswingState {
  const pnl = cumulativePnl(sessions, { cashOnly: true }) // ascending by date
  let peak = 0
  let current = 0
  let sincePeak = 0
  for (const p of pnl) {
    current = p.cum
    if (p.cum >= peak) {
      peak = p.cum
      sincePeak = 0
    } else {
      sincePeak++
    }
  }
  const cash = sessions
    .filter((s) => !s.isMTT && !s.isWsopFund)
    .sort((a, b) => b.date.localeCompare(a.date))
  let lossStreak = 0
  for (const s of cash) {
    if (s.result < 0) lossStreak++
    else break
  }
  return { current, peak, drawdown: Math.max(0, peak - current), lossStreak, sessionsSincePeak: sincePeak }
}

export type DownswingLevel = 'none' | 'watch' | 'deep'

/** Severity from the drawdown (in buy-ins of the current stake) + loss streak. */
export function downswingSeverity(state: DownswingState, buyIn: number): DownswingLevel {
  const bi = buyIn > 0 ? state.drawdown / buyIn : 0
  if (state.lossStreak >= 5 || bi >= 15) return 'deep'
  if (state.lossStreak >= 3 || bi >= 7) return 'watch'
  return 'none'
}

// ── Edge drivers: does the life-system actually move $/hr? ──
// The plan's core bet is that rhythm/headspace → better poker. Test it with the
// player's own logs by splitting cash $/hr on a condition (anchor held, mood).
const EDGE_MIN_SIDE = 3 // sessions each side before a delta means anything

export interface EdgeSide {
  n: number
  hours: number
  perHour: number
}
export interface EdgeSplit {
  label: string // condition-true side, e.g. "anchor held"
  altLabel: string // condition-false side, e.g. "anchor missed"
  a: EdgeSide
  b: EdgeSide
  delta: number | null // a.perHour − b.perHour; null if either side is too small
}

function side(sessions: Session[]): EdgeSide {
  const hours = sessions.reduce((x, s) => x + s.hours, 0)
  const result = sessions.reduce((x, s) => x + s.result, 0)
  return { n: sessions.length, hours, perHour: hours > 0 ? result / hours : 0 }
}

/**
 * Split cash sessions by a predicate (true → side a, false → side b, null →
 * excluded) and compare $/hr. delta is null unless both sides clear EDGE_MIN_SIDE.
 */
export function edgeBy(
  sessions: Session[],
  predicate: (s: Session) => boolean | null,
  label: string,
  altLabel: string,
): EdgeSplit {
  const a: Session[] = []
  const b: Session[] = []
  for (const s of sessions) {
    if (s.isMTT || s.isWsopFund) continue
    const v = predicate(s)
    if (v === true) a.push(s)
    else if (v === false) b.push(s)
  }
  const sa = side(a)
  const sb = side(b)
  const delta = sa.n >= EDGE_MIN_SIDE && sb.n >= EDGE_MIN_SIDE ? sa.perHour - sb.perHour : null
  return { label, altLabel, a: sa, b: sb, delta }
}

/** $/hr on days the wake-anchor held vs not (joined to RoutineLog by date). */
export function rhythmEdge(sessions: Session[], routine: RoutineLog[]): EdgeSplit {
  const heldDates = new Set(routine.filter((r) => r.wakeAnchor).map((r) => r.date))
  return edgeBy(sessions, (s) => heldDates.has(s.date), 'anchor held', 'anchor missed')
}

/** $/hr in good headspace (mood 4–5) vs off (1–2); neutral/unrated excluded. */
export function moodEdge(sessions: Session[]): EdgeSplit {
  return edgeBy(
    sessions,
    (s) => (s.moodRating == null || s.moodRating === 3 ? null : s.moodRating >= 4),
    'good headspace',
    'off A-game',
  )
}

// ── Tax (the 2026 OBBBA 90%-loss rule + "phantom income") ──
export interface TaxEstimate {
  year: number
  winnings: number // sum of winning sessions
  losses: number // sum of |losing sessions|
  net: number // winnings - losses (what you actually made)
  deductibleLosses: number // min(rate * losses, winnings)
  taxable: number // winnings - deductibleLosses
  phantom: number // taxable - net: income you're taxed on but never pocketed
}

/**
 * Gambling tax read for a year. Under OBBBA (TY2026) losses are only 90%
 * deductible against winnings — a break-even year can still be taxed on
 * "phantom income". NOT tax advice — the agenda to put in front of the CPA.
 */
export function taxEstimate(
  sessions: Session[],
  year: number,
  lossDeductRate = 0.9,
): TaxEstimate {
  let winnings = 0
  let losses = 0
  for (const s of sessions) {
    if (Number(s.date.slice(0, 4)) !== year) continue
    if (s.result >= 0) winnings += s.result
    else losses += -s.result
  }
  const net = winnings - losses
  const deductibleLosses = Math.min(lossDeductRate * losses, winnings)
  const taxable = winnings - deductibleLosses
  return {
    year,
    winnings,
    losses,
    net,
    deductibleLosses,
    taxable,
    phantom: taxable - net,
  }
}

// ── Streaks (RoutineLog) — wake anchor is the headline metric ──
function streak(logs: RoutineLog[], pick: (l: RoutineLog) => boolean | undefined): number {
  const byDate = new Map(logs.map((l) => [l.date, l]))
  let count = 0
  // Records are keyed by todayISO() = LOCAL calendar date. Walk back in local
  // date space so key 1 == todayISO() and the keys match stored records.
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  // Allow today to be unlogged without breaking the streak.
  let allowSkipToday = true
  for (;;) {
    const key = localDate(d)
    const log = byDate.get(key)
    if (log && pick(log)) {
      count += 1
      allowSkipToday = false
    } else if (allowSkipToday) {
      allowSkipToday = false
    } else {
      break
    }
    d.setDate(d.getDate() - 1)
    if (count > 400) break
  }
  return count
}

export function wakeAnchorStreak(logs: RoutineLog[]): number {
  return streak(logs, (l) => l.wakeAnchor)
}

export function windDownStreak(logs: RoutineLog[]): number {
  return streak(logs, (l) => l.windDown)
}
