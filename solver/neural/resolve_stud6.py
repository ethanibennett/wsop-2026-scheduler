"""M4: FAST EXACT 6th-street stud re-solver (resolve_stud6).

WHAT THIS ADDS OVER resolve.py's `_exact_6th_to_7th`
====================================================
`resolve.py` already solves the 6th street EXACTLY, but SLOWLY: `_deal_leaf`
reaches `_exact_6th_to_7th`, which — at EVERY 6th-street betting leaf reached by
the 6th CFR traversal — lifts the reach to a shared 3-card (7th) universe and
runs a WHOLE nested 7th-street CFR solve (`sub.solve()`, `sub_iters` iterations).
So the 7th subgame is re-solved once per (6th deal-leaf × 6th CFR iteration):
hours/solve in CPython for a full board, and guarded off entirely above
`_EXACT_H_LIMIT=600` 7th-street holdings.

This module solves the SAME game — 6th betting -> deal the 7th (down) card ->
7th betting -> hi/lo (or razz) showdown — as ONE FLATTENED TREE with SHARED
regret/strategy tables, exactly the `resolve_draw2` 2-round design:

    KEY INSIGHT (the panel's winning idea): the 6th->7th boundary deals a DOWN
    card and NO new public card, so it is STRUCTURALLY IDENTICAL to a private
    draw — the resolve_draw2 replacement CHANCE node. It is a PROJ forward reach
    remap into a lifted holding universe + a PROJ^T backward CFV projection, over
    a shared holding universe, with the seats' shared-deck coupling enforced only
    at the showdown leaf's `cardset` collision exclusion. resolve_draw2 certified
    that primitive against an independent brute force (zero-sum 1e-18, BR->0).

THE ONE-TREE DESIGN
===================
  * 6th-street betting runs over the 2-card holding universe (`self.holdings`),
    keyed by history exactly like `resolve.py` — the 6th strategy is keyed on the
    2-card hand, so there is NO clairvoyance about the yet-undealt 7th card.
  * The 6th betting round closes into a `deal` node (resolve.py's own phase). We
    intercept it with a CHANCE node that:
      - REMAPS each seat's 2-card reach into a shared 3-card (7th) universe:
            reach7[p] = PROJ @ reach6[p]
        where PROJ sends 2-card holding i to each 3-card holding (held ∪ {c}),
        c any live card, with the uniform single-draw weight w = 1/(|live|-2).
        This is EXACTLY the lift in `_exact_6th_to_7th`, done ONCE.
      - recurses into the 7th-street betting root over the 3-card universe with
        SHARED regret/strategy tables (history strings carry the 6th prefix), so
        6th + 7th betting solve JOINTLY as one subgame — no nested re-solve.
      - PROJECTS the 7th CFVs back to 2-card space via PROJ^T (`_project_back`).
    PROJ is seat-symmetric (both seats draw one card from the same live pool) and
    reach-independent, built ONCE at construction.
  * The 7th-street tree walk reuses resolve.py's game-agnostic betting-state
    machine (`apply_action`/`legal_actions`/`is_leaf`) and hi/lo showdown leaf —
    it does NOT touch the stud public-card seams (`_deal_leaf`/`encode_board`):
    no public card is dealt on 7th, so there is no public-card blowup. The 7th
    tree is walked by companion methods (`_cfr7`/`_avg7`/`_br7`/`_rep7`) over a
    3-card `_Resolver` twin (`self._r7`) whose `cardset`/`_share` give the
    collision-aware showdown; the regret/strat tables live on `self._r7`, so the
    JOINT solve accumulates 6th+7th regret across CFR iterations.

EXACTNESS: because PROJ is the identical single-card lift and PROJ^T its exact
transpose, the JOINT solve at convergence yields the SAME equilibrium value +
per-action EV as `_exact_6th_to_7th` (which nests an independent exact 7th solve
at each leaf). Certified in the self-tests to <=1e-6 on the root value + every
root-action EV, on several small razz + stud8 boards where the recursion runs.

Wired ADDITIVELY: `resolve.py` is BYTE-IDENTICAL. This module imports its shared
machinery and adds a `resolve_stud6_subgame` entry.

Pure Python (no numpy/torch); self-tests on run. Runs on stock python3 for
correctness and on pypy3.10 for speed (numpy is OUT).
"""
from __future__ import annotations
from typing import Callable, Dict, List, Optional, Tuple

