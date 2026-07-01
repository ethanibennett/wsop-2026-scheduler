# Solver usage guide

How to actually *use* what's built today. All commands assume you start from the
repo root:

```bash
cd /Users/ethanibennett/Desktop/fg_solver/wsop
```

For deeper background see the companion docs: `solver/README.md` (architecture),
`solver/HANDOFF.md` (machine setup), `solver/PARALLEL.md` (continuous training),
`solver/neural/README.md` (neural pipeline). This file is the "what do I type"
reference.

---

## What you actually have

Two independent solvers plus tooling:

| Thing | Games | What it does | How you use it |
|---|---|---|---|
| **Spot solver** | Stud 8, razz | One later-street spot to equilibrium — `solve_spot` (exact, ≤60 explicit hands) or `solve_range` (range-vs-range, any width) | CLI / browser GUI / HTTP API |
| **Tabular blueprints** | 2-7 TD, A-5 TD, badugi, Stud 8 | Whole-game MCCFR strategy tables | Train + measure (no per-spot query UI yet) |
| **Quality meters** | all | Exploitability (LBR + fixed exploiters) | `node` CLIs |
| **Trainers** | all | Build / refine blueprints | `npm run train` / `supervise` |

> The trained neural nets (`solver/neural/nets/*.pt`, Stud 8 R²≈0.94, razz
> R²≈0.948) are **research infrastructure** for the in-progress full-game
> re-solver — they are *not* what the spot solver queries today. The spot solver
> below is exact CFR+ and needs no net.

---

## 1. Solve a Stud 8 / razz spot — the study tool (most common)

Exact equilibrium for a single later-street spot with a **node-locked opponent
range**. Pure Python, solves in well under a second.

```bash
# Razz, 7th street: your made low vs a couple of opponent holdings
npm run razz -- --street 7 \
  --up0 As4s3d2c --up1 KhQdJc9h \
  --me 5h6h7c \
  --opp-range "Kc Kd 2h, Qs Js Tc, Ad Ac 8d" \
  --pot 20

# Stud 8, 7th street (default game), scoop spot
npm run solve -- --street 7 \
  --up0 As4s5d7c --up1 KhQdJc9h \
  --me 2h3h6c \
  --opp-range "Kc Kd 2c, Qs Js Tc" \
  --pot 20
```

Equivalent without npm (same thing the scripts call):

```bash
solver/neural/.venv/bin/python solver/neural/solve_spot.py --game razz --street 7 \
  --up0 As4s3d2c --up1 KhQdJc9h --me 5h6h7c --opp-range "Kc Kd 2h" --pot 20
```

### Arguments

| Flag | Required | Meaning |
|---|---|---|
| `--game` | no (default `stud8`) | `stud8` or `razz` |
| `--street` | yes | 3–7 |
| `--up0` / `--up1` | yes | your / opponent upcards, e.g. `As4s3d2c` |
| `--me` | yes* | your exact down cards, e.g. `5h6h7c` |
| `--me-range` | yes* | your range instead of `--me` (`"all"` or `"Kc Kd 2h, …"`, `:w` for weight) |
| `--opp-range` | yes | node-locked opponent range (same format) |
| `--pot` | yes | pot in chips |
| `--dead` | no | dead/exposed cards |
| `--iters` | no (default 1000) | CFR+ iterations |

\* provide one of `--me` / `--me-range`.

### Reading the output (JSON)

```json
{ "street": 7, "pot": 20, "holdings": 3,
  "value": { "me": 6.73, "opp": -6.73 },     // hero EV in chips (zero-sum)
  "exploitability": 0.08,                      // chips; lower = closer to exact
  "decisions": {                               // keyed by betting history
    "(root)": { "who": "me", "actions": ["check","bet"], "freq": [0.85, 0.15] },
    "b":      { "who": "opp","actions": ["fold","call"],  "freq": [0.40, 0.60] }
  } }
```

### `solve_spot` is exact but capped at 60 hands

It's the "GTO line against *these specific* hands" tool — `"all"` on 7th street
expands to thousands of combos and it refuses. For wider or full ranges, use the
range-vs-range solver next.

## 1b. Solve range-vs-range — no node-locking

`solve_range.py` solves the spot with **both ranges as wide as you like** (up to
`all`) and solves **both players to equilibrium** (a true re-solver, not a
fixed-opponent best response). It auto-picks the engine by range size:

- **≤ 1,200 combined holdings → exact GTO** (raw-holding CFR+, the precise answer
  — a numpy-vectorized solver ~60–180× faster than the old pure-Python path, so
  even a few hundred holdings solve in well under a second).
- **wider / `all` → bucketed** — runs over the whole holding space via buckets in
  ~1.5s. Fast, but an *approximation*: stud8's 25-bucket hi×lo grid is coarse
  (well-converged *within* the abstraction, but the abstraction loses
  resolution); razz's 8-bucket low ladder is finer.

```bash
# full range vs full range, 7th street, plus the line for your exact hand
npm run solve:range -- --game stud8 --street 7 \
  --up0 As4s5d7c --up1 KhQdJc9h --pot 20 \
  --r0 all --r1 all --me "2h 3h 6c"

# weighted hero range vs all (razz)
npm run solve:range -- --game razz --street 7 --up0 As4s3d2c --up1 KhQdJc9h \
  --pot 20 --r0 "Ac 4c 5c, 2h 3h 8d:0.5" --r1 all
```

Output adds `mode` (`exact`/`bucketed`), `n` (holdings or buckets), the range's
**reach-weighted aggregate** strategy at each betting node, and — with `--me` —
that hand's own line (`me_strategy`) plus which bucket it fell in (`me_bucket`).

