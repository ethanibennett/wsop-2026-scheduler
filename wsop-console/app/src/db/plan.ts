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

// ── Generalized zoom for phases 2–6 (weekly-breakdown.md) ──
// Phase 1 keeps its bespoke week-by-week zoom above (PHASE1_*). Phases 2–6 use
// this window model — synthesized faithfully from docs/plan/weekly-breakdown.md,
// which maps the whole cycle in track-tagged windows (H/B/S/P/Med → the six
// tracks). `wk` is the 1-based week-in-phase range, matched against
// phaseState().week to light the NOW marker.
export const PHASE_SHORT: Record<number, string> = {
  1: 'Foundation',
  2: 'Monterey',
  3: 'Home',
  4: 'Grind',
  5: 'WSOP',
  6: 'Landing',
}

export interface PhaseWeek {
  n: string
  dates: string
  wk: [number, number]
  hl: string
  ramp?: string
  event?: string
  cls?: 'hot' | 'surgery' | 'protect'
  note?: string
  tracks: Partial<Record<TrackKey, string>>
}
export interface PhaseZoom {
  dates: string
  sub: string
  arc: ArcStep[]
  weeks: PhaseWeek[]
  foot: string
}

export const PHASE_ZOOM: Record<number, PhaseZoom> = {
  2: {
    dates: 'Sep 22 – Oct 25, 2026 · ~5 weeks · Ellie away (Monterey) — you solo in Philly',
    sub: 'Her first away rotation; you solo in Philly. The first real test of the installed system, and the first volume ramp — a low-stakes rehearsal for the Phase 4 grind.',
    arc: [
      { w: 'W10', t: 'She leaves', hot: true },
      { w: 'W11–13', t: 'Solo ramp' },
      { w: 'W14', t: 'Assess' },
    ],
    weeks: [
      {
        n: 'W10',
        dates: 'Sep 22–28',
        wk: [1, 1],
        hl: 'She leaves — first solo test',
        event: 'First away rotation',
        cls: 'hot',
        tracks: {
          partner:
            'Her first away rotation, likely the hardest adjustment — be attentive. Set the distance rhythm: daily check-in, and handle the home logistics so she can settle into the new place.',
          health:
            'The real test begins — does the system hold without her presence? Hold the wake anchor and the floors; watch for the solo-grind spiral (play → eat badly → skip sleep → tilt). Lean on the social anchors seeded in Phase 1.',
          bank: 'Begin the first real volume ramp — Philly-area live + the online grind, now that you have solo time.',
          skill: 'Online reps scale up; coaching cadence holds; the course keeps moving.',
        },
      },
      {
        n: 'W11–13',
        dates: 'Sep 29 – Oct 19',
        wk: [2, 4],
        hl: 'The solo ramp — steady mode',
        ramp: 'Peak Phase-2 volume',
        tracks: {
          bank: "Peak Phase-2 volume — edge games live + online. Apply the 30/40/20 rules; if a soft higher game runs and you're rolled, the first shot-take is on. Keep feeding the WSOP-fund bucket.",
          skill:
            'A-games to accumulate, B-games to develop; daily range drills; library growing from coaching and flagged hands. Solver-dev continues, but stays behind the play volume.',
          health:
            'Strength fully resumed post-hernia — rebuild it. Prove the system runs on autopilot solo; this is the dress rehearsal for the long grind.',
          partner:
            'Steady distance-support; a visit or care package mid-rotation lands hardest when the new-place loneliness peaks.',
        },
      },
      {
        n: 'W14',
        dates: 'Oct 20–25',
        wk: [5, 5],
        hl: 'Wind down + assess',
        event: 'She returns ~Oct 26 (to VA rotation)',
        note: 'Fix the wobbles now — the solo structure you prove here is the one Phase 4 leans on for months.',
        tracks: {
          health:
            'Honest read on what held solo and what slipped — note it, because Phase 4 is this same test for months.',
          partner:
            'She returns to Philly ~Oct 26 — but to the VA rotation, so busy, not free. Shift from distance-support to the daily touchpoint; don’t expect a "back together" reset.',
        },
      },
    ],
    foot: "What holds solo here and what slips — note it. Phase 4 is this same test, for months. She's back ~Oct 26, but to the VA rotation: a daily touchpoint, not a reset.",
  },
  3: {
    dates: 'Oct 26 – Feb 7 · ~15 weeks · busy Philly rotations around the protected holidays',
    sub: 'The long one: a busy Philly (VA) rotation, the holiday gap, another busy Philly rotation. Grind the rotation weeks, protect the holidays — and the biggest skills-development window before the grind.',
    arc: [
      { w: 'W15–18', t: 'VA grind' },
      { w: 'W19–23', t: 'Holidays', hot: true },
      { w: 'W24–28', t: 'Close-out' },
    ],
    weeks: [
      {
        n: 'W15–18',
        dates: 'Oct 26 – Nov 25',
        wk: [1, 5],
        hl: 'VA rotation (busy) — grind + develop',
        tracks: {
          bank: "She's slammed on the VA rotation → grind-available. Steady volume, live + online; keep feeding the WSOP fund.",
          skill:
            'Biggest development push begins — drive the PLO course toward done, lean on coaching, grow the library. B-games moving toward competence.',
          health: "Maintain the rhythm; don't let her hospital hours drag your wake anchor around.",
          partner: 'Daily touchpoint; be the steady base through a demanding rotation.',
        },
      },
      {
        n: 'W19–23',
        dates: 'Nov 26 – Jan 3',
        wk: [5, 10],
        hl: 'Holiday gap — protect',
        event: '★ The big together window',
        cls: 'protect',
        tracks: {
          partner:
            "The big together window — full presence. Plan it ahead so it doesn't dissolve into grind. Real time, rest, something to look forward to.",
          bank: 'Pull volume back — this is a protected window, not an accumulation one.',
          health:
            "Hold the wake anchor through holidays and travel; keep defaults running around the indulgence — maintain, don't white-knuckle.",
          skill: 'Light. Recharge. Maybe keep the daily range drill ticking; ease the rest.',
        },
      },
      {
        n: 'W24–28',
        dates: 'Jan 4 – Feb 7',
        wk: [11, 15],
        hl: 'Philly rotation (busy) — close out development',
        tracks: {
          bank: 'Back to grind-available — volume up, fund accumulation continues. Move up a rung if roll and edge-rate support it.',
          skill:
            'Close the big development work: course finished, B-games at or near competence — Phase 4 assumes they’re ready. Library solid.',
          health:
            'Maintain; tighten anything that drifted over the holidays (mind the "I’ll restart in January" trap).',
          partner: 'Daily-touchpoint mode during the rotation.',
        },
      },
    ],
    foot: 'Grind the rotations, protect the holidays. By Feb 7 the course is finished and the B-games are competent — Phase 4 assumes exactly that.',
  },
  4: {
    dates: 'Feb 8 – May 2 · ~12 weeks · mostly solo (Cleveland ×2) around a spring gap',
    sub: 'Peak volume, mostly solo — Cleveland ×2 around a spring gap. The rebuild push and the WSOP-fund accumulation, the payoff for Phases 1–3. The system has to be automatic now.',
    arc: [
      { w: 'W29–33', t: 'Peak grind' },
      { w: 'W34–35', t: 'Spring gap', hot: true },
      { w: 'W36–40', t: 'Lock WSOP', hot: true },
    ],
    weeks: [
      {
        n: 'W29–33',
        dates: 'Feb 8 – Mar 11',
        wk: [1, 5],
        hl: 'Cleveland (away) — peak grind',
        ramp: 'Peak accumulation',
        tracks: {
          bank: 'Peak accumulation — your highest-volume stretch. Disciplined stake progression and shot-taking as the roll clears thresholds. Fund accumulation in earnest.',
          health: "Autopilot under load. Protect sleep ruthlessly — it's hourly. If fried, cut volume, not health.",
          mind: 'The danger zone — isolation × variance × duration. Therapy and resets must already be running; downswing protocol on standby.',
          skill: 'Sharpen under volume, tight leak review. No new big learning — that was Phase 3.',
          partner: 'Support from a distance (Cleveland); steady daily contact through the away block.',
        },
      },
      {
        n: 'W34–35',
        dates: 'Mar 12 – Mar 28',
        wk: [5, 7],
        hl: 'Spring gap — protect',
        event: '★ The one real break in the grind',
        cls: 'protect',
        tracks: {
          partner: "She's back and free — be present, recharge together. The one real break in the grind.",
          health: 'Recover — repay sleep debt, reset.',
          bank: 'Ease volume; protected window.',
        },
      },
      {
        n: 'W36–40',
        dates: 'Mar 29 – May 2',
        wk: [8, 12],
        hl: 'Cleveland (away) — grind + lock WSOP logistics',
        event: 'Lock WSOP logistics + action sales',
        tracks: {
          bank: 'Grind continues; fund near target. Lock the WSOP logistics now: confirm the released schedule, line up the action sales / backers, set the deployable fund.',
          skill: 'Final sharpening of the slate formats before the series.',
          health: 'Hold the line, then a soft taper toward the end so you arrive rested, not fried.',
          admin: 'Draw up the staking agreements + WSOP tax prep with the CPA — the paperwork, not just the handshakes. Per-entry ownership ledger ready before Vegas.',
          partner: 'Distance-support continues; flag any of her milestones landing in this stretch.',
        },
      },
    ],
    foot: 'The danger zone — isolation × variance × duration — is why Phases 1–3 front-loaded the system. Lock the WSOP logistics and the staking paperwork in W36–40, then taper in.',
  },
  5: {
    dates: 'May 3 – Jul 18 · ~11 weeks · you in Vegas · cash pauses',
    sub: "The bracelet hunt. You're in Vegas; cash pauses. Health flips to performance mode; the fund deploys.",
    arc: [
      { w: 'W41–42', t: 'Taper in' },
      { w: 'W43–48', t: 'The series', hot: true },
      { w: 'W49–51', t: 'Late $10ks' },
    ],
    weeks: [
      {
        n: 'W41–42',
        dates: 'May 3 – 16',
        wk: [1, 2],
        hl: 'Arrive + taper in',
        event: 'Fund deployed',
        tracks: {
          health: 'Arrive rested — the taper paying off. Lock the performance sleep/fuel routine for long days.',
          bank: "Fund deployed; action sales confirmed; floats arranged so you're not fronting the full slate.",
          partner: "Set the during-series rhythm — she's on Long Island, you're in Vegas; stay connected from afar.",
        },
      },
      {
        n: 'W43–48',
        dates: '~May 17 – Jun 27',
        wk: [3, 8],
        hl: 'The series, peak',
        ramp: 'Fire the slate',
        cls: 'hot',
        tracks: {
          bank: 'Fire the slate — the $1.5k non-NLHE, the $2.5–3k, the PLO, and the $10k championships. Action sold on the $10ks.',
          health: 'Performance mode: sleep is the #1 variable, fuel for 12-hour days, walk on breaks, recover between Day 1s and Day 2s.',
          mind: 'Bustout management and the reset discipline matter most here. A downswing is a math event, not a verdict.',
          skill: 'Execution — trust the prep. Light review between events.',
          admin: "Log every entry, cash, and W-2G as it happens — don't reconstruct $200k of action in August. Clean records protect the backers' share.",
          partner: "The June gap is lost to Vegas; you're both grinding. Mutual distance-support.",
        },
      },
      {
        n: 'W49–51',
        dates: '~Jun 28 – Jul 18',
        wk: [9, 11],
        hl: 'Late series + wind-down',
        event: 'The late $10k championships',
        note: "As the series ends (~mid-July), begin the wind-down — don't crash straight off the marathon.",
        tracks: {
          bank: 'The late $10k championships — your toughest, highest-variance events. Deep-run endurance is where the health prep cashes out.',
          health: 'Guard recovery hard as fatigue compounds across the series.',
          partner: 'Stay connected from afar — Rockville rotation, still solo in Vegas.',
        },
      },
    ],
    foot: "~$200k slate, sold down to ~$60–70k net. Sleep is the edge; the tilt/reset discipline is the game. Then wind down — don't crash off the marathon.",
  },
  6: {
    dates: "Jul 19 – Aug 12 · ~3½ weeks · Ellie home but slammed (St. Christopher's) — your decompression window",
    sub: "Recovery and an honest year review. She's home but slammed on St. Christopher's, so it's genuinely your decompression window.",
    arc: [
      { w: 'W52–53', t: 'Decompress' },
      { w: 'W54–55', t: 'Review + reset' },
    ],
    weeks: [
      {
        n: 'W52–53',
        dates: 'Jul 19 – Aug 1',
        wk: [1, 2],
        hl: 'Decompress + recover',
        tracks: {
          health: "Repay sleep debt, ease the rhythm down (don't crash into disorder), gentle movement back, home defaults.",
          bank: 'Tally what survived — roll plus the action-sale settlements. No grinding yet.',
          partner: "Daily touchpoint; she's busy, so lean on your own recovery and process the result in a healthy way.",
        },
      },
      {
        n: 'W54–55',
        dates: 'Aug 2 – 12',
        wk: [3, 4],
        hl: 'Review + reset',
        event: 'The honest year review',
        note: 'Honest year review: what held, what slipped, what carries forward — then re-anchor and go again, now as a bracelet hunter.',
        tracks: {
          skill: "Re-rate every format; capture the WSOP learnings into the library; set the next cycle's POY-track targets.",
          bank: 'Reset the engine — next-cycle starting rung, what worked, what to change.',
          admin: 'Reconcile the year, settle backers, hand the CPA clean books. The 90% loss cap makes the records the difference.',
          partner: 'Reconnect properly as her rotation winds down (~Aug 12) and the next-cycle gap opens.',
        },
      },
    ],
    foot: 'Tally what survived, settle the backers, review honestly. → After Aug 2027 the next cycle opens — assess → re-anchor → go again.',
  },
}

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
// Tournament-day protocol (tournament-day-protocol.md) — a planned exception
// wrapped in buffers. A selection filter (any one fails → pass) + the day-of run.
export interface TdFilter {
  t: string
  d: string
}
export const TD_FILTER: TdFilter[] = [
  { t: 'Bankroll fit', d: 'Buy-in within the tournament cap — a much deeper cushion than cash, since MTTs swing far harder.' },
  { t: 'Structure / value', d: 'Deep stacks + slow levels reward edge; turbos/hypers are crapshoots. Favor guarantees, overlay, soft fields.' },
  { t: 'Logistics cost', d: 'Drive time vs. what it’s worth. A long drive for a small, fast event is an automatic no.' },
  { t: 'Schedule fit', d: 'Does it blow up a protected stretch (a free gap with Ellie, a cash run, a recovery day)?' },
  { t: 'Under quota', d: 'Below the tournament-days-per-month cap — it protects the cash foundation and the sleep rhythm.' },
]
export interface TdPhase {
  title: string
  items: string[]
}
export const TD_PHASES: TdPhase[] = [
  {
    title: 'Day before (buffer)',
    items: [
      'Bank sleep — no late cash session the night before. Arrive rested.',
      'Prep: bag, water, real snacks, route, registration, start time, and your latest acceptable late-reg decided in advance.',
    ],
  },
  {
    title: 'Tournament day',
    items: [
      'Wake earlier than 10:00 — (start − drive − buffer). The one day the anchor flexes by design.',
      'Compressed first hour: even rushed, still daylight + protein + water.',
      'In-event: hydrate steadily, eat real food on breaks (avoid the dinner-break crash), walk on breaks. Caffeine cutoff suspended today.',
      'No cap — play till you bust or bag. Accept it going in.',
      'Do NOT drive to a cash game to "get it back" after a bust.',
      'The drive home is the real safety issue: if far/very late, take a hotel. Too gone → don’t drive.',
    ],
  },
  {
    title: 'Day after (recovery)',
    items: [
      'Re-anchor — hold the 10:00 wake as close as you can; earlier bed that night; light movement; hydrate; no late cash session.',
      'If you bagged: Day 2 is another tournament day — re-run the protocol; recovery shifts to after the run ends.',
    ],
  },
]

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
