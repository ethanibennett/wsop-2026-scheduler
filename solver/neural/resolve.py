"""Tabular subgame re-solver for Stud 8 (Milestone A — the critical path).

Given a root PBS, build the depth-limited subgame, run range-form CFR+ to an
approximate equilibrium, and return:
  - the average strategy for the subgame, and
  - per-holding COUNTERFACTUAL VALUES for both players (the training target
    for value_net.py, and the quantity propagated in continual re-solving).

Hi/lo split: terminal utility splits the pot between best hi and best
8-or-better lo (via ../eval/stud8.js logic re-implemented in eval_stud8.py).

Implementation choice (README option 1): self-contained pure-Python stud rules
+ CFR over enumerated holdings. No numpy/torch here so the data-generation
pipeline runs on any CPU box; the value net (value_net.py) consumes the CFVs.

CFR is run in VECTOR form over the public betting tree of the current street:
at each public node both players hold a reach vector over their hidden holdings,
regrets/strategies are indexed by (betting history, own holding), and leaves
weight outcomes by the opponent's reach (the "counterfactual" in CFV). This is
the DeepStack/Libratus public-tree formulation.

Streets are 3..7 (3rd..7th); internally st0 = street-3 in 0..4 to reuse the JS
bet-size formulas verbatim.

Leaf handling at the end of a street's betting (a call/check that closes it):
  - 7th street            -> exact showdown (hi/lo split). No chance node.
  - any street + leaf_fn  -> value the next-street boundary with leaf_value_fn
                             (the trained value net): continual re-solving
                             (Milestone D) and the datagen bootstrap leaf.
  - 6th street, no leaf_fn -> exact one-level recursion: the 7th card is DOWN
                             (no new public card), so the 7th subgame shares the
                             board; we lift ranges by the private draw, solve one
                             7th subgame, and project the CFVs back. Exact but
                             nests a CFR solve (use a value-net leaf in
                             production); guarded against blowup.
  - 3rd-5th, no leaf_fn    -> NotImplementedError: a public upcard is dealt, so
                             exact enumeration of the chance branches is
                             intractable. Supply a value-net leaf (the whole
                             point of the neural solver) — see neural/README.md.
A fold is always an exact terminal (chips only), on any street.
"""
from __future__ import annotations
from typing import Callable, Dict, List, Optional, Tuple

from pbs import (RANKS, SUITS, rank_val, suit_idx, down_count,
                 enumerate_holdings, unseen, PBS)
from eval_stud8 import split_share

# Chips: ante 1, bring-in 2, small bet 4 (3rd/4th), big bet 8 (5th-7th). 4-bet cap.
ANTE, BRING, SMALL, BIG, CAP = 1, 2, 4, 8, 4

# Guard: refuse to enumerate a 7th-street holding space larger than this in the
# exact 6th->7th recursion (use a value-net leaf instead).
_EXACT_H_LIMIT = 600


def bet_size(st0: int) -> int:
    """Bet increment for internal street index st0 (0..4 = 3rd..7th)."""
    return SMALL if st0 < 2 else BIG


def _deck_index(card: str) -> int:
    """DECK ordering (rank-major) used by pbs.enumerate_holdings."""
    return RANKS.index(card[0]) * 4 + SUITS.index(card[1])


def _sort_holding(cards) -> tuple:
    """Holding tuple in DECK order, matching enumerate_holdings' output."""
    return tuple(sorted(cards, key=_deck_index))


# ── Partial-board strength (who acts first from 4th street on) ──────────
def board_value(up: List[str]) -> int:
    """Compare upcards as a poker fragment (port of stud8-game.js boardValue)."""
    counts: Dict[int, int] = {}
    for c in up:
        r = rank_val(c)
        counts[r] = counts.get(r, 0) + 1
    groups = sorted(counts.items(), key=lambda kv: (kv[1], kv[0]), reverse=True)
    v = 0
    for i in range(4):
        if i < len(groups):
            r, n = groups[i]
            v = v * 100 + (n * 15 + r)
        else:
            v = v * 100
    hi = up[0]
    for c in up:
        if rank_val(c) > rank_val(hi) or (
                rank_val(c) == rank_val(hi) and suit_idx(c) > suit_idx(hi)):
            hi = c
    return v * 4 + suit_idx(hi)


def first_actor(up0: List[str], up1: List[str]) -> int:
    """From 4th street on, the best showing board acts first (seat 0 ties up)."""
    return 0 if board_value(up0) >= board_value(up1) else 1


def bring_in_seat(door0: str, door1: str) -> int:
    """3rd street: the lowest upcard (ace high; c<d<h<s breaks ties) brings in."""
    r0, r1 = rank_val(door0), rank_val(door1)
    if r0 < r1 or (r0 == r1 and suit_idx(door0) < suit_idx(door1)):
        return 0
    return 1


# ── Betting node (a faithful port of stud8-game.js's betting state machine) ──
def _clone(node: dict) -> dict:
    n = dict(node)
    n['contrib'] = node['contrib'][:]
    n['acted'] = node['acted'][:]
    return n


def is_leaf(node: dict) -> bool:
    return node['folded'] is not None or node['phase'] in ('showdown', 'deal')


def legal_actions(node: dict) -> List[str]:
    if node['st0'] == 0 and node['curSeq'] == '':
        return ['br', 'co']                       # forced open on 3rd street
    p = node['toAct']
    facing = node['contrib'][1 - p] - node['contrib'][p]
    if facing > 0:
        acts = ['f', 'c']
        if node['bets'] < CAP:
            acts.append('r')
        return acts
    acts = ['k']
    if node['bets'] < CAP:
        acts.append('b')
    return acts


