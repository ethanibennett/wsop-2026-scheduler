// Rich plan content for the Plan screen (M4) — ported from the two prototypes
// reference/year-plan-timeline.html and reference/phase-1-detail.html, with the
// markdown docs as the source of truth. Phase id/name/dates/theme live in
// seed.ts (PHASES); this file holds the per-phase detail (rotation context,
// sub-windows, six-track copy, markers, the tournament series) and the Phase-1
// week-by-week zoom + standard-week grid.

export type TrackKey = 'health' | 'mind' | 'bank' | 'skill' | 'partner' | 'admin'

export const TRACK_ORDER: TrackKey[] = ['health', 'mind', 'bank', 'skill', 'partner', 'admin']
export const TRACK_LABEL: Record<TrackKey, string> = {
  health: 'Health',
  mind: 'Mind',
  bank: 'Bankroll',
  skill: 'Skills',
  partner: 'Partnership',
  admin: 'Admin',
}

// Rotation context drives the node accent on the year timeline.
export type Rotation = 'free' | 'away' | 'philly' | 'wsop'

export interface Seg {
  free?: boolean
  t: string
  d: string
}
export interface SeriesStop {
  name: string
  date: string
  note: string
  tag: ['set' | 'pending' | 'maybe', string]
}
export interface PhaseDetail {
  rotation: Rotation
  badge: string
  segs: Seg[]
  tracks: Partial<Record<TrackKey, string>>
  marker?: string
  series?: SeriesStop[]
}

export const YEAR_NORTHSTAR =
  'Rebuild the roll → become a proper bracelet hunter → a real shot at WSOP Player of the Year. Six tracks, six phases, one objective: accumulate — and a sustainable life that holds.'

export const YEAR_GOALS = ['→ 150 lb', 'cardio / strength / mobility ↑', 'sleep dialed (Oura)', 'bracelet hunter → POY']

export const YEAR_LEGEND: { rotation: Rotation; t: string }[] = [
  { rotation: 'free', t: "She's free (protect)" },
  { rotation: 'away', t: 'Away rotation' },
  { rotation: 'philly', t: 'Philly rotation (busy)' },
]

export const YEAR_ENDCAP = '→ TBD rotation after Aug 2027 · next cycle begins · graduation & boards land here'

