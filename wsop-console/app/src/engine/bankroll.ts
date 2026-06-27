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
    note: 'Delaware Park shot-takes unlocked.',
  },
  {
    amount: 100000,
    key: 'wsop-open',
    name: 'Open WSOP fund',
    cleared: '5/10/30',
    note: 'Start carving the WSOP fund off the top.',
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