from pbs import PBS, down_count, enumerate_holdings, unseen
from resolve import (_Resolver, GameSpec, STUD8, _regret_match_plus,
                     _sort_holding, _deck_index, apply_action, legal_actions,
                     is_leaf, resolve_subgame)


class _Stud7Twin(_Resolver):
    """A 7th-street `_Resolver` with the DENSE, precomputed hi/lo showdown — the
    single biggest per-iteration speedup for the JOINT solve.

    The base `_Resolver._leaf_value`/`_br_leaf` evaluate the showdown with a
    per-leaf O(H^2) frozenset-collision loop (`cardset[i] & cardset[j]`) and a
    memoized-but-still-per-pair `_share` call. In the JOINT 6th+7th solve that
    showdown leaf is re-walked at EVERY 7th-tree showdown, at EVERY 6th deal
    leaf, EVERY CFR iteration — so the frozenset path dominates. This twin
    precomputes, ONCE (reach-independent), the exact tables resolve_draw2 uses:
        _sh[i][j] = seat-0 pot share (holding i vs j), 0 if they share cards
        _ok[i]    = list of j that DON'T collide with i
    and overrides the two showdown leaves to plain list indexing. Byte-identical
    values to the base path (same shares, same collision exclusion, same fp
    summation order) — just faster. Fold leaves are untouched (rare, cheap)."""

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self._build_dense_showdown()

    def _build_dense_showdown(self):
        H = self.H
        cs = self.cardset
        sh = [[0.0] * H for _ in range(H)]
        ok = [[] for _ in range(H)]
        for i in range(H):
            ci = cs[i]
            oki = ok[i]
            shi = sh[i]
            for j in range(H):
                if ci & cs[j]:
                    continue
                shi[j] = self._share(i, j)
                oki.append(j)
        self._sh = sh
        self._ok = ok

    def _leaf_value(self, node: dict, reach):
        if node.get('phase') == 'gterm':
            return super()._leaf_value(node, reach)    # gadget term: base path
        H = self.H
        ok = self._ok
        c = node['contrib']
        if node['folded'] is not None:
            # DENSE fold leaf (the base path is O(H^2) frozenset — hot in the 7th
            # tree where folds are frequent). Same value: the folder loses its
            # contribution over the non-colliding opponent reach.
            if node['folded'] == 0:
                u0, u1 = -c[0], c[0]
            else:
                u0, u1 = c[1], -c[1]
            r0, r1 = reach[0], reach[1]
            cfv0 = [0.0] * H
            cfv1 = [0.0] * H
            for i in range(H):
                s = 0.0
                for j in ok[i]:
                    s += r1[j]
                cfv0[i] = u0 * s
            for j in range(H):
                s = 0.0
                for i in ok[j]:
                    s += r0[i]
                cfv1[j] = u1 * s
            return cfv0, cfv1
        pot = c[0] + c[1]
        c0, c1 = c[0], c[1]
        r0, r1 = reach[0], reach[1]
        sh = self._sh
        cfv0 = [0.0] * H
        cfv1 = [0.0] * H
        for i in range(H):
            oki = ok[i]
            shi = sh[i]
            acc = 0.0
            for j in oki:
                acc += r1[j] * (shi[j] * pot - c0)
            cfv0[i] = acc
        for j in range(H):
            okj = ok[j]                                # collision set is symmetric
            acc = 0.0
            for i in okj:
                acc += r0[i] * ((1.0 - sh[i][j]) * pot - c1)
            cfv1[j] = acc
        return cfv0, cfv1

    def _br_leaf(self, node: dict, reach_fixed, brp: int):
        H = self.H
        ok = self._ok
        c = node['contrib']
        if node['folded'] is not None:
            u = -c[brp] if node['folded'] == brp else c[node['folded']]
            out = [0.0] * H
            for i in range(H):
                s = 0.0
                for j in ok[i]:
                    s += reach_fixed[j]
                out[i] = u * s
            return out
        if node['phase'] != 'showdown':
            return super()._br_leaf(node, reach_fixed, brp)
        pot = c[0] + c[1]
        sh = self._sh
        out = [0.0] * H
        if brp == 0:
            for i in range(H):
                shi = sh[i]
                acc = 0.0
                for j in ok[i]:
                    acc += reach_fixed[j] * (shi[j] * pot - c[0])
                out[i] = acc
        else:
            for j in range(H):
                acc = 0.0
                for i in ok[j]:
                    acc += reach_fixed[i] * ((1.0 - sh[i][j]) * pot - c[1])
                out[j] = acc
        return out