def _end_street(n: dict) -> None:
    n['phase'] = 'showdown' if n['st0'] == 4 else 'deal'


def apply_action(node: dict, a: str) -> dict:
    n = _clone(node)
    p = n['toAct']
    facing = n['contrib'][1 - p] - n['contrib'][p]

    if a == 'br':                                  # bring-in keeps its option
        n['contrib'][p] = n['base'] + BRING
        n['curSeq'] += 'i'
        n['toAct'] = 1 - p
        return n
    if a == 'co':                                  # complete over the bring-in
        n['contrib'][p] = n['base'] + SMALL
        n['bets'] = 1
        n['acted'][p] = True
        n['curSeq'] += 'o'
        n['toAct'] = 1 - p
        return n

    n['acted'][p] = True
    n['curSeq'] += a
    if a == 'f':
        n['folded'] = p
        return n
    if a == 'c' or a == 'k':
        n['contrib'][p] += facing
        if n['acted'][1 - p]:
            _end_street(n)
        else:
            n['toAct'] = 1 - p                     # bring-in retains completion
        return n
    # bet / raise / complete
    if n['bets'] == 0:
        n['contrib'][p] = n['base'] + bet_size(n['st0'])   # completion, not a raise
    else:
        n['contrib'][p] = n['contrib'][1 - p] + bet_size(n['st0'])
    n['bets'] += 1
    n['toAct'] = 1 - p
    return n


def _regret_match_plus(reg: List[float]) -> List[float]:
    """Regret-matching+: normalize positive regrets; uniform if none positive."""
    pos = [r if r > 0 else 0.0 for r in reg]
    s = sum(pos)
    if s > 0:
        return [r / s for r in pos]
    n = len(reg)
    return [1.0 / n] * n


class GameSpec:
    """The three game-specific seams that distinguish stud variants over the
    SAME seven-card-stud betting tree: the showdown share, and the two
    seat-order rules (3rd-street bring-in, 4th-street-on first-to-act).
    Everything else — bet sizes, the betting state machine, the CFR+/BR
    machinery — is shared. Stud 8 is the default (`STUD8`); razz supplies its
    own over the same tree (see razz_game.py)."""
    __slots__ = ('name', 'share', 'bring_in', 'first_actor')

    def __init__(self, name, share, bring_in, first_actor):
        self.name = name
        self.share = share              # (full0, full1) -> seat-0 pot fraction
        self.bring_in = bring_in        # (door0, door1) -> seat forced to bring in
        self.first_actor = first_actor  # (up0, up1) -> seat to act first (4th+)


# Stud 8 or Better: split hi/lo showdown; LOWEST door brings in; best board first.
STUD8 = GameSpec('stud8', split_share, bring_in_seat, first_actor)


