"""NumPy-vectorized EXACT raw-holding re-solver — the fast path for solve_range.

`resolve.resolve_subgame` (pure Python) is the REFERENCE implementation and the
correctness oracle. It runs range-form CFR+ over the public betting tree with a
per-holding O(H²) showdown leaf, which costs O(H²·iters) and chokes past ~80
holdings (H=165 → 32s, H=286 → 113s at 120 iters on this box).

This module reproduces that solve EXACTLY (range-form CFR+, DeepStack/Libratus
public-tree formulation, regret-matching+, linear average strategy, exact 7th-
street hi/lo or razz showdown WITH card-removal masking), but vectorizes the
per-holding arithmetic across all H holdings with NumPy:

  * The betting-tree STRUCTURE/LOGIC is reused verbatim from resolve.py
    (`_Resolver._root_node`, `legal_actions`, `apply_action`, `is_leaf`): the
    tree is walked ONCE and flattened into static node arrays. No betting logic
    is re-implemented here, so the two paths cannot diverge on tree shape.
  * The O(H²) Python showdown double-loop is replaced by ONE precomputed H×H
    seat-0 share matrix M and an H×H allowed-pair mask A (1.0 iff the two
    holdings share no card — exactly resolve.py's `ci & cj` collision skip), then
    matrix-vector products per leaf. M is built EXACTLY (full enumeration via the
    GameSpec showdown share), not sampled. With AM = A*M:
        cfv0 = pot·(AM @ r1) − c0·(A @ r1)
        cfv1 = (pot − c1)·(Aᵀ @ r0) − pot·(AMᵀ @ r0)
    which is algebraically identical to resolve.py's leaf (seat-1 share on a
    disjoint pair is 1 − M[i,j]). Fold leaves use A directly.
  * Regret/strategy/reach updates are the SAME recurrences as resolve._cfr,
    written as NumPy array ops over the holding axis.

Equivalence to the pure-Python reference is asserted (value 1e-6, per-node action
freqs 1e-3, exploitability 1e-4) in this module's self-test AND wired so
solve_range's exact path uses it when NumPy is importable, falling back to the
reference otherwise.

Supports BOTH stud8 and razz: they share the betting tree via GameSpec; only the
showdown matrix M differs (built from `game.share`). Like the reference it also
accepts a precomputed bucket `share_matrix` (no card collisions → A is all-ones),
so the bucketed path can ride the same vectorized CFR.

Scope: this fast path covers the cases solve_range's EXACT engine actually hits —
7th-street showdown leaves, fold terminals, AND depth-limited deal leaves valued
by a `leaf_value_fn` (the net leaf, e.g. 6th→7th continual re-solving). The exact
6th→7th *recursion* (no leaf_fn, no depth_limit, st0==3) is rare and stays on the
pure-Python reference (it nests a whole 7th solve per deal leaf); resolve_subgame_fast
transparently delegates that case to `resolve_subgame`.
"""
from __future__ import annotations
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np

from pbs import down_count, enumerate_holdings
from resolve import (_Resolver, STUD8, GameSpec, is_leaf, legal_actions,
                     apply_action, resolve_subgame)


# ── flattened betting tree ───────────────────────────────────────────────────
# A decision node: (player, [action labels], [child node-id per action], key).
# A leaf node carries enough to value it vectorized (kind + contribs + payoff).
class _Node:
    __slots__ = ('is_leaf', 'player', 'acts', 'children', 'key',
                 'kind', 'c0', 'c1', 'folded')

    def __init__(self):
        self.is_leaf = False
        self.player = 0
        self.acts: List[str] = []
        self.children: List[int] = []
        self.key = ''
        self.kind = ''          # 'showdown' | 'fold' | 'deal'
        self.c0 = 0.0
        self.c1 = 0.0
        self.folded: Optional[int] = None


# ── exact H×H showdown matrix + card-removal mask (vectorized) ───────────────
from pbs import DECK as _DECK
_CARD_IDX = {c: i for i, c in enumerate(_DECK)}     # 52-card index for masking