**6th street** works too (exact path, ≤80 holdings) — it values the 6th→7th
boundary with the trained 7th net. Streets 3–5 aren't supported yet (they deal
public upcards the re-solver doesn't roll out).

> Accuracy on wide ranges is gated by the bucketing — exactly what the EMD
> abstraction work is improving. A better bucket map drops straight into
> `solve_range`'s bucketed mode and sharpens it for free.

---

## 2. Solve spots in the browser (GUI)

```bash
# 1) start the local server (pure Python, no torch needed)
cd solver/neural && python3 solve_server.py        # listens on 127.0.0.1:8000
# 2) open the GUI (separate terminal / Finder)
open solver/razz-solver-gui.html
```

The page fetches `http://127.0.0.1:8000/solve`. It has preset tabs (hero nut low /
hero behind / Stud 8 scoop), editable fields for game, street, upcards, hole
cards, opponent range and pot, a **Solve spot** button, and a dark/light toggle.
Point it at another server with `?server=http://host:port`.

---

## 3. Solve spots programmatically (HTTP API)

Same engine as §1, over HTTP (CORS-open). Start it as in §2, then:

```bash
# health
curl -s http://127.0.0.1:8000/health
# -> {"ok":true,"service":"razz/stud8 solve_spot server","maxHoldings":60,"games":["razz","stud8"]}

# solve (POST JSON)
curl -s -X POST http://127.0.0.1:8000/solve -H 'content-type: application/json' -d '{
  "game":"razz","street":7,
  "up0":"As4s3d2c","up1":"KhQdJc9h",
  "me":"5h6h7c","oppRange":"Kc Kd 2h, Qs Js Tc","pot":20,"iters":1000 }'
```

Request keys: `game, street, up0, up1, dead, me | meRange, oppRange, pot, iters`
(`oppRange` required; cap 60 holdings; `iters` capped at 5000). Response mirrors
the CLI JSON in §1 plus an `input` echo. `GET /solve?game=razz&...` also works.

Env overrides: `SOLVER_HOST`, `SOLVER_PORT`, `SOLVER_MAX_HOLDINGS`.

---

## 4. The draw-game blueprints (2-7 TD, A-5 TD, badugi)

Registered games (`solver/games/index.js`): `td27` (2-7 triple draw), `a5td`
(A-5 triple draw), `badugi`, `stud8`. Trained blueprints are static MCCFR tables
in `solver/strategies/*.json` (e.g. `td27.json` ≈1.88M infosets).

Ask the blueprint what to do in a spot with `npm run query`:

```bash
# button open, 2-card draw to a 7 with a deuce
npm run query -- --game td27 --hand "2c 3d 4h Ks Qd"
#  -> bucket "D2k4d": Raise 90.1% / Call 8.8% / Fold 1.0%   (trained)

# a later decision — replay the action line from the deal:
npm run query -- --game badugi --hand "As 2h 3d Kc" --line "c k"
#  -> draw decision: Stand pat 90.3% / Draw 1 9.7%
```

You name a spot by its **action line from the deal** (`--line`) — the infoset key
carries pot context across streets, so the current street alone isn't enough.
`--line` tokens: `f c r k b` and `d0` (pat) / `d1..d4` (draw N); empty `--line`
is the hand's first decision. The tool prints the hand's bucket, the action
frequencies, and flags **unseen** infosets (rare lines MCCFR never visited →
it honestly returns uniform).

Two honest notes: it's **bucket-level** GTO (many hands share a bucket, so the
strategy is per-bucket, not per-exact-hand), and `a5td` has no blueprint yet
(`npm run train -- --game a5td` to build it). Blueprint *quality* itself is in
§5 (`td27` ≈ 2.84 chips/hand exploitable, `badugi` ≈ 0).

---

## 5. Measure solver quality (exploitability)

```bash
node solver/lbr.js                                            # Kuhn calibration (exact BR)
node solver/lbr-draw-run.js --game td27 --particles 120 --hands 6000
node solver/lbr-draw-run.js --game badugi --particles 120 --hands 8000 --sanity
node solver/exploitability.js --file solver/strategies/td27.json   # quick fixed-exploiter LB
```

`lbr-draw-run.js` reports a particle-filter local-best-response lower bound ±
standard error (the tight, shipped number, in chips/hand). `exploitability.js`
runs fast maniac/station/rock exploiters (looser, quicker).

---

## 6. Train / improve blueprints

```bash
npm run train -- --game td27 --iters 200000          # one bounded run
npm run train -- --game badugi --iters 200000 --workers 4
npm run supervise                                    # always-on, all games, auto-resume + meter
npm run analyst                                      # read-only convergence report + heuristics
tail -f solver/strategies/curve.csv                  # live exploitability-vs-iters
```

Checkpoints + blueprints land in `solver/strategies/`. `supervise` is the "leave
it running" path; `analyst` never mutates anything.

---

## 7. Run the tests

```bash
npm run test:solver                 # JS engine + Kuhn convergence + game invariants
bash solver/neural/run_tests.sh     # neural pipeline self-tests (pure Python)
```

---

## Gotchas (hard-won)

- **Spot solver is node-locked, ≤60 holdings.** Narrow ranges to explicit hands.
- **Torch single-threaded for datagen:** prefix Python grind commands with
  `OMP_NUM_THREADS=1` or workers thrash on this 8-core box.
- **Don't pile on workers.** Keep sustained compute well under 8 cores.
- **Generated data lives OUTSIDE the repo** at `~/fg_solver_data.noindex`
  (`solver/neural/data` is a symlink). Never let datagen write tiny shards back
  into the project tree — it bloats the app and causes session-open crashes.
- **List shard dirs with `find`, not `ls *.jsonl`** (ARG_MAX on large dirs).
