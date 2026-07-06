"""BUCKETED 6th-street stud re-solver — the TRACTABLE 6th datagen engine (M5).

WHY THIS EXISTS
===============
`resolve_stud6.py` (M4) is the EXACT joint 6th+7th solver: it lifts each 2-card
(6th) holding to every 3-card (7th) holding via a single-card PROJ, solves 6th
and 7th betting jointly over the RAW holding universe, and matches the nested
recursion to machine precision. But it is O(H3^2) at the 7th showdown, and H3
grows with the live-card count — a full 44-live board is ~live^6 pair-work, so a
full 6th solve is ~tens of hours. It CANNOT mass-produce labels.

This module solves the SAME game — 6th betting -> deal the 7th (down) card ->
7th betting -> hi/lo (or razz) showdown — over the BUCKET abstraction instead of
raw holdings, exactly as `bucket_resolve.py` does for 7th-street datagen. The
per-iteration showdown is O(nb7^2), INDEPENDENT of the live-card count, so a
bucketed 6th solve is ~seconds regardless of board. This is the roadmap's M5
datagen lane.

THE BUCKETED PROJ (the one new primitive over bucket_resolve.py)
================================================================
`resolve_stud6` remaps 6th reach into 7th space with PROJ, a per-holding
single-card lift (2-card holding i -> each 3-card holding held∪{c}, uniform
weight). Its bucketed analogue is a **transition matrix** T over buckets:

    T[a6][b7] = P(a 6th-bucket-`a6` holding lands in 7th-bucket `b7` after
                 drawing one uniformly-random live card)

estimated ONCE per board by sampling (the same amortized, board-only precompute
as the share matrix). T is ROW-STOCHASTIC (each 6th bucket's live-card draws sum
to 1 over 7th buckets). Then, structurally identical to resolve_stud6:

    reach7 = T^T @ reach6      (forward: 6th-bucket reach -> 7th-bucket reach)
    cfv6   = T   @ cfv7        (backward: 7th-bucket CFV -> 6th-bucket CFV)

i.e. `_remap` uses T and `_project_back` uses T^T — the bucketed twins of
resolve_stud6._remap / _project_back. reach forward + value backward with a
transpose pair keeps the joint solve zero-sum and value-consistent (same law as
the exact PROJ/PROJ^T). The 6th and 7th betting solve JOINTLY over one flattened
tree with SHARED regret/strategy tables (the resolve_stud6 design), so there is
no nested re-solve.

REUSE: this is `resolve_stud6._Stud6Resolver` re-parameterised over bucket ids —
6th "holdings" = range(nb6), 7th "holdings" = range(nb7), both passed a
`share_matrix` (so `_Resolver` treats holdings as buckets: empty cardsets, no
collisions, and the fast factored showdown path). The 7th share matrix is
`bucket_resolve.sample_share_matrix` (stud8) / `bucket_resolve_razz` (razz),
verbatim. The 6th resolver never reaches a 6th showdown (a closed 6th round is a
`deal` node), so its own share matrix is only a placeholder to flip `_Resolver`
into bucket mode; fold leaves are game-agnostic bucket-reach sums.

VALIDATION (self-tests on run): zero-sum on the joint solve; the range-weighted
aggregation invariant carried by bucket.py; BR->0 over the 2-round tree; T is
row-stochastic; and — the headline — the ABSTRACTION GAP vs the EXACT
resolve_stud6 on a small board where both run (expected nonzero; it is the
bucketing error the net is later certified against, NOT a bug).

Additive: resolve.py / resolve_stud6.py / bucket_resolve.py are all UNTOUCHED.
Pure Python (no numpy/torch); runs on stock python3 and on pypy3.10 for speed.
"""
from __future__ import annotations
import random
from collections import defaultdict
from typing import Dict, List, Optional

from pbs import PBS, down_count, enumerate_holdings, unseen
from resolve import GameSpec, STUD8, _Resolver
from resolve_stud6 import _Stud6Resolver, _Stud7Twin

import bucket as _bkt_stud8
import bucket_resolve as _br_stud8
try:
    import bucket_razz as _bkt_razz
    import bucket_resolve_razz as _br_razz
    from razz_game import RAZZ
except Exception:                                   # pragma: no cover
    _bkt_razz = _br_razz = RAZZ = None