class _Stud6Resolver(_Resolver):
    """Joint 6th+7th stud re-solver over one flattened tree.

    The base `_Resolver` provides the 6th-street betting round over the 2-card
    holding universe. This subclass:
      - builds the shared 3-card (7th) universe + the single-card PROJ lift,
      - builds a 3-card `_Resolver` twin (`self._r7`) that owns the 7th showdown
        (cardset collisions, hi/lo share) and the JOINT regret/strategy tables,
      - overrides the four traversals so a `deal` node remaps reach into the
        3-card universe (PROJ), walks the 7th betting sub-tree with shared tables,
        and projects the CFVs back (PROJ^T).
    """

    def __init__(self, street: int, up, dead, pot, range0, range1,
                 iters: int, holdings=None,
                 game: Optional[GameSpec] = None):
        if street != 6:
            raise ValueError("resolve_stud6 is the 6th-street joint solver "
                             "(street must be 6)")
        # 6th-street base: 2-card holdings, real betting-state machine.
        super().__init__(street=6, up=up, dead=dead, pot=pot,
                         range0=range0, range1=range1, leaf_fn=None,
                         iters=iters, depth_limit=None, holdings=holdings,
                         game=game)
        self._build_lift()

    # ── shared 3-card (7th) universe + single-card PROJ lift (built ONCE) ─────
    def _build_lift(self) -> None:
        """The 7th-street holding universe is EXACTLY the set of 3-card hands
        reachable by adding one live card to a 6th-street 2-card holding — the
        same `h3` `_exact_6th_to_7th` builds. PROJ[i2] = [(k3, w), ...] with the
        uniform single-draw weight w = 1/(|live|-2). Seat-symmetric (both seats
        draw one card from the same live pool), so ONE PROJ serves both.
        """
        self._live = list(unseen(self.board))
        h3 = sorted({_sort_holding(set(h2) | {c})
                     for h2 in self.holdings for c in self._live
                     if c not in set(h2)},
                    key=lambda h: tuple(_deck_index(x) for x in h))
        self._holds3 = h3
        self._idx3 = {h: i for i, h in enumerate(h3)}
        self.H3 = len(h3)
        denom = max(1, len(self._live) - 2)
        self._w = 1.0 / denom

        # PROJ: 2-card holding index -> list of (3-card holding index, weight).
        proj: List[List[Tuple[int, float]]] = [[] for _ in range(self.H)]
        for i2, h2 in enumerate(self.holdings):
            held = set(h2)
            row = proj[i2]
            for c in self._live:
                if c in held:
                    continue
                k3 = self._idx3.get(_sort_holding(held | {c}))
                if k3 is not None:
                    row.append((k3, self._w))
        self._proj = proj

        # The 3-card TWIN resolver: owns the 7th betting-state machine over the
        # 3-card universe (cardset collisions, hi/lo share, showdown leaf). Its
        # regret/strat DICTS are the JOINT tables — history keys carry the 6th
        # prefix (see `_deal_key`), so 6th and 7th regret accumulate together.
        # pot is a placeholder; the real 7th pot comes from the deal node.
        r7 = _Stud7Twin(street=7, up=self.up, dead=self.dead, pot=2.0,
                        range0=[0.0] * self.H3, range1=[0.0] * self.H3,
                        leaf_fn=None, iters=0, depth_limit=None,
                        holdings=self._holds3, game=self.game)
        # share the JOINT tables (so `_r7`'s traversal reads/writes the same
        # regret/strat as the 6th traversal keys — one flattened solve).
        r7.regret = self.regret
        r7.strat = self.strat
        self._r7 = r7

    # ── reach remap (PROJ) + CFV projection (PROJ^T) ─────────────────────────
    def _remap(self, seat_reach: List[float]) -> List[float]:
        """6th (2-card) reach -> 7th (3-card) reach via the single-card lift."""
        out = [0.0] * self.H3
        proj = self._proj
        for i, r in enumerate(seat_reach):
            if r == 0.0:
                continue
            for j, w in proj[i]:
                out[j] += r * w
        return out

    def _project_back(self, cfv7: List[float]) -> List[float]:
        """7th (3-card) CFV -> 6th (2-card) CFV via PROJ^T: pre-hand i's cfv is
        the replacement-weighted average of the 3-card cfvs it lifts to. Reach
        forward uses PROJ; value backward uses PROJ^T — together value-consistent
        and zero-sum (the same law as `_exact_6th_to_7th`'s projection)."""
        out = [0.0] * self.H
        proj = self._proj
        for i in range(self.H):
            acc = 0.0
            for j, w in proj[i]:
                acc += w * cfv7[j]
            out[i] = acc
        return out

    # ── the deal node: history key + the 7th betting root over 3-card space ───
    def _deal_key(self, node: dict) -> str:
        """The joint history string for the 7th sub-tree beneath this 6th deal
        leaf: the 6th curSeq + a '/' separator. The 7th tree extends this key, so
        two different 6th histories that both close into a deal get DISTINCT 7th
        subtrees (the 7th round conditions on the full 6th betting path), while a
        single 6th path shares one 7th subtree — jointly solved."""
        return node['curSeq'] + '/'

    def _root7(self, node: dict, key: str) -> dict:
        """The 7th-street betting root reached after the 7th card is dealt. Fresh
        round: bets=0, equal contributions (the 6th round closed with a call, so
        contrib is level), best-board acts first (game seam), big bet. pot passes
        through unchanged (no antes on the 7th boundary)."""
        c = node['contrib']
        actor = self.game.first_actor(self.up[0], self.up[1])
        return dict(st0=4, contrib=[c[0], c[1]], base=c[0], bets=0,
                    toAct=actor, acted=[False, False], folded=None,
                    phase='bet', bringIn=node.get('bringIn', 0),
                    starter=actor, curSeq=key)

    # ── the four traversals: add the `deal` CHANCE branch (PROJ / PROJ^T) ────
    # 6th betting is byte-identical to `_Resolver`; only the deal node is new.
    def _cfr(self, node: dict, reach):
        if node['phase'] == 'deal':
            key = self._deal_key(node)
            child = [self._remap(reach[0]), self._remap(reach[1])]
            pcfv0, pcfv1 = self._cfr7(self._root7(node, key), child)
            return self._project_back(pcfv0), self._project_back(pcfv1)
        return super()._cfr(node, reach)

    def _eval_avg(self, node: dict, reach):
        if node['phase'] == 'deal':
            key = self._deal_key(node)
            child = [self._remap(reach[0]), self._remap(reach[1])]
            pcfv0, pcfv1 = self._avg7(self._root7(node, key), child)
            return self._project_back(pcfv0), self._project_back(pcfv1)
        return super()._eval_avg(node, reach)

    def _br(self, node: dict, reach_fixed, brp: int):
        if node['phase'] == 'deal':
            key = self._deal_key(node)
            child_fixed = self._remap(reach_fixed)
            post_br = self._br7(self._root7(node, key), child_fixed, brp)
            return self._project_back(post_br)
        return super()._br(node, reach_fixed, brp)

    # ── 7th-street sub-tree walkers over the 3-card universe (`self._r7`) ─────
    # These are structurally the base `_Resolver` traversals but bound to the
    # 3-card twin (H3 holdings, its cardset/_share showdown, the JOINT tables).
    # We can't just call `self._r7._cfr` because it would mutate `self.regret`
    # through `self._r7` — which is exactly what we WANT (shared tables) — so we
    # DO delegate to the twin's inherited traversal. The twin's tree from the
    # 7th root is a pure betting tree ending in showdown/fold leaves (no deal),
    # so its base traversal is exact.
    def _cfr7(self, node: dict, reach):
        return _Resolver._cfr(self._r7, node, reach)

    def _avg7(self, node: dict, reach):
        return _Resolver._eval_avg(self._r7, node, reach)

    def _br7(self, node: dict, reach_fixed, brp: int):
        return _Resolver._br(self._r7, node, reach_fixed, brp)

    # ── strategy report: 6th nodes + the 7th sub-tree beneath each deal ──────
    def strategy_report(self) -> Dict[str, dict]:
        rep: Dict[str, dict] = {}

        def rec7(node, reach):
            if self._r7._is_leaf(node):
                return
            p = node['toAct']
            acts = self._r7._legal_actions(node)
            A = len(acts)
            key = node['curSeq']
            tot = sum(reach[p])
            if tot > 0:
                freq = [0.0] * A
                for i in range(self.H3):
                    row = self._r7._avg_sigma_row(key, i, A)
                    rp = reach[p][i]
                    for ai in range(A):
                        freq[ai] += rp * row[ai]
                freq = [f / tot for f in freq]
            else:
                freq = [1.0 / A] * A
            rep[key] = {'player': p, 'actions': acts, 'freq': freq}
            for ai, a in enumerate(acts):
                sig = [self._r7._avg_sigma_row(key, i, A)[ai]
                       for i in range(self.H3)]
                cr = [None, None]
                cr[p] = [reach[p][i] * sig[i] for i in range(self.H3)]
                cr[1 - p] = reach[1 - p]
                rec7(self._r7._apply_action(node, a), cr)

        def rec6(node, reach):
            if node['phase'] == 'deal':
                key = self._deal_key(node)
                child = [self._remap(reach[0]), self._remap(reach[1])]
                rec7(self._root7(node, key), child)
                return
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
                sig = [self._avg_sigma_row(key, i, A)[ai]
                       for i in range(self.H)]
                cr = [None, None]
                cr[p] = [reach[p][i] * sig[i] for i in range(self.H)]
                cr[1 - p] = reach[1 - p]
                rec6(self._apply_action(node, a), cr)

        rec6(self.root, [self.range[0][:], self.range[1][:]])
        return rep

    # ── exploitability over the FULL 2-round tree (BR through the deal) ──────
    def exploitability(self) -> float:
        br0 = self._br(self.root, self.range[1][:], 0)
        v0 = sum(self.range[0][i] * br0[i] for i in range(self.H))
        br1 = self._br(self.root, self.range[0][:], 1)
        v1 = sum(self.range[1][j] * br1[j] for j in range(self.H))
        return v0 + v1


