# WSOP 2027 Console — Build List

The living checklist. **M0 (scaffold) + M1 (sessions + bankroll) are built and
live** at https://futurega.me/console with real plan data. This tracks what's
left. Recommended order: **M4 → M2 → M3 → M5/M6**, with the plan-specific layers
slotted in as they become urgent.

Source-of-truth map is in `PWA-BUILD-HANDOFF.md` §8 and `docs/plan/`.

## M4 — Plan views  ← mostly done
- [x] **Year** view — ported `reference/year-plan-timeline.html`: 6 phases, track filters, tap-to-expand, rotation badges, sub-window segments, six-track copy, markers, the tournament series
- [x] **Phase** view — ported `reference/phase-1-detail.html`: 9-week zoom, arc strip, install-ramp/event tags, surgery marker, the standard-week grid
- [x] "NOW" indicator on the current phase/week (driven by the phase engine)
- [ ] Day templates (hourly) + morning/evening routines from `phase-1-playbook.md` Parts 4–5 (the one remaining M4 piece)

## M2 — Nudges / Push
- [ ] Deploy `push-service/` (web-push VAPID + node-cron) on an always-on host; generate VAPID keys + env
- [ ] PWA push-subscribe flow (permission → subscribe → POST subscription to server)
- [ ] Wire the Settings → push-enable toggle (replace the placeholder note)
- [ ] Server gates each fire by the weekly ramp (`getNudges`)

## M3 — Training (port `lift-log.html`, IndexedDB-backed)
- [ ] Mon/Wed/Fri sessions with the real lift menu (`training-plan.md`)
- [ ] Last-session reference + progressive-overload display
- [ ] Pre-op / build toggle (hernia-aware ramp)
- [ ] Benchmarks + prehab checklist
- [ ] Swap prototype `window.storage` → `lifts`/`benchmarks`/`prehab` stores

## M5 — Rhythm · Health · Study
- [ ] Routine/streaks engine (wake-anchor headline + wind-down)
- [ ] Health metrics (weight, waist, sleep, RHR) — `health-plan-wsop-2027.md`
- [ ] Study log (course / coaching / solver / library / review)
- [ ] Nutrition defaults + shopping list (`nutrition.md`)

## M6 — Review · Insights · Polish
- [ ] Sunday review screen: week's sessions/hours/mood/streak → 3 prompts → save `ReviewEntry`
- [ ] Deeper analytics (cash bb/100, win-rate trends)
- [ ] Backup hardening (reminders, maybe cloud backup)

## Plan-specific layers (unique to this plan)
- [ ] Admin / tax / staking (`business-admin.md`): tax log, 2026 loss rule, quarterly estimates, backer settlements
- [ ] WSOP-fund mechanics: monthly profit-slice feed + ~$200k slate / action-sold net-target tracker
- [ ] Tournament-day protocol checklist (`tournament-day-protocol.md`)

## Cleanup / follow-ups
- [ ] Remove stale "Phase dates are placeholders" note in `SettingsScreen` (data is real now)
- [ ] iOS installed-PWA Basic Auth UX — maybe switch `/console` to cookie/JWT login
- [ ] `TodayScreen` writes a `'log-session'` tick key that no longer maps to a nudge (post-rename orphan)
- [ ] Reconcile bankroll "cleared stake" labels at $75k/$100k rungs vs `bankroll-framework.md`