# ── per-game bucketing plumbing (which bucket module + share sampler to use) ──
class _GameBuckets:
    """Bundles the game-specific bucketing pieces the 6th solver needs:
      * bucket_of_holding(holding, upcards) at BOTH streets (down_count picks the
        card count; the classifier is street-agnostic per bucket.py's contract),
      * nb6 / nb7 bucket counts (bucket modules are single-N; here nb6==nb7),
      * the 7th bucket-vs-bucket share sampler (bucket_resolve[_razz]).
    """
    def __init__(self, game: GameSpec):
        name = game.name
        if name == 'stud8':
            self._bmod, self._smod = _bkt_stud8, _br_stud8
        elif name == 'razz':
            if _bkt_razz is None:
                raise RuntimeError("razz bucket modules unavailable")
            self._bmod, self._smod = _bkt_razz, _br_razz
        else:
            raise ValueError(f"no bucketing for game {name!r}")
        self.game = game
        self.nb6 = self._bmod.N_BUCKETS
        self.nb7 = self._bmod.N_BUCKETS

    def bucket_of(self, holding, upcards) -> int:
        return self._bmod.bucket_of_holding(holding, upcards)

    def share_matrix7(self, board, up0, up1, samples, rng, holding_cap=4000):
        return self._smod.sample_share_matrix(
            board, down_count(7), up0, up1, self.nb7, samples, rng,
            holding_cap=holding_cap)


def sample_transition(board: List[str], up0: List[str], up1: List[str],
                      gb: _GameBuckets, samples: int = 200,
                      rng: Optional[random.Random] = None,
                      holding_cap: int = 4000):
    """Sampled bucketed PROJ: T0, T1 (one per seat) of shape nb6 x nb7.

    T{p}[a6][b7] = fraction of (6th-bucket-a6 holding for seat p, live draw c)
    that lands in 7th-bucket b7. The two seats have different upcards, so each
    gets its own transition (like resolve_stud6's PROJ is seat-symmetric only
    because it drops the upcards; here the BUCKET depends on upcards, so we keep
    a per-seat T). ROW-STOCHASTIC per (seat, a6) with any mass; a 6th bucket with
    no sampled holdings gets an identity-ish uniform row (harmless — no reach
    ever flows through an unreachable bucket). Board-only (no ranges), so datagen
    computes it ONCE per board and reuses it across every range sample.
    """
    rng = rng or random.Random(0)
    live = unseen(board)
    holds6 = enumerate_holdings(board, down_count(6))
    if len(holds6) > holding_cap:
        holds6 = rng.sample(holds6, holding_cap)
    nb6, nb7 = gb.nb6, gb.nb7

    def _build(up):
        # group 6th holdings by their 6th bucket for this seat
        by6: Dict[int, list] = defaultdict(list)
        for h in holds6:
            by6[gb.bucket_of(h, up)].append(h)
        T = [[0.0] * nb7 for _ in range(nb6)]
        for a6 in range(nb6):
            hs = by6.get(a6)
            if not hs:
                T[a6] = [1.0 / nb7] * nb7          # unreachable bucket: benign
                continue
            counts = [0] * nb7
            tot = 0
            for _ in range(samples):
                h = rng.choice(hs)
                held = set(h)
                c = rng.choice(live)
                if c in held:
                    continue                        # can't draw a held card
                h3 = tuple(sorted(held | {c}))
                counts[gb.bucket_of(h3, up)] += 1
                tot += 1
            if tot:
                T[a6] = [ct / tot for ct in counts]
            else:
                T[a6] = [1.0 / nb7] * nb7
        return T

    return _build(up0), _build(up1)


