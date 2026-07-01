# Overnight worklog (2026-06-18 → 19)

Self-directed overnight run. User asleep; mandate: "get as much done on as many
tasks in the queue as possible." Re-read this each turn — it survives compaction.

## ⚠️ CRITICAL INVARIANTS
- **Grind status: UP** (resumed after user returned; 8 workers + caffeinate). Verify with
  `ps ax -o command= | grep -iE 'python.*datagen_bucketed' | grep -v grep | wc -l` (~8).
  If down: `nohup bash solver/neural/collect-daemon.sh > solver/neural/data/collect.log 2>&1 &`
  + `nohup caffeinate -dimsu >/dev/null 2>&1 &`.
- Data on disk: **1.22M stud8 examples**, 47,984 shards (`find data/st7 -name '*.jsonl' | wc -l`).
- Count files with `find`, never `ls/cat data/st7/*.jsonl` (48k files blow past ARG_MAX
  and silently report 0 with `2>/dev/null`). `du -sh` or `monitor.py` also fine.
- **Gate lesson: run torch SINGLE-THREADED** (`OMP_NUM_THREADS=1`) for these small
  MLPs — multi-thread is mostly sync overhead on tiny batches (a 6-thread run burned
  86 CPU-min on one point). Single-thread is fast and coexists with the grind.
- Don't run heavy torch/CFR while the grind runs at 8 workers — contention starves
  both. Pause/split cores for any training run (see gate playbook below).
- `pkill -f <pattern>` matches THIS script's own command line too — never pkill a
  pattern that appears in a running helper's args (that's how the gate died once).

## Queue + status
1. **Stud 8 scale-vs-EMD gate** — RUNNING (task points ~30k, ~70k → `data/validation_curve.csv`).
   When it lands, read the curve:
   - val_mae still falling toward train (~0.004) → **DATA-LIMITED → scale**: restart
     grind FULL (8 workers), keep collecting; razz datagen gets a small slice only.
   - val_mae plateaued ~0.037 well above train → **BUCKET-LIMITED → EMD**: Stud 8 data
     less urgent; build EMD/OCHS bucketing (true Milestone B) + switch datagen to store
     RAW solves (abstraction-agnostic). Give razz more cores.
   Record the verdict in PROGRESS.md + CLAUDE.md.
2. **Razz full-game net** (product). Pipeline is READY:
   - [x] `net_leaf` razz-wired (`make_leaf_value_fn(..., bucketing=bucket_razz)`), tested.
   - [ ] scale razz data: `python3 datagen_razz.py --street 7 --out data/razz7 --tag rN --boards 200 --per-board 30 --forever`
   - [ ] train+measure: `.venv/bin/python validate.py --shards data/razz7 --epochs 200` (auto-detects 8 buckets)
   - [ ] save a net (`--save nets/razz7.pt`) → wire `torch_predict_fn` + `net_leaf` for early-street razz resolving.
   - First 560-ex net already hit val R²=0.895; more data → better.
3. **Vectorize the re-solver** (numpy `resolve.py` showdown/leaf). Self-validate: numpy
   path must equal the pure-Python path on the existing self-test boards (assert ==).
4. **LBR / best-response meter** (draw games, JS). Particle-filter over the opponent's
   private draws; Kuhn-calibrate against exact BR (`exploitability.js` has it). Careful —
   only ship if Kuhn calibration matches. Riskiest; do after the above.
5. Multiway — backburner, skip.

## Done this session (razz product)
- Razz solver pipeline + R²=0.895 validation; `npm run razz` spot solver;
  `equity.js` razz matchup (`eval/razz.js`); `net_leaf` razz-wired.
- **`solver/razz-solver-gui.html`** — design mockup (futuregame.me tokens, real
  solve_spot output, 2 preset spots, theme toggle). For initial UX testing.
- All pure-Python self-tests via `run_tests.sh`; JS via `npm run test:solver` (32).

## Gate verdict: DATA-LIMITED → SCALE  ✅ CONFIRMED (5-point curve)
val_mae 0.045→0.042→0.038→**0.034** (1.5k→6k→12.75k→25-30k), R² 0.59→0.67→0.71→**0.76**,
train flat ~0.005-0.007. Monotonic, improvement-per-doubling NOT decelerating → 25 buckets
is NOT the ceiling, more data keeps buying accuracy. **EMD bucketing deferred.** Action:
**keep the grind running hard** (it is). Lesson learned: run validate FOREGROUND +
SINGLE-THREAD (`OMP_NUM_THREADS=1`); background tasks got reaped in idle gaps, and
multi-thread was pure overhead on the tiny net. Future refinement: a 70k+ point to find
where (if) it finally plateaus — not needed for the scale decision.

## Current state — AUTONOMOUS (user asleep, full autonomy granted)
**Done:** stud8 net **R²0.879** (`nets/st7_100k.pt`), razz net **R²0.948** (`nets/razz7_3k.pt`),
`net_leaf` **zero-sum correction** (both games, DeepStack-correct — subtract range-weighted
imbalance), **razz full-game solver verified** (real net leaf resolves zero-sum, gap 0.0).
caffeinate is now **self-healed by a keeper loop** (relaunches within 120s); grind 8 workers.
**DONE:** stud8 net **R²0.94 @ 200k** (`nets/st7_200k.pt`) — TARGET HIT (val MAE 0.0155, train floor 0.0095). Dataset ~3.6M (145k shards). LBR core validated (`solver/lbr.js`, Kuhn-calibrated).
**RUNNING:** 4 `datagen_6th` workers (nice 5, st7_200k leaf) → `data/st6`, building the 6th-street bootstrap dataset. **Next milestone:** train the 6th net at ~3-5k examples (`.venv/bin/python validate.py --shards data/st6 --epochs 200 --save nets/st6.pt`). Then wire it as the 5th-street leaf, etc.
**Careful rigor builds (don't rush):** draw-game LBR (particle filter, no exact calibration → sanity-check hard), 6th-street net-leaf exploitability vs exact.

**Autonomous queue (chain via task-completion notifications):**
- Bigger nets on the 1.22M data (safe, self-validating, low risk).
- Scale razz data more → re-train razz net (cheap, 1-D).
- **LBR meter** (additive new module, Kuhn-calibrated) — safe to build unattended.
- 6th-street **bootstrap** (use 7th net as depth-limited leaf to make 6th-street targets) — the next DeepStack milestone; additive.
- **Vectorize re-solver** — HIGH value but MODIFIES core `resolve.py`; do ATTENDED (self-validate numpy==pure-Python), not unattended.

**Ops rules (learned the hard way):** torch SINGLE-THREAD (`OMP_NUM_THREADS=1`); run verifications
IN-TURN (background long tasks get reaped in idle gaps, but the kill notification re-invokes me →
just re-run); count files with `find`, never `ls/cat *.jsonl`.

## Log
- 23:5x — net_leaf razz wiring done+tested.
- 00:0x — built razz-solver-gui.html mockup (validated). Gate was pathologically
  slow (6-thread overhead) → killed it, **restarted grind (8 workers)**, re-launched
  gate SINGLE-THREADED (task, ~30k/70k points). Verdict already clear: scale.
- NEXT (when gate lands or now): razz datagen grind → train razz net (--save) →
  wire net into net_leaf; then vectorize re-solver; LBR last.
