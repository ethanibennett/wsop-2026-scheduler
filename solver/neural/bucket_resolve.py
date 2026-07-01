"""Fast BUCKETED Stud 8 re-solver — the throughput engine for 24/7 datagen.

Runs CFR over hi×lo buckets (bucket.py) instead of raw holdings, so a solve is
O(n_buckets²) at the showdown instead of O(#holdings²) — a full 7th-street board
(~13k holdings) solves in well under a second. It reuses resolve.py's exact
betting tree + CFR+ + best-response gauge, swapping the per-card showdown for a
SAMPLED bucket-vs-bucket seat-0 share matrix (card removal handled by rejecting
colliding samples). Per-bucket CFVs are the value net's training target directly.
Pure Python.
"""
from __future__ import annotations
import random
from collections import defaultdict
from typing import List, Optional

from pbs import PBS, enumerate_holdings, down_count
from eval_stud8 import best_hi, best_lo8
from bucket import bucket_of_holding, N_BUCKETS
from resolve import resolve_subgame

# The bucketed CFR runs over a precomputed n_buckets×n_buckets share matrix, which
# resolve_fast's vectorized solver handles identically to the pure-Python
# reference (validated to machine precision; ~40× faster on a full board). Use it
# when NumPy is importable, else fall back to the pure-Python resolve_subgame.
try:
    from resolve_fast import resolve_subgame_fast as _resolve_subgame_fast
    _HAVE_FAST = True
except Exception:                                   # pragma: no cover - no numpy
    _resolve_subgame_fast = None
    _HAVE_FAST = False


def _share_from_scores(hi_a, lo_a, hi_b, lo_b) -> float:
    """Seat-A pot share from precomputed hi/lo scores (split_share, no re-eval)."""
    hs = 1.0 if hi_a > hi_b else 0.0 if hi_a < hi_b else 0.5
    if lo_a is None and lo_b is None:
        return hs
    if lo_a is not None and lo_b is not None:
        ls = 1.0 if lo_a < lo_b else 0.0 if lo_a > lo_b else 0.5
    else:
        ls = 1.0 if lo_a is not None else 0.0
    return 0.5 * hs + 0.5 * ls


def sample_share_matrix(board: List[str], k: int, up0: List[str], up1: List[str],
                        n_buckets: int = N_BUCKETS, samples: int = 60,
                        rng: Optional[random.Random] = None,
                        holding_cap: int = 4000) -> List[List[float]]:
    """Seat-0 expected pot share per (bucket0, bucket1), estimated by sampling.

    Precomputes each holding's (hi, lo) score once per seat, then samples bucket
    pairs in O(n_buckets² · samples) of cheap integer compares — independent of
    #holdings². Colliding samples (shared cards) are rejected. Depends only on
    the board, so datagen computes it ONCE per board and reuses it across many
    range samples. `holding_cap` bounds the per-board precompute by evaluating a
    random subset of holdings (the matrix is an estimate anyway)."""
    rng = rng or random.Random(0)
    holds = enumerate_holdings(board, k)
    if len(holds) > holding_cap:
        holds = rng.sample(holds, holding_cap)
    # group as (frozenset(cards), hi, lo) per bucket, per seat perspective
    by0, by1 = defaultdict(list), defaultdict(list)
    for h in holds:
        c0 = list(h) + up0
        by0[bucket_of_holding(h, up0)].append((frozenset(h), best_hi(c0), best_lo8(c0)))
        c1 = list(h) + up1
        by1[bucket_of_holding(h, up1)].append((frozenset(h), best_hi(c1), best_lo8(c1)))
    M = [[0.5] * n_buckets for _ in range(n_buckets)]
    for a in range(n_buckets):
        ha = by0.get(a)
        if not ha:
            continue
        for b in range(n_buckets):
            hb = by1.get(b)
            if not hb:
                continue
            tot, cnt = 0.0, 0
            for _ in range(samples):
                cx, hix, lox = rng.choice(ha)
                cy, hiy, loy = rng.choice(hb)
                if cx & cy:
                    continue
                tot += _share_from_scores(hix, lox, hiy, loy)
                cnt += 1
            if cnt:
                M[a][b] = tot / cnt
    return M


