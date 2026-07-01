"""Razz game spec for the re-solver — the seat-order + showdown rules that turn
resolve.py's shared seven-card-stud betting tree into razz.

Razz is ace-to-five lowball stud. The BETTING is identical to Stud 8 (ante,
bring-in, small/big bets, 4-bet cap, 3rd–7th streets), so it reuses resolve.py's
state machine and CFR+/best-response machinery unchanged. Only three things
differ, and they're exactly the `GameSpec` seams:

  1. bring-in  — the HIGHEST upcard brings in (the ace plays low, so it never
                 brings in), the opposite of Stud 8's lowest-card bring-in.
  2. first act — from 4th street on the LOWEST / best razz board acts first
                 (Stud 8: the highest/best high board).
  3. showdown  — the lowest hand wins the WHOLE pot; no hi/lo split, no
                 8-or-better qualifier. Equal lows split.

Pass `game=RAZZ` to `resolve_subgame` / `_Resolver`. Pure Python; self-tests on
run. This is the simplest stud instance — the cheap end-to-end validation of the
DeepStack pipeline before trusting it on Stud 8 (see RAZZ.md).
"""
from __future__ import annotations
from typing import List

from pbs import RANKS, SUITS, suit_idx, enumerate_holdings, PBS
from eval_razz import best_low_razz, _lr
from resolve import GameSpec, resolve_subgame


def razz_board_value(up: List[str]) -> int:
    """Strength of the razz board *showing*; LOWER = better (lower) low. Pairs
    are bad (a duplicate rank can't extend a low). Drives both seat-order rules:
    the lowest board acts first (4th st+); the highest board brings in (3rd)."""
    lr = sorted((_lr(c) for c in up), reverse=True)    # ace-low ranks, high->low
    counts: dict[int, int] = {}
    for r in lr:
        counts[r] = counts.get(r, 0) + 1
    dup = sum(n - 1 for n in counts.values())          # paired/duplicate cards
    v = dup                                            # no-pair (dup=0) is best
    for r in lr:
        v = v * 15 + r
    return v


def razz_first_actor(up0: List[str], up1: List[str]) -> int:
    """From 4th street on, the lowest (best) razz board acts first; seat 0 ties."""
    return 0 if razz_board_value(up0) <= razz_board_value(up1) else 1


def razz_bring_in(door0: str, door1: str) -> int:
    """3rd street: the HIGHEST upcard brings in (ace plays low, never brings in).
    Suit breaks an exact-rank tie (higher suit) so the choice is well-defined."""
    v0, v1 = razz_board_value([door0]), razz_board_value([door1])
    if v0 != v1:
        return 0 if v0 > v1 else 1            # the worse (higher) low is forced in
    return 0 if suit_idx(door0) > suit_idx(door1) else 1


def razz_share(full0: List[str], full1: List[str]) -> float:
    """Seat-0 pot fraction at showdown: the lowest razz hand wins the WHOLE pot;
    equal lows split. (eval_razz scores lower = better.)"""
    a, b = best_low_razz(full0), best_low_razz(full1)
    if a < b:
        return 1.0
    if a > b:
        return 0.0
    return 0.5


# The razz game over the shared stud betting tree.
RAZZ = GameSpec('razz', razz_share, razz_bring_in, razz_first_actor)


def _uni(n):
    return [1.0 / n] * n if n else []


if __name__ == "__main__":
    # 1) Seat-order rules are INVERTED vs Stud 8: highest brings in, lowest acts.
    assert razz_bring_in('Kd', '2c') == 0 and razz_bring_in('2c', 'Kd') == 1
    assert razz_bring_in('Ah', '7s') == 1            # ace plays low -> never in
    assert razz_first_actor(['2c'], ['Kd']) == 0     # the 2-low board acts first
    assert razz_first_actor(['Kd', 'Qh'], ['5c', '4d']) == 1   # 5-4 beats K-Q
    assert razz_first_actor(['3s', '3d'], ['9c', '4d']) == 1   # a pair is worse
    # showdown: wheel beats a worse low (whole pot); equal lows split.
    assert razz_share(['5s', '4d', '3c', '2h', 'Ah'],
                      ['8s', '7d', '6c', '4s', '2c']) == 1.0
    assert razz_share(['7s', '5d', '4c', '3h', '2h'],
                      ['7h', '5s', '4d', '3c', '2d']) == 0.5

    # 2) 7th-street exact solve with game=RAZZ: zero-sum + best-response -> ~0.
    #    Board's unseen pool is exactly `live` (6 cards -> |H| = C(6,3) = 20).
    up0 = ['As', '4s', '5d', '3c']                   # low door cards (good razz)
    up1 = ['Kh', 'Qd', 'Jc', '9h']                   # high door cards (bad razz)
    live = ['2c', '2d', '6h', '8s', 'Tc', 'Kd']      # has 2s -> seat0 can wheel
    used = set(up0) | set(up1) | set(live)
    dead = [c for c in (r + s for r in RANKS for s in SUITS) if c not in used]
    H = len(enumerate_holdings(up0 + up1 + dead, 3))
    pbs = PBS(street=7, up=[up0, up1], dead=dead, pot=20.0,
              ranges=[_uni(H), _uni(H)])
    res = resolve_subgame(pbs, iters=200, game=RAZZ)
    assert len(res['cfv'][0]) == H and len(res['cfv'][1]) == H
    assert abs(res['value'][0] + res['value'][1]) < 1e-6, res['value']
    assert res['exploitability'] < 0.02 * res['pot'], res['exploitability']
    for node in res['strategy'].values():
        assert abs(sum(node['freq']) - 1.0) < 1e-6

    # 3) Dominance: seat 0 holds the nut low (a wheel seat 1 can't make) -> wins
    #    the WHOLE pot, so net value ~ +half the pot; exploitability stays ~0.
    holds = enumerate_holdings(up0 + up1 + dead, 3)
    win = None
    for i, hi in enumerate(holds):
        for j, hj in enumerate(holds):
            if set(hi) & set(hj):
                continue
            if razz_share(list(hi) + up0, list(hj) + up1) == 1.0:
                win = (i, j)
                break
        if win:
            break
    assert win, "expected a strictly-winning razz matchup on this board"
    r0 = [0.0] * H; r0[win[0]] = 1.0
    r1 = [0.0] * H; r1[win[1]] = 1.0
    pbs2 = PBS(street=7, up=[up0, up1], dead=dead, pot=20.0, ranges=[r0, r1])
    res2 = resolve_subgame(pbs2, iters=300, game=RAZZ)
    assert res2['value'][0] > 0 and res2['value'][1] < 0, res2['value']
    assert abs(res2['value'][0] - 10.0) < 0.5, res2['value']   # whole 20-pot, net +10
    assert res2['exploitability'] < 0.05 * res2['pot'], res2['exploitability']
    print("ok: razz_game self-tests pass (high brings in, low acts first, "
          "lowest hand scoops; 7th-street solve zero-sum + best-response ~0)")
