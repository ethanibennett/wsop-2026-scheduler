# push-service/ — server-driven nudges (M2)

⚠️ **`wsop-console.zip` was NOT present in the repo when the app was
scaffolded.** Unzip it here. It contains a working Node/Express + web-push
(VAPID) + `node-cron` service whose `server.js` already gates each nudge fire
by the weekly ramp, plus `schedule.js` (the real `PHASES` + ramped
`BASE_NUDGES` + `getCurrentPhase` / `weekInPhase` / `getNudges`).

## When it lands

1. Unzip into this directory (`server.js`, `schedule.js`, `package.json`).
2. **Reconcile the engine.** `app/src/engine/phase.ts` and `app/src/db/seed.ts`
   are a faithful re-implementation built from the handoff spec, but with
   **placeholder phase dates / nudge times**. Replace `seed.ts`'s `PHASES`,
   `PLAN_WEEKS`, and `BASE_NUDGES` with the real values from `schedule.js` so
   the app and the push service agree. The app logic consumes that data as-is —
   no code change needed, just the data.
3. Wire the push subscribe flow + an enable toggle in
   `app/src/screens/SettingsScreen.tsx` (placeholder note already there).
4. Host the service on an always-on box (Fly / Render / Railway). The frontend
   stays static.

> iOS only delivers web push to an **installed** PWA on iOS 16.4+. Push is an
> enhancement — every nudge is already mirrored into the in-app **Today**
> checklist, so the app is useful without it.
