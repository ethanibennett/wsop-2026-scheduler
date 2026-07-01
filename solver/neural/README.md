# Stud 8 Neural Solver (DeepStack / ReBeL style)

> **Status: foundation / Milestone 0.** This directory is the scaffold for a
> real-time neural solver for heads-up limit **Stud 8 or Better** — the ability
> to solve *any* spot on demand (not just a precomputed grid), so the trainer
> can node-lock to player types/ranges and generate unlimited spots cheaply.
> It is a separate **Python + PyTorch (GPU)** system from the JS MCCFR engine.
> See `../RESEARCH.md` Part IV for the cited rationale and `../ROADMAP.md`
> Phase 4 for sequencing. Nothing here runs end-to-end yet — this is the
> specified starting point.

## Why Stud 8 (and why a neural solver at all)

The JS blueprint solver gives fixed, abstracted strategies. A DeepStack/ReBeL
value network lets us **re-solve arbitrary subgames in seconds**, which is what
powers (a) exact frequencies for any spot, (b) node-locking opponent ranges,
and (c) unlimited trainer spots. Stud 8 is the right first target because its
**rich public upcards** make the public belief state compact (each player's
hidden holding is a bounded set given the board) — the property DeepStack/ReBeL
exploit, and exactly what the *draw* games lack.

## The plan (milestones — each independently useful)