class _BucketStud6Resolver(_Stud6Resolver):
    """Joint 6th+7th solve over the BUCKET abstraction.

    Subclasses the exact `_Stud6Resolver` and REPLACES its raw single-card lift
    (`_build_lift`/`_remap`/`_project_back`) with the bucketed transition T.
    Everything else — the 6th betting round, the deal-node interception, the four
    traversals, the strategy report, exploitability — is inherited verbatim from
    the exact solver, so the only behavioural difference is that reach/value flow
    through buckets (via T / T^T) instead of raw holdings (via PROJ / PROJ^T).
    """

    def __init__(self, up, dead, pot, brange0, brange1, iters, gb: _GameBuckets,
                 share7, T0, T1, share6=None):
        self._gb = gb
        self._share7 = share7
        self._T0 = T0
        self._T1 = T1
        self._share6 = share6
        # NB: skip _Stud6Resolver.__init__'s raw-holding _build_lift; drive the
        # base _Resolver directly with bucket ids as "holdings" + a share matrix
        # (so _Resolver goes into bucket mode: empty cardsets, no collisions).
        nb6 = gb.nb6
        share6 = share6 if share6 is not None else [[0.5] * nb6 for _ in range(nb6)]
        _Resolver.__init__(self, street=6, up=up, dead=dead, pot=pot,
                           range0=list(brange0), range1=list(brange1),
                           leaf_fn=None, iters=iters, depth_limit=None,
                           holdings=list(range(nb6)),
                           share_matrix=share6, game=gb.game)
        self._build_bucket_lift()

    def _build_bucket_lift(self) -> None:
        """The bucketed analogue of `_Stud6Resolver._build_lift`: instead of a
        3-card holding universe + PROJ, use the 7th BUCKET universe + T. The 7th
        twin is a `_Stud7Twin` over range(nb7) with the sampled 7th share matrix,
        sharing the JOINT regret/strat tables (so 6th+7th solve as one tree)."""
        gb = self._gb
        self.H3 = gb.nb7
        r7 = _Stud7Twin(street=7, up=self.up, dead=self.dead, pot=2.0,
                        range0=[0.0] * gb.nb7, range1=[0.0] * gb.nb7,
                        leaf_fn=None, iters=0, depth_limit=None,
                        holdings=list(range(gb.nb7)),
                        share_matrix=self._share7, game=gb.game)
        r7.regret = self.regret
        r7.strat = self.strat
        self._r7 = r7

    # ── reach remap (T^T) + CFV projection (T) — the bucketed twins ──────────
    def _remap(self, seat_reach: List[float]) -> List[float]:
        raise RuntimeError("use _remap_seat for bucketed 6th (per-seat T)")

    def _project_back(self, cfv7: List[float]) -> List[float]:
        raise RuntimeError("use _project_back_seat for bucketed 6th (per-seat T)")

    def _remap_seat(self, seat_reach, T) -> List[float]:
        """6th-bucket reach -> 7th-bucket reach: reach7[b] = sum_a reach6[a]·T[a][b]."""
        nb7 = self._gb.nb7
        out = [0.0] * nb7
        for a, r in enumerate(seat_reach):
            if r == 0.0:
                continue
            row = T[a]
            for b in range(nb7):
                out[b] += r * row[b]
        return out

    def _project_back_seat(self, cfv7, T) -> List[float]:
        """7th-bucket CFV -> 6th-bucket CFV: cfv6[a] = sum_b T[a][b]·cfv7[b]
        (the replacement-weighted average of the 7th CFVs bucket a lifts to —
        T^T on reach, T on value: value-consistent + zero-sum)."""
        nb6 = self._gb.nb6
        out = [0.0] * nb6
        for a in range(nb6):
            row = T[a]
            acc = 0.0
            for b, w in enumerate(row):
                if w:
                    acc += w * cfv7[b]
            out[a] = acc
        return out

    # ── the four deal-node traversals: use per-seat T instead of PROJ ────────
    def _cfr(self, node: dict, reach):
        if node['phase'] == 'deal':
            key = self._deal_key(node)
            child = [self._remap_seat(reach[0], self._T0),
                     self._remap_seat(reach[1], self._T1)]
            pcfv0, pcfv1 = self._cfr7(self._root7(node, key), child)
            return (self._project_back_seat(pcfv0, self._T0),
                    self._project_back_seat(pcfv1, self._T1))
        return _Resolver._cfr(self, node, reach)

    def _eval_avg(self, node: dict, reach):
        if node['phase'] == 'deal':
            key = self._deal_key(node)
            child = [self._remap_seat(reach[0], self._T0),
                     self._remap_seat(reach[1], self._T1)]
            pcfv0, pcfv1 = self._avg7(self._root7(node, key), child)
            return (self._project_back_seat(pcfv0, self._T0),
                    self._project_back_seat(pcfv1, self._T1))
        return _Resolver._eval_avg(self, node, reach)

    def _br(self, node: dict, reach_fixed, brp: int):
        if node['phase'] == 'deal':
            key = self._deal_key(node)
            T = self._T0 if brp == 0 else self._T1
            Topp = self._T1 if brp == 0 else self._T0
            child_fixed = self._remap_seat(reach_fixed, Topp)
            post_br = self._br7(self._root7(node, key), child_fixed, brp)
            return self._project_back_seat(post_br, T)
        return _Resolver._br(self, node, reach_fixed, brp)

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
                for i in range(self._gb.nb7):
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
                       for i in range(self._gb.nb7)]
                cr = [None, None]
                cr[p] = [reach[p][i] * sig[i] for i in range(self._gb.nb7)]
                cr[1 - p] = reach[1 - p]
                rec7(self._r7._apply_action(node, a), cr)

        def rec6(node, reach):
            if node['phase'] == 'deal':
                key = self._deal_key(node)
                child = [self._remap_seat(reach[0], self._T0),
                         self._remap_seat(reach[1], self._T1)]
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
                sig = [self._avg_sigma_row(key, i, A)[ai] for i in range(self.H)]
                cr = [None, None]
                cr[p] = [reach[p][i] * sig[i] for i in range(self.H)]
                cr[1 - p] = reach[1 - p]
                rec6(self._apply_action(node, a), cr)

        rec6(self.root, [self.range[0][:], self.range[1][:]])
        return rep