class _Resolver:
    """Range-form CFR+ over one street's public betting tree for a Stud 8 PBS."""

    def __init__(self, street: int, up: List[List[str]], dead: List[str],
                 pot: float, range0: List[float], range1: List[float],
                 leaf_fn: Optional[Callable], iters: int,
                 depth_limit: Optional[int], sub_iters: Optional[int] = None,
                 holdings: Optional[List[tuple]] = None,
                 share_matrix: Optional[List[List[float]]] = None,
                 game: Optional['GameSpec'] = None):
        self.street = street
        self.game = game if game is not None else STUD8
        self.st0 = street - 3
        self.up = [list(up[0]), list(up[1])]
        self.dead = list(dead)
        self.board = self.up[0] + self.up[1] + self.dead
        self.k = down_count(street)
        # `holdings` lets a caller restrict the solve to a SUBSET of holdings
        # (the union of both ranges' support) — exact for those, and far faster
        # than all C(unseen,k) when the ranges are narrow (node-locked study).
        self.holdings = holdings if holdings is not None else \
            enumerate_holdings(self.board, self.k)
        self.H = len(self.holdings)
        if len(range0) != self.H or len(range1) != self.H:
            raise ValueError(f"range length must equal #holdings ({self.H}); "
                             f"got {len(range0)}, {len(range1)}")
        self.range = [list(range0), list(range1)]
        # A bucketed solve passes its own seat-0 share matrix and treats
        # "holdings" as bucket ids — no card collisions between buckets. A
        # real-card solve excludes colliding (i,j) pairs at the leaves.
        self.share_matrix = share_matrix
        self.cardset = ([frozenset()] * self.H if share_matrix is not None
                        else [frozenset(h) for h in self.holdings])
        self.leaf_fn = leaf_fn
        self.iters = iters
        self.depth_limit = depth_limit
        self.sub_iters = sub_iters if sub_iters is not None else min(iters, 200)
        self.regret: Dict[str, List[List[float]]] = {}
        self.strat: Dict[str, List[List[float]]] = {}
        self._share_cache: Dict[Tuple[int, int], float] = {}
        self.root = self._root_node(pot)

    # -- root reconstruction from the PBS (canonical start-of-street betting) --
    def _root_node(self, pot: float) -> dict:
        if self.st0 == 0:                          # 3rd street: antes + bring-in
            bring = self.game.bring_in(self.up[0][0], self.up[1][0])
            return dict(st0=0, contrib=[ANTE, ANTE], base=ANTE, bets=0,
                        toAct=bring, acted=[False, False], folded=None,
                        phase='bet', bringIn=bring, starter=bring, curSeq='')
        half = pot / 2.0                           # later streets: equal so far
        actor = self.game.first_actor(self.up[0], self.up[1])
        bring = self.game.bring_in(self.up[0][0], self.up[1][0])
        return dict(st0=self.st0, contrib=[half, half], base=half, bets=0,
                    toAct=actor, acted=[False, False], folded=None,
                    phase='bet', bringIn=bring, starter=actor, curSeq='')

    # ── betting-tree seams (the ONLY game-shape hooks the CFR/BR core uses) ──
    # The core (`_cfr`/`_eval_avg`/`_br`/`strategy_report`) reaches the tree ONLY
    # through these three, so a different game family (e.g. the DRAW resolver in
    # resolve_draw.py) plugs in by overriding them — the CFR+/exact-BR machinery
    # is shared verbatim. Default = the module-level stud betting state machine,
    # so stud/razz behaviour is byte-identical (these just forward).
    def _is_leaf(self, node: dict) -> bool:
        return is_leaf(node)

    def _legal_actions(self, node: dict) -> List[str]:
        return legal_actions(node)

    def _apply_action(self, node: dict, a: str) -> dict:
        return apply_action(node, a)

    def _share(self, i: int, j: int) -> float:
        """Seat-0 pot share for (seat0 holding i, seat1 holding j)."""
        if self.share_matrix is not None:
            return self.share_matrix[i][j]
        key = (i, j)
        v = self._share_cache.get(key)
        if v is None:
            v = self.game.share(list(self.holdings[i]) + self.up[0],
                                list(self.holdings[j]) + self.up[1])
            self._share_cache[key] = v
        return v

    # ── leaf valuation: returns (cfv0, cfv1) over all holdings ──
    def _leaf_value(self, node: dict, reach: List[List[float]]):
        H = self.H
        c = node['contrib']
        cfv0 = [0.0] * H
        cfv1 = [0.0] * H

        if node['folded'] is not None:
            if node['folded'] == 0:
                u0, u1 = -c[0], c[0]
            else:
                u0, u1 = c[1], -c[1]
            r0, r1 = reach[0], reach[1]
            for i in range(H):
                ci = self.cardset[i]
                cfv0[i] = u0 * sum(r1[j] for j in range(H) if not (ci & self.cardset[j]))
            for j in range(H):
                cj = self.cardset[j]
                cfv1[j] = u1 * sum(r0[i] for i in range(H) if not (cj & self.cardset[i]))
            return cfv0, cfv1

        if node['phase'] == 'showdown':
            pot = c[0] + c[1]
            r0, r1 = reach[0], reach[1]
            if self.share_matrix is not None:
                # Bucketed fast path: no collisions, and cfv0[i] = pot·(M[i]·r1)
                # - c0·Σr1 (the Σr1 term factored out of the inner loop).
                M = self.share_matrix
                r0tot, r1tot = sum(r0), sum(r1)
                for i in range(H):
                    Mi = M[i]
                    sr = 0.0
                    for j in range(H):
                        sr += r1[j] * Mi[j]
                    cfv0[i] = pot * sr - c[0] * r1tot
                for j in range(H):
                    sc = 0.0
                    for i in range(H):
                        sc += r0[i] * M[i][j]
                    cfv1[j] = pot * (r0tot - sc) - c[1] * r0tot
                return cfv0, cfv1
            for i in range(H):
                ci = self.cardset[i]
                acc = 0.0
                for j in range(H):
                    if ci & self.cardset[j]:
                        continue
                    acc += r1[j] * (self._share(i, j) * pot - c[0])
                cfv0[i] = acc
            for j in range(H):
                cj = self.cardset[j]
                acc = 0.0
                for i in range(H):
                    if cj & self.cardset[i]:
                        continue
                    acc += r0[i] * ((1.0 - self._share(i, j)) * pot - c[1])
                cfv1[j] = acc
            return cfv0, cfv1

        # phase == 'deal': boundary into the next street
        return self._deal_leaf(node, reach)

    def _deal_leaf(self, node: dict, reach: List[List[float]]):
        pot = node['contrib'][0] + node['contrib'][1]
        if self.depth_limit is not None:
            if self.leaf_fn is None:
                raise ValueError("depth_limit set but no leaf_value_fn provided")
            return self.leaf_fn(self.street, self.up, self.dead, pot,
                                self.holdings, reach[0], reach[1])
        if self.leaf_fn is not None:
            return self.leaf_fn(self.street, self.up, self.dead, pot,
                                self.holdings, reach[0], reach[1])
        if self.st0 == 3:                          # 6th -> 7th, exact
            return self._exact_6th_to_7th(pot, reach)
        raise NotImplementedError(
            "exact solve below 6th street deals a public upcard (intractable to "
            "enumerate); pass a value-net leaf_value_fn (depth-limited resolving) "
            "— see neural/README.md milestone D")

    def _exact_6th_to_7th(self, pot: float, reach: List[List[float]]):
        """Exact 6th-street deal leaf: no public card is dealt on 7th, so one
        shared 7th subgame. Lift each 2-card reach to 3-card holdings by the
        private draw, solve the 7th subgame once, project CFVs back to 2-card."""
        live = set(unseen(self.board))
        # Only the 3-card holdings reachable from our (possibly sparse) 2-card
        # holdings matter — keeps the recursion sparse when the ranges are narrow.
        h3 = sorted({_sort_holding(set(h2) | {c})
                     for h2 in self.holdings for c in live if c not in set(h2)},
                    key=lambda h: tuple(_deck_index(x) for x in h))
        if len(h3) > _EXACT_H_LIMIT:
            raise NotImplementedError(
                f"exact 6th->7th needs {len(h3)} 7th-street holdings "
                f"(> {_EXACT_H_LIMIT}); use a value-net leaf_value_fn instead")
        idx3 = {h: i for i, h in enumerate(h3)}
        # weight: a 2-card holding draws its 7th card uniformly from cards not
        # public and not already held -> 1/(#live - 2). Same weight is used to
        # lift reach and project CFVs, so subgame value is preserved exactly.
        denom = max(1, len(live) - 2)
        w = 1.0 / denom

        lifted = [[0.0] * len(h3), [0.0] * len(h3)]
        for i2, h2 in enumerate(self.holdings):
            held = set(h2)
            for c in live:
                if c in held:
                    continue
                k3 = idx3.get(_sort_holding(held | {c}))
                if k3 is None:
                    continue
                lifted[0][k3] += reach[0][i2] * w
                lifted[1][k3] += reach[1][i2] * w

        sub = _Resolver(7, self.up, self.dead, pot, lifted[0], lifted[1],
                        None, self.sub_iters, None, holdings=h3,
                        game=self.game)
        cfv7_0, cfv7_1 = sub.solve()

        cfv0 = [0.0] * self.H
        cfv1 = [0.0] * self.H
        for i2, h2 in enumerate(self.holdings):
            held = set(h2)
            a0 = a1 = 0.0
            for c in live:
                if c in held:
                    continue
                k3 = idx3.get(_sort_holding(held | {c}))
                if k3 is None:
                    continue
                a0 += w * cfv7_0[k3]
                a1 += w * cfv7_1[k3]
            cfv0[i2] = a0
            cfv1[i2] = a1
        return cfv0, cfv1

    # ── CFR+ traversal (one iteration; mutates regret/strategy sums) ──
    def _cfr(self, node: dict, reach: List[List[float]]):
        if self._is_leaf(node):
            return self._leaf_value(node, reach)
        p = node['toAct']
        opp = 1 - p
        acts = self._legal_actions(node)
        A = len(acts)
        key = node['curSeq']
        reg = self.regret.get(key)
        if reg is None:
            reg = [[0.0] * A for _ in range(self.H)]
            self.regret[key] = reg
            self.strat[key] = [[0.0] * A for _ in range(self.H)]
        strat_sum = self.strat[key]
        sigma = [_regret_match_plus(reg[i]) for i in range(self.H)]

        cfv_self = [0.0] * self.H
        cfv_opp = [0.0] * self.H
        child_self: List[Optional[List[float]]] = [None] * A
        for ai, a in enumerate(acts):
            child_reach = [None, None]
            child_reach[p] = [reach[p][i] * sigma[i][ai] for i in range(self.H)]
            child_reach[opp] = reach[opp]
            c0, c1 = self._cfr(self._apply_action(node, a), child_reach)
            cs = c0 if p == 0 else c1
            co = c1 if p == 0 else c0
            child_self[ai] = cs
            for i in range(self.H):
                cfv_self[i] += sigma[i][ai] * cs[i]
                cfv_opp[i] += co[i]

        for i in range(self.H):
            ri = reg[i]
            si = strat_sum[i]
            rp = reach[p][i]
            cs_i = cfv_self[i]
            for ai in range(A):
                ri[ai] = max(0.0, ri[ai] + child_self[ai][i] - cs_i)
                si[ai] += rp * sigma[i][ai]

        return (cfv_self, cfv_opp) if p == 0 else (cfv_opp, cfv_self)

    def _avg_sigma_row(self, key: str, i: int, A: int) -> List[float]:
        ss = self.strat.get(key)
        if ss is None:
            return [1.0 / A] * A
        row = ss[i]
        s = sum(row)
        if s > 0:
            return [x / s for x in row]
        return [1.0 / A] * A

    def _eval_avg(self, node: dict, reach: List[List[float]]):
        """CFVs under the average strategy (no updates) — the net's target."""
        if self._is_leaf(node):
            return self._leaf_value(node, reach)
        p = node['toAct']
        opp = 1 - p
        acts = self._legal_actions(node)
        A = len(acts)
        key = node['curSeq']
        cfv_self = [0.0] * self.H
        cfv_opp = [0.0] * self.H
        for ai, a in enumerate(acts):
            sig = [self._avg_sigma_row(key, i, A)[ai] for i in range(self.H)]
            child_reach = [None, None]
            child_reach[p] = [reach[p][i] * sig[i] for i in range(self.H)]
            child_reach[opp] = reach[opp]
            c0, c1 = self._eval_avg(self._apply_action(node, a), child_reach)
            cs = c0 if p == 0 else c1
            co = c1 if p == 0 else c0
            for i in range(self.H):
                cfv_self[i] += sig[i] * cs[i]
                cfv_opp[i] += co[i]
        return (cfv_self, cfv_opp) if p == 0 else (cfv_opp, cfv_self)

    def solve(self):
        for _ in range(self.iters):
            self._cfr(self.root, [self.range[0][:], self.range[1][:]])
        cfv0, cfv1 = self._eval_avg(self.root, [self.range[0][:], self.range[1][:]])
        self.root_cfv = (cfv0, cfv1)
        return cfv0, cfv1

    # ── exact best response (exploitability gauge; 7th street only) ──
    def _br_leaf(self, node: dict, reach_fixed: List[float], brp: int) -> List[float]:
        H = self.H
        c = node['contrib']
        out = [0.0] * H
        if node['folded'] is not None:
            u = -c[brp] if node['folded'] == brp else c[node['folded']]
            for i in range(H):
                ci = self.cardset[i]
                out[i] = u * sum(reach_fixed[j] for j in range(H)
                                 if not (ci & self.cardset[j]))
            return out
        if node['phase'] != 'showdown':
            raise NotImplementedError("BR only over 7th-street subgames (no deals)")
        pot = c[0] + c[1]
        for i in range(H):
            ci = self.cardset[i]
            acc = 0.0
            for j in range(H):
                if ci & self.cardset[j]:
                    continue
                if brp == 0:
                    u = self._share(i, j) * pot - c[0]
                else:
                    u = (1.0 - self._share(j, i)) * pot - c[1]
                acc += reach_fixed[j] * u
            out[i] = acc
        return out

    def _br(self, node: dict, reach_fixed: List[float], brp: int) -> List[float]:
        if self._is_leaf(node):
            return self._br_leaf(node, reach_fixed, brp)
        p = node['toAct']
        acts = self._legal_actions(node)
        A = len(acts)
        key = node['curSeq']
        if p == brp:                               # BR player maximizes per holding
            children = [self._br(self._apply_action(node, a), reach_fixed, brp)
                        for a in acts]
            return [max(children[ai][i] for ai in range(A)) for i in range(self.H)]
        out = [0.0] * self.H                       # fixed player plays avg strategy
        for ai, a in enumerate(acts):
            sig = [self._avg_sigma_row(key, i, A)[ai] for i in range(self.H)]
            child = self._br(self._apply_action(node, a),
                             [reach_fixed[i] * sig[i] for i in range(self.H)], brp)
            for i in range(self.H):
                out[i] += child[i]
        return out

    def exploitability(self) -> float:
        """Sum of both players' best-response gains vs the average strategy.

        >= 0 always, -> 0 as the subgame is solved (the repo's "measure before
        you trust" gauge, here exact for the 7th-street subgame)."""
        br0 = self._br(self.root, self.range[1][:], 0)
        v0 = sum(self.range[0][i] * br0[i] for i in range(self.H))
        br1 = self._br(self.root, self.range[0][:], 1)
        v1 = sum(self.range[1][j] * br1[j] for j in range(self.H))
        return v0 + v1

    # ── aggregated average strategy report (range vs each public node) ──
    def strategy_report(self) -> Dict[str, dict]:
        rep: Dict[str, dict] = {}

        def rec(node: dict, reach: List[List[float]]):
            if self._is_leaf(node):
                return
            p = node['toAct']
            acts = self._legal_actions(node)
            A = len(acts)
            key = node['curSeq']
            tot = sum(reach[p])
            if tot > 0:
                freq = [0.0] * A
                for i in range(self.H):
                    row = self._avg_sigma_row(key, i, A)
                    rp = reach[p][i]
                    for ai in range(A):
                        freq[ai] += rp * row[ai]
                freq = [f / tot for f in freq]
            else:
                freq = [1.0 / A] * A
            rep[key] = {'player': p, 'actions': acts, 'freq': freq}
            for ai, a in enumerate(acts):
                sig = [self._avg_sigma_row(key, i, A)[ai] for i in range(self.H)]
                child_reach = [None, None]
                child_reach[p] = [reach[p][i] * sig[i] for i in range(self.H)]
                child_reach[1 - p] = reach[1 - p]
                rec(self._apply_action(node, a), child_reach)

        rec(self.root, [self.range[0][:], self.range[1][:]])
        return rep