// Keyed by phase id (matches seed.ts PHASES).
export const PHASE_DETAIL: Record<number, PhaseDetail> = {
  1: {
    rotation: 'philly',
    badge: 'Ellie in school — busy weekdays',
    segs: [
      { t: 'Ellie in school', d: 'pre-rotation · packed weekdays, evenings studying' },
      { free: true, t: 'Break before Monterey', d: 'school done, not yet away · the real together window' },
    ],
    tracks: {
      health:
        'Install the keystone (wake anchor + floors + defaults). Hernia repair early (W3–4), then rebuild. Protein-first nutrition, daily mobility, GP physical + full bloodwork.',
      mind: "Start therapy while it's calm; re-establish the daily meditation floor; line up a mental-game resource.",
      bank: 'Set the starting rung; install the 30/40/20 rules; finally build online volume.',
      skill: 'Baseline every format; book the coaching cadence; start Advanced PLO Mastery + daily range drills.',
      partner:
        'She’s in school most of the phase — support her through it and grab her pockets; the pre-Monterey break is the real together time. Have the year conversation.',
      admin:
        'Install the infrastructure: stand up the session-tracking system (the keystone), open segregated accounts (roll / WSOP fund / taxes / life), open a SEP-IRA or Solo 401(k), and book one proactive CPA session. Confirm the surgery’s coverage first.',
    },
    marker: 'Medical block early: hernia repair + bloodwork (informs supplements)',
    series: [
      {
        name: 'Borgata Summer Poker Open',
        date: 'Jul 15–31 ’26',
        note: 'Soft re-entry, not a grind. You land ~Jul 20–25 and catch the back half — where the cheap $500 single-day mixed events cluster, one a day: TORSE (Jul 21), HORSE (22), O.E. (23), Stud8 (24), O8 (25), HOE (26). Pick 3–4, skip the multi-day NLH guarantees and the $2,700 Main, cap the re-entries. A 2026-only window — summer ’27 is WSOP.',
        tag: ['set', 'Soft re-entry · ~3–4 mixed events'],
      },
      {
        name: 'Hard Rock Series — Florida',
        date: 'August (TBD)',
        note: 'Possible but unlikely. If Aug ’26 it collides with hernia recovery; if Aug ’27 it lands in the Landing / recovery phase. Either way a stretch — a flight and a series during a healing or decompression window.',
        tag: ['maybe', 'Unlikely'],
      },
    ],
  },
  2: {
    rotation: 'away',
    badge: 'Ellie away — Monterey, CA',
    segs: [{ t: 'Monterey (away)', d: 'her first away rotation — you solo in Philly' }],
    tracks: {
      health: 'Keep the system alive without her scaffolding. Strength resumed post-hernia — rebuild it. Watch the solo-grind spiral.',
      mind: 'First run of the solo-support tools — meditation floor + therapy cadence hold. The isolation starts here.',
      bank: 'First real volume ramp, live + online. Start feeding the WSOP fund.',
      skill: 'First real online reps — A-games to accumulate, B-games to develop.',
      partner: 'Her first away rotation, the lonely one — support from a distance, daily check-in.',
      admin: 'First real test of the tracking discipline solo — log every session the same night, away from home. Set aside the tax % as you go; first quarterly estimate lands.',
    },
  },
  3: {
    rotation: 'philly',
    badge: 'Mostly Philly rotations (busy)',
    segs: [
      { t: 'VA rotation', d: 'Philly · busy · grind-available' },
      { free: true, t: 'Holiday gap', d: '~Nov 26 – Jan 3 · free · protect' },
      { t: 'Philly rotation', d: 'busy · grind-available' },
    ],
    tracks: {
      health: 'Biggest training build — push strength, add cardio intensity; most of the 30 lbs comes off here. Maintain rhythm through the holidays.',
      mind: 'Steady — therapy + meditation running. Recharge over the holiday gap.',
      bank: 'Grind the rotation weeks (real accumulation); protect only the holiday gap; move up a rung if rolled.',
      skill: 'Biggest development phase — finish the course, lean on coaching, grow the heuristics library.',
      partner: 'Full presence over the holidays; daily touchpoint during the rotation weeks.',
      admin: 'Biggest accumulation = biggest tracking load — keep the logs clean through the build. Quarterly estimates paid on time; year-end tax check-in with the CPA.',
    },
    marker: 'Holidays — the big protected window',
  },
  4: {
    rotation: 'away',
    badge: 'Ellie away — Cleveland ×2',
    segs: [
      { t: 'Cleveland', d: 'away · solo grind' },
      { free: true, t: 'Spring gap', d: 'mid-Mar · free · recover together' },
      { t: 'Cleveland', d: 'away · solo grind' },
    ],
    tracks: {
      health: 'Autopilot under load. Training drops to maintenance — hold gains. Weight at goal → hold. Protect sleep ruthlessly.',
      mind: 'The danger zone — isolation × variance × duration. Therapy + resets must already be running; downswing protocol on standby.',
      bank: 'Peak accumulation + the WSOP fund. Disciplined stakes and shot-taking. Lock WSOP logistics + action sales late (W36–40).',
      skill: 'B-games at competence by the start; sharpen them under volume.',
      partner: 'Support from a distance (Cleveland); be present in the spring gap.',
      admin: 'Draw up the staking agreements + do WSOP tax prep with the CPA (W36–40) — the paperwork, not just the handshakes. Per-entry ownership ledger ready before you leave.',
    },
    marker: 'Lock WSOP logistics + action sales + staking paperwork (W36–40)',
  },
  5: {
    rotation: 'wsop',
    badge: 'You in Vegas · Ellie away',
    segs: [
      { t: 'Long Island', d: 'her away · you in Vegas' },
      { t: 'Jun gap', d: 'her free — but lost to Vegas' },
      { t: 'Rockville', d: 'her away · you in Vegas' },
    ],
    tracks: {
      health: 'Performance mode — sleep is the edge. Movement only (no training load), fuel for long days, taper in rested.',
      mind: 'Bustout management, the reset discipline, slate pressure — the mental game matters most here. A downswing is a math event, not a verdict.',
      bank: 'Deploy the fund; sell action on the $10k championships. Cash pauses.',
      skill: 'Execution — trust the prep. Light review between events.',
      partner: "She's on rotation too; the June gap is lost to Vegas. Stay connected from afar.",
      admin: "Log every entry, cash, and W-2G as it happens — don't reconstruct $200k of action in August. Clean records protect the backers' share.",
    },
    marker: 'WSOP — ~$200k slate, sold down to ~$60–70k net',
  },
  6: {
    rotation: 'philly',
    badge: "Ellie home but busy (St. Christopher's)",
    segs: [{ t: "St. Christopher's", d: 'Philly · busy · your recovery window' }],
    tracks: {
      health: 'Recovery — repay sleep debt, ease the rhythm down, gentle rebuild after the series layoff.',
      mind: 'Decompress; process the result, win or lose, in a healthy way. The honest year review.',
      bank: 'Tally what survived — roll + action-sale settlements. Reset the engine for next cycle.',
      skill: "Re-rate every format; capture the WSOP learnings; set next cycle's POY-track targets.",
      partner: "She's slammed on St. Christopher's — daily touchpoint, recover, reconnect after.",
      admin: 'Reconcile the year, settle backers, hand the CPA clean books. The 90% loss cap makes the records the difference — make sure they’re airtight.',
    },
  },
}