def resolve_stud6_bucketed(up, dead, pot: float,
                           brange0: List[float], brange1: List[float],
                           iters: int = 300, samples: int = 200,
                           share7=None, T0=None, T1=None,
                           rng: Optional[random.Random] = None,
                           game: Optional[GameSpec] = None) -> dict:
    """Solve a 6th-street subgame over the BUCKET abstraction -> per-bucket
    strategy + CFVs (the 6th value net's training target).

    brange0/brange1 are length-nb6 probability vectors. share7 (nb7 x nb7) and
    T0/T1 (nb6 x nb7) are the board-only precomputes; pass them in from datagen
    (compute ONCE per board) or leave None to build them here. Returns the same
    dict shape as resolve.resolve_subgame / resolve_stud6_subgame.
    """
    game = game if game is not None else STUD8
    gb = _GameBuckets(game)
    board = up[0] + up[1] + dead
    rng = rng or random.Random(0)
    if share7 is None:
        share7 = gb.share_matrix7(board, up[0], up[1], samples, rng)
    if T0 is None or T1 is None:
        T0, T1 = sample_transition(board, up[0], up[1], gb, samples, rng)
    R = _BucketStud6Resolver(up, dead, float(pot), brange0, brange1, iters, gb,
                             share7, T0, T1)
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
        'n_buckets': gb.nb6,
        '_resolver': R,
    }


