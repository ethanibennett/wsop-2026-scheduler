// Win-rate + volume + streak analytics — the "where's my edge actually" read
// that feeds game selection and the Sunday review.

import type { Session, RoutineLog, Expense, ExpenseCategory } from '../db/types'
import { isThisWeek, localDate, money, fmtHours } from './format'

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

// ── Venue breakdown — game selection by room (Parx / Delaware / online) ──
export interface VenueStat {
  venue: string
  sessions: number
  hours: number
  result: number
  perHour: number
}

export function byVenue(sessions: Session[]): VenueStat[] {
  const map = new Map<string, VenueStat>()
  for (const s of sessions) {
    if (s.isWsopFund) continue
    const venue = s.venue?.trim() || s.channel
    const v = map.get(venue) ?? { venue, sessions: 0, hours: 0, result: 0, perHour: 0 }
    v.sessions += 1
    v.hours += s.hours
    v.result += s.result
    map.set(venue, v)
  }
  const out = [...map.values()]
  for (const v of out) v.perHour = v.hours > 0 ? v.result / v.hours : 0
  return out.sort((a, b) => b.hours - a.hours)
}

// ── Day-of-week — which nights actually run best (Mon-first) ──
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export interface WeekdayStat {
  weekday: number // 0 = Mon
  label: string
  sessions: number
  hours: number
  result: number
  perHour: number
}

export function byWeekday(sessions: Session[]): WeekdayStat[] {
  const out: WeekdayStat[] = WEEKDAYS.map((label, weekday) => ({
    weekday, label, sessions: 0, hours: 0, result: 0, perHour: 0,
  }))
  for (const s of sessions) {
    if (s.isWsopFund) continue
    const dow = (new Date(s.date + 'T00:00:00').getDay() + 6) % 7 // 0 = Mon
    out[dow].sessions += 1
    out[dow].hours += s.hours
    out[dow].result += s.result
  }
  for (const d of out) d.perHour = d.hours > 0 ? d.result / d.hours : 0
  return out
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

// ── Weekly auto-readout: the Sunday review, half-written from the data ──
export interface Insight {
  tone: 'good' | 'bad' | 'neutral'
  text: string
}

export function weeklyReadout(
  sessions: Session[],
  routine: RoutineLog[],
  targetHours: number,
): Insight[] {
  const wk = sessions.filter((s) => isThisWeek(s.date))
  if (wk.length === 0) return [{ tone: 'neutral', text: 'No sessions logged this week yet.' }]

  const out: Insight[] = []
  const net = wk.reduce((a, s) => a + s.result, 0)

  if (targetHours > 0) {
    const cash = cashHoursThisWeek(sessions)
    const p = Math.round((cash / targetHours) * 100)
    out.push({
      tone: p >= 100 ? 'good' : p >= 70 ? 'neutral' : 'bad',
      text: `${fmtHours(cash)} cash of the ${targetHours}h target (${p}%).`,
    })
  }

  out.push({
    tone: net >= 0 ? 'good' : 'bad',
    text: `${net >= 0 ? 'Up' : 'Down'} ${money(Math.abs(net))} across ${wk.length} session${wk.length === 1 ? '' : 's'}.`,
  })

  const anchorDays = routine.filter((r) => isThisWeek(r.date) && r.wakeAnchor).length
  out.push({
    tone: anchorDays >= 5 ? 'good' : anchorDays >= 3 ? 'neutral' : 'bad',
    text: `Wake anchor held ${anchorDays}/7 days.`,
  })

  // The thesis check — does the anchor actually show up in $/hr?
  const re = rhythmEdge(sessions, routine)
  if (re.delta != null) {
    out.push(
      re.delta >= 0
        ? { tone: 'good', text: `$/hr runs ${money(re.delta)} higher on anchor-held days — the rhythm is paying.` }
        : { tone: 'neutral', text: `$/hr is ${money(Math.abs(re.delta))} lower on anchor days — likely small-sample noise; keep logging.` },
    )
  }

  const groups = winRateByGroup(wk).filter((g) => g.hours >= 2 && g.bb > 0)
  if (groups.length) {
    const best = groups.reduce((a, b) => (b.perHour > a.perHour ? b : a))
    out.push({
      tone: best.perHour >= 0 ? 'good' : 'neutral',
      text: `Best game: ${best.key} at ${money(best.perHour, { sign: true })}/h over ${fmtHours(best.hours)}.`,
    })
  }

  const sw = downswingState(sessions)
  if (net < 0 && sw.lossStreak >= 3) {
    out.push({ tone: 'bad', text: `${sw.lossStreak} losing sessions running — run the downswing protocol.` })
  }

  return out
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
    // Taxed-but-not-pocketed = taxable minus what you actually kept (≥0). In a
    // losing year you pocketed nothing positive, so there's no phantom income.
    phantom: Math.max(0, taxable - Math.max(0, net)),
  }
}

// ── Lifetime stats — "the long game" (the year is a marathon; show the miles) ──
export interface LifetimeStats {
  sessions: number
  hours: number
  net: number
  biggestWin: Session | null
  biggestLoss: Session | null
  bestMonth: MonthStat | null
}

export function lifetimeStats(sessions: Session[]): LifetimeStats {
  const real = sessions.filter((s) => !s.isWsopFund)
  const t = totals(real)
  let biggestWin: Session | null = null
  let biggestLoss: Session | null = null
  for (const s of real) {
    if (s.result > 0 && (!biggestWin || s.result > biggestWin.result)) biggestWin = s
    if (s.result < 0 && (!biggestLoss || s.result < biggestLoss.result)) biggestLoss = s
  }
  const months = monthlyBreakdown(real)
  const bestMonth = months.length
    ? months.reduce((a, b) => (b.result > a.result ? b : a))
    : null
  return { sessions: t.sessions, hours: t.hours, net: t.result, biggestWin, biggestLoss, bestMonth }
}

/** Longest-ever run of consecutive days where `pick` is true (vs the current streak). */
export function longestStreak(
  logs: RoutineLog[],
  pick: (l: RoutineLog) => boolean | undefined,
): number {
  const days = [...new Set(logs.filter((l) => pick(l)).map((l) => l.date))].sort()
  let best = 0
  let cur = 0
  let prev: string | null = null
  for (const d of days) {
    if (prev) {
      const next = new Date(prev + 'T00:00:00')
      next.setDate(next.getDate() + 1)
      cur = localDate(next) === d ? cur + 1 : 1
    } else {
      cur = 1
    }
    if (cur > best) best = cur
    prev = d
  }
  return best
}

// ── Business expenses (Schedule C) — the deduction half of the tax layer ──
export interface ExpenseSummary {
  year: number
  total: number
  byCategory: Partial<Record<ExpenseCategory, number>>
  count: number
}

export function expenseTotals(expenses: Expense[], year: number): ExpenseSummary {
  const byCategory: Partial<Record<ExpenseCategory, number>> = {}
  let total = 0
  let count = 0
  for (const e of expenses) {
    if (Number(e.date.slice(0, 4)) !== year) continue
    total += e.amount
    count += 1
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount
  }
  return { year, total, byCategory, count }
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
