# Handoff — Mixed-Games CFR Solver & Study System

This is the orientation doc for picking the project up in a fresh (e.g.
non-cloud, local) session. It captures where things stand, how to run
everything on your own machine, the execution-model gotchas that have caused
confusion, what's built, the hard-won lessons, and what's next. Companion docs:
`RESEARCH.md` (cited literature + design rationale), `ROADMAP.md` (phased plan),
`PARALLEL.md` (the continuous-training/parallelism operator guide), `README.md`
(module overview), `neural/README.md` (the Stud 8 neural-solver plan).

Working branch: **`claude/cfr-poker-solvers-jec846`**.

---

## 1. TL;DR — where things stand

- A from-scratch **external-sampling MCCFR** engine (DCFR(3/2,0,2)) solves three
  heads-up fixed-limit mixed games with no commercial solver coverage:
  **2-7 Triple Draw, Badugi, Stud 8 or Better**. Validated on Kuhn (→ −1/18) and
  by an exploitability meter (exact best response on Kuhn; Monte-Carlo lower
  bound on the big games).
- Trained strategies today: **td27 ≈ 1.885M iters, badugi ≈ 1.752M, stud8 ≈ 431k**.
  The draw games are mature; **Stud 8 is undertrained** (~1.9 visits/infoset) and
  is the priority for more compute.
- A study UI ships on the admin Hands tab: **Watch Solver** (self-play viewer on
  the replayer felt table), **Solver Trainer** (quiz), pot-odds "why" line.
- **New this session (the local-training stack):**
  - `engine/parallel.js` + `engine/cfr-worker.js` — data-parallel MCCFR
    (multi-core). Verified `workers=1` reproduces single-thread byte-for-byte.
  - `train.js` — `--workers`, `--merge-every`, `--worker-heap`, periodic
    `--ckpt-every` checkpoints (atomic temp+rename), and SIGTERM/SIGINT
    checkpoint-on-exit (single-thread loop now yields so it honors signals).
  - `supervise.js` — self-managing supervisor: runs all three games at once,
    auto-resumes from checkpoints across crashes/OOM, meters on a schedule, logs
    the exploitability-vs-iterations curve to `strategies/curve.csv`.
  - `analyst.js` — read-only report: convergence + a recommended `--workers`
    allocation, plain-English strategy heuristics, optional Claude narration.
  - `setup-local.sh` — one-command machine setup.

---

## 2. How to run it on your machine

```bash
# from the repo root, once:
bash solver/setup-local.sh        # installs deps, restores checkpoints, runs tests,
                                  # prints a launch command tuned to your cores/RAM

# continuous training (survives disconnect):
tmux new -s solver
npm run supervise -- --heap 16384 --meter-min 20      # 64 GB box; auto-sizes workers
#   detach: Ctrl-b then d   |   reattach: tmux attach -t solver

# watch convergence:
tail -f solver/strategies/curve.csv

# heuristics + "which game deserves the cores" (free, no API):
npm run analyst
npm run analyst -- --narrate --out report.md          # + Claude commentary (needs ANTHROPIC_API_KEY)

# ship improved strategies to the live site (review first, then deploy):
bash solver/sync-prod.sh --dry-run                    # review iteration delta + exploitability
bash solver/sync-prod.sh --deploy                     # commit + push just the strategy files to master -> Render
```

