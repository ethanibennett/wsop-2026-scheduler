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

## M5 — Rhythm · Health · Study
- [ ] Routine/streaks engine (wake-anchor headline + wind-down)
- [ ] Health metrics (weight, waist, sleep, RHR) — `health-plan-wsop-2027.md`
- [ ] Study log (course / coaching / solver / library / review)
- [ ] Nutrition defaults + shopping list (`nutrition.md`)

## M6 — Review · Insights · Polish
- [x] Sunday review screen: week's sessions/hours/mood/streak → 3 prompts → save `ReviewEntry`
- [ ] Deeper analytics (cash bb/100, win-rate trends)
- [ ] Backup hardening (reminders, maybe cloud backup)

## Plan-specific layers (unique to this plan)
- [ ] Admin / tax / staking (`business-admin.md`): tax log, 2026 loss rule, quarterly estimates, backer settlements
- [ ] WSOP-fund mechanics: monthly profit-slice feed + ~$200k slate / action-sold net-target tracker
- [ ] Tournament-day protocol checklist (`tournament-day-protocol.md`)

## Cleanup / follow-ups
- [x] Fixed stale default anchor times in `store.tsx` (07:00/23:00/14:00 → real 10:00/01:30/18:00)
- [x] Removed stale "Phase dates are placeholders" note in `SettingsScreen`
- [ ] iOS installed-PWA Basic Auth UX — maybe switch `/console` to cookie/JWT login
- [ ] `TodayScreen` writes a `'log-session'` tick key that no longer maps to a nudge (post-rename orphan)
- [ ] Reconcile bankroll "cleared stake" labels at $75k/$100k rungs vs `bankroll-framework.md`
