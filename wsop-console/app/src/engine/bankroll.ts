// Bankroll engine. Playing roll + WSOP fund are DERIVED from sessions +
// adjustments (never stored). Checkpoint ladder + floors from
// bankroll-framework.md §"Year checkpoints".

import type { Session, BankrollAdjustment } from '../db/types'

// ── Checkpoint ladder (bankroll-framework.md) ──
export interface Checkpoint {
  amount: number
  key: string
  name: string
  cleared: string // stake level cleared at this rung
  note: string
}

export const LADDER: Checkpoint[] = [
  {
    amount: 50000,
    key: 'base',
    name: '2/2/5 + shots',
    cleared: '2/2/5',
    note: 'Baseline roll. Clear 2/2/5 and take shots above.',
  },
  {
    amount: 60000,
    key: '5-5-10',
    name: '5/5/10',
    cleared: '5/5/10',
    note: 'Move up to 5/5/10 as your main game.',
  },
  {
    amount: 75000,
    key: 'delaware',
    name: 'Delaware shots',
    cleared: '5/5/10',
    note: '5/5/10 fully comfortable. Delaware 5/10/30 = 30 bi, so Saturday shots only (shallow cap → higher variance than the stake suggests) — not your standard game yet.',
  },
  {
    amount: 100000,
    key: 'wsop-open',
    name: 'Open WSOP fund',
    cleared: '5/10/30',
    note: 'Open the dedicated WSOP-fund bucket off the top. 40 bi now clears 5/10/30 as a standard game (not just a shot).',
  },
  {
    amount: 135000,
    key: 'wsop-ready',
    name: 'WSOP-ready',
    cleared: '5/10/30',
    note: 'Playing roll (~$70k) + WSOP fund (~$65k). Fully rolled for the series.',
  },
  {
    amount: 150000,
    key: '10-10-25',
    name: '10/10/25 (stretch)',
    cleared: '10/10/25',
    note: 'Next-cycle territory — only if accumulation carries you here with the edge intact.',
  },
]

// Move-down floors.
export const FLOOR_SOFT = 40000
export const FLOOR_HARD = 25000

// ── Live stake ladder (bankroll-framework.md "The live ladder") ──
// Buy-ins per stake drive the 30-sit / 40-move-up / 20-move-down rules.
export interface StakeRung {
  key: string
  name: string
  venue: string
  buyIn: number
}
export const STAKE_LADDER: StakeRung[] = [
  { key: '2/2/5', name: '2/2/5 PLO', venue: 'Parx', buyIn: 1000 },
  { key: '5/5/10', name: '5/5/10 PLO', venue: 'Parx', buyIn: 2000 },
  { key: '5/10/30', name: '5/10/30 PLO', venue: 'Delaware Park', buyIn: 2500 },
  { key: '10/10/25', name: '10/10/25 PLO', venue: 'Parx', buyIn: 5000 },
  { key: '25/25/50', name: '25/25/50 PLO', venue: 'Parx', buyIn: 10000 },
]

export const SIT_BI = 30 // buy-ins to sit a stake
export const MOVEUP_BI = 40 // buy-ins of the next stake to move up
export const MOVEDOWN_BI = 20 // drop below this many bi of current stake → move down
export const SHOT_BI_MIN = 3 // earmark 3–5 bi of the higher stake for a shot
export const SHOT_BI_MAX = 5

// ── Online stakes + benchmarks ──
// "Online is pure rate" — the framework's most underused lever. Online PLO runs
// a touch more (~50 bi) for the higher hands/hour variance; mixed (limit) games
// are ~300–400 big bets PER game in the rotation.
export const ONLINE_PLO_BI = 50
export const ONLINE_LIMIT_BB = 350

export interface OnlineStake {
  key: string
  site: string
  game: string
  kind: 'PLO' | 'mixed'
  unit: number // PLO buy-in ($) or limit big bet ($)
  rollToSit: number // 50 bi (PLO) / 350 big bets (limit)
  winRateTarget: string // soft-game benchmark
  volume: string // weekly target
  tier: 'start' | 'next'
  note: string
}