def resolve_subgame(pbs, iters: int = 1000, depth_limit: Optional[int] = None,
                    leaf_value_fn: Optional[Callable] = None,
                    holdings: Optional[List[tuple]] = None,
                    share_matrix: Optional[List[List[float]]] = None,
                    game: Optional['GameSpec'] = None) -> dict:
    """Run CFR on the subgame rooted at `pbs` (start of its street's betting).

    Args:
        pbs: root Public Belief State (pbs.PBS). `pbs.ranges` must be aligned to
            enumerate_holdings(board, down_count(street)) — or to `holdings` if
            given. Pass uniform priors if unknown (pbs.uniform_range).
        iters: CFR+ iterations (DeepStack used ~1000).
        depth_limit: if set, street boundaries are valued by `leaf_value_fn`
            (continual re-solving, Milestone D). If None, solve to the end of the
            hand (exact: showdown on 7th; one exact recursion on 6th).
        leaf_value_fn: (street, up, dead, pot, holdings, reach0, reach1) ->
            (cfv0, cfv1) in chips, e.g. a wrapped CounterfactualValueNet. May be
            supplied without depth_limit to override the exact recursion.
        holdings: explicit holding list to solve over (the union of both ranges'
            support). Restricting to nonzero-reach holdings is exact and far
            faster for narrow / node-locked ranges (study). Default: all
            enumerate_holdings(board, k).

    Returns:
        dict with:
          strategy:       {history -> {player, actions, freq}} (avg, range-aggregated)
          cfv:            [cfv_me, cfv_opp] per holding (chips), aligned to holdings
          holdings:       the holding list the cfv/range vectors index
          pot:            pot at the subgame root (chips)
          value:          [v_me, v_opp] = range-weighted root CFVs (game value)
          exploitability: best-response gap (7th street only; else absent)
          iters:          iterations run
    """
    street = pbs.street
    R = _Resolver(street, pbs.up, pbs.dead, float(pbs.pot),
                  list(pbs.ranges[0]), list(pbs.ranges[1]),
                  leaf_value_fn, iters, depth_limit, holdings=holdings,
                  share_matrix=share_matrix, game=game)
    cfv0, cfv1 = R.solve()
    out = {
        'strategy': R.strategy_report(),
        'cfv': [cfv0, cfv1],
        'holdings': R.holdings,
        'pot': R.root['contrib'][0] + R.root['contrib'][1],
        'value': [sum(R.range[0][i] * cfv0[i] for i in range(R.H)),
                  sum(R.range[1][i] * cfv1[i] for i in range(R.H))],
        'iters': iters,
    }
    if R.st0 == 4:
        out['exploitability'] = R.exploitability()
    return out


