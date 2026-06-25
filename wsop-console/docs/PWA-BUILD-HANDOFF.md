# WSOP 2027 Console — PWA Build Handoff

*A spec for building the year-plan into one installable personal app. Hand this whole file to Claude Code as the brief, alongside the existing assets and the plan docs.*

---

## 0 · What this is

One **personal command console** for the WSOP 2027 cycle: it tracks the work, nudges the daily rhythm, and shows where you stand at a glance. Offline-first PWA, installable on the phone, single user (you).

It is **not** a generic poker tracker or a habit app — it's the operational layer for *this specific plan*, which already exists in detail across the markdown docs. The app's job is to make the load-bearing parts of that plan a daily tool.

**The non-negotiable core (build this first, everything else is secondary):**
1. **Session tracking** — the keystone the entire plan rests on. Bankroll rules, win-rate reads, and the admin/tax layer all depend on clean session logs.
2. **Bankroll state** — roll, WSOP fund, checkpoint ladder, stake clearance.
3. **The daily nudges** — the rhythm reminders that ramp on by week.

Everything else (training log, plan views, routines, review) layers on top.

---

## 1 · Existing assets to absorb

All of these are in the project outputs — bring them into the repo. They are prototypes and content, not the final app.

| Asset | What it is | How to use it |
|---|---|---|
| `wsop-console.zip` | Working Node/Express + web-push (VAPID) + service-worker PWA. Contains `schedule.js` (the `PHASES` array + the ramped `BASE_NUDGES` with real times + `getCurrentPhase`/`weekInPhase`/`getNudges`). | **Reuse the push architecture and the phase/nudge engine wholesale.** `schedule.js` is essentially final — port it. |
| `lift-log.html` | Strength-log prototype: Mon/Wed/Fri sessions w/ the specific lifts, last-session reference, progressive-overload display, benchmarks, prehab checklist. | **Port the UI and data model** for the Training screen. ⚠️ Swap its storage (see below). |
| `year-plan-timeline.html` | The 6-phase year graphic — track filters, tap-to-expand, segments, markers, series. | Port as the **Plan → Year** screen. |
| `phase-1-detail.html` | The 9-week Phase 1 zoom — track filters, install-ramp badges, events, the standard-week grid. | Port as the **Plan → Phase** screen. |
| The markdown docs | `phase-1-playbook.md`, `bankroll-framework.md`, `nutrition.md`, `training-plan.md`, `mental-health-and-game.md`, `business-admin.md`, etc. | **Content source of truth.** The app's plan text, schedules, lift menu, checkpoints, routines, day templates all come from here. |

> ⚠️ **Storage migration — important.** The HTML prototypes (`lift-log.html`) persist via the Claude-artifact `window.storage` API. **That API does not exist in a real PWA.** Replace it everywhere with **IndexedDB** (offline-first local storage). Do not ship `window.storage`.

---

## 2 · Tech stack (recommended)

Keep it lightweight and offline-first. Match the existing console aesthetic.