export const ONLINE_STAKES: OnlineStake[] = [
  {
    key: 'wsop-1-2-plo',
    site: 'WSOP.com',
    game: '1/2 PLO · 2 tables',
    kind: 'PLO',
    unit: 200,
    rollToSit: 200 * ONLINE_PLO_BI, // ~$10k
    winRateTarget: '+5 bb/100',
    volume: '2–3 sessions/wk',
    tier: 'start',
    note: 'PA/NJ/NV, supremely soft. The volume lever — log hands so bb/100 + “is your edge real?” work.',
  },
  {
    key: 'phenom-5-10-mix',
    site: 'Phenom',
    game: '5/10 mixed (limit)',
    kind: 'mixed',
    unit: 10,
    rollToSit: 10 * ONLINE_LIMIT_BB, // ~$3.5k
    winRateTarget: '+1 BB/100',
    volume: '1–2 sessions/wk',
    tier: 'start',
    note: 'Reps across the rotation cheaply — builds the $10k-championship muscle. Needs the USDT wallet.',
  },
  {
    key: 'wsop-2-5-plo',
    site: 'WSOP.com',
    game: '2/5 PLO',
    kind: 'PLO',
    unit: 500,
    rollToSit: 500 * ONLINE_PLO_BI, // ~$25k
    winRateTarget: 'hold the edge',
    volume: 'after 1/2',
    tier: 'next',
    note: 'Move up once 1/2 is a significant winner over a real sample — not a small upswing.',
  },
  {
    key: 'phenom-10-20-mix',
    site: 'Phenom',
    game: '10/20 mixed (limit)',
    kind: 'mixed',
    unit: 20,
    rollToSit: 20 * ONLINE_LIMIT_BB, // ~$7k
    winRateTarget: 'hold the edge',
    volume: 'after 5/10',
    tier: 'next',
    note: 'Move up once the rotation feels automatic.',
  },
]

export interface StakeRecommendation {
  sit: StakeRung | null // highest stake with ≥ SIT_BI buy-ins
  buyInsAtSit: number
  next: StakeRung | null // the stake above `sit`
  canMoveUp: boolean // ≥ MOVEUP_BI buy-ins of `next` (edge still required — flagged, not known)
  moveUpShortfall: number // $ to MOVEUP_BI of `next`
  shotEarmark: number // $ a sanctioned shot at `next` can risk (0 if none)
  belowFloor: 'none' | 'soft' | 'hard'
}

/**
 * Game-selection call from the playing roll alone, per the framework's
 * 30/40/20 rules. The standard stake follows the checkpoint ladder's `cleared`
 * value (the doc's 40-bi "moved up" game, not a bare 30-bi sit), so it stays
 * consistent with the Roll view. It can't see your edge-rate, so move-up still
 * says "if the edge holds." Move-down is surfaced via the floors.
 */
export function recommendStake(roll: number): StakeRecommendation {
  const clearedKey = ladderLookup(roll)?.cleared ?? null
  let sitIdx = clearedKey ? STAKE_LADDER.findIndex((r) => r.key === clearedKey) : -1
  // Below the $50k base rung but still ≥30 bi of 2/2/5 → rebuild at 2/2/5.
  if (sitIdx < 0 && roll >= SIT_BI * STAKE_LADDER[0].buyIn) sitIdx = 0
  const sit = sitIdx >= 0 ? STAKE_LADDER[sitIdx] : null
  const next = sit && sitIdx + 1 < STAKE_LADDER.length ? STAKE_LADDER[sitIdx + 1] : null

  const buyInsAtSit = sit ? Math.floor(roll / sit.buyIn) : 0
  const canMoveUp = !!next && roll >= MOVEUP_BI * next.buyIn
  const moveUpShortfall = next ? Math.max(0, MOVEUP_BI * next.buyIn - roll) : 0

  // A shot is only sanctioned when fully rolled at `sit` (≥30 bi) and the
  // surplus above that 30-bi floor covers ≥ SHOT_BI_MIN bi of `next`.
  let shotEarmark = 0
  if (sit && next && !canMoveUp) {
    const surplus = roll - SIT_BI * sit.buyIn
    if (surplus >= SHOT_BI_MIN * next.buyIn) {
      shotEarmark = Math.min(SHOT_BI_MAX * next.buyIn, surplus)
    }
  }

  const belowFloor = roll < FLOOR_HARD ? 'hard' : roll < FLOOR_SOFT ? 'soft' : 'none'

  return { sit, buyInsAtSit, next, canMoveUp, moveUpShortfall, shotEarmark, belowFloor }
}

// WSOP 2027 fund (bankroll-framework.md): a ~$200k slate sold down to a
// ~$60–70k NET target, carved off once the playing roll clears $100k, fed
// monthly across P1–P4 so it's ready by Phase 5.
export const WSOP_FUND_TARGET = 65000
export const WSOP_FUND_OPEN_AT = 100000

export interface BankrollState {
  startingRoll: number
  playingRoll: number
  wsopFund: number
  sessionPnl: number // non-WSOP session results
  current: Checkpoint | null // highest rung reached
  next: Checkpoint | null // next rung to clear
  toNext: number // dollars to next rung
  clearedStake: string | null // highest stake cleared at current roll
}

const isWsop = (s: Session) => !!s.isWsopFund