def root_action_ev(pbs, hero_holding, hero_reach=None, game: Optional['GameSpec'] = None,
                   iters: int = 2000, opp_range=None, return_meta: bool = False) -> dict:
    """The TRUE-GTO grading ORACLE primitive.

    Solve the subgame rooted at `pbs` to equilibrium, then for EACH legal root
    action report the hero's EV (chips) for the FIXED hero holding under the
    equilibrium continuation: hero best-responds ONLY at the root and both sides
    play the average strategy everywhere after. This is the exact analog of
    grade.js's per-action EV, and the loop lifted (verbatim in spirit) from
    _xcheck_solve.py / _xcheck_stud8_solve.py — now first-class.

    Args:
        pbs: a pbs.PBS whose `.ranges[1]` is the reach-weighted OPPONENT range
            aligned to `pbs.holdings` (or `opp_range`, below). `.ranges[0]` is
            unused here — the hero's reach is supplied by `hero_holding`/
            `hero_reach` (a point mass on the hero's actual hand).
        hero_holding: the hero's exact down cards (tuple/list of card strings).
            Must be present in the union of holdings solved.
        hero_reach: optional explicit hero reach vector over the union holdings.
            Defaults to an indicator on `hero_holding` (a specific hand grade).
        opp_range: optional {holding_tuple: weight} opponent range. If given, the
            union of holdings is built from (hero_holding ∪ opp_range) and the
            solve is restricted to it (exact + fast for narrow node-locked ranges,
            the study case). If None, `pbs.holdings`/`pbs.ranges[1]` are used.
        game: GameSpec (RAZZ / STUD8). Defaults to STUD8.
        iters: CFR+ iterations.
        return_meta: also return holdings/reach/value for debugging.

    Returns:
        {
          'per_action_ev': {action: ev_chips},   # hero EV per root action
          'gtoMix':        {'actions':[...], 'freq':[...]},  # root GTO mix
          'exploitability': float,               # solve self-validation (7th only)
          'pot':           float,
        }
        (+ holdings/r0/r1/me_idx/value when return_meta).
    """
    g = game if game is not None else STUD8
    street = pbs.street
    up = pbs.up
    dead = pbs.dead
    pot = float(pbs.pot)
    me = _sort_holding(hero_holding)

    # Build the union of holdings + reach vectors. Two modes:
    #  (a) opp_range given  -> node-locked: union = hero ∪ opp support (narrow).
    #  (b) opp_range None   -> use the PBS's own holdings/ranges (dense).
    if opp_range is not None:
        opp = {}
        for h, w in (opp_range.items() if hasattr(opp_range, 'items') else opp_range):
            opp[_sort_holding(h)] = opp.get(_sort_holding(h), 0.0) + w
        union = sorted(set([me]) | set(opp),
                       key=lambda h: tuple(_deck_index(c) for c in h))
        idx = {h: i for i, h in enumerate(union)}
        H = len(union)
        r1 = [0.0] * H
        for h, w in opp.items():
            r1[idx[h]] += w
        s1 = sum(r1)
        r1 = [x / s1 for x in r1] if s1 else r1
        holdings = union
    else:
        holdings = getattr(pbs, 'holdings', None)
        holdings = list(holdings) if holdings is not None else \
            enumerate_holdings(up[0] + up[1] + dead, down_count(street))
        idx = {h: i for i, h in enumerate(holdings)}
        H = len(holdings)
        r1 = list(pbs.ranges[1])
        s1 = sum(r1)
        r1 = [x / s1 for x in r1] if s1 else r1

    if me not in idx:
        raise ValueError("hero_holding is not in the solved holding union")
    me_idx = idx[me]

    # hero reach: point mass on the actual hand (a specific-hand grade), unless
    # an explicit reach vector is supplied.
    if hero_reach is None:
        r0 = [0.0] * H
        r0[me_idx] = 1.0
    else:
        r0 = list(hero_reach)
        s0 = sum(r0)
        r0 = [x / s0 for x in r0] if s0 else r0

    R = _Resolver(street, up, dead, pot, r0, r1, None, iters=iters,
                  depth_limit=None, holdings=holdings, game=g)
    cfv0, cfv1 = R.solve()

    root = R.root
    if root['toAct'] != 0:
        raise ValueError("oracle expects hero (seat 0) to act first at the root")
    racts = legal_actions(root)

    # Per-action hero EV: hero plays action a at the root, then both play the
    # equilibrium average strategy; opp reach entering the child is unchanged
    # (hero acts at the root, so opp hasn't acted between root and child).
    per_action_ev = {}
    hero_pt = [0.0] * H
    hero_pt[me_idx] = 1.0
    for a in racts:
        child = apply_action(root, a)
        c0, _c1 = R._eval_avg(child, [hero_pt, R.range[1][:]])
        per_action_ev[a] = c0[me_idx]

    # Root GTO mix (reach-weighted aggregate over the hero range at the root).
    rep = R.strategy_report()
    root_rep = rep.get(root['curSeq'], {'actions': racts, 'freq': [1.0 / len(racts)] * len(racts)})

    out = {
        'per_action_ev': {a: per_action_ev[a] for a in racts},
        'gtoMix': {'actions': root_rep['actions'], 'freq': list(root_rep['freq'])},
        'exploitability': R.exploitability() if R.st0 == 4 else None,
        'pot': root['contrib'][0] + root['contrib'][1],
    }
    if return_meta:
        out['holdings'] = [list(h) for h in holdings]
        out['r0'] = r0
        out['r1'] = r1
        out['me_idx'] = me_idx
        out['value'] = {'me': sum(r0[i] * cfv0[i] for i in range(H)),
                        'opp': sum(r1[i] * cfv1[i] for i in range(H))}
    return out