def _allowed_mask(holdings) -> np.ndarray:
    """A[i,j] = 1.0 iff holdings i and j share no card (card-removal: colliding
    (i,j) pairs are excluded at every leaf — exactly resolve.py's `ci & cj` skip).
    Built as (C @ Cᵀ == 0) over a per-holding 52-card membership matrix."""
    H = len(holdings)
    C = np.zeros((H, 52), dtype=np.float64)
    for i, h in enumerate(holdings):
        for c in h:
            C[i, _CARD_IDX[c]] = 1.0
    overlap = C @ C.T                                # # shared cards per pair
    return (overlap == 0.0).astype(np.float64)


def _exact_share_matrix(holdings, up0, up1, A: np.ndarray,
                        game: GameSpec) -> np.ndarray:
    """EXACT seat-0 pot-share matrix M[i,j] = game.share(holding_i+up0,
    holding_j+up1), over RAW holdings — the full-enumeration analog of
    bucket_resolve.sample_share_matrix (no sampling).

    For the two shipped games it precomputes each holding's hand score ONCE per
    seat (O(H) evaluations) and forms M from cheap broadcasted comparisons —
    O(H²) integer ops instead of O(H²) seven-card evaluations (the bottleneck of
    a naive per-pair `game.share` loop). For any other GameSpec it falls back to
    the exact per-pair loop (correct, just slower). Identical numbers either way;
    M values at colliding (i,j) are irrelevant (A masks them) but set to 0."""
    H = len(holdings)
    name = getattr(game, 'name', None)
    if name == 'stud8':
        from eval_stud8 import best_hi, best_lo8
        hi0 = np.empty(H); hi1 = np.empty(H)
        lo0 = np.empty(H); lo1 = np.empty(H)
        has0 = np.empty(H, dtype=bool); has1 = np.empty(H, dtype=bool)
        for i, h in enumerate(holdings):
            c0 = list(h) + up0
            c1 = list(h) + up1
            hi0[i] = best_hi(c0); hi1[i] = best_hi(c1)
            l0 = best_lo8(c0); l1 = best_lo8(c1)
            has0[i] = l0 is not None
            has1[i] = l1 is not None
            lo0[i] = -1.0 if l0 is None else l0   # sentinel; masked by has*
            lo1[i] = -1.0 if l1 is None else l1
        HI0 = hi0[:, None]; HI1 = hi1[None, :]
        # hi half: 1 / 0.5 / 0 by seat-0 hi vs seat-1 hi
        hi_share = np.where(HI0 > HI1, 1.0, np.where(HI0 < HI1, 0.0, 0.5))
        LO0 = lo0[:, None]; LO1 = lo1[None, :]
        H0 = has0[:, None]; H1 = has1[None, :]
        both = H0 & H1
        # lo half (lower lo score is better): only meaningful where both qualify
        lo_share_both = np.where(LO0 < LO1, 1.0,
                                 np.where(LO0 > LO1, 0.0, 0.5))
        only0 = H0 & (~H1)
        only1 = (~H0) & H1
        neither = (~H0) & (~H1)
        # split: 0.5*hi + 0.5*lo when any low exists; pure hi when neither
        M = np.where(
            neither, hi_share,
            0.5 * hi_share + 0.5 * np.where(
                both, lo_share_both,
                np.where(only0, 1.0, np.where(only1, 0.0, 0.0))))
        return M * A
    if name == 'razz':
        from eval_razz import best_low_razz
        lo0 = np.empty(H); lo1 = np.empty(H)
        for i, h in enumerate(holdings):
            lo0[i] = best_low_razz(list(h) + up0)
            lo1[i] = best_low_razz(list(h) + up1)
        LO0 = lo0[:, None]; LO1 = lo1[None, :]
        M = np.where(LO0 < LO1, 1.0, np.where(LO0 > LO1, 0.0, 0.5))
        return M * A
    # Generic exact fallback (any other GameSpec): per-pair, allowed pairs only.
    cards = [list(h) for h in holdings]
    M = np.zeros((H, H), dtype=np.float64)
    share = game.share
    for i in range(H):
        ci0 = cards[i] + up0
        Ai = A[i]
        Mi = M[i]
        for j in range(H):
            if Ai[j]:
                Mi[j] = share(ci0, cards[j] + up1)
    return M