- **Frontend:** Vite + vanilla TS, or React + Vite if preferred. The prototypes are vanilla; either is fine. Single-page, mobile-first.
- **Storage:** **IndexedDB** via [`idb`](https://github.com/jakearchibald/idb) or **Dexie.js**. All user data lives local-first on the device. Add JSON **export/import** for backup early (it's the only safety net for local-only data).
- **PWA:** Web App Manifest + service worker (offline cache + push). Must be installable; design for iOS install.
- **Push notifications:** keep the existing **web-push (VAPID) + Node service + `node-cron`** model from `wsop-console`. Server-driven push is more reliable than client-scheduled. ⚠️ iOS only delivers web push to an **installed** PWA on **iOS 16.4+**; treat push as enhancement, and mirror every nudge as an in-app **Today checklist** so the app is useful even if push is flaky.
- **Hosting:** static frontend anywhere (Vercel/Netlify/Pages). The push service needs an always-on host (Fly/Render/Railway/a small VPS) — it's tiny.

---

## 3 · Design system (match the graphics)

Console aesthetic — dark felt, chip gold, mono data. Pull these tokens straight from the prototypes.

```css
:root{
  --ink:#14171C; --surface:#1C2128; --surface-2:#232A33; --line:#2C343E;
  --bone:#E8E4DA; --muted:#8A9099; --felt:#3CA374; --chip:#C8A04E;
  /* track colors */
  --t-health:#3CA374; --t-mind:#A78BC9; --t-bank:#C8A04E;
  --t-skill:#6BA9C9; --t-partner:#C98AA8; --t-admin:#2FA0A0;
}
```
- **Fonts:** Space Grotesk (700/500) for headings, Inter (400/500) for body, JetBrains Mono (500/700) for labels, numbers, dates.
- **Components** (already in the prototypes): rounded cards on `--surface`, pill filter chips, tap-to-expand sections, the green primary button, the toast. Reuse them.
- Mobile-first; phone shows ~6–8 sentences at a time. Bottom tab nav.

---

## 4 · Data model

TypeScript-ish; the **Session** is the keystone entity. (See `app/src/db/types.ts` for the live version.)

---

## 5 · Key logic / behaviors

- **Phase + week engine** — port `getCurrentPhase(date)` and `weekInPhase(date)` from `schedule.js`. Everything keys off "what phase/week is it."
- **Nudge ramp** — `getNudges(date)` filters `BASE_NUDGES` by `fromWeek` during Phase 1. The push service must **gate each fire** by the active set.
- **Bankroll engine:**
  - `playingRoll` and `wsopFund` derived from sessions + adjustments.
  - `ladderLookup(roll)` → checkpoint + which stake is cleared (table in `bankroll-framework.md`): $50k→2/2/5+shots, $60k→5/5/10, $75k→Delaware shots, $100k→open WSOP fund, ~$135k→WSOP-ready.
  - **Alerts:** roll crosses a checkpoint up → "you're cleared for X"; roll drops under a floor ($40k / $25k) → "move down" warning.
- **Win-rate analytics** — `$/hr` and (for cash) `bb/100` grouped by `format` + `stakeLevel`.
- **Volume vs ramp** — cash hours logged this week vs the phase target (P1 ~10–15 → P4 ~30).
- **Streaks** — wake-anchor and wind-down streaks from `RoutineLog`. The headline metric is the wake anchor.

---

## 6 · Screens

Bottom-tab nav. Mobile-first.

1. **Today** — phase/week banner; today's **day-type** and its **morning + evening routine checklist**; active nudges as tickable items; a one-tap **Log session** CTA; quick stats (roll, hours this week vs target, anchor streak).
2. **Sessions** — add/edit/list + history; filters; the win-rate-by-format read; hours-this-week vs ramp.
3. **Bankroll** — playing roll + WSOP fund buckets; the **checkpoint ladder** with current position; stake clearance; move-up/down alerts; recent results; the volume ramp.
4. **Training** — port `lift-log`. IndexedDB-backed.
5. **Plan** — port the two graphics: **Year** (6 phases) and **Phase** (9-week zoom) + the standard-week grid, the day templates, and the routines.
6. **Review** — the **Sunday review**.
7. **Settings** — starting roll, the rhythm times, phase override, push enable, **export/import JSON backup**.

---

## 7 · Build milestones (order matters)

- **M0 — Scaffold.** Vite PWA (manifest, SW, installable), design tokens, bottom-tab shell, IndexedDB (`idb`) setup, seed static plan data, port the phase/week engine. Export/import JSON from day one.
- **M1 — Session tracker + Bankroll (the keystone).** *If only M1 ships, the app is already worth using.*
- **M2 — Nudges.** Stand up the push service from the zip; wire the ramp; mirror nudges into the Today checklist.
- **M3 — Training.** Port the lift log to IndexedDB; benchmarks; prehab.
- **M4 — Plan views.** Port the year + phase graphics; weekly grid; day templates; routines.
- **M5 — Rhythm + health + study.** RoutineLog/streaks, health metrics, study log.
- **M6 — Review + insights + polish.** Sunday review screen; deeper analytics; backup hardening.

---

## 8 · Content source map

- **Phases, nudge times, the ramp** → `schedule.js` (in the zip).
- **Phase-1 weeks, the standard-week grid, day-types** → `phase-1-detail.html` + `phase-1-playbook.md`.
- **Day templates (hourly), morning/evening routines** → `phase-1-playbook.md` Parts 4 & 5.
- **The lifts, sample week, benchmarks, prehab** → `training-plan.md` + `lift-log.html`.
- **Bankroll ladder, checkpoints, volume ramp, move-up/down floors** → `bankroll-framework.md`.
- **Nutrition defaults, shopping list, fueling** → `nutrition.md`.
- **Mental-game install, the Sunday-review prompts** → `mental-health-and-game.md`.
- **Admin/tax/staking** → `business-admin.md`.
