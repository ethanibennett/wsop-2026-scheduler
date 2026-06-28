// Training math — surface progressive overload from the lift log. Sets at
// different weight×reps are compared via an estimated 1-rep-max so "is it
// going up?" has an answer. Muscle preservation through the cut is the goal
// (nutrition.md / health-plan), so trend matters more than any single number.

import type { LiftEntry } from '../db/types'

/** Epley estimated 1-rep max. A single rep IS the 1RM (Epley overshoots at r=1). */
export function e1rm(weight?: number, reps?: number): number {
  if (!weight || weight <= 0) return 0
  const r = reps && reps > 0 ? reps : 1
  return r <= 1 ? weight : weight * (1 + r / 30)
}

export interface LiftStats {
  last: LiftEntry | null
  best: LiftEntry | null // highest estimated 1RM across all logged sets
  bestE1rm: number
  lastIsPR: boolean // the most recent set beat every prior set
  count: number
}

/** Stats for one lift. `entries` may be unsorted; the latest by (date,id) is "last". */
export function liftStats(entries: LiftEntry[], slug: string): LiftStats {
  const a = entries
    .filter((e) => e.liftSlug === slug)
    .sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id))
  if (!a.length) return { last: null, best: null, bestE1rm: 0, lastIsPR: false, count: 0 }

  const last = a[a.length - 1]
  let best = a[0]
  let bestVal = e1rm(a[0].weight, a[0].reps)
  for (const e of a) {
    const v = e1rm(e.weight, e.reps)
    if (v > bestVal) {
      bestVal = v
      best = e
    }
  }

  const prior = a.slice(0, -1)
  let priorBest = 0
  for (const e of prior) priorBest = Math.max(priorBest, e1rm(e.weight, e.reps))
  const lastVal = e1rm(last.weight, last.reps)
  const lastIsPR = prior.length > 0 && lastVal > priorBest && lastVal > 0

  return { last, best, bestE1rm: bestVal, lastIsPR, count: a.length }
}
