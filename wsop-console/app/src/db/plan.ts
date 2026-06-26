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
