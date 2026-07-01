"""Fast BUCKETED razz re-solver — the razz analog of bucket_resolve.py and the
throughput engine for razz datagen.

Same idea: run CFR over the 1-D low buckets (bucket_razz) instead of raw
holdings, with a SAMPLED bucket-vs-bucket seat-0 share matrix, so a full board
solves in well under a second. Razz's showdown is a single low compare (the
lowest hand wins the WHOLE pot), so the per-holding precompute is one razz-low
score — simpler than Stud 8's hi+lo pair. It reuses resolve.py's exact betting
tree + CFR+ + best-response gauge via `game=RAZZ` (so the bucketed solve still
gets razz's high-card bring-in and lowest-board-acts-first seat order). The
per-bucket CFVs are the razz value net's training target directly. Pure Python.
"""
from __future__ import annotations
import random
from collections import defaultdict
from typing import List, Optional

from pbs import PBS, enumerate_holdings, down_count
from eval_razz import best_low_razz
from bucket_razz import bucket_of_holding, N_BUCKETS
from razz_game import RAZZ
from resolve import resolve_subgame

# Same vectorized fast path as bucket_resolve.py: resolve_fast solves the bucketed
# share-matrix CFR identically to the pure-Python reference (game=RAZZ flows
# through unchanged — only the root betting node's seat order is razz-specific;
# the matrix-driven leaf is game-agnostic). Use it when NumPy is importable, else
# fall back to the pure-Python resolve_subgame.
try:
    from resolve_fast import resolve_subgame_fast as _resolve_subgame_fast
    _HAVE_FAST = True
except Exception:                                   # pragma: no cover - no numpy
    _resolve_subgame_fast = None
    _HAVE_FAST = False


def _razz_share(la: int, lb: int) -> float:
    """Seat-A pot share from two razz-low scores (lower = better; whole pot)."""
    return 1.0 if la < lb else 0.0 if la > lb else 0.5


def sample_share_matrix(board: List[str], k: int, up0: List[str], up1: List[str],
                        n_buckets: int = N_BUCKETS, samples: int = 60,
                        rng: Optional[random.Random] = None,
                        holding_cap: int = 4000) -> List[List[float]]:
    """Seat-0 expected pot share per (bucket0, bucket1), estimated by sampling.

    Precomputes one razz-low score per holding per seat, groups by razz bucket,
    then samples bucket pairs in O(n_buckets²·samples) cheap integer compares —
    independent of #holdings². Colliding samples (shared cards) are rejected.
    Depends only on the board, so datagen computes it ONCE per board and reuses
    it across many range samples."""
    rng = rng or random.Random(0)
    holds = enumerate_holdings(board, k)
    if len(holds) > holding_cap:
        holds = rng.sample(holds, holding_cap)
    by0, by1 = defaultdict(list), defaultdict(list)
    for h in holds:
        c0 = list(h) + up0
        by0[bucket_of_holding(h, up0)].append((frozenset(h), best_low_razz(c0)))
        c1 = list(h) + up1
        by1[bucket_of_holding(h, up1)].append((frozenset(h), best_low_razz(c1)))
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
                cx, lx = rng.choice(ha)
                cy, ly = rng.choice(hb)
                if cx & cy:
                    continue
                tot += _razz_share(lx, ly)
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
    """Solve a bucketed razz subgame -> per-bucket strategy + CFVs (the net
    target). brange0/brange1 are length-n_buckets probability vectors."""
    board = up[0] + up[1] + dead
    k = down_count(street)
    if share_matrix is None:
        share_matrix = sample_share_matrix(board, k, up[0], up[1], n_buckets,
                                           samples, rng or random.Random(0))
    pbs = PBS(street=street, up=up, dead=dead, pot=pot,
              ranges=[brange0, brange1])
    solver = _resolve_subgame_fast if _HAVE_FAST else resolve_subgame
    return solver(pbs, iters=iters, holdings=list(range(n_buckets)),
                  share_matrix=share_matrix, game=RAZZ)


if __name__ == "__main__":
    import time

    up0 = ['As', '4s', '5d', '7c']
    up1 = ['Kh', 'Qd', 'Jc', '9h']
    dead: List[str] = []
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
    assert abs(res['value'][0] + res['value'][1]) < 1e-9, res['value']      # zero-sum
    assert res['exploitability'] < 0.05 * res['pot'], res['exploitability']
    assert t_solve < 5.0, f"bucketed solve too slow: {t_solve:.1f}s"

    # the strongest-vs-weakest bucket matchup (max share) must profit seat 0:
    # a low bucket (nut-ish) crushing a high bucket (paired/junk).
    mval, a, b = max(((M[a][b], a, b) for a in range(n) for b in range(n)),
                     key=lambda t: t[0])
    if mval > 0.65 and a != b:
        r0 = [0.0] * n; r0[a] = 1.0
        r1 = [0.0] * n; r1[b] = 1.0
        res2 = resolve_bucketed(7, [up0, up1], dead, 20.0, r0, r1, iters=150,
                                share_matrix=M)
        assert res2['value'][0] > 0, (mval, res2['value'])

    print(f"ok: bucket_resolve_razz self-tests pass (full 7th board: matrix "
          f"{t_matrix:.2f}s, solve {t_solve:.2f}s over {n} buckets; zero-sum + "
          f"exploitability + dominance)")
