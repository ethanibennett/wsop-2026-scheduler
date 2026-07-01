# WSOP 2027 Console — Build List

The living checklist. **M0 (scaffold) + M1 (sessions + bankroll) are built and
live** at https://futurega.me/console with real plan data. This tracks what's
left. Recommended order: **M4 → M2 → M3 → M5/M6**, with the plan-specific layers
slotted in as they become urgent.

Source-of-truth map is in `PWA-BUILD-HANDOFF.md` §8 and `docs/plan/`.

## M4 — Plan views  ← done
- [x] **Year** view — ported `reference/year-plan-timeline.html`: 6 phases, track filters, tap-to-expand, rotation badges, sub-window segments, six-track copy, markers, the tournament series
- [x] **Phase** view — ported `reference/phase-1-detail.html`: 9-week zoom, arc strip, install-ramp/event tags, surgery marker, the standard-week grid
- [x] "NOW" indicator on the current phase/week (driven by the phase engine)
- [x] Day view — three dials, four fixed points, the three hourly templates (cash/MTT/study, expandable), morning anchor + evening wind-downs (`phase-1-playbook.md` Parts 4–5)

## M2 — Nudges / Push  ← built (needs a phone to confirm delivery)
- [x] Cron runs inside the existing always-on `server.js` (no separate service); reuses the app's VAPID setup; nudge subs in `console_push_subscriptions`
- [x] PWA push-subscribe flow (`src/push.ts`) + push/notificationclick handler (`public/push-sw.js` via Workbox importScripts)
- [x] Settings → push-enable toggle (replaced the placeholder note)
- [x] Each fire gated by the weekly ramp (`getNudges`), fired in `America/New_York`
- [ ] Confirm end-to-end delivery on the installed iOS PWA (needs the phone; VAPID must be set in Render env)

## M3 — Training (port `lift-log.html`, IndexedDB-backed)  ← done
- [x] Mon/Wed/Fri sessions with the real lift menu (`training-plan.md`)
- [x] Last-session reference + progressive-overload display
- [x] Pre-op / build toggle (hernia-aware ramp)
- [x] Benchmarks + prehab checklist + history
- [x] Swap prototype `window.storage` → `lifts`/`benchmarks`/`prehab` stores

## M5 — Rhythm · Health · Study  ← done (Health tab: Vitals | Food)
- [x] Rhythm/streaks (wake-anchor + wind-down streaks, this-week routine adherence) — on the Health tab
- [x] Health metrics (weight, waist, sleep, RHR) with weight trend
- [x] Study log (course / coaching / solver / library / review)
- [x] Nutrition defaults + shopping list (`nutrition.md`) — Health → Food: protein target, principles, eating-on-the-day, default plates, phasing/surgery, standing shopping list (localStorage checks)

## M6 — Review · Insights · Polish  ← done
- [x] Sunday review screen: week's sessions/hours/mood/streak → 3 prompts → save `ReviewEntry`
- [x] Deeper analytics: bb/hr + true bb/100 (optional online `hands` field), cumulative-P&L sparkline, by-month breakdown, MTT ROI/ITM, small-sample flags — on Sessions
- [x] Backup hardening: `lastBackupAt` tracking + overdue reminders (Settings status line + Today banner)

## Plan-specific layers (unique to this plan)
- [x] Admin / tax / staking (`business-admin.md`) — Bankroll → Admin: 2026 OBBBA phantom-income estimator (reads the logs) + set-aside %, setup checklist, action-sale calculator, reference landscape
- [x] WSOP-fund tracker on the Bankroll screen: progress to the ~$65k net target + mechanics (monthly feed, opens at $100k, slate sold to net)
- [x] Tournament-day protocol (selection filter + day-before/day-of/day-after) on the Plan → Day view

## Cleanup / follow-ups
- [x] Fixed stale default anchor times in `store.tsx` (07:00/23:00/14:00 → real 10:00/01:30/18:00)
- [x] Removed stale "Phase dates are placeholders" note in `SettingsScreen`
- [x] Fixed `TodayScreen` ROUTINE_MAP — keys were stale post-rename (wake/movement vs wake-anchor/movement-floor) so the wake-anchor streak silently never logged; dropped the orphan `'log-session'` tick
- [x] Reconciled bankroll "cleared stake" notes at $75k/$100k (30-bi-sit vs 40-bi-clear for 5/10/30)
- [x] Made the meditation floor loggable on Health (was a permanently-0 metric — no nudge wrote it)
- [ ] iOS installed-PWA Basic Auth UX — maybe switch `/console` to cookie/JWT login  *(deliberately NOT done unprompted: changing prod auth risks locking the live console out + needs a login-UX decision)*

