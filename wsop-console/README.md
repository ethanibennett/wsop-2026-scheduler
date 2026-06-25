# WSOP 2027 Console

One **personal command console** for the WSOP 2027 cycle — offline-first PWA,
installable on the phone, single user. It tracks the work, nudges the daily
rhythm, and shows where you stand at a glance. The full brief is in
[`docs/PWA-BUILD-HANDOFF.md`](docs/PWA-BUILD-HANDOFF.md).

## Status

**M0 (Scaffold) + M1 (Session tracker + Bankroll) are built and the app runs.**
This is the non-negotiable core — *if only M1 ships, the app is already worth
using.* Stack decision: **React + Vite + TypeScript** (the handoff allowed
vanilla TS or React; React was chosen for the session/bankroll forms and
derived-state dashboards).

| Milestone | State |
|---|---|
| **M0** — Vite PWA (installable), tokens, tab shell, IndexedDB, seed plan data, phase/week engine, JSON export/import | ✅ done |
| **M1** — Session tracker + bankroll dashboard (checkpoints, clearance, win-rate, volume ramp) | ✅ done |
| **M2** — Nudges (push service + ramp + Today checklist) | ◻︎ Today checklist live; push service pending `wsop-console.zip` |
| **M3** — Training (port lift-log) | ◻︎ tab scaffolded, IndexedDB stores ready |
| **M4** — Plan views (port the two graphics) | ◻︎ tab renders seeded plan data |
| **M5** — Rhythm/streaks + health + study | ◻︎ streak engine + stores ready |
| **M6** — Sunday review + insights | ◻︎ tab scaffolded |

### ⚠️ Missing source assets

The handoff references assets that were **not in the repo** at scaffold time.
The app was built from the spec content inline in the handoff, with clearly
flagged **placeholder** data where those assets are the source of truth:

- `wsop-console.zip` → `push-service/` (the real `schedule.js` PHASES + nudge times)
- `lift-log.html`, `year-plan-timeline.html`, `phase-1-detail.html` → `reference/`
- the plan markdown docs → `docs/plan/`

Each target directory has a `README.md` explaining exactly what to drop in and
where it wires up. **The phase dates, nudge times, and Phase-1 week grid in
`app/src/db/seed.ts` are placeholders** — replace them with the real
`schedule.js` values when the zip lands (the engine consumes the data as-is, so
no logic changes). The bankroll ladder / floors in
`app/src/engine/bankroll.ts` are taken from the handoff's checkpoint table;
reconcile against `bankroll-framework.md` when it lands.

## Run it

```bash
cd app
npm install
npm run dev        # http://localhost:5173 — installable PWA (dev SW enabled)
npm run build      # type-check + production build to app/dist
npm run preview    # serve the production build
npm run icons      # regenerate PWA icons (dependency-free)
```

Open in a mobile browser (or device emulation) and **Add to Home Screen** to
install. All data is stored **local-first in IndexedDB** — export a JSON backup
regularly from **Settings → Backup** (it's the only safety net for local-only
data).

## Layout

```
wsop-console/
├─ app/                  ← the PWA (React + Vite + TS) — built
│  ├─ src/
│  │  ├─ db/             ← types, IndexedDB layer (idb), seed plan data
│  │  ├─ engine/         ← phase/week, bankroll, win-rate, streaks, formatting
│  │  ├─ screens/        ← today · sessions · bankroll · settings (+ scaffolds)
│  │  ├─ components/     ← BottomNav, Sheet, Toast, SessionForm
│  │  ├─ styles/         ← design tokens (§3) + app styles
│  │  └─ store.tsx       ← React context over IndexedDB
│  └─ scripts/gen-icons.mjs
├─ docs/                 ← the brief + plan docs (source of truth)
├─ reference/            ← prototypes to PORT (M3/M4)
└─ push-service/         ← Node push service (M2, from the zip)
```

## What's real in M0 + M1

- **Session tracking** — log/edit/delete cash & MTT sessions (channel, format,
  stake, buy-in incl. rebuys, cash-out, hours, mood, tilt note, MTT
  entries/place/field, WSOP-fund flag). The keystone entity.
- **Bankroll** — playing-roll and WSOP-fund buckets derived from sessions +
  adjustments; the checkpoint ladder ($50k → ~$135k) with your current rung and
  $-to-next; stake clearance; move-up (crossed a checkpoint) and move-down
  (under the $40k / $25k floors) alerts; deposits/withdrawals/transfers.
- **Win-rate** — `$/hr` grouped by format + stake, plus all-in totals.
- **Volume ramp** — cash hours this week vs the active phase's target.
- **Today** — phase/week banner, quick stats (roll, week hours, wake-anchor
  streak), one-tap log, and the ramped nudge checklist (the in-app mirror of
  what push will fire).
- **Settings** — starting roll, rhythm anchor times, phase override, JSON
  export/import backup.
- **PWA** — installable, offline-first (Workbox precache), manifest + icons.