class _FastResolver:
    """Vectorized twin of resolve._Resolver. Builds the SAME tree (via resolve's
    state machine) and the SAME leaf valuations, over NumPy holding arrays."""

    def __init__(self, street: int, up, dead, pot: float,
                 range0: List[float], range1: List[float],
                 leaf_fn: Optional[Callable], iters: int,
                 depth_limit: Optional[int],
                 holdings: Optional[List[tuple]] = None,
                 share_matrix=None, game: Optional[GameSpec] = None):
        self.game = game if game is not None else STUD8
        self.street = street
        self.st0 = street - 3
        self.up = [list(up[0]), list(up[1])]
        self.dead = list(dead)
        self.board = self.up[0] + self.up[1] + self.dead
        self.k = down_count(street)
        self.holdings = holdings if holdings is not None else \
            enumerate_holdings(self.board, self.k)
        self.H = len(self.holdings)
        if len(range0) != self.H or len(range1) != self.H:
            raise ValueError(f"range length must equal #holdings ({self.H}); "
                             f"got {len(range0)}, {len(range1)}")
        self.r0 = np.asarray(range0, dtype=np.float64)
        self.r1 = np.asarray(range1, dtype=np.float64)
        self.leaf_fn = leaf_fn
        self.iters = iters
        self.depth_limit = depth_limit
        self.share_matrix = share_matrix

        # Borrow resolve._Resolver purely to reconstruct the canonical root node
        # (antes/bring-in/first-actor) — identical betting state, no CFR run.
        ref = _Resolver(street, up, dead, pot, range0, range1, leaf_fn, 0,
                        depth_limit, holdings=self.holdings,
                        share_matrix=share_matrix, game=self.game)
        self.root_betting = ref.root

        self._build_showdown()
        self.nodes: List[_Node] = []
        self.root_id = self._flatten(self.root_betting)

        # CFR storage, indexed by node id (only decision nodes allocate).
        self.regret: Dict[int, np.ndarray] = {}     # (H, A)
        self.strat: Dict[int, np.ndarray] = {}       # (H, A) strategy sum

    # -- exact showdown matrix M (seat-0 share) + allowed-pair mask A ----------
    def _build_showdown(self):
        H = self.H
        if self.share_matrix is not None:
            # Bucketed path: ids carry no cards -> no collisions, A is all ones.
            self.M = np.asarray(self.share_matrix, dtype=np.float64)
            self.A = np.ones((H, H), dtype=np.float64)
        else:
            self.A = _allowed_mask(self.holdings)
            # M is only ever read at showdown leaves (st0 == 4). On earlier
            # streets a holding has <5 cards, so the per-holding best-hand
            # enumeration (combinations(<5, 5)) is empty and max()/min() would
            # raise — exactly the crash on 3rd/4th-street depth-limited solves
            # that the reference handles fine. Build M only when a showdown leaf
            # can exist; zero it otherwise (harmless — never read off-showdown).
            self.M = (_exact_share_matrix(self.holdings, self.up[0], self.up[1],
                                          self.A, self.game)
                      if self.st0 == 4 else np.zeros((H, H), dtype=np.float64))
        # Elementwise A*M and its transpose, reused every iteration at leaves.
        self.AM = self.A * self.M
        self.A_T = self.A.T.copy()
        self.AM_T = self.AM.T.copy()
        # Validate both inputs at this convergence point: NaN/out-of-range share
        # entries and negative/NaN range weights would otherwise sail through to
        # value=[nan,nan] and a NaN in the cfv training target, silently. (The
        # external study path — solve_spot's `w = float(ws)` and solve_server —
        # carries unchecked user numbers here.) On earlier streets M is the
        # zeroed placeholder (finite, in [0,1]), so this passes there too.
        if not (np.isfinite(self.r0).all() and np.isfinite(self.r1).all()
                and (self.r0 >= 0).all() and (self.r1 >= 0).all()
                and np.isfinite(self.M).all()
                and ((self.M >= -1e-9) & (self.M <= 1.0 + 1e-9)).all()):
            raise ValueError(
                "range weights must be finite and non-negative; share_matrix "
                "entries must be finite in [0,1]")

    # -- flatten the betting tree into static node records --------------------
    def _flatten(self, bnode: dict) -> int:
        node = _Node()
        nid = len(self.nodes)
        self.nodes.append(node)
        if is_leaf(bnode):
            node.is_leaf = True
            c = bnode['contrib']
            node.c0 = float(c[0])
            node.c1 = float(c[1])
            if bnode['folded'] is not None:
                node.kind = 'fold'
                node.folded = bnode['folded']
            elif bnode['phase'] == 'showdown':
                node.kind = 'showdown'
            else:                                   # 'deal' boundary
                node.kind = 'deal'
            return nid
        node.player = bnode['toAct']
        node.key = bnode['curSeq']
        acts = legal_actions(bnode)
        node.acts = acts
        # Recurse first into temporaries, then record children (ids are stable
        # because append order is deterministic).
        child_ids = []
        for a in acts:
            child_ids.append(self._flatten(apply_action(bnode, a)))
        node.children = child_ids
        return nid

    # -- leaf valuation (vectorized) -> (cfv0, cfv1) over holdings ------------
    def _leaf_value(self, node: _Node, reach0: np.ndarray, reach1: np.ndarray):
        if node.kind == 'fold':
            if node.folded == 0:
                u0, u1 = -node.c0, node.c0
            else:
                u0, u1 = node.c1, -node.c1
            # cfv0[i] = u0 * sum_j allowed[i,j] r1[j];  cfv1[j] = u1 * sum_i allowed[i,j] r0[i]
            cfv0 = u0 * (self.A @ reach1)
            cfv1 = u1 * (self.A_T @ reach0)
            return cfv0, cfv1
        if node.kind == 'showdown':
            pot = node.c0 + node.c1
            # cfv0 = pot·(AM @ r1) − c0·(A @ r1)
            cfv0 = pot * (self.AM @ reach1) - node.c0 * (self.A @ reach1)
            # cfv1 = (pot − c1)·(Aᵀ @ r0) − pot·(AMᵀ @ r0)
            cfv1 = (pot - node.c1) * (self.A_T @ reach0) \
                - pot * (self.AM_T @ reach0)
            return cfv0, cfv1
        # 'deal': boundary into the next street -> value with the leaf fn.
        pot = node.c0 + node.c1
        if self.leaf_fn is None:
            # The only no-leaf deal case the reference handles is the exact
            # 6th->7th recursion; resolve_subgame_fast delegates that wholesale,
            # so we should never reach here without a leaf fn.
            raise NotImplementedError(
                "deal leaf without leaf_value_fn is handled by the pure-Python "
                "reference (exact 6th->7th recursion); use resolve_subgame_fast "
                "which delegates that case")
        cfv0, cfv1 = self.leaf_fn(self.street, self.up, self.dead, pot,
                                  self.holdings,
                                  reach0.tolist(), reach1.tolist())
        return (np.asarray(cfv0, dtype=np.float64),
                np.asarray(cfv1, dtype=np.float64))

    # -- regret-matching+ for a whole node at once (H, A) --------------------
    @staticmethod
    def _rm_plus(reg: np.ndarray) -> np.ndarray:
        pos = np.maximum(reg, 0.0)
        s = pos.sum(axis=1, keepdims=True)
        A = reg.shape[1]
        out = np.empty_like(pos)
        nz = (s[:, 0] > 0.0)
        # rows with positive mass: normalize; else uniform 1/A
        if nz.any():
            out[nz] = pos[nz] / s[nz]
        if (~nz).any():
            out[~nz] = 1.0 / A
        return out

    # -- one CFR+ iteration (mutates regret/strategy sums) -------------------
    def _cfr(self, nid: int, reach0: np.ndarray, reach1: np.ndarray):
        node = self.nodes[nid]
        if node.is_leaf:
            return self._leaf_value(node, reach0, reach1)
        p = node.player
        A = len(node.acts)
        reg = self.regret.get(nid)
        if reg is None:
            reg = np.zeros((self.H, A), dtype=np.float64)
            self.regret[nid] = reg
            self.strat[nid] = np.zeros((self.H, A), dtype=np.float64)
        strat_sum = self.strat[nid]
        sigma = self._rm_plus(reg)                  # (H, A)

        reach_p = reach0 if p == 0 else reach1
        # child CFVs for the ACTING player, per action -> (H, A)
        child_self = np.empty((self.H, A), dtype=np.float64)
        cfv_opp = np.zeros(self.H, dtype=np.float64)
        for ai in range(A):
            cr_p = reach_p * sigma[:, ai]
            if p == 0:
                c0, c1 = self._cfr(node.children[ai], cr_p, reach1)
                cs, co = c0, c1
            else:
                c0, c1 = self._cfr(node.children[ai], reach0, cr_p)
                cs, co = c1, c0
            child_self[:, ai] = cs
            cfv_opp += co
        # expected self CFV under sigma
        cfv_self = np.einsum('ha,ha->h', sigma, child_self)
        # regret-matching+ update and linear strategy-sum accumulation
        reg += child_self - cfv_self[:, None]
        np.maximum(reg, 0.0, out=reg)
        strat_sum += reach_p[:, None] * sigma

        if p == 0:
            return cfv_self, cfv_opp
        return cfv_opp, cfv_self

    # -- average strategy at a node (H, A); uniform if unseen ----------------
    def _avg_sigma(self, nid: int, A: int) -> np.ndarray:
        ss = self.strat.get(nid)
        if ss is None:
            return np.full((self.H, A), 1.0 / A)
        s = ss.sum(axis=1, keepdims=True)
        out = np.empty_like(ss)
        nz = (s[:, 0] > 0.0)
        if nz.any():
            out[nz] = ss[nz] / s[nz]
        if (~nz).any():
            out[~nz] = 1.0 / A
        return out

    def _eval_avg(self, nid: int, reach0: np.ndarray, reach1: np.ndarray):
        node = self.nodes[nid]
        if node.is_leaf:
            return self._leaf_value(node, reach0, reach1)
        p = node.player
        A = len(node.acts)
        sig = self._avg_sigma(nid, A)
        reach_p = reach0 if p == 0 else reach1
        cfv_self = np.zeros(self.H, dtype=np.float64)
        cfv_opp = np.zeros(self.H, dtype=np.float64)
        for ai in range(A):
            cr_p = reach_p * sig[:, ai]
            if p == 0:
                c0, c1 = self._eval_avg(node.children[ai], cr_p, reach1)
                cs, co = c0, c1
            else:
                c0, c1 = self._eval_avg(node.children[ai], reach0, cr_p)
                cs, co = c1, c0
            cfv_self += sig[:, ai] * cs
            cfv_opp += co
        if p == 0:
            return cfv_self, cfv_opp
        return cfv_opp, cfv_self

    def solve(self):
        for _ in range(self.iters):
            self._cfr(self.root_id, self.r0.copy(), self.r1.copy())
        cfv0, cfv1 = self._eval_avg(self.root_id, self.r0.copy(), self.r1.copy())
        self.root_cfv = (cfv0, cfv1)
        return cfv0, cfv1

    # -- exact best response (exploitability gauge; 7th street only) ---------
    def _br_leaf(self, node: _Node, reach_fixed: np.ndarray, brp: int) -> np.ndarray:
        if node.kind == 'fold':
            u = -node.c0 if (node.folded == 0 and brp == 0) else None
            # u = -c[brp] if folded==brp else c[folded]
            cb = node.c0 if brp == 0 else node.c1
            if node.folded == brp:
                u = -cb
            else:
                u = node.c0 if node.folded == 0 else node.c1
            if brp == 0:
                return u * (self.A @ reach_fixed)
            return u * (self.A_T @ reach_fixed)
        if node.kind != 'showdown':
            raise NotImplementedError("BR only over 7th-street subgames")
        pot = node.c0 + node.c1
        if brp == 0:
            # out[i] = sum_j allowed[i,j] r1[j] (M[i,j] pot - c0)
            return pot * (self.AM @ reach_fixed) - node.c0 * (self.A @ reach_fixed)
        # brp == 1: out[j] = sum_i allowed[i,j] r0[i] ((1 - M[i,j]) pot - c1)
        return (pot - node.c1) * (self.A_T @ reach_fixed) \
            - pot * (self.AM_T @ reach_fixed)

    def _br(self, nid: int, reach_fixed: np.ndarray, brp: int) -> np.ndarray:
        node = self.nodes[nid]
        if node.is_leaf:
            return self._br_leaf(node, reach_fixed, brp)
        p = node.player
        A = len(node.acts)
        if p == brp:                                 # BR player maximizes per holding
            cols = [self._br(node.children[ai], reach_fixed, brp)
                    for ai in range(A)]
            return np.max(np.stack(cols, axis=1), axis=1)
        sig = self._avg_sigma(nid, A)                # fixed player plays avg
        out = np.zeros(self.H, dtype=np.float64)
        for ai in range(A):
            out += self._br(node.children[ai], reach_fixed * sig[:, ai], brp)
        return out

    def exploitability(self) -> float:
        br0 = self._br(self.root_id, self.r1.copy(), 0)
        v0 = float(np.dot(self.r0, br0))
        br1 = self._br(self.root_id, self.r0.copy(), 1)
        v1 = float(np.dot(self.r1, br1))
        return v0 + v1

    # -- aggregated average-strategy report (matches resolve.strategy_report) -
    def strategy_report(self) -> Dict[str, dict]:
        rep: Dict[str, dict] = {}

        def rec(nid: int, reach0: np.ndarray, reach1: np.ndarray):
            node = self.nodes[nid]
            if node.is_leaf:
                return
            p = node.player
            A = len(node.acts)
            sig = self._avg_sigma(nid, A)
            reach_p = reach0 if p == 0 else reach1
            tot = float(reach_p.sum())
            if tot > 0:
                freq = (reach_p[:, None] * sig).sum(axis=0) / tot
                freq = freq.tolist()
            else:
                freq = [1.0 / A] * A
            rep[node.key] = {'player': p, 'actions': list(node.acts),
                             'freq': freq}
            for ai in range(A):
                cr_p = reach_p * sig[:, ai]
                if p == 0:
                    rec(node.children[ai], cr_p, reach1)
                else:
                    rec(node.children[ai], reach0, cr_p)

        rec(self.root_id, self.r0.copy(), self.r1.copy())
        return rep

    # -- one holding's average strategy at every node it reaches -------------
    def me_strategy(self, me_idx: int, action_label: dict) -> Dict[str, dict]:
        """Average strategy of a SINGLE holding me_idx at every betting node
        (the per-holding analog of strategy_report; mirrors solve_range's
        _me_strategy_exact but over the flattened tree). Keys: curSeq or
        '(root)'; freqs are rounded to 4 places to match the public shape."""
        rep: Dict[str, dict] = {}
        for nid, node in enumerate(self.nodes):
            if node.is_leaf:
                continue
            A = len(node.acts)
            row = self._avg_sigma(nid, A)[me_idx]
            rep[node.key or '(root)'] = {
                'who': 'me' if node.player == 0 else 'opp',
                'actions': [action_label.get(a, a) for a in node.acts],
                'freq': [round(float(f), 4) for f in row],
            }
        return rep


