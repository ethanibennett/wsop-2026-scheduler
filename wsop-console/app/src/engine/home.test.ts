import { describe, it, expect } from 'vitest'
import { todaysHome, homeContribution, mentalPromptFor, customRegularsToTasks } from './home'
import { HOME_LIBRARY, MENTAL_PROMPTS } from '../db/home'

const empty = new Set<string>()

describe('todaysHome', () => {
  it('home mode excludes away-only tasks and vice versa', () => {
    const home = todaysHome({ away: false, doneToday: empty, doneThisWeek: empty })
    expect(home.some((t) => t.id === 'real-call')).toBe(false) // away-only
    expect(home.some((t) => t.id === 'shared-dinner')).toBe(true) // home-only

    const away = todaysHome({ away: true, doneToday: empty, doneThisWeek: empty })
    expect(away.some((t) => t.id === 'real-call')).toBe(true)
    expect(away.some((t) => t.id === 'shared-dinner')).toBe(false)
  })

  it('any-mode tasks appear in both', () => {
    const inHome = todaysHome({ away: false, doneToday: empty, doneThisWeek: empty }).some((t) => t.id === 'take-one')
    const inAway = todaysHome({ away: true, doneToday: empty, doneThisWeek: empty }).some((t) => t.id === 'take-one')
    expect(inHome && inAway).toBe(true)
  })

  it('marks daily done from doneToday, weekly from doneThisWeek', () => {
    const list = todaysHome({
      away: false,
      doneToday: new Set(['kitchen']), // daily
      doneThisWeek: new Set(['groceries']), // weekly
    })
    expect(list.find((t) => t.id === 'kitchen')?.done).toBe(true)
    expect(list.find((t) => t.id === 'groceries')?.done).toBe(true)
    expect(list.find((t) => t.id === 'tidy')?.done).toBe(false)
  })

  it('sorts undone first, then surfaces mental/connection before load/errand', () => {
    const list = todaysHome({ away: false, doneToday: empty, doneThisWeek: empty })
    const firstUndone = list[0]
    expect(firstUndone.done).toBe(false)
    // the very first item should be a daily mental/connection task, not an errand
    expect(['mental', 'connection', 'load']).toContain(firstUndone.category)
    // a done daily task sinks below undone ones
    const done = todaysHome({ away: false, doneToday: new Set(['take-one']), doneThisWeek: empty })
    const takeOneIdx = done.findIndex((t) => t.id === 'take-one')
    expect(done.slice(0, takeOneIdx).every((t) => !t.done)).toBe(true)
  })
})

describe('homeContribution', () => {
  it('counts the done-set size', () => {
    expect(homeContribution(new Set(['a', 'b', 'c']))).toBe(3)
    expect(homeContribution(empty)).toBe(0)
  })
})

describe('mentalPromptFor', () => {
  it('is deterministic per date and within range', () => {
    const a = mentalPromptFor('2026-08-12')
    expect(a).toBe(mentalPromptFor('2026-08-12'))
    expect(MENTAL_PROMPTS).toContain(a)
  })
  it('differs across consecutive days (cycles)', () => {
    const days = ['2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15'].map(mentalPromptFor)
    expect(new Set(days).size).toBeGreaterThan(1)
  })
})

describe('customRegularsToTasks', () => {
  it('maps custom regulars into HomeTasks that flow through todaysHome', () => {
    const tasks = customRegularsToTasks([
      { id: 'abc', title: 'Water the plants', cadence: 'daily' },
      { id: 'def', title: 'Deep clean', cadence: 'weekly', category: 'load' },
    ])
    expect(tasks[0].id).toBe('custom-abc')
    expect(tasks[0].mode).toBe('any')
    expect(tasks[0].category).toBe('load') // default

    const list = todaysHome({
      away: false,
      doneToday: new Set(['custom-abc']),
      doneThisWeek: empty,
      library: [...HOME_LIBRARY, ...tasks],
    })
    expect(list.find((t) => t.id === 'custom-abc')?.done).toBe(true)
    expect(list.some((t) => t.id === 'custom-def')).toBe(true)
  })
})

describe('library integrity', () => {
  it('ids are unique', () => {
    expect(new Set(HOME_LIBRARY.map((t) => t.id)).size).toBe(HOME_LIBRARY.length)
  })
})