export function computeBankroll(
  sessions: Session[],
  adjustments: BankrollAdjustment[],
  startingRoll: number,
): BankrollState {
  const sessionPnl = sessions
    .filter((s) => !isWsop(s))
    .reduce((a, s) => a + s.result, 0)

  const transfers = adjustments.filter((a) => a.type === 'wsop-fund-transfer')
  const rollAdj = adjustments
    .filter((a) => a.type !== 'wsop-fund-transfer')
    .reduce((a, x) => a + x.amount, 0)
  const transferTotal = transfers.reduce((a, x) => a + x.amount, 0)

  const wsopSessionPnl = sessions.filter(isWsop).reduce((a, s) => a + s.result, 0)

  const playingRoll = startingRoll + sessionPnl + rollAdj - transferTotal
  const wsopFund = transferTotal + wsopSessionPnl

  const current = ladderLookup(playingRoll)
  const next = nextCheckpoint(playingRoll)

  return {
    startingRoll,
    playingRoll,
    wsopFund,
    sessionPnl,
    current,
    next,
    toNext: next ? Math.max(0, next.amount - playingRoll) : 0,
    clearedStake: current?.cleared ?? null,
  }
}

// ── WSOP fund pace: the one hard target, fed monthly to be ready by May ──
const MONTH_MS = 30.44 * 24 * 60 * 60 * 1000

export interface FundProjection {
  current: number
  target: number
  remaining: number
  monthsLeft: number
  requiredMonthly: number // remaining / monthsLeft — the feed needed from here
  observedMonthly: number // transfer pace so far ($/month), 0 if not yet estimable
  projected: number // current + observedMonthly · monthsLeft
  shortfall: number // max(0, target − projected)
  onTrack: boolean
}

/**
 * Project the WSOP fund to the series. `transfers` are the wsop-fund-transfer
 * adjustments; observed pace is the total fed divided by the months since the
 * first feed. Dates injected for testability.
 */
export function fundProjection(
  wsopFund: number,
  adjustments: BankrollAdjustment[],
  now: Date,
  wsopStart: Date,
  target: number = WSOP_FUND_TARGET,
): FundProjection {
  const remaining = Math.max(0, target - wsopFund)
  const monthsLeft = Math.max(0, (wsopStart.getTime() - now.getTime()) / MONTH_MS)
  const requiredMonthly = monthsLeft > 0 ? remaining / monthsLeft : remaining

  const feeds = adjustments
    .filter((a) => a.type === 'wsop-fund-transfer' && a.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  let observedMonthly = 0
  if (feeds.length > 0) {
    const total = feeds.reduce((s, a) => s + a.amount, 0)
    const first = new Date(feeds[0].date + 'T00:00:00').getTime()
    const monthsElapsed = Math.max(0.5, (now.getTime() - first) / MONTH_MS)
    observedMonthly = total / monthsElapsed
  }

  const projected = wsopFund + observedMonthly * monthsLeft
  return {
    current: wsopFund,
    target,
    remaining,
    monthsLeft,
    requiredMonthly,
    observedMonthly,
    projected,
    shortfall: Math.max(0, target - projected),
    onTrack: projected >= target,
  }
}

/** Highest rung at or below `roll`. */
export function ladderLookup(roll: number): Checkpoint | null {
  let hit: Checkpoint | null = null
  for (const c of LADDER) {
    if (roll >= c.amount) hit = c
  }
  return hit
}

export function nextCheckpoint(roll: number): Checkpoint | null {
  return LADDER.find((c) => roll < c.amount) ?? null
}

export type AlertLevel = 'good' | 'warn' | 'bad'
export interface BankrollAlert {
  level: AlertLevel
  icon: string
  text: string
}

/**
 * Alerts for the dashboard. `prevRoll` (e.g. roll as of start of week) lets us
 * detect a fresh checkpoint crossing ("you're cleared for X").
 */
export function bankrollAlerts(roll: number, prevRoll?: number): BankrollAlert[] {
  const out: BankrollAlert[] = []

  // Fresh upward crossing.
  if (prevRoll != null && roll > prevRoll) {
    for (const c of LADDER) {
      if (prevRoll < c.amount && roll >= c.amount) {
        out.push({
          level: 'good',
          icon: '▲',
          text: `Crossed ${money(c.amount)} — you're cleared for ${c.cleared}. ${c.note}`,
        })
      }
    }
  }

  // Floor warnings.
  if (roll < FLOOR_HARD) {
    out.push({
      level: 'bad',
      icon: '⚠',
      text: `Roll under ${money(FLOOR_HARD)} — stop the bleed and move down hard.`,
    })
  } else if (roll < FLOOR_SOFT) {
    out.push({
      level: 'warn',
      icon: '▼',
      text: `Roll under ${money(FLOOR_SOFT)} — move down a level until you rebuild.`,
    })
  }

  // Standing position (only if no louder alert already).
  if (out.length === 0) {
    const c = ladderLookup(roll)
    if (c) {
      out.push({
        level: 'good',
        icon: '◆',
        text: `Cleared for ${c.cleared}. ${c.note}`,
      })
    }
  }

  return out
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}
