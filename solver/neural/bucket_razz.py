"""1-D holding bucketing for the razz value net (the razz analog of bucket.py).

Razz has ONE strategic dimension — low strength — so holdings collapse onto a
small 1-D ladder (N_BUCKETS=8), from the nut low (the wheel) down to paired/high
junk, instead of Stud 8's 5x5 hi-by-lo grid. That 1-D-ness is exactly why razz
is the cheap pipeline validation: a much smaller net I/O that should train fast.

The aggregate/scatter helpers are game-agnostic (they only use the bucket map),
so they're reused verbatim from bucket.py; only the per-holding class assignment
is razz-specific. Same key property: range-weighted aggregation preserves the
range-weighted value exactly. Pure Python (no numpy/torch).
"""
from __future__ import annotations
from itertools import combinations
from typing import List, Sequence

from pbs import enumerate_holdings
from eval_razz import score5_razz, _lr
# Game-agnostic aggregation/scatter — identical math, reused as the stable API.
from bucket import aggregate_range, aggregate_cfv, scatter_cfv  # noqa: F401

N_BUCKETS = 8                     # 0 = wheel/nut low ... 7 = two pair or worse


def _low_class(cards: Sequence[str]) -> int:
    """Razz low strength 0..7 (0 = the wheel, 7 = two pair or worse). With five
    or more cards this reads the best five-card low's shape; with fewer (early
    streets) it falls back to draw strength = count of distinct low ranks."""
    cards = list(cards)
    if len(cards) >= 5:
        best = min(combinations(cards, 5), key=score5_razz)
        ranks = sorted((_lr(c) for c in best), reverse=True)
        counts: dict[int, int] = {}
        for r in ranks:
            counts[r] = counts.get(r, 0) + 1
        top = max(counts.values())
        npair = sum(1 for v in counts.values() if v >= 2)
        if top == 1:                       # no pair: a genuine five-card low
            hi = ranks[0]                  # the "X-low" name card (ace-low rank)
            if hi <= 5:
                return 0                    # 5-low = the wheel (nut)
            if hi <= 8:
                return hi - 5               # 6-low->1, 7-low->2, 8-low->3
            if hi <= 10:
                return 4                    # 9- or 10-low
            return 5                        # jack-low or worse
        if top == 2 and npair == 1:
            return 6                        # one pair
        return 7                            # two pair / trips / worse
    # fewer than five cards: draw strength by # of distinct low ranks (<=8)
    nlow = len({_lr(c) for c in cards if _lr(c) <= 8})
    return 1 if nlow >= 4 else 3 if nlow == 3 else 5 if nlow == 2 else 7


def bucket_of_holding(holding: Sequence[str], upcards: Sequence[str]) -> int:
    """Bucket id 0..N_BUCKETS-1 for a razz holding given the player's upcards."""
    return _low_class(list(holding) + list(upcards))


def bucket_map(board: List[str], k: int, upcards: Sequence[str]) -> List[int]:
    """Per-holding bucket id, aligned to enumerate_holdings(board, k)."""
    return [bucket_of_holding(h, upcards) for h in enumerate_holdings(board, k)]


if __name__ == "__main__":
    import random
    from pbs import down_count

    rng_ = random.Random(5)
    up0 = ['As', '4s', '5d']
    up1 = ['Kh', 'Qd', 'Jc']
    dead = ['2h', '7c']
    board = up0 + up1 + dead
    k = down_count(5)
    holds = enumerate_holdings(board, k)
    H = len(holds)

    bmap0 = bucket_map(board, k, up0)
    assert len(bmap0) == H
    assert all(0 <= b < N_BUCKETS for b in bmap0)

    # class sanity along the ladder
    assert _low_class(['5s', '4d', '3c', '2h', 'Ah']) == 0          # the wheel
    assert _low_class(['6s', '5d', '4c', '3h', 'Ah']) == 1          # 6-low
    assert _low_class(['8s', '6d', '4c', '3h', '2h']) == 3          # 8-low
    assert _low_class(['Ks', 'Kd', '9c', '7h', '2h', '4s', '5d']) == 4   # best 5 = 9-7-5-4-2
    assert _low_class(['Ks', 'Qd', 'Jc', 'Th', '9s']) == 5         # all high (jack+ low)
    assert _low_class(['3s', '3d', '9c', 'Jh', 'Kd']) == 6         # forced single pair

    # value-preserving aggregation (reused helpers), same contract as bucket.py
    r0 = [rng_.random() for _ in range(H)]
    s = sum(r0); r0 = [x / s for x in r0]
    cfv0 = [rng_.uniform(-10, 10) for _ in range(H)]
    br = aggregate_range(r0, bmap0, N_BUCKETS)
    assert abs(sum(br) - 1.0) < 1e-9, sum(br)
    bcfv = aggregate_cfv(cfv0, r0, bmap0, N_BUCKETS)
    v_raw = sum(r0[h] * cfv0[h] for h in range(H))
    v_buck = sum(br[b] * bcfv[b] for b in range(N_BUCKETS))
    assert abs(v_raw - v_buck) < 1e-9, (v_raw, v_buck)
    cfv_sc = scatter_cfv(bcfv, bmap0)
    assert max(abs(a - b) for a, b in
               zip(bcfv, aggregate_cfv(cfv_sc, r0, bmap0, N_BUCKETS))) < 1e-9
    print(f"ok: bucket_razz.py self-tests pass (N_BUCKETS={N_BUCKETS}, "
          f"1-D low ladder, value-preserving aggregation)")
