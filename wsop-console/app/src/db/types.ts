// WSOP 2027 Console — data model (§4 of the handoff).
// The Session is the keystone entity; bankroll, win-rate and the admin/tax
// layer all derive from clean session logs.

export type Channel = 'live' | 'online'

export type Format =
  | 'PLO'
  | 'PLO8'
  | 'NLH'
  | 'mixed'
  | 'stud8'
  | 'razz'
  | '2-7'
  | 'BigO'
  | 'other'

export type MoodRating = 1 | 2 | 3 | 4 | 5

// ── Poker session — THE core entity ──
export interface Session {
  id: string
  date: string // ISO
  channel: Channel
  isMTT: boolean
  format: Format
  gameLabel: string // e.g. "5/5/10 PLO", "40/80 mix", "Sunday Major"
  venue: string // Parx | Delaware Park | WSOP.com | BetRivers | ...
  stakeLevel?: string // ladder key for live: "2/2/5" | "5/5/10" | "5/10/30"
  buyInTotal: number // includes rebuys / re-entries
  cashOut: number
  hours: number
  result: number // computed: cashOut - buyInTotal
  isWsopFund?: boolean // does this session settle against the WSOP fund bucket?
  // MTT extras
  entries?: number
  place?: number
  fieldSize?: number
  // mental-game capture (feeds the Sunday review)
  moodRating?: MoodRating
  tiltNote?: string
  tags?: string[]
}

// ── Bankroll ──
export type AdjustmentType =
  | 'deposit'
  | 'withdrawal'
  | 'wsop-fund-transfer'
  | 'backer-settlement'
  | 'correction'

export interface BankrollAdjustment {
  id: string
  date: string
  amount: number // +/-
  type: AdjustmentType
  note?: string
}

// ── Training (port from lift-log) ──
export interface LiftEntry {
  id: string
  date: string
  liftSlug: string
  weight?: number
  reps?: number
  sets?: number
  note?: string
}

export interface Benchmark {
  id: string
  date: string
  slug: string
  value: number
}

export interface PrehabTick {
  date: string
  day: 'mon' | 'wed' | 'fri'
  items: Record<string, boolean>
}

// ── Rhythm / adherence ──
export interface RoutineLog {
  date: string // one per day → drives streaks
  wakeAnchor?: boolean
  windDown?: boolean
  meditation?: boolean
  movement?: boolean
  sessionLogged?: boolean
}

// ── Health & study ──
export interface HealthMetric {
  id: string
  date: string
  weight?: number
  waist?: number
  sleepHours?: number
  sleepQuality?: MoodRating
  rhr?: number
  note?: string
}

export interface StudyLog {
  id: string
  date: string
  type: 'course' | 'coaching' | 'solver' | 'library' | 'review'
  detail: string
}

// ── Weekly review (Sunday review) ──
export interface ReviewEntry {
  id: string
  date: string
  weekN: number
  anchorHeld?: boolean
  whatSlipped: string
  oneThing: string
}

// ── Checklist ticks for Today (nudges + routine items) ──
export interface ChecklistTick {
  date: string // YYYY-MM-DD
  items: Record<string, boolean> // keyed by nudge id / routine key
}

// ── Static plan data (seed once) ──
export interface Phase {
  id: number
  name: string
  start: string
  end: string
  theme: string
  weeklyCashHours: number // volume ramp target for this phase
}

export interface PlanWeek {
  n: number
  dates: string
  headline: string
  ramp?: string
  event?: string
  tracks: Record<string, string>
}

export interface Nudge {
  id: string
  cron: string
  time: string // human display, e.g. "07:00"
  title: string
  body: string
  fromWeek: number // ramps on at this Phase-1 week
}

export interface Settings {
  startingRoll: number
  wakeTime: string
  capTime: string
  caffeineCutoff: string
  phaseOverride?: number
  lastBackupAt?: string // ISO; set on every successful export — drives the backup reminder
}