- **A. Tabular subgame re-solver + exact best response** (`resolve.py`).
  ✅ **Implemented & validated.** A range-form **CFR+** solver that takes a
  Public Belief State (public board + both players' ranges over hidden holdings)
  and produces (i) the equilibrium strategy for the subgame and (ii)
  **counterfactual values per hidden holding** for both players. Self-contained
  pure-Python stud rules + hi/lo eval (`eval_stud8.py`, a faithful port of
  `../eval/stud8.js`); no numpy/torch so it runs on any CPU box. Solves 7th
  street exactly (showdown), values street boundaries via a `leaf_value_fn` (the
  net — Milestone D) when depth-limited, and does an exact one-level recursion on
  6th street. Ships an **exact best-response exploitability gauge**; verified by
  zero-sum + exploitability→0 self-tests and a 7000-case cross-check against the
  JS evaluator/first-to-act. `python3 resolve.py` runs the suite.
- **B. Range/holding bucketing** (`bucket.py`).
  ✅ **v0 implemented** (`bucket.py`): deterministic feature bucketing into a
  fixed 25 buckets = high-hand class (5) × 8-or-better-low class (5) — the
  OCHS-style feature pair — so variable-size per-board ranges/CFVs become
  fixed-width net I/O. Aggregation is **range-weighted, so the range-weighted
  value is preserved exactly** (tested). `bucket_map / aggregate_range /
  aggregate_cfv / scatter_cfv` are the stable interface. **Upgrade (true B):**
  EMD/potential-aware clustering to ~1000 buckets (DeepStack's number) — swap is
  local to `bucket.py`.
- **C. Counterfactual value network** (`value_net.py` — *implemented here*).
  Input: a PBS (public board + pot + both range vectors). Output: a per-holding
  counterfactual value vector for both players, as a **fraction of the pot**,
  with a differentiable **zero-sum correction** layer. 7×500 PReLU, Huber loss,
  Adam — DeepStack's proven shape.
- **D. Continual re-solving at the table** (`resolve.py` + the net).
  Maintain our own range + the opponent's counterfactual values; at each
  decision build a depth-limited subgame, set leaf values from the net, run CFR,
  act on the average strategy, update range + CFVs after every action/card (the
  safe re-solving gadget, Brown & Sandholm 2017).
- **E. Earlier-street nets via bootstrapping** — train 7th/6th-street nets
  first, then use them as leaf evaluators to generate earlier-street data
  (DeepStack: the turn net trains the flop net).

## Public Belief State for Stud 8 (the data contract)

```
PBS = {
  street:        3..7 (3rd .. 7th),
  upcards:       [ [my up...], [opp up...] ],   # public
  dead:          [ folded/exposed cards ],       # public, for card removal
  pot, toCall, betSize,
  ranges:        [ r_me, r_opp ],                # prob vectors over each
                                                 # player's hidden holdings
                                                 # (down cards) consistent with
                                                 # the public board
}
```
A player's hidden state on 3rd street = 2 down cards; by 7th = 3 down cards.
Given the board, the holding space is `C(unseen, k)` — small enough to
enumerate before bucketing (B).

## Value network I/O (implemented in `value_net.py`)

- **Inputs (concatenated):** pot/stack ratio (scalar); a board encoding
  (rank+suit multi-hot for both players' upcards + dead cards); the two range
  vectors (length = #buckets or #holdings); a street one-hot.
- **Outputs:** two value vectors (one per player), one scalar per holding,
  expressed as a fraction of the pot, passed through the zero-sum layer.
- **Loss:** Huber on the per-holding value error; Adam; ~fraction-of-pot
  normalization is essential for generalization (DeepStack).

## Data generation (`datagen.py` — ✅ implemented)

1. Sample a random reachable public state (street, upcards, dead, pot).
2. Sample both players' ranges (v0: a mixture of uniform / dense-random /
   sparse / Dirichlet — a coverage proxy; ReBeL's "sample a random CFR
   iteration" snapshot is the upgrade).
3. Solve the subgame with `resolve.py` (CFR+, exact on 7th).
4. Log `(PBS -> per-holding CFV vector)` to JSONL shards (`read_shards` reloads).
5. Bootstrap: 7th street is exact (no net); earlier streets pass the trained
   next-street net as `leaf_value_fn` with `depth_limit=1`.

`generate(out_dir, n, street, ...)` is pure Python and self-tested on small
boards. At full board size the re-solver is the bottleneck (O(#holdings²) at
showdown leaves) — bucket first (B) or solve sampled/low-iter.

## How this connects to the JS engine

The JS engine (`../games/stud8-game.js`, `../eval/stud8.js`) already encodes
the full Stud 8 rules + hi/lo split. Options for `resolve.py`:
- (preferred) re-implement the small amount of stud rules/eval in Python for a
  self-contained, GPU-host-friendly pipeline; or
- (bridge) shell out to a Node helper that runs a range-based CFR over a stud8
  subgame and returns CFVs as JSON.
Milestone A decides this; the net (C) is independent of that choice.

## Setup

```
cd solver/neural
# Everything except the net itself is pure Python (no deps):
bash run_tests.sh          # solver, bucketing, datagen, solve_spot, ... (~55s)

# The value network + training loop need PyTorch:
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python value_net.py        # smoke-test the network shape
python net_leaf.py         # net <-> resolver leaf adapter smoke test
```

### Study a spot now (no training, no torch)

`solve_spot.py` solves any node-locked later-street spot EXACTLY — the headline
value, available immediately (it restricts CFR to the ranges' support, so narrow
spots are fast):

```
python3 solve_spot.py --street 7 --up0 As4s5d7c --up1 KhQdJc9h \
    --me 2h3h6c --opp-range "KcKd2c, QsJsTc, AdAc8d" --pot 20
# -> JSON: per-decision strategy/frequencies, hero EV (chips), exploitability
```

### Build the dataset 24/7 (the bucketed grind)

Full-board raw solves are too slow for volume, so data generation runs CFR over
buckets (`bucket_resolve.py`) — a full 7th board solves over 25 buckets in ~3.4s,
and the per-board share matrix is amortized across many range samples. Run it
continuously across all cores (one process/core), in tmux:

```
tmux new -s datagen
STREET=7 OUT=solver/neural/data/st7 bash solver/neural/datagen-24-7.sh
# detach Ctrl-b d; reattach tmux attach -t datagen; stop Ctrl-C; restart-safe.
# count: ls solver/neural/data/st7/*.jsonl | wc -l
```

### Train (PyTorch), bootstrap latest street first

```
python3 train.py --shards solver/neural/data/st7 --epochs 350 --out nets/st7.pt
# then bootstrap 6th street with the trained 7th-street net as the leaf:
python3 datagen.py --street 6 --n 5000 --out data/st6 --iters 1000 --net nets/st7.pt
python3 train.py  --shards data/st6 --out nets/st6.pt   # ...down to 3rd
```

## Honest status

Implemented & validated (pure Python, self-tested): **`resolve.py`** (Milestone
A subgame re-solver + exact best-response gauge + sparse-support + bucketed
mode), **`solve_spot.py`** (on-demand node-locked study solver — usable NOW),
**`bucket_resolve.py`** + **`datagen_bucketed.py`** + **`datagen-24-7.sh`** (the
fast bucketed solver and the parallel 24/7 data grind), **`datagen.py`**
(exact/raw data), **`bucket.py`** (B v0 — value-preserving hi×lo buckets),
`net_leaf.py`, `train.py` (featurize tested; loop needs torch), `eval_stud8.py`,
`pbs.py`. `value_net.py` (the network) is implemented (needs PyTorch).

Two things work end-to-end on CPU today: **(a) study** — `solve_spot.py` solves
node-locked later-street spots exactly and fast; **(b) the dataset grind** —
`datagen-24-7.sh` generates bucketed CFV training data across all cores. Remaining:

- **Finish Milestone C — `train.py` (+ `net_leaf.py`):** load datagen shards,
  bucket via `bucket.py`, encode via `pbs.encode_pbs`, fit `CounterfactualValueNet`
  with Huber+Adam. `net_leaf.py` wraps a trained net to resolve.py's
  `leaf_value_fn` contract `(street, up, dead, pot, holdings, reach0, reach1) ->
  (cfv0, cfv1)` in chips (net outputs fraction-of-pot → ×pot, scattered over
  holdings) — the bootstrap leaf and the Milestone D search leaf. *Both need
  PyTorch to run; implemented and import-checked here.*
- **Milestone B (true):** swap `bucket.py`'s feature buckets for EMD/potential
  clustering (~1000 buckets) — interface unchanged. Also the path to scaling the
  re-solver past full-board holding counts (it's O(#holdings²) at showdown
  leaves; bucket the leaf evaluation to shrink it).
- **Milestone D — continual re-solving:** drive `resolve_subgame(..., depth_limit,
  leaf_value_fn=net_leaf)` at each decision, propagating ranges + opponent CFVs.
