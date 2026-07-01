"""Public Belief State for heads-up Stud 8, and PBS <-> tensor encoding.

A PBS = public board (both players' upcards + dead cards) + pot + a probability
vector (range) over each player's hidden holdings consistent with that board.
On 3rd street a hidden holding is 2 down cards; by 7th it is 3 down cards.

Until EMD bucketing (Milestone B) lands, ranges are over the RAW enumerated
holdings given the board (C(unseen, k) is small enough). The value network
(value_net.py) is parameterized by n_holdings/board_dim so this can evolve
without touching the net.

TODO(Milestone B): replace `enumerate_holdings` output with cluster ids and add
EMD/OCHS feature extraction for hi + 8-or-better-low strength.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import List
import itertools


RANKS = "23456789TJQKA"
SUITS = "cdhs"                      # suit order c<d<h<s (matches ../engine/cards.js)
DECK = [r + s for r in RANKS for s in SUITS]

_RANK_VAL = {r: i for i, r in enumerate(RANKS, start=2)}   # '2'->2 .. 'A'->14


def rank_val(card: str) -> int:
    """Ace-high rank, 2..14."""
    return _RANK_VAL[card[0]]


def low_rank_val(card: str) -> int:
    """Ace-low rank for the low hand: A=1, else 2..13."""
    r = _RANK_VAL[card[0]]
    return 1 if r == 14 else r


def suit_idx(card: str) -> int:
    """Suit index 0..3 in c<d<h<s order."""
    return SUITS.index(card[1])


def down_count(street: int) -> int:
    """Number of hidden (down) cards on `street` (3..7): 2 until 7th, then 3."""
    return 3 if street >= 7 else 2


@dataclass
class PBS:
    street: int                 # 3..7
    up: List[List[str]]         # [my upcards, opp upcards]
    dead: List[str]             # folded/exposed cards (card removal)
    pot: float
    ranges: List[List[float]]   # [r_me, r_opp] over enumerate_holdings(...)
    toCall: float = 0.0         # amount facing the player to act (informational)
    betSize: float = 0.0        # current-street bet increment (informational)


def unseen(board: List[str]) -> List[str]:
    seen = set(board)
    return [c for c in DECK if c not in seen]


def enumerate_holdings(board: List[str], k: int) -> List[tuple]:
    """All k-card hidden holdings consistent with the public board.

    `board` = every publicly-known card (both upcards + dead). k = number of
    a player's hidden (down) cards on the current street.
    """
    return list(itertools.combinations(unseen(board), k))


# Featurization widths. A board "group" = rank-count(13) + suit-count(4) = 17
# values; we encode three groups (my upcards, opp upcards, dead cards).
_GROUP_DIM = len(RANKS) + len(SUITS)        # 17
BOARD_DIM = 3 * _GROUP_DIM                   # 51  -> value_net board_dim
EXTRA_DIM = 8                                # pot/toCall/betSize ratios + 5 streets


def board_cards(pbs: "PBS") -> List[str]:
    """Every publicly-known card (both players' upcards + dead)."""
    return list(pbs.up[0]) + list(pbs.up[1]) + list(pbs.dead)


def uniform_range(board: List[str], k: int) -> List[float]:
    """A uniform prior over enumerate_holdings(board, k) (sums to 1)."""
    n = len(enumerate_holdings(board, k))
    return [1.0 / n] * n if n else []


def _group_feats(cards: List[str]) -> List[float]:
    """rank-count(13) ++ suit-count(4) for a set of cards (order-invariant)."""
    ranks = [0.0] * len(RANKS)
    suits = [0.0] * len(SUITS)
    for c in cards:
        ranks[rank_val(c) - 2] += 1.0
        suits[suit_idx(c)] += 1.0
    return ranks + suits


def encode_board(up: List[List[str]], dead: List[str]) -> List[float]:
    """Multi-hot rank+suit COUNTS for [my upcards, opp upcards, dead cards].

    Order-invariant counts (not per-slot one-hots) so the width is fixed at
    BOARD_DIM regardless of how many cards are showing on each street.
    """
    return _group_feats(up[0]) + _group_feats(up[1]) + _group_feats(dead)


def encode_pbs(pbs: "PBS"):
    """PBS -> (board, extra, r0, r1) plain-Python feature lists for the net.

    Returned as lists (no numpy/torch dependency here); the training loop wraps
    them in tensors. `board` has width BOARD_DIM, `extra` width EXTRA_DIM, and
    r0/r1 are the two range vectors as given (width = #holdings/#buckets).
    """
    board = encode_board(pbs.up, pbs.dead)
    pot = float(pbs.pot) or 1.0
    to_call = float(getattr(pbs, "toCall", 0.0) or 0.0)
    bet_size = float(getattr(pbs, "betSize", 0.0) or 0.0)
    street_onehot = [1.0 if pbs.street == s else 0.0 for s in range(3, 8)]
    extra = [pot / 100.0, to_call / pot, bet_size / pot] + street_onehot
    return board, extra, list(pbs.ranges[0]), list(pbs.ranges[1])


if __name__ == "__main__":
    # holding enumeration shrinks as the board grows / streets advance
    up = [["As", "7d"], ["Kc", "2h"]]
    dead = ["9s", "9d"]
    board = up[0] + up[1] + dead
    h2 = enumerate_holdings(board, down_count(5))   # 5th street: 2 down cards
    h3 = enumerate_holdings(board, down_count(7))   # 7th street: 3 down cards
    assert len(unseen(board)) == 52 - len(board)
    assert len(h2) > 0 and all(len(h) == 2 for h in h2)
    assert all(len(h) == 3 for h in h3)
    # no holding overlaps the public board (card removal)
    seen = set(board)
    assert all(not (set(h) & seen) for h in h2)

    p = PBS(street=5, up=up, dead=dead, pot=12.0,
            ranges=[uniform_range(board, 2), uniform_range(board, 2)],
            toCall=4.0, betSize=8.0)
    b, e, r0, r1 = encode_pbs(p)
    assert len(b) == BOARD_DIM, len(b)
    assert len(e) == EXTRA_DIM, len(e)
    assert len(r0) == len(h2) and abs(sum(r0) - 1.0) < 1e-9
    # board counts: my upcards contribute exactly 2 to the rank histogram
    assert sum(b[:len(RANKS)]) == 2.0
    # street one-hot is set for 5th street
    assert e[3 + (5 - 3)] == 1.0
    print(f"ok: pbs self-tests pass (BOARD_DIM={BOARD_DIM}, "
          f"|H2|={len(h2)}, |H3|={len(h3)})")