// ── Phase-1 zoom (phase-1-detail.html) ──
export const PHASE1_SUB =
  "Install the whole system while it's easiest — low volume, no travel pressure, repair done, and Ellie busy with school most weeknights so the grind has room. Nothing here is about results; it's about building the machine so it runs on its own when the solo grind starts."

export interface ArcStep {
  w: string
  t: string
  hot?: boolean
}
export const PHASE1_ARC: ArcStep[] = [
  { w: 'W1', t: 'Land' },
  { w: 'W2–3', t: 'Install' },
  { w: 'W4', t: 'Repair', hot: true },
  { w: 'W5–6', t: 'Rebuild' },
  { w: 'W7', t: 'Humming' },
  { w: 'W8', t: 'Solo run', hot: true },
  { w: 'W9', t: 'Hand off' },
]

export type DayKind = 'live' | 'mtt' | 'study' | 'flex'
export interface WeekDay {
  d: string
  t: string
  k: DayKind
}
export const STANDARD_WEEK: WeekDay[] = [
  { d: 'Mon', t: 'flex-live·shop', k: 'flex' },
  { d: 'Tue', t: 'LIVE Parx', k: 'live' },
  { d: 'Wed', t: 'flex+lift', k: 'flex' },
  { d: 'Thu', t: 'study', k: 'study' },
  { d: 'Fri', t: 'flex+lift', k: 'flex' },
  { d: 'Sat', t: 'LIVE Parx', k: 'live' },
  { d: 'Sun', t: 'MTTs', k: 'mtt' },
]
export const STANDARD_WEEK_NOTE =
  "Two fixed live nights at Parx (Tue/Sat) + Monday flex-live (Delaware / 40-80 mix), Sunday MTTs, study midweek. Live-primary — only the stake floats with the roll. Ellie's in school, so weeknights have room."

