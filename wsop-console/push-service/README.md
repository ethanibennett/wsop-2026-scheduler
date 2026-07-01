# WSOP 2027 Console

A self-hosted personal push console for the year plan. A small Node backend holds
the schedule and sends Web Push notifications to an installed PWA on your iPhone.

It's v1: the full notification pipeline works end to end, with the Phase 1 health
nudges wired in as a starting set. Bankroll and skills nudges, and per-phase
schedules, slot in later by editing one file.

---

## What's here

```
server.js            Express backend: serves the app, stores subscriptions,
                     runs the cron scheduler, sends pushes via VAPID.
schedule.js          The plan as data — phases + nudges. The file you'll edit most.
public/
  index.html         The console UI.
  styles.css
  app.js             Registers the service worker, handles the iOS install flow,
                     subscribes to push, renders the schedule.
  sw.js              Service worker — receives pushes, shows notifications.
  manifest.webmanifest
  icons/
```

## Why this stack (the short version)

iOS only delivers Web Push to a PWA that's been **added to the Home Screen** and
opened from there, and it gives PWAs **no background execution** — so the schedule
has to live on the server, which fires each push at its set time. No Apple Developer
account, no App Store. You host the web app and the backend; you own all of it.

---

## Setup

**1. Install**
```bash
npm install
```

**2. Generate your VAPID keys** (once)
```bash
npm run keys
```
Copy `.env.example` to `.env` and paste the public/private keys in. Set `TZ`
to your timezone (`America/New_York` for Philadelphia) and a contact email in
`VAPID_SUBJECT`.

**3. Run**
```bash
npm start
```
Local testing works at `http://localhost:3000` (service workers are allowed on
localhost). **But iOS push needs a real HTTPS origin** — see Hosting below.

---

## Hosting

Push requires HTTPS on a real domain. Anything that runs a persistent Node process
works: a small VPS, Render, Railway, Fly.io, etc. Point a domain at it with a TLS
cert (most of those platforms give you HTTPS automatically) and you're set.

> **Scheduler note.** This uses an always-on process with `node-cron`. If you'd
> rather go serverless (Vercel, Cloudflare Workers), the scheduler can't run as a
> persistent cron inside a function — you'd move the timed firing to that platform's
> cron trigger hitting a send endpoint. Everything else stays the same. Say the word
> and I'll swap it.

---

## The one-time iOS ritual

1. Open your hosted URL in **Safari** on the iPhone.
2. Tap **Share → Add to Home Screen**.
3. Open the app **from the Home Screen icon** (not the Safari tab).
4. Tap **Enable notifications**, then allow.
5. Tap **Send a test push** to confirm it lands.

If you ever deny permission, iOS won't ask again until you **remove the app from
the Home Screen and re-add it**. That's an Apple rule, not a bug.

---

## Editing the plan

Open `schedule.js`. `BASE_NUDGES` is the daily set — change times (`cron` is what
fires; `time` is the label), titles, and bodies freely. Each nudge has a `fromWeek`:
during Phase 1 the set **ramps on by week** (wake W1 → caffeine + cap W3 → movement
W5 → review W7), matching the playbook's install ramp, so you don't toggle anything
by hand. `PHASES` maps the year to Ellie's rotations and drives the phase label.
When you want different nudges per phase, fill in `PHASE_NUDGES[phaseId]`.

cron format is `minute hour day month weekday`. A few examples:
- `0 10 * * *`  → every day at 10:00 (the wake anchor)
- `30 1 * * *`  → every day at 01:30 (the session cap — soft on Sundays)
- `0 13 * * 0`  → Sundays at 13:00 (the weekly review, pre-MTT-grind)

---

## Known iOS quirks (so they don't surprise you)

- Web push **can't break through Focus / Sleep modes** — native (Time-Sensitive)
  can. If that matters for the session-cap or wake-anchor, that's the trigger to
  graduate to an Expo/React Native build. The backend here carries over.
- Subscriptions can **silently expire** after long inactivity. The server prunes
  dead ones automatically; if pushes stop, just open the app and tap Enable again.
- Delivery is slightly less reliable than native. Fine for nudges; don't rely on it
  for anything truly time-critical.
