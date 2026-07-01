# WSOP 2027 Console — session orientation

Read this first when picking up the console (e.g. from a phone Remote Control session).

## What it is
A personal PWA for Ethan's WSOP 2027 cycle. Code in `wsop-console/app` (React + TS + Vite),
served by the repo-root `server.js` under **futurega.me/console** (HTTP Basic Auth, account
"ham"). Tabs: Today · Sessions · Bankroll · Plan · Training · Health · Review · Settings.
Plus a decision-support layer and a **Home** module (household contribution). The living
checklist of what's built is `docs/BUILD-LIST.md` — read it for the full feature map.

## How to work
- All work lives on **`master`**. Commit + push → Render auto-deploys.
- `cd wsop-console/app` then: `npm test` (vitest, 100+ tests), `npm run build` (`tsc -b && vite build`).
- Pure logic lives in `src/engine/*.ts` and is unit-tested — add tests for any engine change.
- Checklist / list state (nutrition shopping, admin checklist, Home lists) persists in
  **localStorage**, NOT IndexedDB — deliberately, to avoid risky DB migrations on the user's phone.
- IndexedDB (`src/db/idb.ts`) holds the core records (sessions, bankroll, health, etc.).

## Deploy — the gotchas that bit us (don't repeat)
- **Verify a deploy with the BUILD TIMESTAMP, not `/health`.** `curl https://futurega.me/version.txt`
  returns the deployed build's `YYYYMMDDHHMMSS`. `/health` returning 200 only means *a* server is
  up — Render's starter plan cold-starts the LAST GOOD build after idle (502→200), which looks
  exactly like a fresh deploy but isn't.
- The console build uses **`npm install`, NOT `npm ci`** (`build.js`): the dual-esbuild tree
  (vite 5 → 0.21, vitest 4 → 0.27/0.28) makes strict `npm ci` fail on Render even when the
  lockfile validates locally. Don't switch it back.
- Diagnose deploys via the Render API (service `srv-d6b8ujfgi27c73d5v3p0`): `GET /v1/services/{svc}/deploys`
  for status, `GET /v1/logs?ownerId=tea-d6b8t3ali9vc73dcs4q0&resource={svc}&type=build` for the
  failure reason. API key is in `~/.claude/projects/-Users-ethanibennett-WSOP-scheduler/render.env`
  (out-of-scope — ask before using).

## Current focus: the Home module
`src/screens/HomeCard.tsx` + `src/db/home.ts` (library) + `src/engine/home.ts`. Three lists behind
a toggle: **Today** (rotation-aware suggestions, home/away), **Regular** (user's recurring tasks),
**Needs doing** (longer-term backlog). The curated library is a first draft to tune to Ethan's
actual household. A daily 11:00 ET "home check" push nudge lives in `push-service/schedule.js`
(`HOME_NUDGES`, scheduled separately from the rhythm `BASE_NUDGES`).
