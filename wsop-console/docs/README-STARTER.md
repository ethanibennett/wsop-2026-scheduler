# WSOP 2027 Console — Repo Starter

The 5-minute setup so the repo is ready the moment you open Claude Code. Pair this with `PWA-BUILD-HANDOFF.md` (the full brief).

---

## 1 · Drop these in first

Bring the existing assets into the repo before you start building:

- [ ] `PWA-BUILD-HANDOFF.md` → `docs/`  *(the brief — Claude Code reads this first)*
- [ ] `wsop-console.zip` → unzip into `push-service/`  *(Node push service + `schedule.js`)*
- [ ] `lift-log.html` → `reference/`  *(training UI to port)*
- [ ] `year-plan-timeline.html` → `reference/`  *(year graphic to port)*
- [ ] `phase-1-detail.html` → `reference/`  *(phase graphic to port)*
- [ ] the plan docs (`phase-1-playbook.md`, `bankroll-framework.md`, `nutrition.md`, `training-plan.md`, `mental-health-and-game.md`, `business-admin.md`) → `docs/plan/`  *(content source of truth)*

---

## 2 · Suggested structure

```
wsop-console/
├─ README.md                     ← this file
├─ docs/
│  ├─ PWA-BUILD-HANDOFF.md        ← the brief (source of truth)
│  └─ plan/                       ← the markdown plan docs (content source)
│     ├─ phase-1-playbook.md
│     ├─ bankroll-framework.md
│     ├─ nutrition.md
│     ├─ training-plan.md
│     ├─ mental-health-and-game.md
│     └─ business-admin.md
├─ reference/                     ← prototypes to PORT (not shipped as-is)
│  ├─ lift-log.html
│  ├─ year-plan-timeline.html
│  └─ phase-1-detail.html
├─ app/                           ← the PWA frontend (Claude Code builds this)
│  ├─ index.html
│  ├─ manifest.webmanifest
│  ├─ vite.config.ts
│  └─ src/
│     ├─ main.ts
│     ├─ db/                      ← IndexedDB (idb) schema + repositories
│     ├─ engine/                  ← phase/week, bankroll, win-rate, streaks
│     ├─ screens/                 ← today · sessions · bankroll · training · plan · review · settings
│     ├─ components/              ← cards, chips, expandable, toast (from prototypes)
│     ├─ styles/                  ← design tokens (§3 of the handoff)
│     └─ sw.ts                    ← service worker (cache + push)
└─ push-service/                  ← from wsop-console.zip (Node/Express + web-push + node-cron)
   ├─ server.js                   ← already gates nudge fires by the weekly ramp
   ├─ schedule.js                 ← PHASES + ramped nudges (port the engine from here)
   └─ package.json
```

> ⚠️ The prototypes persist with the Claude-artifact `window.storage` API, which **does not exist in a real PWA**. Use **IndexedDB** in `app/src/db/`. Never ship `window.storage`.

---

## 3 · Quick start

1. Create the repo, drop in the files per §1.
2. Open Claude Code in the repo and paste the kickoff prompt from **§9 of the handoff**.
3. Build **M0** (scaffold + IndexedDB + phase engine) → **M1** (session tracker + bankroll). Ship those and actually use them before adding the rest — the session log is the keystone habit.
4. Decide **vanilla-TS vs React** before M0 so the scaffold stays clean (the handoff allows either).

---

## 4 · Milestone checklist

- [ ] **M0** — Vite PWA (installable), design tokens, tab shell, IndexedDB, seed plan data, phase/week engine, JSON export/import
- [ ] **M1** — Session tracker + bankroll dashboard (checkpoints, clearance, win-rate)  ← *minimum useful app*
- [ ] **M2** — Nudges (push service + ramp + Today checklist)
- [ ] **M3** — Training (port lift-log → IndexedDB)
- [ ] **M4** — Plan views (port the two graphics + grid + routines)
- [ ] **M5** — Rhythm/streaks + health metrics + study log
- [ ] **M6** — Sunday review + insights + backup hardening
