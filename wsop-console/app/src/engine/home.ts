// Home engine — turn the library into "what could I do, given today + whether
// Ellie's home or away," with completions tracked so done things sink and the
// invisible (mental/connection) work surfaces first.

import {
  HOME_LIBRARY,
  MENTAL_PROMPTS,
  type HomeTask,
  type HomeCategory,
  type HomeCadence,
} from '../db/home'

export interface HomeSuggestion extends HomeTask {
  done: boolean
}

// Surface the easy-to-forget work first — that's the whole point.
const CATEGORY_ORDER: Record<HomeCategory, number> = {
  mental: 0,
  connection: 1,
  load: 2,
  errand: 3,
}

export interface TodaysHomeOpts {
  away: boolean
  doneToday: Set<string> // task ids completed today
  doneThisWeek: Set<string> // task ids completed this week (for weekly-cadence items)
  library?: HomeTask[]
}

/** Relevant suggestions for today, undone first, mental/connection surfaced. */
export function todaysHome(opts: TodaysHomeOpts): HomeSuggestion[] {
  const lib = opts.library ?? HOME_LIBRARY
  const wantMode = opts.away ? 'away' : 'home'
  return lib
    .filter((t) => t.mode === 'any' || t.mode === wantMode)
    .map((t) => ({
      ...t,
      done: t.cadence === 'daily' ? opts.doneToday.has(t.id) : opts.doneThisWeek.has(t.id),
    }))
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1 // undone first
      if (a.cadence !== b.cadence) return a.cadence === 'daily' ? -1 : 1
      return CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]
    })
}

/** How many distinct contributions are done in the given week's done-set. */
export function homeContribution(doneThisWeek: Set<string>): number {
  return doneThisWeek.size
}

// User-defined recurring tasks (the "Regular" list) — folded into the daily
// suggestions alongside the built-in library.
export interface CustomRegular {
  id: string
  title: string
  cadence: HomeCadence
  category?: HomeCategory
}

export function customRegularsToTasks(list: CustomRegular[]): HomeTask[] {
  return list.map((c) => ({
    id: `custom-${c.id}`,
    title: c.title,
    detail: 'Your regular task.',
    category: c.category ?? 'load',
    cadence: c.cadence,
    mode: 'any',
  }))
}

/** Deterministic mental-load prompt for a given local date. */
export function mentalPromptFor(dateISO: string): string {
  const t = new Date(dateISO + 'T00:00:00').getTime()
  const idx = Math.floor(t / 86_400_000) % MENTAL_PROMPTS.length
  return MENTAL_PROMPTS[(idx + MENTAL_PROMPTS.length) % MENTAL_PROMPTS.length]
}