export interface Phase1Week {
  n: number
  dates: string
  hl: string
  ramp?: string
  event?: string
  cls?: 'hot' | 'surgery'
  tracks: Partial<Record<TrackKey, string>>
}
export const PHASE1_WEEKS: Phase1Week[] = [
  {
    n: 1,
    dates: 'Jul 21–27',
    hl: 'Land & re-enter',
    ramp: 'Wake anchor',
    event: 'Borgata SUPO — soft re-entry',
    cls: 'hot',
    tracks: {
      bank: 'Borgata soft re-entry — 3–4 cheap $500 single-day mixed events; cap the re-entries.',
      admin: 'First real use of the tracker — log every session the same night.',
      health: 'Wake anchor only; daily walks + mobility, no gym yet.',
      mind: "Notice, don't formalize — a quiet test of the pre/post-session routine.",
      partner: "You're back, she's in school — fit time around her studying; don't let the series eat the week.",
    },
  },
  {
    n: 2,
    dates: 'Jul 28 – Aug 3',
    hl: 'Settle & set up',
    event: 'Therapy + medical booked',
    tracks: {
      admin: 'Stand up the tracking system; open the segregated accounts; book the CPA session.',
      mind: 'Book the therapy intake — the key deferred move.',
      partner: 'The conversation: the year, the protected windows, what support looks like.',
      bank: 'Set the starting rung; live stays light.',
      health: 'Gentle movement only (pre-op); book the medical block + the hernia consult → schedule the repair.',
      skill: 'Stand up the study rails — range trainer, solver env, library skeleton.',
    },
  },
  {
    n: 3,
    dates: 'Aug 4–10',
    hl: 'Sleep bookends + pre-op',
    ramp: 'Sleep bookends',
    tracks: {
      health: 'Full sleep system in (cap, wind-down, caffeine cutoff) before surgery. Protein-first defaults.',
      mind: "Meditation floor begins (5 min); therapy's first real sessions.",
      skill: 'PLO Mastery module 1 + daily range drills; book the coaching cadence.',
      admin: 'Hold the CPA session; confirm the surgery’s coverage.',
    },
  },
  {
    n: 4,
    dates: 'Aug 11–17',
    hl: 'The repair',
    event: 'Hernia repair (~Aug 11–13)',
    cls: 'surgery',
    tracks: {
      health: 'Hernia repair. Rest → walking as cleared. No training, no strain.',
      mind: 'The unexpected mental rep — keep the meditation floor; let therapy hold the week.',
      partner: 'Lean on Ellie through recovery — she’s local (in school), part of why the repair lives here.',
    },
  },
  {
    n: 5,
    dates: 'Aug 18–24',
    hl: 'Gentle return',
    ramp: 'Movement floor',
    tracks: {
      health: 'Easy walking daily; still no lifting. Movement floor as its own block.',
      bank: 'Online volume resumes gently — low stakes, edge games, short sessions.',
      skill: 'Study + drills back to full cadence; first coaching session.',
      mind: 'Meditation daily; restart the pre/post-session routines at low stakes.',
    },
  },
  {
    n: 6,
    dates: 'Aug 25–31',
    hl: 'Rebuild',
    tracks: {
      health: 'Reintroduce light strength (cleared); lock shared dinners.',
      bank: 'Install the 30/40/20 rules; build the online volume; first read on what produces.',
      skill: 'PLO module 3 + scope the first solver target; heuristics — stud8 family.',
      mind: 'Line up the mental-game resource; build the tilt profile + draft the downswing protocol.',
      partner: 'Seed the non-Ellie social anchor — the one that must survive Phase 4.',
    },
  },
  {
    n: 7,
    dates: 'Sep 1–7',
    hl: 'Humming',
    ramp: 'Sunday review',
    tracks: {
      health: 'Post-session reset / tilt practice; steady strength + cardio.',
      admin: 'Open the retirement vehicle; first month of clean books.',
      skill: 'PLO module 4 + solver build; heuristics — draw family.',
      mind: "The Sunday review gains its 'what tilted me / mood' line.",
      partner: 'If school’s wrapping up, the pre-Monterey break may begin here — the real together window.',
    },
  },
  {
    n: 8,
    dates: 'Sep 8–14',
    hl: 'Solo dress-rehearsal',
    event: 'Solo dry-run — the key rehearsal',
    cls: 'hot',
    tracks: {
      mind: 'The real test — does the self-regulation hold solo? Bring whatever wobbles to therapy.',
      bank: 'Lock the online routine for Monterey; set up the WSOP-fund bucket.',
      skill: 'PLO module 5 / finish + solver iterate; heuristics — Omaha-8 / Big O.',
      partner: 'The packed weeks already had you semi-solo — W8 is the conscious audit of your own structure.',
    },
  },
  {
    n: 9,
    dates: 'Sep 15–21',
    hl: 'Close & hand off',
    event: 'Hand off to Monterey (Sep 22)',
    tracks: {
      mind: 'Lock the portable stack — therapy through Monterey, meditation, the downswing protocol written down.',
      bank: 'Set the Phase 2 volume-ramp targets.',
      skill: 'Capture course takeaways into the library; set Phase 2 targets.',
      partner: 'The pre-Monterey break is the together window; then she leaves ~Sep 22 — set the distance rhythm first. A real send-off.',
      health: 'Confirm the system is portable: which parts are automatic vs. propped up by being home.',
    },
  },
]

