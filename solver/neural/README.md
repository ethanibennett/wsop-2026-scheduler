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
  A CFR/CFR+ solver that takes a Public Belief State (public board + both
  players' ranges over hidden holdings) and produces (i) the equilibrium
  strategy for the subgame and (ii) **counterfactual values per hidden holding**
  for both players. This is the data-generation primitive *and* a useful tool on
  its own. Hi/lo split handled by the existing evaluator (`../eval/stud8.js`
  logic, re-implemented in Python or called via a thin bridge).
- **B. Range/holding bucketing** (`pbs.py`).
  EMD/potential-aware clustering of stud hi/lo holdings to compress each range
  to ~1000 buckets (DeepStack's number), capturing both high-hand strength and
  8-or-better low potential (an OCHS-style feature pair). Until B lands, use the
  raw enumerated holdings given the board (tractable: C(unseen, k) is small).
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

## Data generation (`datagen.py`)

1. Sample a random reachable public state (street, upcards, dead, pot).
2. Sample both players' ranges with a coverage-oriented recursive procedure
   (ReBeL's "sample a random CFR iteration" trick) so the net is accurate on the
   PBSs that actually arise, not just equilibrium ranges.
3. Solve the subgame with `resolve.py` (CFR+, no card abstraction).
4. Log `(PBS -> per-holding CFV vector)` as a training example.
5. Bootstrap: train latest-street nets first; use them as leaf values for
   earlier streets.

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
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# smoke-test the network shape:
python value_net.py
```

## Honest status

Only `value_net.py` is real, runnable code (the architecture is fully specified
by the literature, so it's worth nailing down first). `pbs.py`, `resolve.py`,
`datagen.py`, `train.py` are specified interfaces/stubs. The critical-path next
step is **Milestone A** (the tabular subgame re-solver), because without CFV
training data the network has nothing to learn from.
