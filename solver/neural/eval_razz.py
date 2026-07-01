"""Razz (seven-card stud, ace-to-five lowball) hand evaluation.

Foundation for the razz neural solver — the minimal "same DeepStack machinery,
easiest instance" validation of the Stud-8 pipeline (see razz/README.md). Razz
is the simplest of the stud family: ONE strategic dimension (low strength), and
the evaluator is trivial — best five-card low, ace LOW, straights and flushes do
NOT count, pairs hurt. Best possible hand: 5-4-3-2-A (the wheel). There is no
qualifier (unlike Stud 8's 8-or-better) — every hand has a low.

Cards are 2-char strings ('As', 'Td', '7c', ...), as in pbs.py / eval_stud8.py.
Pure Python (no torch); self-tests on run. Lower score = better hand.
"""
from __future__ import annotations
from itertools import combinations
from typing import List

RANK_VAL = {r: i for i, r in enumerate("23456789TJQKA", start=2)}  # 2..14 (A=14)


def _lr(card: str) -> int:
    """Ace-low rank: A=1, else 2..13."""
    r = RANK_VAL[card[0]]
    return 1 if r == 14 else r


def score5_razz(cards: List[str]) -> int:
    """Ace-to-five low score for exactly 5 cards; LOWER is better.

    Straights and flushes are ignored (they don't count in razz). A no-pair hand
    beats any paired hand; within a category, compare the rank multiset (grouped
    by count, then rank) from the top down — lower wins."""
    ranks = sorted((_lr(c) for c in cards), reverse=True)
    counts: dict[int, int] = {}
    for r in ranks:
        counts[r] = counts.get(r, 0) + 1
    groups = sorted(counts.items(), key=lambda kv: (kv[1], kv[0]), reverse=True)
    top = groups[0][1]
    second = groups[1][1] if len(groups) > 1 else 0
    if top == 4:
        cat = 7                       # quads (worst)
    elif top == 3 and second == 2:
        cat = 6                       # full house
    elif top == 3:
        cat = 3                       # trips
    elif top == 2 and second == 2:
        cat = 2                       # two pair
    elif top == 2:
        cat = 1                       # one pair
    else:
        cat = 0                       # no pair (a real low)
    v = cat
    for r, n in groups:
        for _ in range(n):
            v = v * 15 + r
    return v                          # lower is better; wheel 5-4-3-2-A is minimal


def best_low_razz(cards7: List[str]) -> int:
    """Best (lowest) five-card razz low from up to 7 cards. Lower is better."""
    return min(score5_razz(list(c)) for c in combinations(cards7, 5))


def describe_low_razz(cards7: List[str]) -> str:
    """Human label of the best low, e.g. '6-4-3-2-A' or 'pair of 3s'."""
    best, bestv = None, None
    for c in combinations(cards7, 5):
        v = score5_razz(list(c))
        if bestv is None or v < bestv:
            bestv, best = v, c
    ranks = sorted((_lr(x) for x in best), reverse=True)
    ch = lambda r: 'A' if r == 1 else ('T' if r == 10 else ('J' if r == 11 else
                   ('Q' if r == 12 else ('K' if r == 13 else str(r)))))
    counts: dict[int, int] = {}
    for r in ranks:
        counts[r] = counts.get(r, 0) + 1
    if max(counts.values()) == 1:
        return '-'.join(ch(r) for r in ranks) + ' low'
    pr = max(r for r, n in counts.items() if n >= 2)
    return f"pair of {ch(pr)}s"


if __name__ == "__main__":
    t = lambda s: s.split()
    # the wheel (5-4-3-2-A) is the nut low; beats a 6-low
    wheel = score5_razz(t("5s 4d 3c 2h Ah"))
    six = score5_razz(t("6s 4d 3c 2h Ah"))
    assert wheel < six, (wheel, six)
    # any no-pair low beats any paired hand
    assert score5_razz(t("8s 7d 6c 4h 2h")) < score5_razz(t("2s 2d 3c 4h 5h"))
    # best-of-7 picks the five lowest distinct ranks
    assert best_low_razz(t("Ah 2c 3d 4s 5h Ks Qd")) == wheel      # ignores K,Q
    # paired board still has a (paired) low; describe it
    assert best_low_razz(t("Ah Ac 2d 3s 9h Kd 9c")) == score5_razz(t("Ah 2d 3s 9h Kd"))
    assert describe_low_razz(t("5s 4d 3c 2h Ah Ks Qd")) == "5-4-3-2-A low"
    # tie: same five low ranks score equal regardless of suits
    assert score5_razz(t("7s 5d 4c 3h 2h")) == score5_razz(t("7h 5s 4d 3c 2d"))
    print("ok: eval_razz self-tests pass (wheel is the nut; pairs lose; ace plays low)")