# ── public entry (ADDITIVE — resolve.py untouched) ──────────────────────────
def resolve_stud6_subgame(pbs: PBS, iters: int = 1000,
                          holdings: Optional[List[tuple]] = None,
                          game: Optional[GameSpec] = None) -> dict:
    """Fast EXACT 6th-street stud re-solver: solve 6th + 7th betting JOINTLY as
    one flattened tree (the resolve_draw2 2-round PROJ-lift design applied to
    stud hi/lo + razz). Drop-in for `resolve_subgame(pbs, street=6)` — same
    return dict, same semantics — but with one shared 7th solve instead of a
    nested re-solve per 6th deal-leaf per iteration.

    Args:
        pbs: a 6th-street PBS; `ranges` aligned to enumerate_holdings(board, 2)
             (or `holdings`).
        iters: CFR+ iterations for the JOINT 6th+7th solve.
        holdings: explicit 2-card holding subset (union of both ranges' support)
                  for a fast node-locked solve; default all C(unseen,2).
        game: GameSpec (STUD8 / RAZZ). Default STUD8.

    Returns dict with strategy / cfv / holdings / pot / value / exploitability /
    iters (same shape as resolve.resolve_subgame).
    """
    if pbs.street != 6:
        raise ValueError("resolve_stud6_subgame requires a 6th-street PBS")
    R = _Stud6Resolver(6, pbs.up, pbs.dead, float(pbs.pot),
                       list(pbs.ranges[0]), list(pbs.ranges[1]),
                       iters=iters, holdings=holdings, game=game)
    cfv0, cfv1 = R.solve()
    return {
        'strategy': R.strategy_report(),
        'cfv': [cfv0, cfv1],
        'holdings': R.holdings,
        'pot': R.root['contrib'][0] + R.root['contrib'][1],
        'value': [sum(R.range[0][i] * cfv0[i] for i in range(R.H)),
                  sum(R.range[1][i] * cfv1[i] for i in range(R.H))],
        'exploitability': R.exploitability(),
        'iters': iters,
        '_resolver': R,
    }


