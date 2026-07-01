"""Holding bucketing for the Stud 8 value net (Milestone B, v0).

The raw holding space is variable-sized per board (C(unseen, k)) and large
(~13k on 7th street), so a single fixed-width net can't consume it. This maps
each holding to one of a FIXED, small set of buckets capturing the OCHS-style
feature pair the README calls for: high-hand class x 8-or-better-low class.

This is the v0 (deterministic feature bucketing, no clustering). The upgrade is
EMD/potential-aware clustering (true Milestone B); the interfaces here
(bucket_map / aggregate_range / aggregate_cfv / scatter_cfv) stay the same so
that swap is local.

Key property (tested): aggregation is RANGE-WEIGHTED, so the range-weighted
value is preserved exactly — sum_h range[h]*cfv[h] == sum_b brange[b]*bcfv[b].
Pure Python (no numpy/torch).
"""
from __future__ import annotations
from typing import List, Sequence

from pbs import rank_val, low_rank_val, enumerate_holdings
from eval_stud8 import best_lo8

N_HI, N_LO = 5, 5
N_BUCKETS = N_HI * N_LO            # 25 — fixed net range/value width


def _hi_class(cards: Sequence[str]) -> int:
    """Coarse high-hand class 0..4 from a player's cards (any street)."""
    counts = {}
    for c in cards:
        r = rank_val(c)
        counts[r] = counts.get(r, 0) + 1
    top = max(counts.values()) if counts else 1
    pairs = sum(1 for v in counts.values() if v >= 2)
    if top >= 3 or pairs >= 2:        # trips+ or two pair -> made big hand
        return 4
    if top == 2:                       # one pair: split small/big
        pr = max(r for r, v in counts.items() if v >= 2)
        return 3 if pr >= 9 else 2
    hi_rank = max((rank_val(c) for c in cards), default=2)
    return 1 if hi_rank >= 11 else 0   # high-card: broadway vs low


def _lo_class(cards: Sequence[str]) -> int:
    """Coarse 8-or-better-low class 0..4 (made strength, else draw count)."""
    lo = best_lo8(cards)
    if lo is not None:
        top = lo // (15 ** 4)          # highest of the five low cards
        return 4 if top <= 6 else 3    # 6-or-better (strong) vs 7/8 low
    nlow = len({low_rank_val(c) for c in cards if low_rank_val(c) <= 8})
    if nlow >= 4:
        return 2
    return 1 if nlow == 3 else 0


def bucket_of_holding(holding: Sequence[str], upcards: Sequence[str]) -> int:
    """Bucket id 0..N_BUCKETS-1 for a holding given the player's upcards."""
    cards = list(holding) + list(upcards)
    return _hi_class(cards) * N_LO + _lo_class(cards)


def bucket_map(board: List[str], k: int, upcards: Sequence[str]) -> List[int]:
    """Per-holding bucket id, aligned to enumerate_holdings(board, k)."""
    return [bucket_of_holding(h, upcards) for h in enumerate_holdings(board, k)]


def aggregate_range(rng: Sequence[float], bmap: Sequence[int],
                    n_buckets: int = N_BUCKETS) -> List[float]:
    """Per-holding range -> per-bucket range (sums preserved)."""
    out = [0.0] * n_buckets
    for h, b in enumerate(bmap):
        out[b] += rng[h]
    return out


def aggregate_cfv(cfv: Sequence[float], rng: Sequence[float], bmap: Sequence[int],
                  n_buckets: int = N_BUCKETS) -> List[float]:
    """Per-holding CFV -> per-bucket CFV (reach-weighted mean; the net target)."""
    num = [0.0] * n_buckets
    den = [0.0] * n_buckets
    for h, b in enumerate(bmap):
        num[b] += rng[h] * cfv[h]
        den[b] += rng[h]
    return [num[b] / den[b] if den[b] > 1e-12 else 0.0 for b in range(n_buckets)]


def scatter_cfv(bucket_cfv: Sequence[float], bmap: Sequence[int]) -> List[float]:
    """Per-bucket CFV -> per-holding CFV (every holding takes its bucket's value)."""
    return [bucket_cfv[b] for b in bmap]


if __name__ == "__main__":
    import random
    from pbs import down_count

    rng_ = random.Random(3)
    # a 5th-street board (2 down, 3 up each)
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

    r0 = [rng_.random() for _ in range(H)]
    s = sum(r0); r0 = [x / s for x in r0]
    cfv0 = [rng_.uniform(-10, 10) for _ in range(H)]

    br = aggregate_range(r0, bmap0)
    assert abs(sum(br) - 1.0) < 1e-9, sum(br)             # range mass preserved
    bcfv = aggregate_cfv(cfv0, r0, bmap0)

    # value preservation: range-weighted value identical before/after bucketing
    v_raw = sum(r0[h] * cfv0[h] for h in range(H))
    v_buck = sum(br[b] * bcfv[b] for b in range(N_BUCKETS))
    assert abs(v_raw - v_buck) < 1e-9, (v_raw, v_buck)

    # scatter then re-aggregate reproduces the per-bucket CFVs (idempotent)
    cfv_scattered = scatter_cfv(bcfv, bmap0)
    bcfv2 = aggregate_cfv(cfv_scattered, r0, bmap0)
    assert max(abs(a - b) for a, b in zip(bcfv, bcfv2)) < 1e-9

    # sanity: a made wheel buckets as strong-low; a pair of kings as big-pair/no-low
    assert _lo_class(['As', '2c', '3d', '4h', '5s']) == 4
    assert _hi_class(['Kh', 'Kd', '9s', '7c', '2h']) == 3
    assert _hi_class(['Ah', 'Ad', 'Kc', 'Ks', '2h']) == 4   # two pair
    print(f"ok: bucket.py self-tests pass (N_BUCKETS={N_BUCKETS}, "
          f"value-preserving aggregation verified)")