# ── self-tests (run: python3 resolve.py) ──
def _tiny_board(up0, up1, live):
    """A board whose unseen pool is exactly `live` (rest dead) for fast tests."""
    used = set(up0) | set(up1) | set(live)
    dead = [c for c in (r + s for r in RANKS for s in SUITS) if c not in used]
    return up0, up1, dead


def _uniform(n):
    return [1.0 / n] * n if n else []


if __name__ == "__main__":
    # 1) Betting-tree port: later-street first-actor, 3rd-street forced open,
    #    bring-in seat, and the 4-bet cap.
    up0, up1, dead = _tiny_board(['As', '4s', '5d', '7c'],
                                 ['Kh', 'Qd', 'Jc', '9h'],
                                 ['2c', '3d', '6h', '8s', 'Tc', 'Kd'])
    root7 = _Resolver(7, [up0, up1], dead, 20.0,
                      _uniform(20), _uniform(20), None, 1, None).root
    assert root7['st0'] == 4 and root7['toAct'] == first_actor(up0, up1)
    # 3rd street: 1 upcard each, forced open, lowest door card brings in.
    u0, u1, d3 = _tiny_board(['2c'], ['Kd'], ['As', '4s', '5h', '6s', '8d', 'Th'])
    H3rd = len(enumerate_holdings(['2c', 'Kd'] + d3, 2))
    r3 = _Resolver(3, [u0, u1], d3, 2.0, _uniform(H3rd), _uniform(H3rd),
                   None, 1, None)
    assert legal_actions(r3.root) == ['br', 'co']
    assert r3.root['bringIn'] == 0 and r3.root['toAct'] == 0   # 2c < Kd
    # cap: after 4 raises no further raise/bet is offered
    nd = dict(st0=4, contrib=[100, 100], base=10, bets=CAP, toAct=0,
              acted=[True, True], folded=None, phase='bet', bringIn=0,
              starter=0, curSeq='bbbb')
    assert 'r' not in legal_actions(nd) and 'b' not in legal_actions(nd)

    # 2) 7th-street exact solve: zero-sum + exploitability -> ~0 (uniform ranges).
    up0, up1, dead = _tiny_board(['As', '4s', '5d', '7c'],
                                 ['Kh', 'Qd', 'Jc', '9h'],
                                 ['2c', '3d', '6h', '8s', 'Tc', 'Kd'])
    H = len(enumerate_holdings(up0 + up1 + dead, 3))
    pbs = PBS(street=7, up=[up0, up1], dead=dead, pot=20.0,
              ranges=[_uniform(H), _uniform(H)])
    res = resolve_subgame(pbs, iters=200)
    assert len(res['cfv'][0]) == H and len(res['cfv'][1]) == H
    assert abs(res['value'][0] + res['value'][1]) < 1e-6, res['value']
    pot = res['pot']
    assert res['exploitability'] < 0.02 * pot, res['exploitability']
    # strategy report covers the root and frequencies are simplices
    for node in res['strategy'].values():
        assert abs(sum(node['freq']) - 1.0) < 1e-6

    # 3) Dominance: P0 holds a scooping hand vs P1 -> P0 wins ~half the pot
    #    (the part P1 has in), exploitability stays ~0.
    holds = enumerate_holdings(up0 + up1 + dead, 3)
    scoop = None
    for i, hi in enumerate(holds):
        for j, hj in enumerate(holds):
            if set(hi) & set(hj):
                continue
            if split_share(list(hi) + up0, list(hj) + up1) == 1.0:
                scoop = (i, j)
                break
        if scoop:
            break
    assert scoop, "expected a scooping matchup on this board"
    r0 = [0.0] * H; r0[scoop[0]] = 1.0
    r1 = [0.0] * H; r1[scoop[1]] = 1.0
    pbs2 = PBS(street=7, up=[up0, up1], dead=dead, pot=20.0, ranges=[r0, r1])
    res2 = resolve_subgame(pbs2, iters=300)
    assert res2['value'][0] > 0 and res2['value'][1] < 0, res2['value']
    assert abs(res2['value'][0] - 10.0) < 0.5, res2['value']     # ~ half of pot=20
    assert res2['exploitability'] < 0.05 * res2['pot'], res2['exploitability']

    # 4) Symmetric matchup ties: both hold the SAME (effective) strength ->
    #    a tie splits, root value near 0 and exploitability ~0.
    tie = None
    for i, hi in enumerate(holds):
        for j, hj in enumerate(holds):
            if set(hi) & set(hj):
                continue
            if abs(split_share(list(hi) + up0, list(hj) + up1) - 0.5) < 1e-9:
                tie = (i, j); break
        if tie:
            break
    if tie:
        r0 = [0.0] * H; r0[tie[0]] = 1.0
        r1 = [0.0] * H; r1[tie[1]] = 1.0
        rest = resolve_subgame(PBS(street=7, up=[up0, up1], dead=dead, pot=20.0,
                                   ranges=[r0, r1]), iters=200)
        assert rest['exploitability'] < 0.05 * rest['pot']

    # 5) leaf_value_fn path: a zero-value leaf -> game value ~0, runs on 6th st.
    up0, up1, dead = _tiny_board(['As', '4s', '5d', '7c'],
                                 ['Kh', 'Qd', 'Jc', '9h'],
                                 ['2c', '3d', '6h', '8s', 'Tc', 'Kd'])
    H2 = len(enumerate_holdings(up0 + up1 + dead, 2))
    calls = {'n': 0}

    def zero_leaf(street, up, dead_, pot, holdings, reach0, reach1):
        calls['n'] += 1
        n = len(holdings)
        return [0.0] * n, [0.0] * n

    res5 = resolve_subgame(PBS(street=6, up=[up0, up1], dead=dead, pot=16.0,
                               ranges=[_uniform(H2), _uniform(H2)]),
                           iters=200, leaf_value_fn=zero_leaf)
    assert calls['n'] > 0, "leaf_value_fn was never called"
    # zero-sum is exact; game value -> 0 (a zero-value leaf makes folding the
    # only mistake, so equilibrium value is 0 up to CFR convergence residual).
    assert abs(res5['value'][0] + res5['value'][1]) < 1e-9, res5['value']
    assert abs(res5['value'][0]) < 0.02 * 16.0, res5['value']

    # 6) exact 6th->7th recursion -> zero-sum holds. This nests a full 7th-street
    #    solve at each deal leaf; zero-sum is structural (exact at any iteration
    #    count), so 2 iterations suffice to exercise lift/solve/project while real
    #    showdown matchups flow through (live=6 keeps 3-card holdings disjoint).
    up0, up1, dead = _tiny_board(['As', '4s', '5d', '7c'],
                                 ['Kh', 'Qd', 'Jc', '9h'],
                                 ['2c', '3d', '6h', '8s', 'Tc', 'Kd'])
    H3 = len(enumerate_holdings(up0 + up1 + dead, 2))
    res6 = resolve_subgame(PBS(street=6, up=[up0, up1], dead=dead, pot=16.0,
                               ranges=[_uniform(H3), _uniform(H3)]),
                           iters=2)
    assert abs(res6['value'][0] + res6['value'][1]) < 1e-9, res6['value']
    assert all(abs(v) < 1e6 for v in res6['cfv'][0]), "CFVs must be finite"

    # 7) early-street exact without a leaf is a deliberate, explained error.
    up0, up1, dead = _tiny_board(['As'], ['Kh'],
                                 ['2c', '3d', '6h', '8s', 'Tc', '4s'])
    H4 = len(enumerate_holdings(up0 + up1 + dead, 2))
    try:
        resolve_subgame(PBS(street=3, up=[up0, up1], dead=dead, pot=2.0,
                            ranges=[_uniform(H4), _uniform(H4)]), iters=10)
        raise AssertionError("expected NotImplementedError for 3rd-street exact")
    except NotImplementedError:
        pass

    # 8) the exact-recursion blowup guard fires when the 7th holding space is too
    #    big (here 17 live cards -> C(17,3)=680 > the limit), steering to a leaf.
    _all = [r + s for r in RANKS for s in SUITS]
    up0, up1 = ['As', '4s', '5d', '7c'], ['Kh', 'Qd', 'Jc', '9h']
    live17 = [c for c in _all if c not in set(up0) | set(up1)][:17]
    up0, up1, dead = _tiny_board(up0, up1, live17)
    H5 = len(enumerate_holdings(up0 + up1 + dead, 2))
    try:
        resolve_subgame(PBS(street=6, up=[up0, up1], dead=dead, pot=16.0,
                            ranges=[_uniform(H5), _uniform(H5)]), iters=1)
        raise AssertionError("expected NotImplementedError from the blowup guard")
    except NotImplementedError:
        pass

    # 9) sparse support is EXACT: solving over the union support (explicit
    #    holdings) matches the full solve restricted to those holdings — the
    #    correctness guarantee behind fast node-locked study solves.
    import random as _rnd
    up0, up1, dead = _tiny_board(['As', '4s', '5d', '7c'],
                                 ['Kh', 'Qd', 'Jc', '9h'],
                                 ['2c', '3d', '6h', '8s', 'Tc', 'Kd'])
    holds_full = enumerate_holdings(up0 + up1 + dead, 3)
    Hf = len(holds_full)
    rr = _rnd.Random(1)
    sup0 = sorted(rr.sample(range(Hf), 4))
    sup1 = sorted(rr.sample(range(Hf), 4))
    f0 = [0.0] * Hf; f1 = [0.0] * Hf
    for i in sup0:
        f0[i] = 1.0
    for j in sup1:
        f1[j] = 1.0
    f0 = [x / sum(f0) for x in f0]; f1 = [x / sum(f1) for x in f1]
    res_full = resolve_subgame(PBS(7, [up0, up1], dead, 20.0, [f0, f1]), iters=150)
    union = sorted(set(sup0) | set(sup1))
    pos = {i: k for k, i in enumerate(union)}
    sub_holds = [holds_full[i] for i in union]
    g0 = [f0[i] for i in union]; g1 = [f1[i] for i in union]
    res_sp = resolve_subgame(PBS(7, [up0, up1], dead, 20.0, [g0, g1]),
                             iters=150, holdings=sub_holds)
    assert abs(res_full['value'][0] - res_sp['value'][0]) < 1e-6, \
        (res_full['value'], res_sp['value'])
    for i in sup0:
        assert abs(res_full['cfv'][0][i] - res_sp['cfv'][0][pos[i]]) < 1e-6
    for j in sup1:
        assert abs(res_full['cfv'][1][j] - res_sp['cfv'][1][pos[j]]) < 1e-6

    print("ok: resolve.py self-tests pass "
          f"(7th |H|={H}, zero-sum + best-response exploitability + "
          "sparse-support exactness verified)")