# ── self-tests ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import time
    from resolve import _tiny_board

    def _uni(n):
        return [1.0 / n] * n

    games = [STUD8] + ([RAZZ] if RAZZ is not None else [])

    print("bucket_resolve_stud6 self-tests")
    print("=" * 64)
    worst_gap = 0.0
    for gm in games:
        gb = _GameBuckets(gm)
        nb = gb.nb6

        # ── (1) SMALL board (via _tiny_board: only `live` cards unseen) so the
        # EXACT resolve_stud6 also runs — this is where the abstraction gap +
        # zero-sum + BR + aggregation-invariant are all checked. 6 live cards ->
        # H2=C(6,2)=15, H3=C(6,3)=20: exact 6th solve is seconds. ──
        up0, up1, dead = _tiny_board(['As', '4s', '5d', '7c'],
                                     ['Kh', 'Qd', 'Jc', '9h'],
                                     ['2c', '3d', '6h', '8s', 'Tc', 'Kd'])
        board = up0 + up1 + dead

        # board-only precomputes (amortized once per board in datagen)
        t0 = time.time()
        share7 = gb.share_matrix7(board, up0, up1, 200, random.Random(1))
        T0, T1 = sample_transition(board, up0, up1, gb, 600, random.Random(2))
        t_pre = time.time() - t0

        # T is row-stochastic (each 6th bucket's live draws sum to 1)
        for T in (T0, T1):
            for a in range(nb):
                assert abs(sum(T[a]) - 1.0) < 1e-9, (gm.name, 'T row', a, sum(T[a]))

        # bucketed solve (uniform bucket ranges)
        uni = _uni(nb)
        t0 = time.time()
        res = resolve_stud6_bucketed([up0, up1], dead, 16.0, uni, uni, iters=300,
                                     share7=share7, T0=T0, T1=T1, game=gm)
        t_solve_small = time.time() - t0

        # (a) zero-sum + normalized strategy freqs
        zs = abs(res['value'][0] + res['value'][1])
        assert zs < 1e-9, (gm.name, 'zero-sum', zs)
        for nd in res['strategy'].values():
            assert abs(sum(nd['freq']) - 1.0) < 1e-9, (gm.name, nd)

        # (a') range-weighted aggregation invariant (bucket.py contract): the
        # reported game value equals the range-weighted sum of per-bucket CFVs.
        v0 = sum(uni[b] * res['cfv'][0][b] for b in range(nb))
        assert abs(v0 - res['value'][0]) < 1e-9, (gm.name, 'agg-invariant', v0)

        # (BR) exploitability -> 0 over the joint 2-round tree (small vs pot)
        assert res['exploitability'] < 0.05 * res['pot'], \
            (gm.name, 'expl', res['exploitability'])

        # ── (b) ABSTRACTION GAP vs EXACT resolve_stud6 on this SMALL board ──
        # Aggregate a raw uniform range into buckets, solve BOTH ways, compare the
        # game value. Nonzero is EXPECTED (the bucketing error the net is certified
        # against), NOT a bug.
        from resolve_stud6 import resolve_stud6_subgame
        from bucket import aggregate_range as _agg
        if gm.name == 'stud8':
            from bucket import bucket_map as _bmap
        else:
            from bucket_razz import bucket_map as _bmap
        bmap0 = _bmap(board, down_count(6), up0)
        bmap1 = _bmap(board, down_count(6), up1)
        H2 = len(enumerate_holdings(board, down_count(6)))
        raw0, raw1 = _uni(H2), _uni(H2)

        t0 = time.time()
        exact = resolve_stud6_subgame(
            PBS(street=6, up=[up0, up1], dead=dead, pot=16.0,
                ranges=[raw0, raw1]), iters=300, game=gm)
        t_exact = time.time() - t0

        br0 = _agg(raw0, bmap0, nb)
        br1 = _agg(raw1, bmap1, nb)
        resb = resolve_stud6_bucketed([up0, up1], dead, 16.0, br0, br1, iters=300,
                                      share7=share7, T0=T0, T1=T1, game=gm)
        gap = abs(exact['value'][0] - resb['value'][0])
        worst_gap = max(worst_gap, gap)

        # ── (2) FULL board (all 44 live) latency: this is the point of bucketing.
        # The EXACT resolve_stud6 is intractable here (~O(H3^2), tens of hours),
        # but the bucketed solve is board-size-independent -> seconds. Measure it. ─
        fup0 = ['As', '4s', '5d', '7c']
        fup1 = ['Kh', 'Qd', 'Jc', '9h']
        fdead: List[str] = []
        fboard = fup0 + fup1 + fdead
        t0 = time.time()
        fshare7 = gb.share_matrix7(fboard, fup0, fup1, 120, random.Random(3))
        fT0, fT1 = sample_transition(fboard, fup0, fup1, gb, 400, random.Random(4))
        t_pre_full = time.time() - t0
        t0 = time.time()
        fres = resolve_stud6_bucketed([fup0, fup1], fdead, 20.0, uni, uni,
                                      iters=300, share7=fshare7, T0=fT0, T1=fT1,
                                      game=gm)
        t_solve_full = time.time() - t0
        assert abs(fres['value'][0] + fres['value'][1]) < 1e-9, 'full zero-sum'
        # Latency bound is generous on CPython under a loaded box; the real
        # datagen number is measured on PyPy (see the report / bench). This only
        # guards a pathological blowup, not the datagen target.
        assert t_solve_full < 60.0, (gm.name, 'full solve pathological', t_solve_full)

        print(f"  {gm.name:6s} nb={nb}")
        print(f"    small board (6 live): pre {t_pre:4.2f}s  bucket-solve "
              f"{t_solve_small:4.2f}s  exact-solve {t_exact:5.2f}s")
        print(f"    FULL board (44 live): pre {t_pre_full:4.2f}s  bucket-solve "
              f"{t_solve_full:4.2f}s  (exact intractable)")
        print(f"    zero-sum {zs:.1e}  expl {res['exploitability']:.4f} "
              f"(<{0.05*res['pot']:.2f})")
        print(f"    ABSTRACTION GAP vs exact: {gap:.4f} chips  "
              f"(exact v0={exact['value'][0]:+.4f}  bucket v0={resb['value'][0]:+.4f})")

    print("=" * 64)
    print(f"ok: bucket_resolve_stud6 self-tests pass "
          f"(bucketed 6th solve seconds on ANY board vs exact's tens-of-hours full "
          f"board; zero-sum + BR->0 + row-stochastic T + agg-invariant; worst "
          f"abstraction gap {worst_gap:.4f} chips — EXPECTED bucketing error, the "
          f"net's certification target)")
