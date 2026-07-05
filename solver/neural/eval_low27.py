"""Deuce-to-seven (2-7) lowball 5-card evaluator — a faithful pure-Python port
of ../eval/low27.js `score27` (the draw analogue of eval_badugi.py's port of
badugi.js).

2-7 rules: LOWER score = BETTER hand. Aces are always HIGH; straights and
flushes count AGAINST you; A-2-3-4-5 is NOT a straight (ace is high only).
Best possible hand: 7-5-4-3-2 offsuit.

The scoring is byte-identical to the JS `score27`: the same category ladder
(0 = unpaired/no straight/no flush ... 8 = straight flush) and the same
base-15 packing of grouped ranks (count-desc, then rank-desc) followed by
kickers — so a JS score and a Python score compare in the SAME integer order
(and are in fact the SAME integer, which low27_parity_check.py asserts over
>=10,000 random hands).

Cards are 2-char strings ('As', 'Td', '7c', ...), as everywhere in
solver/neural. Pure Python (no numpy/torch); self-tests on run.
"""
from __future__ import annotations
from typing import List

RANK_VAL = {r: i for i, r in enumerate("23456789TJQKA", start=2)}   # 2..14, A=14
SUITS = "cdhs"


def score27(cards: List[str]) -> int:
    """2-7 lowball score of a 5-card hand. LOWER = better (JS score27)."""
    ranks = sorted((RANK_VAL[c[0]] for c in cards), reverse=True)    # desc
    counts = {}
    for r in ranks:
        counts[r] = counts.get(r, 0) + 1
    # groups by count desc, then rank desc — identical to the JS comparator.
    groups = sorted(counts.items(), key=lambda kv: (-kv[1], -kv[0]))

    is_flush = all(c[1] == cards[0][1] for c in cards)
    # A2345 is NOT a straight in 2-7 (ace is high only): ranks are ace-HIGH,
    # so [14,5,4,3,2] spans 12, never 4.
    distinct = len(groups) == 5
    is_straight = distinct and (ranks[0] - ranks[4] == 4)

    n0 = groups[0][1]
    n1 = groups[1][1] if len(groups) > 1 else 0
    if is_straight and is_flush:
        cat = 8
    elif n0 == 4:
        cat = 7
    elif n0 == 3 and n1 == 2:
        cat = 6
    elif is_flush:
        cat = 5
    elif is_straight:
        cat = 4
    elif n0 == 3:
        cat = 3
    elif n0 == 2 and n1 == 2:
        cat = 2
    elif n0 == 2:
        cat = 1
    else:
        cat = 0

    # Pack significance order: grouped ranks first (count desc), then kickers.
    v = cat
    for r, n in groups:
        for _ in range(n):
            v = v * 15 + r
    return v


def compare27(h0: List[str], h1: List[str]) -> int:
    """+1 if h0 wins (lower score), -1 if h1 wins, 0 tie."""
    a, b = score27(h0), score27(h1)
    if a < b:
        return 1
    if a > b:
        return -1
    return 0


def low27_share(h0: List[str], h1: List[str]) -> float:
    """Seat-0 pot fraction at showdown: the LOWER 2-7 score wins the whole
    pot; equal scores split. (The td27 GameSpec `share` seam.)"""
    a, b = score27(h0), score27(h1)
    if a < b:
        return 1.0
    if a > b:
        return 0.0
    return 0.5


if __name__ == "__main__":
    t = lambda s: s.split()

    # 1) the nuts: 7-5-4-3-2 offsuit beats everything nearby
    nut = score27(t("7s 5d 4c 3h 2s"))
    assert nut < score27(t("7s 6d 4c 3h 2s"))          # 7-6 low worse
    assert nut < score27(t("8s 5d 4c 3h 2s"))          # 8 low worse
    assert nut < score27(t("7s 5s 4s 3s 2s"))          # same ranks FLUSHED: bad

    # 2) straights/flushes count against: 76543 (straight) loses to 8-6-5-4-3
    assert score27(t("8s 6d 5c 4h 3s")) < score27(t("7s 6d 5c 4h 3s"))
    # 3) ace is HIGH: A5432 is NOT a straight but IS ace-high (worse than K-high)
    a_low = score27(t("As 5d 4c 3h 2s"))
    k_low = score27(t("Ks 5d 4c 3h 2s"))
    assert k_low < a_low, (k_low, a_low)
    # ...but the unpaired ace-high still beats ANY pair
    assert a_low < score27(t("2s 2d 4c 5h 7s"))

    # 4) category ladder ordering: pair < two pair < trips < straight < flush
    #    < full house < quads < straight flush (higher score = worse)
    ladder = [
        t("9s 7d 5c 4h 2s"),                            # no pair
        t("2s 2d 5c 6h 9s"),                            # one pair
        t("2s 2d 5c 5h 9s"),                            # two pair
        t("2s 2d 2c 5h 9s"),                            # trips
        t("6s 5d 4c 3h 2s"),                            # straight
        t("9s 7s 5s 4s 2s"),                            # flush
        t("2s 2d 2c 5h 5s"),                            # full house
        t("2s 2d 2c 2h 9s"),                            # quads
        t("6s 5s 4s 3s 2s"),                            # straight flush
    ]
    scores = [score27(h) for h in ladder]
    assert scores == sorted(scores), scores
    assert len(set(scores)) == len(scores)

    # 5) within a category, compare packed ranks: 22-9 kicker < 22-T kicker
    assert score27(t("2s 2d 4c 5h 9s")) < score27(t("2s 2d 4c 5h Ts"))
    # pair rank dominates kickers: 22-AKQ still beats 33-542
    assert score27(t("2s 2d Ac Kh Qs")) < score27(t("3s 3d 5c 4h 2s"))

    # 6) share/compare consistency + ties split (same ranks, different suits,
    #    both unsuited)
    assert compare27(t("7s 5d 4c 3h 2s"), t("8s 5d 4c 3h 2s")) == 1
    assert low27_share(t("7s 5d 4c 3h 2s"), t("8s 5d 4c 3h 2s")) == 1.0
    assert low27_share(t("8s 5d 4c 3h 2s"), t("7s 5d 4c 3h 2s")) == 0.0
    assert low27_share(t("7s 5d 4c 3h 2s"), t("7d 5c 4h 3s 2d")) == 0.5

    print("ok: eval_low27 self-tests pass (7-5-4-3-2 offsuit is the nut; "
          "aces high; straights/flushes penalized; ties split)")
