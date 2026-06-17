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
SUITS = "cdhs"
DECK = [r + s for r in RANKS for s in SUITS]


@dataclass
class PBS:
    street: int                 # 3..7
    up: List[List[str]]         # [my upcards, opp upcards]
    dead: List[str]             # folded/exposed cards (card removal)
    pot: float
    ranges: List[List[float]]   # [r_me, r_opp] over enumerate_holdings(...)


def unseen(board: List[str]) -> List[str]:
    seen = set(board)
    return [c for c in DECK if c not in seen]


def enumerate_holdings(board: List[str], k: int) -> List[tuple]:
    """All k-card hidden holdings consistent with the public board.

    `board` = every publicly-known card (both upcards + dead). k = number of
    a player's hidden (down) cards on the current street.
    """
    return list(itertools.combinations(unseen(board), k))


def encode_board(up: List[List[str]], dead: List[str]) -> "list[float]":
    """Multi-hot rank+suit features for upcards (per player) + dead cards.

    TODO: settle the exact featurization (rank one-hot x suit one-hot per
    board card slot, or counts). Width must match value_net board_dim.
    """
    raise NotImplementedError("Milestone A/B: board featurization")


def encode_pbs(pbs: PBS):
    """PBS -> (board_tensor, extra_tensor, r0_tensor, r1_tensor) for the net."""
    raise NotImplementedError("Milestone A: assemble net inputs from a PBS")
