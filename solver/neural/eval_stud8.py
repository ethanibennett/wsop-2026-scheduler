"""Stud 8 hi/lo hand evaluation (Python port of ../eval/stud8.js).

Foundation for Milestone A (the subgame re-solver) and the data pipeline:
terminal utility in Stud 8 splits the pot between the best HIGH hand and the
best 8-or-better LOW. Cards are 2-char strings ('As', 'Td', '7c', ...) as in
pbs.py. This module is pure Python (no torch) and self-tests on run.
"""
from __future__ import annotations
from itertools import combinations
from typing import List, Optional, Tuple

RANK_VAL = {r: i for i, r in enumerate("23456789TJQKA", start=2)}  # 2..14
SUITS = "cdhs"


def _rank(card: str) -> int:
    return RANK_VAL[card[0]]


def _low_rank(card: str) -> int:
    """Ace-low rank for the low hand: A=1, else 2..13."""
    r = _rank(card)
    return 1 if r == 14 else r


def score5_hi(cards: List[str]) -> int:
    """Standard 5-card high score; higher is better. Categories 0..8."""
    ranks = sorted((_rank(c) for c in cards), reverse=True)
    counts: dict[int, int] = {}
    for r in ranks:
        counts[r] = counts.get(r, 0) + 1
    groups = sorted(counts.items(), key=lambda kv: (kv[1], kv[0]), reverse=True)
    is_flush = len({c[1] for c in cards}) == 1
    distinct = len(groups) == 5
    straight_high = 0
    if distinct:
        if ranks[0] - ranks[4] == 4:
            straight_high = ranks[0]
        elif ranks[0] == 14 and ranks[1] == 5 and ranks[4] == 2:  # wheel A-5
            straight_high = 5
    if straight_high and is_flush:
        cat, sig = 8, [straight_high]
    elif groups[0][1] == 4:
        cat, sig = 7, [groups[0][0], groups[1][0]]
    elif groups[0][1] == 3 and groups[1][1] == 2:
        cat, sig = 6, [groups[0][0], groups[1][0]]
    elif is_flush:
        cat, sig = 5, ranks
    elif straight_high:
        cat, sig = 4, [straight_high]
    elif groups[0][1] == 3:
        cat, sig = 3, [g[0] for g in groups]
    elif groups[0][1] == 2 and groups[1][1] == 2:
        cat, sig = 2, [g[0] for g in groups]
    elif groups[0][1] == 2:
        cat, sig = 1, [g[0] for g in groups]
    else:
        cat, sig = 0, ranks
    v = cat
    for i in range(5):
        v = v * 15 + (sig[i] if i < len(sig) else 0)
    return v


def best_hi(cards7: List[str]) -> int:
    return max(score5_hi(list(c)) for c in combinations(cards7, 5))


def best_lo8(cards7: List[str]) -> Optional[int]:
    """Best 8-or-better low (lower is better), or None if it doesn't qualify."""
    lows = sorted({_low_rank(c) for c in cards7 if _low_rank(c) <= 8})
    if len(lows) < 5:
        return None
    five = sorted(lows[:5], reverse=True)
    v = 0
    for r in five:
        v = v * 15 + r
    return v


def split_share(cards_a: List[str], cards_b: List[str]) -> float:
    """Fraction of the pot player A wins (0, 0.25, 0.5, 0.75, 1) under hi/lo."""
    hi_a, hi_b = best_hi(cards_a), best_hi(cards_b)
    hi_share = 1.0 if hi_a > hi_b else 0.0 if hi_a < hi_b else 0.5
    lo_a, lo_b = best_lo8(cards_a), best_lo8(cards_b)
    if lo_a is None and lo_b is None:
        return hi_share
    if lo_a is not None and lo_b is not None:
        lo_share = 1.0 if lo_a < lo_b else 0.0 if lo_a > lo_b else 0.5
    else:
        lo_share = 1.0 if lo_a is not None else 0.0
    return 0.5 * hi_share + 0.5 * lo_share


def _t(h):  # helper for tests
    return h.split()


if __name__ == "__main__":
    # wheel low + a pair vs high-only: A wins low half, splits/loses high
    a = _t("As 2c 3d 4h 5s Ks Qd")   # 5-high straight (wheel) + nut low
    b = _t("Kh Kc 9s 8d 2h 3c 4s")   # pair of kings, no low
    s = split_share(a, b)
    assert 0.0 <= s <= 1.0
    # A has the wheel (straight beats a pair) AND the only low -> scoops
    assert s == 1.0, s
    # no-low board: pure high contest (two pair beats one pair)
    c = _t("Ah Ad Kc Qs Jh 9c 9d")   # aces up (two pair)
    d = _t("Kh Kd Qc Js 9h 7s 4c")   # pair of kings, no straight
    assert split_share(c, d) == 1.0
    # tie low (both wheel) splits the low half
    e = _t("As 2c 3d 4h 5s 9c 9d")
    f = _t("Ah 2d 3s 4c 5d Kc Qs")
    sh = split_share(e, f)
    assert 0.0 < sh < 1.0, sh
    print("ok: stud8 hi/lo evaluator self-tests pass")