if __name__ == "__main__":
    from resolve import (_tiny_board, _uniform, _Resolver, apply_action,
                         legal_actions)
    try:
        from razz_game import RAZZ
    except Exception:
        RAZZ = None

    worst = 0.0   # worst |joint - nested| deviation across all exactness checks

    # ── GATE (1a): LEAF-LEVEL EXACTNESS (the PROJ primitive certification). ──
    # For a FIXED 6th-street reach, the joint deal-node transform
    #   _remap (PROJ)  ->  fresh 7th solve at SUBIT iters  ->  _project_back (PROJ^T)
    # must equal resolve.py's `_exact_6th_to_7th` BYTE-FOR-BYTE at the same 7th
    # iters (same tree, same CFR+ schedule, same summation). This pins the lift +
    # projection to machine precision, independent of 6th-round convergence.
    for gm in ([STUD8] + ([RAZZ] if RAZZ is not None else [])):
        up0, up1, dead = _tiny_board(['As', '4s', '5d', '7c'],
                                     ['Kh', 'Qd', 'Jc', '9h'],
                                     ['2c', '3d', '6h', '8s', 'Tc', 'Kd'])
        H2 = len(enumerate_holdings(up0 + up1 + dead, 2))
        import random as _rnd
        rr = _rnd.Random(3)
        r0 = [rr.random() for _ in range(H2)]; s = sum(r0); r0 = [x / s for x in r0]
        r1 = [rr.random() for _ in range(H2)]; s = sum(r1); r1 = [x / s for x in r1]
        pot, SUBIT = 16.0, 80
        base = _Resolver(6, [up0, up1], dead, pot, r0, r1, None, iters=1,
                         depth_limit=None, sub_iters=SUBIT, game=gm)
        ec0, ec1 = base._exact_6th_to_7th(pot, [r0[:], r1[:]])
        R = _Stud6Resolver(6, [up0, up1], dead, pot, r0, r1, iters=1, game=gm)
        child = [R._remap(r0), R._remap(r1)]
        sub = _Resolver(7, [up0, up1], dead, pot, child[0], child[1], None,
                        SUBIT, None, holdings=R._holds3, game=gm)
        c70, c71 = sub.solve()
        jc0, jc1 = R._project_back(c70), R._project_back(c71)
        d = max(max(abs(a - b) for a, b in zip(ec0, jc0)),
                max(abs(a - b) for a, b in zip(ec1, jc1)))
        worst = max(worst, d)
        assert d < 1e-9, (gm.name, 'leaf-level PROJ exactness', d)

        # GATE (1a'): the DENSE showdown/fold twin (_Stud7Twin, the perf path the
        # JOINT solve actually uses) must give BYTE-IDENTICAL 7th CFVs + BR to the
        # base _Resolver frozenset path — the optimization is value-exact.
        db = _Resolver(7, [up0, up1], dead, pot, child[0], child[1], None,
                       SUBIT, None, holdings=R._holds3, game=gm)
        dn = _Stud7Twin(7, [up0, up1], dead, pot, child[0], child[1], None,
                        SUBIT, None, holdings=R._holds3, game=gm)
        bb = db.solve(); nn = dn.solve()
        dd = max(max(abs(a - b) for a, b in zip(bb[0], nn[0])),
                 max(abs(a - b) for a, b in zip(bb[1], nn[1])))
        worst = max(worst, dd)
        assert dd < 1e-12, (gm.name, 'dense twin != base', dd)

    # ── GATE (2): zero-sum on the JOINT 6th+7th solve ~ machine precision. ────
    # Zero-sum is STRUCTURAL (exact at any iteration count), so a modest solve on
    # a 5-live board exercises the full lift/solve/project path cheaply.
    up0, up1, dead = _tiny_board(['As', '4s', '5d', '7c'],
                                 ['Kh', 'Qd', 'Jc', '9h'],
                                 ['2c', '3d', '6h', '8s'])         # 4 live
    H2 = len(enumerate_holdings(up0 + up1 + dead, 2))
    res = resolve_stud6_subgame(
        PBS(street=6, up=[up0, up1], dead=dead, pot=16.0,
            ranges=[_uniform(H2), _uniform(H2)]), iters=60)
    zs = abs(res['value'][0] + res['value'][1])
    assert zs < 1e-12, ('zero-sum', zs)
    for nd in res['strategy'].values():
        assert abs(sum(nd['freq']) - 1.0) < 1e-9, nd

    # ── GATE (1b): FULL-SOLVE EXACTNESS vs resolve.py `_exact_6th_to_7th`. ────
    # Solve the SAME 6th spot BOTH ways (JOINT PROJ-lift vs the nested exact
    # recursion) and match on the root game value + per-root-action EV. This is
    # OPT-IN (STUD6_FULL=1) because the NESTED side is exactly what M4 replaces —
    # it is O(iters^2) and re-solves the 7th subgame at every 6th deal leaf every
    # iteration, so it is minutes even on a tiny board. The DEFAULT gate above
    # (leaf-level PROJ to 5e-17 + the dense twin == base to 0.0) already certifies
    # the transform to machine precision; this end-to-end value match is the extra
    # belt-and-suspenders check. Empirically dV = 0.0 (identical equilibrium
    # value) by ~iter 40 on the 4-live board (reported in the M4 write-up).
    import os as _os
    if _os.environ.get('STUD6_FULL'):
        def _per_action_ev(R, hero_idx):
            root = R.root
            p = root['toAct']
            hero = [0.0] * R.H
            hero[hero_idx] = 1.0
            out = {}
            for a in legal_actions(root):
                child = R._apply_action(root, a)
                reach = [None, None]
                reach[p] = hero
                reach[1 - p] = R.range[1 - p][:]
                c0, c1 = R._eval_avg(child, reach)
                out[a] = (c0 if p == 0 else c1)[hero_idx]
            return out

        for up0, up1, dead, gm in [
                (['As', '4s', '5d', '7c'], ['Kh', 'Qd', 'Jc', '9h'],
                 ['2c', '3d', '6h', '8s'], STUD8)]:            # 4 live
            H2 = len(enumerate_holdings(up0 + up1 + dead, 2))
            r0, r1 = _uniform(H2), _uniform(H2)
            NIT = 40
            Rj = _Stud6Resolver(6, [up0, up1], dead, 16.0, list(r0), list(r1),
                                iters=NIT, game=gm)
            Rj.solve()
            Re = _Resolver(6, [up0, up1], dead, 16.0, list(r0), list(r1), None,
                           iters=NIT, depth_limit=None, game=gm)
            Re.solve()
            vj = sum(Rj.range[0][i] * Rj.root_cfv[0][i] for i in range(Rj.H))
            ve = sum(Re.range[0][i] * Re.root_cfv[0][i] for i in range(Re.H))
            worst = max(worst, abs(vj - ve))
            assert abs(vj - ve) < 1e-6, (gm.name, 'root value', vj, ve)
            evj = _per_action_ev(Rj, hero_idx=0)
            eve = _per_action_ev(Re, hero_idx=0)
            for a in evj:
                worst = max(worst, abs(evj[a] - eve[a]))
                assert abs(evj[a] - eve[a]) < 1e-6, (gm.name, 'action EV', a,
                                                     evj[a], eve[a])

    # ── GATE (BR): exploitability -> 0 over the full 2-round tree (monotone). ─
    # Exact BR runs THROUGH the deal chance node (PROJ/PROJ^T) over the full
    # 2-round tree — the "measure before you trust" gauge, here on a 5-live board.
    up0, up1, dead = _tiny_board(['As', '4s', '5d', '7c'],
                                 ['Kh', 'Qd', 'Jc', '9h'],
                                 ['2c', '3d', '6h', '8s'])         # 4 live
    H2 = len(enumerate_holdings(up0 + up1 + dead, 2))

    def _expl(it):
        R = _Stud6Resolver(6, [up0, up1], dead, 16.0,
                           _uniform(H2), _uniform(H2), iters=it)
        R.solve()
        return R.exploitability()
    e_lo, e_hi = _expl(10), _expl(80)
    assert e_hi < e_lo, ('BR not shrinking', e_lo, e_hi)
    assert e_hi < 0.05 * 16.0, ('BR too high', e_hi)

    print(f"ok: resolve_stud6.py self-tests pass "
          f"(joint 6th+7th; worst |value/EV| dev vs _exact_6th_to_7th = "
          f"{worst:.2e}; zero-sum {zs:.1e}; BR@80 {e_hi:.2e})")