def resolve_bucketed(street: int, up, dead, pot: float,
                     brange0: List[float], brange1: List[float],
                     iters: int = 500, samples: int = 80,
                     rng: Optional[random.Random] = None,
                     share_matrix: Optional[List[List[float]]] = None,
                     n_buckets: int = N_BUCKETS) -> dict:
    """Solve a bucketed subgame -> per-bucket strategy + CFVs (the net target).

    brange0/brange1 are length-n_buckets probability vectors. Returns the
    resolve_subgame dict (cfv/value/exploitability) indexed by bucket."""
    board = up[0] + up[1] + dead
    k = down_count(street)
    if share_matrix is None:
        share_matrix = sample_share_matrix(board, k, up[0], up[1], n_buckets,
                                           samples, rng or random.Random(0))
    pbs = PBS(street=street, up=up, dead=dead, pot=pot, ranges=[brange0, brange1])
    solver = _resolve_subgame_fast if _HAVE_FAST else resolve_subgame
    return solver(pbs, iters=iters, holdings=list(range(n_buckets)),
                  share_matrix=share_matrix)


if __name__ == "__main__":
    import time

    # FULL 7th-street board (no dead cards -> ~13k raw holdings). The matrix is
    # the per-board cost (amortized across many range samples in datagen); each
    # bucketed CFR SOLVE is fast because it runs over 25 buckets, not holdings.
    up0 = ['As', '4s', '5d', '7c']
    up1 = ['Kh', 'Qd', 'Jc', '9h']
    dead = []
    board = up0 + up1 + dead
    n = N_BUCKETS
    uni = [1.0 / n] * n

    t0 = time.time()
    M = sample_share_matrix(board, down_count(7), up0, up1, n, 60, random.Random(1))
    t_matrix = time.time() - t0

    t0 = time.time()
    res = resolve_bucketed(7, [up0, up1], dead, 20.0, uni, uni, iters=150,
                           share_matrix=M)
    t_solve = time.time() - t0
    assert len(res['cfv'][0]) == n and len(res['cfv'][1]) == n
    assert abs(res['value'][0] + res['value'][1]) < 1e-9, res['value']   # zero-sum
    assert res['exploitability'] < 0.05 * res['pot'], res['exploitability']
    # per-example cost (matrix reused, 150 iters); throughput then scales with
    # cores via the parallel datagen runner.
    assert t_solve < 5.0, f"bucketed solve too slow: {t_solve:.1f}s"

    # the most lopsided real matchup (max M[a][b]) must profit seat 0. Assert the
    # precondition rather than guarding it: a data-dependent `if` could silently
    # skip the only directional-correctness check (matching resolve.py:706's
    # `assert scoop` convention), so the dominance assertion always runs.
    mval, a, b = max(((M[a][b], a, b) for a in range(n) for b in range(n)),
                     key=lambda t: t[0])
    assert mval > 0.65 and a != b, (mval, a, b)
    r0 = [0.0] * n; r0[a] = 1.0
    r1 = [0.0] * n; r1[b] = 1.0
    res2 = resolve_bucketed(7, [up0, up1], dead, 20.0, r0, r1, iters=150,
                            share_matrix=M)
    assert res2['value'][0] > 0, (mval, res2['value'])

    # ── fast (vectorized) vs pure-Python bucketed equivalence + before/after ──
    # resolve_bucketed now rides resolve_fast's vectorized solver when NumPy is
    # importable; assert it matches the pure-Python resolve_subgame reference to
    # tight tolerance (value/CFV 1e-6, action freqs 1e-3, exploitability 1e-4) and
    # report the speedup. If NumPy is missing both paths ARE resolve_subgame, so
    # the deviations are trivially zero and the timings are equal.
    def _max_dev_b(ref, fast):
        dv = max(abs(ref['value'][0] - fast['value'][0]),
                 abs(ref['value'][1] - fast['value'][1]))
        dc = 0.0
        for side in (0, 1):
            for x, y in zip(ref['cfv'][side], fast['cfv'][side]):
                dc = max(dc, abs(x - y))
        df = 0.0
        for kk in set(ref['strategy']) | set(fast['strategy']):
            for x, y in zip(ref['strategy'][kk]['freq'],
                            fast['strategy'][kk]['freq']):
                df = max(df, abs(x - y))
        de = abs(ref.get('exploitability', 0.0) - fast.get('exploitability', 0.0))
        return dv, dc, df, de

    print(f"\nfast-vs-pure-Python bucketed equivalence (NumPy fast={_HAVE_FAST}):")
    rng_eq = random.Random(17)
    mx_dv = mx_dc = mx_df = mx_de = 0.0
    cases = [("uniform", uni, uni)]
    # asymmetric random reaches
    aa = [rng_eq.random() ** 2 for _ in range(n)]
    bb = [rng_eq.random() ** 3 for _ in range(n)]
    aa = [x / sum(aa) for x in aa]; bb = [x / sum(bb) for x in bb]
    cases.append(("asym-rand", aa, bb))
    # random sparse supports (different per seat)
    s0 = [0.0] * n; s1 = [0.0] * n
    for i in rng_eq.sample(range(n), max(2, n // 3)):
        s0[i] = rng_eq.random() + 0.05
    for j in rng_eq.sample(range(n), max(2, n // 2)):
        s1[j] = rng_eq.random() + 0.05
    s0 = [x / sum(s0) for x in s0]; s1 = [x / sum(s1) for x in s1]
    cases.append(("random-sparse", s0, s1))
    for lbl, r0, r1 in cases:
        pbs_eq = PBS(street=7, up=[up0, up1], dead=dead, pot=20.0,
                     ranges=[r0, r1])
        ref = resolve_subgame(pbs_eq, iters=150, holdings=list(range(n)),
                              share_matrix=M)
        fast = resolve_bucketed(7, [up0, up1], dead, 20.0, r0, r1, iters=150,
                                share_matrix=M)
        dv, dc, df, de = _max_dev_b(ref, fast)
        mx_dv = max(mx_dv, dv); mx_dc = max(mx_dc, dc)
        mx_df = max(mx_df, df); mx_de = max(mx_de, de)
        ok = dv < 1e-6 and dc < 1e-6 and df < 1e-3 and de < 1e-4
        print(f"  {lbl:14s} dv={dv:.2e} dcfv={dc:.2e} df={df:.2e} de={de:.2e}  "
              f"{'OK' if ok else 'FAIL'}")
        assert ok, (lbl, dv, dc, df, de)
    print(f"  MAX: value={mx_dv:.2e} (<1e-6) cfv={mx_dc:.2e} (<1e-6) "
          f"freq={mx_df:.2e} (<1e-3) exploit={mx_de:.2e} (<1e-4)")

    # before/after timing on a FULL 7th board at NB=80, iters=150 (the datagen
    # working size). 'before' = pure-Python resolve_subgame; 'after' = the wired
    # resolve_bucketed (fast when NumPy present).
    nb80 = 80
    M80 = sample_share_matrix(board, down_count(7), up0, up1, nb80, 60,
                              random.Random(8))
    uni80 = [1.0 / nb80] * nb80
    pbs80 = PBS(street=7, up=[up0, up1], dead=dead, pot=20.0,
                ranges=[uni80, uni80])
    t0 = time.time()
    resolve_subgame(pbs80, iters=150, holdings=list(range(nb80)),
                    share_matrix=M80)
    t_before = time.time() - t0
    t0 = time.time()
    resolve_bucketed(7, [up0, up1], dead, 20.0, uni80, uni80, iters=150,
                     share_matrix=M80, n_buckets=nb80)
    t_after = time.time() - t0
    print(f"\nbucketed solve timing (full 7th board, NB={nb80}, iters=150): "
          f"before(pure)={t_before:.2f}s  after(wired)={t_after:.2f}s  "
          f"speedup={t_before / t_after:.1f}x")

    print(f"\nok: bucket_resolve self-tests pass (full 7th board: matrix "
          f"{t_matrix:.2f}s/board amortized, solve {t_solve:.2f}s/example over "
          f"{n} buckets; zero-sum + exploitability + dominance; "
          f"fast==pure-Python within tolerance)")
