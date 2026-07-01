# Razz neural solver — pipeline validation milestone

> **Why this exists:** the cheapest way to prove (or break) the whole
> DeepStack-style stack end-to-end. Razz shares Stud 8's public-upcard structure
> (so all the machinery applies unchanged) but is the *simplest* stud instance —
> ONE strategic dimension (low strength), a trivial evaluator, a tiny value net,
> fast convergence. If razz trains clean and re-solving matches exact spots, the
> approach is sound and Stud 8 becomes "just" an abstraction-scaling problem; if
> it struggles, we found a fundamental flaw cheaply, in a day not weeks.

## Status

- [x] **`eval_razz.py`** — ace-to-five low evaluator. Self-tested.
- [x] **Razz re-solver** — done via a `GameSpec` seam in `resolve.py` +
      `razz_game.py` (high-card bring-in, lowest-board-acts-first, whole-pot low
      showdown). Solves any razz subgame exactly; the 7th-street solve is
      validated zero-sum + best-response → 0. **This is already a usable exact
      razz solver for later streets** — the analog of `solve_spot` for Stud 8.
- [x] **Razz 1-D bucketing** (`bucket_razz.py`) — 8-bucket low ladder
      (wheel → paired junk), value-preserving aggregation (reuses bucket.py's
      game-agnostic helpers verbatim).
- [x] **Bucketed throughput engine** (`bucket_resolve_razz.py`) — a full 7th
      board solves in ~0.5s over 8 buckets; zero-sum + dominance verified.
- [x] **Datagen** (`datagen_razz.py`) — same JSONL schema as the Stud 8 grind,
      tagged `game='razz'`, `n_buckets=8`; `validate.py` now auto-detects the
      bucket count, so the training/validation path is wired unchanged.
- [x] **Verify (net fit) — PASSED.** A net trained on the first 560-example
      batch (`data/razz7`) hits **val R²=0.895, MAE 0.051 vs 0.194 baseline**
      (train MAE 0.013 → the gap is data-limited overfit, NOT a bucketing
      ceiling). The DeepStack stack works end-to-end on razz; Stud 8's first run
      was R²=0.39 (harder 2-D abstraction). Scaling the data drives val MAE →
      train; that's optional refinement, the approach is validated.

**Run the verify step:**
```bash
cd solver/neural
python3 datagen_razz.py --street 7 --out data/razz7 --tag r0 \
    --boards 200 --per-board 30 --iters 150 --samples 60 --forever &   # grind
.venv/bin/python validate.py --shards data/razz7 --epochs 200          # measure
```
Read: if val MAE falls toward train MAE as the data grows, the DeepStack stack
works → trust it on Stud 8. If it can't fit even the train targets, 8 buckets is
too coarse (unlikely for 1-D razz).

## Reuse map (≈ Stud 8 minus the hi half)

| Piece | Stud 8 | Razz |
|---|---|---|
| Betting tree | 7-card stud, hi/lo | **same tree** (7-card stud betting) |
| Bring-in | LOWEST upcard | **HIGHEST upcard** (ace is low, so it doesn't bring in) |
| First to act (4th st+) | best (highest) board | **lowest/best razz board** acts first |
| Showdown | split hi / 8-or-better lo | **lowest razz hand wins whole pot** (no split, no qualifier) |
| Eval | `eval_stud8` (bestHi7 + bestLo8) | `eval_razz.best_low_razz` (done) |
| Bucketing | hi-class × lo-class = 25 | **low-class only ≈ 6–8 buckets** (1-D) |
| Value net | 25-bucket I/O | ~6–8-bucket I/O (smaller, trains faster) |
| datagen/train/net_leaf | game-parameterized | reuse |

The real work is the **re-solver** (`resolve.py` is stud8-specific: it mirrors
`games/stud8-game.js` betting + hi/lo showdown). Cleanest path: parameterize
`resolve.py`'s showdown/eval + bring-in direction into a small "game adapter,"
or fork a `resolve_razz.py` that reuses the CFR core. Razz has no chance-card
complexity beyond stud's normal streets and no qualifier, so the leaf logic is
*simpler* than stud8's hi/lo split.

## Verification

- Razz lacks a cheap exact BR (unlike Kuhn), so verify with the re-solver's own
  exact best-response gauge (the `_br`/`exploitability` machinery already in
  `resolve.py`) on small boards, plus the `eval_razz` self-tests.
- The end-to-end win condition: a trained razz net whose held-out CFV error is
  low AND that, used as a re-solving leaf, reproduces exact-solve values on small
  spots. That result is the green light for trusting the same stack on Stud 8.

## Compute

Razz needs far less data than Stud 8 (tiny abstraction), so it's a short run —
briefly pause the Stud 8 grind, generate razz data, train the small net,
validate, resume. No GPU needed (the net is small).

## Razz as a product (study tool)

Razz is a real deliverable the user will use, not just pipeline validation.

- [x] **Exact spot solver** — `solve_spot.py --game razz`. Board + each player's
      range (node-lock the opponent to anything) → GTO strategy + per-side EV +
      exploitability, exact for later streets, in well under a second. The #1
      study tool; needs no net. (e.g. hero with a made wheel vs a broadway board
      → +10 chips, mostly trap-checks the nuts.)
- [ ] **Full-game net** — scale razz datagen + train a strong net + wire
      `net_leaf` for razz, so the re-solver covers 3rd–5th streets (where exact
      upcard enumeration is intractable) and runs in real time. Razz needs far
      less data than Stud 8, so this is cheap — but its datagen competes with the
      Stud 8 grind for cores, so sequence it after the Stud 8 scale-vs-EMD gate.
- [ ] **Equity graphs** — port `eval_razz` to JS + a razz `MATCHUP` in
      `equity.js` for Monker-style razz range-vs-range equity curves.
- [ ] **Study UI** — wire razz spot study / equity into the app (Hands tab).
