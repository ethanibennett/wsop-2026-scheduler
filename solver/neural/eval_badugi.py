"""Badugi hand evaluation — a faithful pure-Python port of ../eval/badugi.js.

A badugi hand is 4 cards; the playable hand is the LARGEST subset whose cards
have all-DISTINCT ranks AND all-DISTINCT suits. More cards beats fewer; among
equal sizes the LOWER ranks win (compare highest card down). Aces are LOW. Best
possible hand: 4-3-2-A of four different suits (the "number-one" badugi).

Cards are 2-char strings ('As', 'Td', '7c', ...), as in pbs.py / eval_razz.py.
The scoring is byte-identical to the JS `badugiScore` (same base-15 packing and
the same (4 - subsetSize)*100000 size prefix), so a JS score and a Python score
compare in the SAME order — which is all the showdown needs. Pure Python (no
torch); self-tests on run. LOWER score = BETTER hand.
"""
from __future__ import annotations
from itertools import combinations
from typing import List, Optional, Tuple

RANK_VAL = {r: i for i, r in enumerate("23456789TJQKA", start=2)}   # 2..14 (A=14)
SUITS = "cdhs"


def _lr(card: str) -> int:
    """Ace-LOW rank: A=1, else 2..13 (JS lowRankOf)."""
    r = RANK_VAL[card[0]]
    return 1 if r == 14 else r


def _suit(card: str) -> int:
    return SUITS.index(card[1])


def valid_badugi_set(sub: List[str]) -> bool:
    """A subset is playable iff all ranks distinct AND all suits distinct
    (JS validBadugiSet)."""
    ranks, suits = set(), set()
    for c in sub:
        r, s = _lr(c), _suit(c)
        if r in ranks or s in suits:
            return False
        ranks.add(r)
        suits.add(s)
    return True


def _sub_score(sub: List[str]) -> int:
    """Score of a specific VALID subset (JS's inner packing). LOWER = better.
    (4 - size) prefix so a 4-card badugi always beats a 3-card hand, etc.;
    then base-15 pack the ranks high->low, padding missing slots with 0."""
    ranks = sorted((_lr(c) for c in sub), reverse=True)      # descending
    v = (4 - len(sub)) * 100000
    for i in range(4):
        v = v * 15 + (ranks[i] if i < len(ranks) else 0)
    return v


def badugi_score(cards: List[str]) -> int:
    """Lowest (best) score over all valid subsets of the 4-card hand
    (JS badugiScore). LOWER = better."""
    best = None
    n = len(cards)
    for mask in range(1, 1 << n):
        sub = [cards[i] for i in range(n) if mask & (1 << i)]
        if not valid_badugi_set(sub):
            continue
        v = _sub_score(sub)
        if best is None or v < best:
            best = v
    return best if best is not None else _sub_score([cards[0]])


def best_badugi_subset(cards: List[str]) -> List[str]:
    """The actual cards of the best playable subset (JS bestBadugiSubset).
    Used for bucketing / display."""
    best: Optional[List[str]] = None
    best_score: Optional[int] = None
    n = len(cards)
    for mask in range(1, 1 << n):
        sub = [cards[i] for i in range(n) if mask & (1 << i)]
        if not valid_badugi_set(sub):
            continue
        v = _sub_score(sub)
        if best_score is None or v < best_score:
            best_score, best = v, sub
    return best if best is not None else [cards[0]]


def compare_badugi(h0: List[str], h1: List[str]) -> int:
    """+1 if h0 wins, -1 if h1 wins, 0 tie (JS badugi-game compare)."""
    a, b = badugi_score(h0), badugi_score(h1)
    if a < b:
        return 1
    if a > b:
        return -1
    return 0


def badugi_share(h0: List[str], h1: List[str]) -> float:
    """Seat-0 pot fraction at showdown: the LOWER badugi score wins the whole
    pot; equal scores split. (The draw GameSpec `share` seam.)"""
    a, b = badugi_score(h0), badugi_score(h1)
    if a < b:
        return 1.0
    if a > b:
        return 0.0
    return 0.5


def describe_badugi(cards: List[str]) -> str:
    """Human label of the best subset, e.g. '4-3-2-A badugi' or '3-card 5'."""
    best = best_badugi_subset(cards)
    ranks = sorted((_lr(c) for c in best), reverse=True)
    ch = lambda r: 'A' if r == 1 else ('T' if r == 10 else ('J' if r == 11 else
                   ('Q' if r == 12 else ('K' if r == 13 else str(r)))))
    body = '-'.join(ch(r) for r in ranks)
    n = len(best)
    if n == 4:
        return f"{body} badugi"
    return f"{n}-card {body}"


if __name__ == "__main__":
    t = lambda s: s.split()

    # 1) validity: distinct rank AND distinct suit
    assert valid_badugi_set(t("As 2d 3c 4h"))          # 4 ranks, 4 suits
    assert not valid_badugi_set(t("As 2s 3c 4h"))      # two spades
    assert not valid_badugi_set(t("As Ad 3c 4h"))      # two aces

    # 2) the number-one badugi (4-3-2-A rainbow) beats any other 4-card badugi
    nut = badugi_score(t("As 2d 3c 4h"))
    k432a = badugi_score(t("Ks 2d 3c 4h"))             # K-high 4-card badugi
    assert nut < k432a, (nut, k432a)
    # a 4-card badugi always beats a 3-card hand (size prefix)
    three = badugi_score(t("As 2s 3c 4h"))             # best subset is 3 cards
    assert nut < three < k432a or nut < three          # sanity: 4-card < 3-card
    assert nut < three, (nut, three)

    # 3) aces are LOW: 4-3-2-A beats 5-3-2-A
    assert badugi_score(t("Ah 2d 3c 4s")) < badugi_score(t("Ah 2d 3c 5s"))
    # among equal-size badugis, compare the top card down (lower wins)
    assert badugi_score(t("6h 4d 3c 2s")) < badugi_score(t("7h 4d 3c 2s"))

    # 4) best subset selection: 'As 2s 3c 4h' -> drop one spade, keep 3 distinct
    bs = best_badugi_subset(t("As 2s 3c 4h"))
    assert len(bs) == 3 and valid_badugi_set(bs), bs
    assert set(_suit(c) for c in bs).__len__() == 3     # distinct suits

    # 5) showdown share / compare consistency
    assert compare_badugi(t("As 2d 3c 4h"), t("Ks 2d 3c 4h")) == 1
    assert badugi_share(t("As 2d 3c 4h"), t("Ks 2d 3c 4h")) == 1.0
    assert badugi_share(t("Ks 2d 3c 4h"), t("As 2d 3c 4h")) == 0.0
    # identical strength (same ranks, swapped suits within the badugi) -> split
    assert badugi_share(t("As 2d 3c 4h"), t("Ah 2s 3d 4c")) == 0.5

    # 6) a 2-card hand (lots of collisions) beats a 1-card hand
    twoc = badugi_score(t("As Ad 2s 2d"))               # best playable = 2 cards
    onec = badugi_score(t("As Ad Ah Ac"))               # all same rank -> 1 card
    assert twoc < onec, (twoc, onec)

    # 7) describe
    assert describe_badugi(t("As 2d 3c 4h")) == "4-3-2-A badugi"
    print("ok: eval_badugi self-tests pass (rainbow 4-3-2-A is the nut; "
          "aces low; more cards beats fewer; ties split)")