On 8 cores / 64 GB the supervisor auto-allocates **td27=3, badugi=3, stud8=1**
(Stud 8 is memory-bound → single worker by default; the analyst will suggest
`stud8=2` once you confirm it's the still-descending priority — safe on 64 GB).
Stop with Ctrl-C (every child checkpoints first). Re-launch to resume.

For true always-on (boot-start, auto-restart) use a systemd unit — see
`PARALLEL.md` (set `KillSignal=SIGINT` so `systemctl stop` checkpoints cleanly).

### Useful single commands
```bash
npm run test:solver                                   # 32 tests (engine, evals, meter)
npm run train -- --game stud8 --iters 5000000 --workers 1   # train one game directly
node solver/exploitability.js --game stud8 --hands 20000     # meter one strategy
```

---

## 3. Execution model — READ THIS (the source of the confusion)

- **Training is 100% local compute and makes ZERO API/network calls.** The
  supervisor, `train.js`, the parallel workers, the exploitability meter, and
  `npm run analyst` *without* `--narrate` never touch any API. They can run
  flat-out 24/7 and can never hit a rate limit.
- **The only thing that calls the Anthropic API is `analyst.js --narrate`.** So
  if you see **HTTP 429 "too many requests,"** it is one of:
  1. `--narrate` called too often (e.g. wrapped in a tight loop). Narrate once or
     twice a day; the deterministic report under it is free and instant. The SDK
     now backs off (maxRetries) and a 429 degrades to "narrative skipped" without
     killing the report.
  2. **Claude Code itself** on the machine hitting your Anthropic plan's usage
     limits — unrelated to the solver code. Fix is plan/limit side (wait for
     reset, fewer concurrent sessions, higher-tier key), not code.
- **CFR resume needs the full-state checkpoints** (`strategies/*.ckpt.json`),
  which are **gitignored** (too large — tens to ~130 MB each). A fresh `git
  clone` has the *pruned average* strategies (`*.json`, committed) but **not** the
  regret state, so without the checkpoints training restarts from zero. The
  current checkpoints were handed off as gzip files; drop the `*.ckpt.json.gz`
  next to the repo (or in `solver/strategies/`) and `setup-local.sh` restores
  them. `curve.csv` is also gitignored (local artifact).
- **The cloud container is ephemeral** (reclaimed when idle) — it is *not* the
  always-on box. Run the supervisor on your dedicated machine, not in a cloud
  session.

---

## 4. What's built (module map)

```
solver/
  engine/
    mccfr.js          External-sampling MCCFR; DCFR(3/2,0,2); checkpoint/resume.
    parallel.js       Data-parallel coordinator (W worker threads, delta-merge).
    cfr-worker.js     The worker thread body.
    cards.js          Card ints, seedable RNG, shuffles.
  games/
    draw-game.js      Shared HU fixed-limit factory (2-7 & Badugi): rules, betting,
                      draws, infosetKey = street+phase|potBin|thisStreetSeq|oppDraws|
                      myDraw|bucket. Actions f/c/r/k/b, d0..d4.
    triple-draw-27.js Draw-aware buckets: M<hi><2nd> (pat low) / D<n>k<top><flags>.
    badugi-game.js    Buckets B/T/W/X by best subset + high card.
    stud8-game.js     Stud hi/lo-8; key street|potBin|seq|first|ownBucket|oppBucket|
                      bringIn. Actions br/co/f/c/r/k/b. ownBucket = COARSE on purpose.
    index.js, kuhn.js (test-only)
  eval/               Hand evaluators: low27, badugi, stud8 (hi + 8-or-better lo).
  train.js            Training CLI (single + parallel paths; checkpoints; signals).
  supervise.js        Continuous-training supervisor.
  analyst.js          Heuristics + allocation report (+ optional Claude narrate).
  exploitability.js   The meter (exact Kuhn BR; reference lower bound for big games).
  setup-local.sh      One-command machine setup.
  strategies/         <game>.json (committed) + .meta.json + .ckpt.json (gitignored).
  tests/              32 tests incl. Kuhn convergence + meter validation.
  RESEARCH.md ROADMAP.md PARALLEL.md README.md HANDOFF.md
  neural/             Stud 8 DeepStack/ReBeL plan; value_net.py implemented;
                      resolve.py (Milestone A) is the critical-path stub.
```

Frontend (in `vite-app/src/` and `public/index.html`): `SolverPlayView.jsx`,
`SolverTrainerView.jsx`, `SolverCard.jsx`. API in `server.js`:
`GET /api/solver/games`, `/api/solver/spot/:gameId`, `/api/solver/playout/:gameId`
(lazy per-game load + `.meta.json` sidecars to avoid OOM in production).

---

## 5. Solver quality today (what the analyst shows)

- **td27** reads as genuine strategy: the **deuce premium** is visible (deuce-
  holding draws open ~92-94% pre-draw), pat/draw splits are sound.
- **badugi** mature (~1.75M iters), low exploitability lower bound.
- **stud8** is **undertrained** — it raises ~55-69% facing a bet on every street
  and a bring-in raises trash ~93% facing a completion. Those are
  convergence/abstraction artifacts (~1.9 visits/infoset), not strategy. The fix
  is **more iterations** (a coarse abstraction was already validated as better
  than a finer one — see §6), which is exactly what the dedicated box is for.

The exploitability number is a **Monte-Carlo lower bound** (simple fixed
exploiters), so treat small moves as noise; a principled per-public-state best
response / LBR is a future milestone (`ROADMAP.md` Phase 1).

---

## 6. Hard-won lessons (don't relearn these)

- **Measure before you trust.** Every abstraction/engine change is judged by the
  exploitability meter. Abstraction quality is **non-monotonic** — a *finer* Stud 8
  bucket raised exploitability (15.1→15.7) and was reverted. Coarser-but-more-
  trained beat finer-but-undertrained.
- **Stud 8's problem is iterations, not granularity.** ~227k infosets at ~431k
  iters ≈ undertrained. RAM was the binding constraint on the 7 GB Actions runner;
  a 64 GB box with a big `--heap` removes it.
- **Label hands by what they draw to, not the made-hand evaluator.** The td27
  rebuild fixed nonsense like "1-card draw to a 9" (really a 2-card draw to the
  cards underneath). The expert user caught these — trust that scrutiny.
- **Deploy code + strategies atomically.** Infoset keys change with the
  abstraction; a strategy only works with the code that produced it.
- **Abstraction is the ceiling, not iterations.** Past the stable-blueprint point,
  more hands barely help; only a better abstraction (Phase 2) or the neural solver
  (Phase 4) moves the ceiling toward true GTO.
- **Parallel merge math:** additive delta-merge is exact for `workers=1` (verified
  byte-for-byte) and sound at scale (DCFR discount ≈1 when t is large). Keep
  `--merge-every` large (100k+) so table serialization stays negligible vs compute.
  Worker threads have their *own* heaps — `--worker-heap` must be set or a growing
  table OOM-kills a worker at ~2 GB even on a big box.

---

## 7. What's next (prioritized)

1. **Grind Stud 8** on the dedicated box toward the millions of iters it needs;
   watch `curve.csv` and rebalance workers via `npm run analyst`. Deploy the
   improved stud8 strategy once the meter shows a meaningful drop.
2. **Production sync** — `bash solver/sync-prod.sh` (built). Reviews each game's
   iteration delta vs prod + its exploitability (so you never ship a regression),
   commits the strategy files on the current branch, and with `--deploy` ships
   *just* the strategy files onto `master` via a throwaway worktree (no
   feature-branch merge) and polls Render until live. `--dry-run` reviews only.
3. **Phase 2 abstraction work** (`RESEARCH.md` C4/C5): distribution-aware **EMD
   bucketing** (learns the deuce/blocker/straight-risk structure instead of
   hand-coding it) and an **expanded draw action space**. Judge with the meter.
4. **Principled best-response / LBR** for a tight exploitability number (not just
   the lower bound) — the gate for trusting further abstraction changes.
5. **Study-system features** (`ROADMAP.md` Phase 3): spot drilling, range/frequency
   explorer, **leak detection** (import your hands vs the solver), node-locking.
6. **Neural Stud 8** (`neural/`, Phase 4): implement **Milestone A `resolve.py`**
   (tabular range-CFR subgame re-solver producing per-holding counterfactual
   values) — the critical path; the value net (`value_net.py`) is already done.
7. Optional: wire `analyst.js` into the supervisor to auto-emit a report each
   metering cycle.

---

## 8. Quick reference — flags

`supervise.js`: `--games`, `--workers g=N,...`, `--heap`, `--worker-heap`,
`--meter-min`, `--meter-hands`, `--save-every`, `--ckpt-every`, `--merge-every`,
`--dir` (sandbox). `train.js`: same training flags + `--game`, `--iters`,
`--minutes`, `--out`, `--seed`, `--min-mass`. `analyst.js`: `--game`, `--dir`,
`--out`, `--narrate`, `--model`. `exploitability.js`: `--game`, `--hands`, `--file`.