def resolve_subgame_fast(pbs, iters: int = 1000,
                         depth_limit: Optional[int] = None,
                         leaf_value_fn: Optional[Callable] = None,
                         holdings: Optional[List[tuple]] = None,
                         share_matrix=None,
                         game: Optional[GameSpec] = None) -> dict:
    """NumPy-vectorized twin of resolve.resolve_subgame (same signature/returns).

    Numerically equivalent to the pure-Python reference within tight tolerance
    (value 1e-6, action freqs 1e-3, exploitability 1e-4) — only the float
    summation order differs (NumPy pairwise vs Python left-fold).

    Delegates the one case it does not vectorize — the exact 6th->7th recursion
    (no leaf_value_fn, no depth_limit, on 6th street) — to resolve_subgame, so it
    is a safe drop-in for ANY input resolve_subgame accepts.
    """
    street = pbs.street
    st0 = street - 3
    # Exact 6th->7th recursion (nests a full 7th solve per deal leaf): keep on
    # the reference. Everything else (7th showdown, folds, net-leaf deals) is
    # vectorized here.
    if (st0 == 3 and leaf_value_fn is None and depth_limit is None
            and share_matrix is None):
        return resolve_subgame(pbs, iters=iters, depth_limit=depth_limit,
                               leaf_value_fn=leaf_value_fn, holdings=holdings,
                               share_matrix=share_matrix, game=game)
    R = _FastResolver(street, pbs.up, pbs.dead, float(pbs.pot),
                      list(pbs.ranges[0]), list(pbs.ranges[1]),
                      leaf_value_fn, iters, depth_limit, holdings=holdings,
                      share_matrix=share_matrix, game=game)
    cfv0, cfv1 = R.solve()
    out = {
        'strategy': R.strategy_report(),
        'cfv': [cfv0.tolist(), cfv1.tolist()],
        'holdings': R.holdings,
        'pot': R.root_betting['contrib'][0] + R.root_betting['contrib'][1],
        'value': [float(np.dot(R.r0, cfv0)), float(np.dot(R.r1, cfv1))],
        'iters': iters,
    }
    if R.st0 == 4:
        out['exploitability'] = R.exploitability()
    return out


