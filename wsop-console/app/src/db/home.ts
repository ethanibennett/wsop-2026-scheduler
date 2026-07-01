// Home — household contribution library. The point isn't a chore list Ethan has
// to populate (that's just another thing to remember); it's the app surfacing
// what he *could* be doing — especially the invisible mental-load work — so the
// remembering doesn't fall on Ellie. Rotation-aware: "home" vs "away" (solo /
// her on a VA/Philly rotation) change what showing up looks like.

export type HomeCategory = 'load' | 'errand' | 'mental' | 'connection'
export type HomeCadence = 'daily' | 'weekly'
export type HomeMode = 'home' | 'away' | 'any' // when Ellie is home / away / either

export interface HomeTask {
  id: string
  title: string
  detail: string
  category: HomeCategory
  cadence: HomeCadence
  mode: HomeMode
}

export const CATEGORY_META: Record<HomeCategory, { label: string; blurb: string }> = {
  load: { label: 'Daily load', blurb: 'the constant background stuff that silently piles up' },
  errand: { label: 'Errands & admin', blurb: 'the logistics that take mental tracking' },
  mental: { label: 'Mental load', blurb: 'noticing and owning it without being asked' },
  connection: { label: 'Connection', blurb: 'the relationship through the distance' },
}

export const HOME_LIBRARY: HomeTask[] = [
  // ── Daily load (sharing the day-to-day when home; keeping it running when away) ──
  { id: 'dinner', title: 'Own dinner tonight', detail: 'Pick it, make it, sort it — no “what do you want?” bounced back to her. The whole meal is yours.', category: 'load', cadence: 'daily', mode: 'home' },
  { id: 'kitchen', title: 'Kitchen reset', detail: 'Dishes washed, surfaces wiped, left done — not half-done for her to finish.', category: 'load', cadence: 'daily', mode: 'any' },
  { id: 'laundry', title: 'A load of laundry, start to finish', detail: 'Wash → dry → fold → put away. The “put away” is the part that usually doesn’t happen.', category: 'load', cadence: 'daily', mode: 'any' },
  { id: 'tidy', title: 'Tidy the shared spaces', detail: '10 minutes resetting the rooms you both live in, before they pile up.', category: 'load', cadence: 'daily', mode: 'any' },
  { id: 'evening-reset', title: 'Evening reset for tomorrow', detail: 'Set the kitchen/house up so the morning starts clean — solo-discipline when she’s away.', category: 'load', cadence: 'daily', mode: 'away' },
  { id: 'trash', title: 'Trash & recycling out', detail: 'Before it’s overflowing, not after she points at it.', category: 'load', cadence: 'weekly', mode: 'any' },

  // ── Errands & admin (own the logistics) ──
  { id: 'groceries', title: 'Own the grocery run', detail: 'Build the cart off the standing list (ties to the Monday food stock-up), go, put it all away.', category: 'errand', cadence: 'weekly', mode: 'any' },
  { id: 'pharmacy', title: 'Prescriptions & refills', detail: 'Check what’s running low and handle the refill before it’s urgent.', category: 'errand', cadence: 'weekly', mode: 'any' },
  { id: 'errands-batch', title: 'Batch the week’s errands', detail: 'Packages, returns, the dry-cleaning, the thing on the list — knock them out in one loop.', category: 'errand', cadence: 'weekly', mode: 'any' },
  { id: 'car', title: 'Car: gas / wash / check', detail: 'Keep it ready so it’s never a last-minute scramble.', category: 'errand', cadence: 'weekly', mode: 'any' },

  // ── Mental load (the headline ask: see it and own it, unprompted) ──
  { id: 'take-one', title: 'Take one thing fully off her plate', detail: 'Pick something she’s been carrying and just own it end-to-end — no check-ins, no “how do you want this done?”', category: 'mental', cadence: 'daily', mode: 'any' },
  { id: 'week-ahead', title: 'Know the week ahead', detail: 'Glance at the shared calendar and what’s coming. Be the one who already knows, not the one who gets told.', category: 'mental', cadence: 'daily', mode: 'any' },
  { id: 'own-upcoming', title: 'Own one upcoming thing, fully', detail: 'An appointment, a booking, a bill, a gift — you’re the one responsible start to finish.', category: 'mental', cadence: 'weekly', mode: 'any' },
  { id: 'restock', title: 'Restock before it runs out', detail: 'Notice the staple that’s low — coffee, paper goods, her things — and replace it before she has to ask.', category: 'mental', cadence: 'weekly', mode: 'any' },
  { id: 'plan-ahead', title: 'Plan something to look forward to', detail: 'A dinner, a small trip, a weekend — you initiate it, you make it happen.', category: 'mental', cadence: 'weekly', mode: 'any' },

  // ── Connection (weighted to the away months, but home matters too) ──
  { id: 'real-call', title: 'A real call, not just texts', detail: 'When you’re apart, actually talk — ask about her day and follow the thread, don’t just trade logistics.', category: 'connection', cadence: 'daily', mode: 'away' },
  { id: 'how-doing', title: 'Ask how she’s actually doing', detail: 'Beyond the to-do list. A hard, ambitious year is hard on her too — be in it with her.', category: 'connection', cadence: 'daily', mode: 'any' },
  { id: 'shared-dinner', title: 'Protect the shared dinner', detail: 'When home, the deliberate shared dinner is its own anchor — make it good, be present, phone away.', category: 'connection', cadence: 'daily', mode: 'home' },
  { id: 'next-visit', title: 'Plan the next time you’ll see each other', detail: 'Across the rotations, having the next visit actually on the calendar makes the distance smaller.', category: 'connection', cadence: 'weekly', mode: 'away' },
  { id: 'gesture', title: 'One thoughtful gesture from afar', detail: 'Something delivered, a note, handling a thing for her remotely — distance made smaller.', category: 'connection', cadence: 'weekly', mode: 'away' },
]

// Rotating one-liners for the daily mental-load prompt.
export const MENTAL_PROMPTS = [
  'What’s one thing on Ellie’s plate you can just take today — no questions asked?',
  'What would she have to remember today that you could handle first?',
  'What’s about to run low or come due that you can get ahead of?',
  'What’s one way to make today a little lighter for her?',
]