export const PHASE1_FOOT =
  'The arc: land & re-enter → install → repair → rebuild → humming → solo dress-rehearsal → hand off to Monterey. By the time the Phase 4 danger zone arrives, none of this is new — it has been running for months. The full hour-by-hour detail lives in phase-1-playbook.md.'

// ── Day view (phase-1-playbook.md Parts 4 & 5) ──
export interface Dial {
  name: string
  time: string
  note: string
}
export const DIALS: Dial[] = [
  { name: 'Wake anchor', time: '10:00', note: 'Held within ±1 hr even after a rough night. The keystone — everything hangs off it.' },
  { name: 'Session cap', time: '01:30', note: 'Last hand. Wind-down 1:30–2:00, in bed by 2:00. The cap protects the anchor.' },
  { name: 'Caffeine cutoff', time: '18:00', note: '~8 hrs before sleep. The tight one — sleep-protective on purpose.' },
]

export interface FixedPoint {
  t: string
  d: string
}
export const FIXED_POINTS: FixedPoint[] = [
  { t: 'Wake + first hour · 10:00–11:00', d: 'Daylight (~10 min) → 5–10 min movement → protein breakfast + water. One block.' },
  { t: 'Movement floor · by ~16:30', d: 'A real walk; the strength set on lifting days. Before the evening, not after.' },
  { t: 'Caffeine cutoff · 18:00', d: 'Last caffeine. The late hours run on water and food.' },
  { t: 'Wind-down · 01:30–02:00', d: 'No hand review, dim lights, shower, two-line journal. In bed by 2:00.' },
]