# ── self-test: equivalence vs the pure-Python reference + a timing table ─────
def _tiny_board(up0, up1, live):
    from pbs import RANKS, SUITS
    used = set(up0) | set(up1) | set(live)
    dead = [c for c in (r + s for r in RANKS for s in SUITS) if c not in used]
    return up0, up1, dead


def _uniform(n):
    return [1.0 / n] * n if n else []


def _max_dev(res_a, res_b):
    """Max deviation between two resolve dicts: value, per-node freqs, exploit."""
    dv = max(abs(res_a['value'][0] - res_b['value'][0]),
             abs(res_a['value'][1] - res_b['value'][1]))
    df = 0.0
    keys = set(res_a['strategy']) | set(res_b['strategy'])
    for k in keys:
        fa = res_a['strategy'][k]['freq']
        fb = res_b['strategy'][k]['freq']
        for x, y in zip(fa, fb):
            df = max(df, abs(x - y))
    de = abs(res_a.get('exploitability', 0.0) - res_b.get('exploitability', 0.0))
    return dv, df, de


if __name__ == "__main__":
    import time
    import random
    from pbs import PBS, RANKS, SUITS, enumerate_holdings
    from razz_game import RAZZ

    up0 = ['As', '4s', '5d', '7c']
    up1 = ['Kh', 'Qd', 'Jc', '9h']

    # A battery of equivalence spots: stud8 + razz; uniform, narrow, ASYMMETRIC.
    print("equivalence (fast vs pure-Python reference):")
    max_dv = max_df = max_de = 0.0

    def shrunk(live):
        return _tiny_board(up0, up1, live)

    rr = random.Random(7)
    specs = []
    # (label, game, live pool, range-builder)
    live6 = ['2c', '3d', '6h', '8s', 'Tc', 'Kd']
    live7 = ['2c', '3d', '6h', '8s', 'Tc', 'Kd', '9d']

    for gname, game in (('stud8', None), ('razz', RAZZ)):
        u0, u1, dead = shrunk(live6)
        H = len(enumerate_holdings(u0 + u1 + dead, 3))
        # uniform vs uniform
        specs.append((f"{gname} uniform   H={H}", game, u0, u1, dead,
                      _uniform(H), _uniform(H)))
        # asymmetric random reaches (both seats different dirichlet-ish weights)
        a0 = [rr.random() ** 2 for _ in range(H)]
        a1 = [rr.random() ** 3 for _ in range(H)]
        s0, s1 = sum(a0), sum(a1)
        a0 = [x / s0 for x in a0]
        a1 = [x / s1 for x in a1]
        specs.append((f"{gname} asym-rand H={H}", game, u0, u1, dead, a0, a1))
        # narrow: a handful of holdings each, asymmetric supports
        holds = enumerate_holdings(u0 + u1 + dead, 3)
        sup0 = sorted(rr.sample(range(H), 4))
        sup1 = sorted(rr.sample(range(H), 5))
        n0 = [0.0] * H
        n1 = [0.0] * H
        for i in sup0:
            n0[i] = rr.random() + 0.1
        for j in sup1:
            n1[j] = rr.random() + 0.1
        t0, t1 = sum(n0), sum(n1)
        n0 = [x / t0 for x in n0]
        n1 = [x / t1 for x in n1]
        specs.append((f"{gname} narrow    H={H}", game, u0, u1, dead, n0, n1))

    for label, game, u0, u1, dead, r0, r1 in specs:
        pbs = PBS(street=7, up=[u0, u1], dead=dead, pot=20.0, ranges=[r0, r1])
        ref = resolve_subgame(pbs, iters=200, game=game)
        fast = resolve_subgame_fast(pbs, iters=200, game=game)
        dv, df, de = _max_dev(ref, fast)
        max_dv = max(max_dv, dv)
        max_df = max(max_df, df)
        max_de = max(max_de, de)
        ok = dv < 1e-6 and df < 1e-3 and de < 1e-4
        print(f"  {label:24s} dv={dv:.2e} df={df:.2e} de={de:.2e}  "
              f"{'OK' if ok else 'FAIL'}")
        assert ok, (label, dv, df, de)

    print(f"  MAX over battery: value={max_dv:.2e} (<1e-6), "
          f"freq={max_df:.2e} (<1e-3), exploit={max_de:.2e} (<1e-4)")

    # Bucketed share_matrix path also rides the vectorized CFR identically.
    nb = 6
    Msm = [[0.5 + 0.4 * ((i - j) / nb) for j in range(nb)] for i in range(nb)]
    for i in range(nb):
        for j in range(nb):
            Msm[i][j] = min(1.0, max(0.0, Msm[i][j]))
    br0 = _uniform(nb)
    br1 = [0.05, 0.05, 0.1, 0.2, 0.3, 0.3]
    pbs_b = PBS(street=7, up=[up0, up1], dead=[], pot=20.0, ranges=[br0, br1])
    ref_b = resolve_subgame(pbs_b, iters=200, holdings=list(range(nb)),
                            share_matrix=Msm)
    fast_b = resolve_subgame_fast(pbs_b, iters=200, holdings=list(range(nb)),
                                  share_matrix=Msm)
    dv, df, de = _max_dev(ref_b, fast_b)
    print(f"  bucketed share_matrix   dv={dv:.2e} df={df:.2e} de={de:.2e}  "
          f"{'OK' if (dv<1e-6 and df<1e-3 and de<1e-4) else 'FAIL'}")
    assert dv < 1e-6 and df < 1e-3 and de < 1e-4

    # Timing table at H ~ 80, 200, 400, 800 (fast path only; reference shown
    # where it is still tractable). 7th-street uniform stud8 solve, 120 iters.
    print("\ntiming (7th-street stud8 uniform, iters=120):")
    print(f"  {'H':>5}  {'fast(s)':>9}  {'ref(s)':>9}  {'speedup':>8}")
    allcards = [r + s for r in RANKS for s in SUITS]
    pool = [c for c in allcards if c not in set(up0) | set(up1)]
    targets = [(9, 80), (11, 200), (13, 400), (15, 800)]
    for L, approxH in targets:
        live = pool[:L]
        u0, u1, dead = _tiny_board(up0, up1, live)
        H = len(enumerate_holdings(u0 + u1 + dead, 3))
        uni = _uniform(H)
        pbs = PBS(street=7, up=[u0, u1], dead=dead, pot=20.0, ranges=[uni, uni])
        t0 = time.time()
        rf = resolve_subgame_fast(pbs, iters=120)
        tf = time.time() - t0
        tr = float('nan')
        sp = ''
        if H <= 200:                                # reference too slow past this
            t0 = time.time()
            resolve_subgame(pbs, iters=120)
            tr = time.time() - t0
            sp = f"{tr / tf:6.1f}x"
        print(f"  {H:5d}  {tf:9.2f}  {tr:9.2f}  {sp:>8}  "
              f"(v0={rf['value'][0]:+.3f} exploit={rf['exploitability']:.4f})")

    print("\nok: resolve_fast.py self-tests pass (vectorized == pure-Python "
          "reference within tolerance on stud8+razz uniform/asym/narrow; "
          "timing table above)")
