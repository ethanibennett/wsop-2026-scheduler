// "The climb" — cross-domain milestones. The rebuild carries impatience and
// comparison (mental-health-and-game.md); surfacing concrete progress across
// the roll, the rhythm, and the cut is a deliberate morale counter.

import { LADDER } from './bankroll'
import { moneyK } from './format'

export interface Milestone {
  id: string
  label: string
  done: boolean
  sort: number // ordering / rough difficulty
}

export interface MilestoneSummary {
  list: Milestone[] // sorted, done first within ties of sort
  achieved: number
  total: number
  next: Milestone | null // nearest not-yet-done
}

const ANCHOR_TIERS = [7, 14, 30, 60, 100]
const WEIGHT_TIERS = [5, 10, 15, 20, 25, 30]

export function milestones(opts: {
  roll: number
  anchorStreak: number
  lbsLost: number
}): MilestoneSummary {
  const list: Milestone[] = []

  for (const c of LADDER) {
    list.push({
      id: `roll-${c.amount}`,
      label: `Roll ${moneyK(c.amount)} — ${c.name}`,
      done: opts.roll >= c.amount,
      sort: c.amount,
    })
  }
  for (const t of ANCHOR_TIERS) {
    list.push({
      id: `anchor-${t}`,
      label: `${t}-day wake-anchor streak`,
      done: opts.anchorStreak >= t,
      sort: 100000 + t * 1000, // interleave after the lower roll rungs
    })
  }
  for (const t of WEIGHT_TIERS) {
    list.push({
      id: `weight-${t}`,
      label: t >= 30 ? `Goal: −${t} lb` : `−${t} lb`,
      done: opts.lbsLost >= t,
      sort: 50000 + t * 2000,
    })
  }

  list.sort((a, b) => a.sort - b.sort)
  const achieved = list.filter((m) => m.done).length
  // Next = the lowest-sort not-yet-done milestone.
  const next = list.find((m) => !m.done) ?? null

  return { list, achieved, total: list.length, next }
}