export interface TemplateStep {
  time: string
  what: string
}
export interface DayTemplate {
  key: string
  title: string
  when: string
  steps: TemplateStep[]
}
export const DAY_TEMPLATES: DayTemplate[] = [
  {
    key: 'cash',
    title: 'Cash grind day — live at Parx',
    when: 'Tue / Sat',
    steps: [
      { time: '10:00', what: 'Wake anchor + first hour: daylight, movement, protein, water.' },
      { time: '11:30', what: 'Light block: range drills (~30 min) + a glance at notes.' },
      { time: '16:00', what: 'Movement floor: a real walk (no strength — that’s M/W/F).' },
      { time: '16:45', what: 'Pre-session meal: protein + slower carbs, nothing heavy.' },
      { time: '17:00', what: 'Last caffeine before the 18:00 cutoff + prep: one process goal for the night.' },
      { time: '18:15', what: 'Sit. Stand/water every ~90 min; tilt-reset between big pots.' },
      { time: '~01:00', what: 'Live cap: rack up (you’re 40 min out). The drive home is the wind-down.' },
      { time: '01:40', what: 'Shower, two-line journal, no hand review. Bed by 2:00.' },
    ],
  },
  {
    key: 'mtt',
    title: 'Tournament day — Sunday online MTTs',
    when: 'Sun',
    steps: [
      { time: '10:00', what: 'Wake anchor + first hour. The anchor matters most today.' },
      { time: '11:30', what: 'Build the slate: pick events, set the buy-in budget, set up the station.' },
      { time: '13:00', what: 'Weekly review (~15 min), then switch to play mode.' },
      { time: '13:30', what: 'Registration / grind begins. Use breaks: stand, walk, hydrate.' },
      { time: '17:30', what: 'Real dinner on a break, protein-first. Last caffeine by 18:00.' },
      { time: 'most weeks', what: 'Bust before 1:30 → normal wind-down, bed by 2:00.' },
      { time: 'deep run', what: 'Soft cap: a final table is the sanctioned exception. Let Monday flex.' },
    ],
  },
  {
    key: 'study',
    title: 'Study day',
    when: 'Thu (+ non-live Mon)',
    steps: [
      { time: '10:00', what: 'Wake anchor + first hour.' },
      { time: '11:30', what: 'Deep study block (the heavy one, while fresh): Mon PLO/solver · Thu library/review.' },
      { time: '14:00', what: 'Lighter block: range drills / coaching review. (Mon: grocery shop + prep.)' },
      { time: '16:00', what: 'Movement floor: Mon strength + walk · Thu walk only.' },
      { time: '17:30', what: 'Dinner — a deliberate shared one when Ellie has a window.' },
      { time: 'before 2:00', what: 'No session → bank sleep: bed before 2 if tired. These nights repay the debt.' },
    ],
  },
]

export interface RoutineStep {
  t: string
}
export const MORNING_ANCHOR: RoutineStep[] = [
  { t: '10:00 — up on the first alarm. Feet on the floor, no snooze (phone charges across the room).' },
  { t: 'Light, immediately. Blinds / step outside / 10 min of daylight. Sets tonight’s melatonin.' },
  { t: 'Water. A big glass before coffee — you wake dehydrated.' },
  { t: 'Move, 5–10 min. Mobility flow or an easy walk. Just "day’s on."' },
  { t: 'Protein breakfast (~30–40g) — the nutrition anchor meal.' },
  { t: 'Then coffee, ~11:00 — deliberately after light + water + food.' },
]
export const MORNING_RULE = 'No inputs before the protein meal — no phone-in-bed, email, Discord, news, or results. Light and water before screens.'

export interface EveningWindDown {
  key: string
  title: string
  lines: string[]
}
export const EVENING_WINDDOWNS: EveningWindDown[] = [
  {
    key: 'e1',
    title: 'Live-cash nights',
    lines: [
      'The drive home is step one — no hype music, let the session settle, don’t relitigate hands.',
      '~1:40 home: shower (drops core temp), kill the overhead lights.',
      'Two-line journal: one thing that worked, one to fix. No hand review, no solver, no results-refresh.',
      'In bed by 2:00. Wired? 10 min of breathing / the meditation floor.',
    ],
  },
  {
    key: 'e2',
    title: 'Sunday MTTs',
    lines: [
      'Bust before ~1:30: run the live-cash wind-down — close tables, shower, two lines, bed by 2.',
      'Deep run: a longer, deliberate decompress (20–30 min) — shower, low light, breathing. Accept the later bed; Monday flexes.',
      'Whether a score or a bustout, make no decisions — don’t fire up cash to "stay hot," don’t spiral a beat.',
    ],
  },
  {
    key: 'e3',
    title: 'No-session nights',
    lines: [
      'The most valuable one: no session means you can bed before 2. Do it.',
      'Books closed by ~17:00 → easy evening → screens down 30–45 min before bed → meditation floor → in bed early.',
      'Guard the leak: the urge to "use" the free night for more poker or study. Protect it as recovery.',
    ],
  },
]
