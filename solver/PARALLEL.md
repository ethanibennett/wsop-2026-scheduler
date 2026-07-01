# Continuous training on a dedicated machine

> **Note on `--workers > 1`:** the data-parallel merge now **averages** the
> per-round worker tables (`mergeAverage` in `engine/parallel.js`) — a
> DCFR-correct merge, verified on Kuhn (W=4 → exploitability 0.0012, W=8 →
> 0.0008, ≤ single-thread's 0.0016). The *original* additive delta-merge was
> broken (it over-applied DCFR's regret discount W times and flipped negative
> regrets, making strategies *more* exploitable with training — it corrupted a
> td27 retrain from ~2.6 to ~7.9 before it was caught). One semantic change from
> the fix: **parallelism now buys variance reduction at the same iteration rate,
> not W× more iterations** — the extra cores make each iteration lower-variance
> (better convergence), they don't multiply the iteration count. A blueprint
> trained at workers>1 carries genuinely fewer-but-better iterations than the
> old (bogus) iteration counts implied.

This is the plug-and-play setup for grinding the three solvers 24/7 on an
always-on box. Training is pure local compute (zero API tokens), so there's no
reason to leave cores idle. Two pieces:

1. **`supervise.js`** — a self-managing supervisor: runs all three games at
   once (one child process each), keeps them alive across crashes/OOM by
   resuming from the last checkpoint, meters exploitability on a schedule, and
   logs the exploitability-vs-iterations curve to `strategies/curve.csv`.
2. **`engine/parallel.js` + `engine/cfr-worker.js`** — data-parallel MCCFR so a
   single game can use multiple cores (`--workers N` on `train.js`, wired up by
   the supervisor automatically).

## Quick start

```bash
# Auto-size to the machine and run all three games continuously:
npm run supervise

# Typical dedicated box (lots of RAM): cap each child's heap, meter every 20m:
node solver/supervise.js --heap 12288 --meter-min 20

# Pick games / worker counts explicitly:
node solver/supervise.js --games td27,stud8 --workers td27=6,stud8=1
```

Stop it with **Ctrl-C**: it signals every child to write a full-state
checkpoint, then exits. Start it again any time — resuming is automatic (each
game picks up its `strategies/<game>.ckpt.json`).

## What the supervisor does each run

- **Concurrency.** All games run simultaneously, so the box's cores stay busy.
  Memory-bound **Stud 8 runs single-worker by default** (more workers = more
  full-table copies, and RAM is its binding constraint); the memory-light draw
  games (`td27`, `badugi`) split the remaining cores via the parallel engine.
- **Crash/OOM resilience.** If a child exits non-zero it is restarted and
  resumes from its last checkpoint. A child that dies almost immediately (likely
  OOM or a config error) is restarted with exponential backoff instead of
  hot-looping.
- **Periodic saves.** Each child re-exports its pruned strategy every
  `--save-every` seconds (default 600) — so the live site and the meter read
  fresh strategies — and writes a full-state checkpoint every `--ckpt-every`
  seconds (default 1800) — so a kill loses minutes, not hours. Checkpoint writes
  are atomic (temp + rename).
- **Metering.** Every `--meter-min` minutes it runs the exploitability lower
  bound against each saved strategy and appends a row to
  `strategies/curve.csv`: `timestamp,game,iterations,infosets,exploit_lb`. That
  CSV *is* the convergence curve — plot it to see each game flatten out.

### Key flags

| flag | default | meaning |
|---|---|---|
| `--games` | `td27,badugi,stud8` | which games to run |
| `--workers` | auto | e.g. `td27=6,badugi=6,stud8=1` |
| `--heap` | node default | `--max-old-space-size` per child (MB); raise for Stud 8 |
| `--meter-min` | `30` | minutes between exploitability passes |
| `--meter-hands` | `8000` | hands per meter pass (more = less noisy, slower) |
| `--save-every` | `600` | seconds between strategy re-exports |
| `--ckpt-every` | `1800` | seconds between full-state checkpoints |
| `--merge-every`| `100000` | iters/worker between parallel merges (see below) |
| `--dir` | `solver/strategies` | strategies/checkpoints/curve dir (use a throwaway to sandbox) |

## How the data parallelism works (and its limits)

Each merge round the coordinator broadcasts the current table to `W` workers;
each runs `--merge-every` independent external-sampling iterations on its own
RNG stream; the coordinator then sums their regret/strategy **deltas** back in
(`authoritative += Σ_w (worker_w − snapshot)`) and advances the global iteration
count by `merge-every × W`. Regret and average-strategy mass are additive
accumulators and DCFR's per-iteration discount is ≈1 at the scale we train at,
so this synchronous data-parallel scheme is equivalent to that many more
single-thread iterations, to a vanishing early-iteration approximation.
(Verified: `parallel(workers=1)` reproduces a single-thread run byte-for-byte.)

Trade-offs to know:

- **`merge-every` controls the speedup.** Each round costs one table
  serialization (~0.4s for a 13MB / ~110k-infoset badugi table — measured). To
  amortize that to near-linear speedup, keep `merge-every` large relative to the
  table (100k+ is the default for this reason). Smaller = fresher syncs but more
  overhead.
- **Memory scales with workers.** Peak RAM per game ≈ `(W+2)×` one table during
  a merge. That's why Stud 8 (memory-bound) stays at `W=1`; give it RAM via
  `--heap` instead. The draw games are light enough to parallelize freely.
- **`workers=1` uses the in-process trainer** (no serialization cost at all) —
  the parallel path only kicks in at `W>1`.

## Ceiling, not magic

More iterations only converge toward the **abstraction's** optimum, not true
GTO. Past the "stable blueprint" point the exploitability curve flattens and the
next gains come from a better abstraction (Roadmap Phase 2) or the neural solver
(Phase 4), not more hands. Watch `curve.csv`: when a game stops improving, it's
done for this abstraction — move compute to a game still descending.