## Quality / hardening (review-driven)
Adversarial review of the codebase surfaced + fixed real bugs:
- [x] **Date-key timezone bug** — `todayISO()` wrote UTC but week math is local; an EST session logged "today" could fall outside "this week". All record keys now local; streak walks local dates.
- [x] **Rapid-tap data loss** — Today's `toggle`/`save` spread a stale render closure and clobbered ticks; now serialized read-merge-write via `getRecord`.
- [x] **bb/100 channel mixing** — live sessions sharing a stake string inflated bb/100; now uses hands-tracked results only. **bigBlind** = the BB (2nd number), not the straddle.
- [x] **Backup import** refuses newer-schema blobs; export/import derive stores from the live DB (no silent drift).
- [x] **Console push** — cron phase/week gating computed in `America/New_York` (was UTC, drifted on boundary nights); subscribe validates nested keys.
- [x] **Tests** — vitest + 55 engine unit tests (`npm test`); dev-only, prod build/deploy unchanged.
- Skipped (low value / out of scope): bigBlind free-form parse (dropdown-constrained, degrades gracefully); Basic Auth username-timing side-channel (auth path, left per the auth decision above).

## Outside-the-box features (decision-support, data-driven)
Beyond the original spec — turn the framework's judgment calls into numbers from the player's own logs:
- [x] **Monte-Carlo risk simulator** (Bankroll → Risk) — estimates win rate + hourly variance from logged cash, simulates 3000 forward paths → P(hit the $25k/$40k move-down floors), P(reach $100k/$135k checkpoints), 5th/median/95th ending roll, typical worst drawdown. `engine/risk.ts` + seeded-RNG tests.
- [x] **Edge drivers** (Sessions) — splits cash $/hr by whether the wake-anchor held that day and by mood (4–5 vs 1–2), with a delta once each side has 3+ sessions. Tests the plan's rhythm→poker thesis with real data.
- [x] **Stake recommender / "Tonight's game"** (Bankroll → Roll + Today) — the 30/40/20 rules as a live call: standard stake, buy-ins held, move-up readiness, sanctioned-shot earmark, move-down floors.
- [x] **Win-rate significance** ("Is your edge real?", Sessions) — 95% CI on the hourly rate, verdict + hours-to-significance. Backs "don't move up off a small winning sample."
- [x] **WSOP fund pace projection** (Bankroll → Roll) — months to May, required monthly feed, observed pace, projected fund, on-track/shortfall.
- [x] **Downswing protocol + circuit-breaker** (Today banner + Health card) — detects drawdown/loss-streak severity, surfaces the written protocol.
- [x] **Sunday Review auto-readout** ("This week's read") — tone-coded plain-English insights (volume, net, anchor, rhythm→$/hr edge, best game, downswing flag).
- [x] **Weight-recomp tracker** (Health) — progress to −30 lb, lb/week trend, weeks-to-goal, muscle-risk-rate flag.
- [x] **"The climb" milestones** (Review) — bankroll/anchor/weight milestones cleared + next target.
- [x] **Sessions CSV export** (Settings) — RFC-4180 CSV for the CPA / spreadsheet.
- [x] **Lift PR detection** (Training) — estimated-1RM best-set + PR badge.
- [x] **Study cadence** (Health) — this-week count + consecutive-week study streak.
- Engines: `engine/risk.ts`, `health.ts`, `milestones.ts`, `training.ts`, `csv.ts` + new `analytics.ts` functions — all unit-tested (`npm test`).

## Home — household contribution (woven into the schedule)
The "I can't remember everything I could be doing" problem: the app surfaces contributions (esp. the invisible mental load) so the remembering doesn't fall on Ellie. Rotation-aware (home vs away).
- [x] **Library + engine** (`db/home.ts`, `engine/home.ts`) — curated, rotation-aware tasks across daily load / errands & admin / mental load / connection-across-distance; `todaysHome()` surfaces relevant undone items, invisible work first; rotating daily mental-load prompt. Unit-tested.
- [x] **Today 'Home' card** — Ellie home/away toggle (in Settings), the daily prompt, the contribution checklist, quick-add for one-offs she mentions, this-week count. Completions in localStorage.
- [x] **Weekly review summary** — 'Home this week' card (count + per-category) folds household contribution into the Sunday ritual.
- [x] **Daily push nudge** — 11:00 ET 'home check' (`HOME_NUDGES`, separate cron, not in the rhythm checklist).
- All engines unit-tested — **102 tests** total.

## Visual + overnight polish batch
- [x] **Dashboard** (new Dash tab) — overlay every series (cash/MTT P&L, Oura sleep score, sleep hrs, weight, RHR, mood, hours, anchor), each normalized; toggle on/off; **Pearson correlation** readout for any 2; 30/90/all date filter. Oura sleep-score field added to Health.
- [x] **Sessions** — by-venue + by-night ($/hr) breakdowns; search + week/month date filter; quick-log presets (Parx 5/5/10, WSOP.com 1/2 PLO, Phenom 5/10) + online stakes.
- [x] **Bankroll** — online stakes ladder + benchmarks; week-over-week roll delta; delete adjustments.
- [x] **Training** consistency (days/wk + streak) · **Health** sleep-score/RHR 7-day trends · **Review** mental-game card (tilt notes) · **Settings** data summary · weekly backup push nudge · Today first-run card.
- Engines: `series.ts` (+correlate), `byVenue`/`byWeekday`, `weekCadence`/`trainingConsistency`/`metricTrend` — all unit-tested (**120+ tests**).
