"""Adapter: a trained value net <-> resolve.py's `leaf_value_fn` contract.

resolve.resolve_subgame values a street boundary by calling
    leaf_value_fn(street, up, dead, pot, holdings, reach0, reach1) -> (cfv0, cfv1)
with CFVs in CHIPS aligned to `holdings`, where street/up/dead/reach* describe
the PRE-deal boundary (the current street's public state at the node that
closed the betting). The DeepStack net instead predicts per-BUCKET
counterfactual values as a FRACTION OF THE POT for a POST-deal street-root PBS:
datagen.py trains it exclusively on complete street-(s+1) boards with
normalized (sum-1) ranges. This module bridges the two.

M1a DEAL-LEAF DISTRIBUTION FIX (2026-07-02). The original glue evaluated the
net directly on the PRE-deal boundary: the current street's board (missing the
next upcards), the current street index in the one-hot (an input bit the
street-(s+1) net never saw set in training -> untrained weights), reaches
without next-card removal, and unnormalized reach vectors. That is a public
state shape the net never trained on; every net-leaf validation number
produced through it is VOID (see README.md). The fixed glue queries the net
only on post-deal street-(s+1) PBSs, matching the training distribution:

  * UP-card boundaries (3rd->4th, 4th->5th, 5th->6th): the next street deals a
    public upcard to EACH player. We take M joint ordered deals (c0, c1) from
    the unseen pool — full enumeration when the pool is small, else M sampled
    without replacement — and for each deal build the post-deal PBS: upcards
    extended, street s+1 in the one-hot, both reach vectors zeroed on holdings
    containing a dealt card (card removal) and then NORMALIZED (training
    ranges sum to 1). The net's fraction-of-pot values are scaled back to
    chips by pot x the OPPONENT'S post-removal reach mass (CFVs are linear in
    the opponent's reach and invariant to one's own). Per-holding CFVs average
    the compatible deals with the FIXED weight 1/(M * p_compat), where
    p_compat = (N-2)(N-3)/(N(N-1)) is the expected compatible fraction for a
    2-card holding: this keeps the leaf EXACTLY zero-sum (a realized-count
    divisor would not) and is unbiased for the conditional expectation over
    deals given the holding; with full enumeration it is exact. The deals are
    drawn ONCE per public boundary with a seed derived from the PBS (common
    random numbers): every CFR iteration sees the same deals, so sampling
    noise cancels in regret differences and results are deterministic.

  * DOWN-card boundary (6th->7th, stud games): the 7th card is dealt face
    DOWN, so the public board does not change — there is nothing to sample
    publicly. The pre-fix mismatch here was (a) the street index (the net
    trained at street=7; the old glue passed 6) and (b) the holdings (training
    ranges/targets are bucketed 3-card 7th-street holdings; the old glue
    bucketed 2-card 6th-street holdings, i.e. pre-draw strengths). Fix: lift
    each 2-card reach across the private draw exactly as resolve.py's
    _exact_6th_to_7th does (weight 1/(N-2) per live card, mass-preserving),
    bucket the lifted 3-card holdings, query the net ONCE at street=7 on the
    SAME board, and project the per-bucket values back through the same lift.
    One call, no sampling — all private draws share one public PBS.

`mode='pre_deal'` preserves the original (buggy) glue verbatim, ONLY so the
M1a verification gate (validate.py --ab-gate) can A/B old-vs-fixed against the
exact 6th->7th recursion. Never ship it.

The bucketing/lift/scatter glue is pure Python and self-tested here with fake
predictors; `torch_predict_fn` wires a real CounterfactualValueNet (PyTorch,
imported lazily — this module stays importable without torch).
"""
from __future__ import annotations
import hashlib
import random
from typing import Callable, List, Tuple

from pbs import PBS, encode_pbs, down_count, unseen
import bucket as B

DEAL_SAMPLES = 32       # M: joint next-street upcard deals per boundary (CRN)
_CACHE_MAX = 8          # boards' worth of static deal/lift tables kept


def _stable_seed(street: int, up, dead) -> int:
    """Deterministic per-PBS seed (Python's hash() is salted per process)."""
    key = f"{street}|{','.join(up[0])}|{','.join(up[1])}|{','.join(dead)}"
    return int.from_bytes(hashlib.sha1(key.encode()).digest()[:8], 'big')


def _normalize(v: List[float]) -> Tuple[List[float], float]:
    """(normalized copy, original mass). Zero mass -> uniform fallback input
    (the net only trained on sum-1 ranges); the caller scales that side's
    OPPONENT CFVs by the zero mass, so the fallback never leaks value."""
    s = sum(v)
    if s > 1e-12:
        return [x / s for x in v], s
    n = len(v)
    return ([1.0 / n] * n if n else []), 0.0


def _zs_correct(v0: List[float], v1: List[float],
                r0: List[float], r1: List[float]):
    """DeepStack zero-sum correction on fraction-of-pot values: subtract the
    shared range-weighted imbalance so <r0,v0> + <r1,v1> == 0 exactly. (The
    net has an internal ZeroSumLayer; this is belt-and-braces and also makes
    fake test predictors zero-sum.)"""
    s = sum(r0) + sum(r1)
    if s <= 1e-12:
        return v0, v1
    imb = (sum(r0[b] * v0[b] for b in range(len(v0)))
           + sum(r1[b] * v1[b] for b in range(len(v1)))) / s
    return [x - imb for x in v0], [x - imb for x in v1]


def make_leaf_value_fn(predict_fn: Callable, n_buckets: int = None,
                       bucketing=B, deal_samples: int = DEAL_SAMPLES,
                       mode: str = 'post_deal') -> Callable:
    """Wrap a per-bucket, fraction-of-pot predictor into a resolve leaf_value_fn.

    predict_fn(board, extra, brange0, brange1) -> (v0, v1), each a length
    `n_buckets` list of fraction-of-pot counterfactual values for ONE post-deal
    PBS. If predict_fn has a `.batch(boards, extras, r0s, r1s)` attribute
    (torch_predict_fn attaches one) the up-card path evaluates all M sampled
    deals in a single batched call. `bucketing` is the bucket module: `bucket`
    for Stud 8 (default), `bucket_razz` for razz.

    mode='post_deal' (default) is the M1a fixed leaf documented above.
    mode='pre_deal' is the pre-2026-07-02 buggy glue, kept verbatim ONLY for
    the A/B verification gate.
    """
    if n_buckets is None:
        n_buckets = bucketing.N_BUCKETS
    if mode == 'pre_deal':
        return _make_pre_deal_leaf(predict_fn, n_buckets, bucketing)
    if mode != 'post_deal':
        raise ValueError(f"unknown mode {mode!r} (post_deal | pre_deal)")

    cache: dict = {}

    def _tables(street, up, dead, holdings):
        """Static per-boundary tables (deal list + bucket ids / lift counts).
        Keyed on the full public state + holding list; reaches vary per call."""
        key = (street, tuple(up[0]), tuple(up[1]), tuple(dead),
               tuple(holdings))
        tab = cache.get(key)
        if tab is None:
            if len(cache) >= _CACHE_MAX:
                cache.clear()
            board = list(up[0]) + list(up[1]) + list(dead)
            pool = unseen(board)
            if street >= 6:
                tab = _build_down_tables(pool, up, holdings)
            else:
                tab = _build_up_tables(street, pool, up, dead, holdings)
            cache[key] = tab
        return tab

    def _build_down_tables(pool, up, holdings):
        """6th->7th lift: counts[i][h][b] = #live cards c whose lifted 3-card
        holding (h + c) falls in bucket b for player i. Both the lifted bucket
        range and the CFV projection reduce to this one count matrix."""
        H = len(holdings)
        denom = max(1, len(pool) - (len(holdings[0]) if H else 0))
        counts = [[[0] * n_buckets for _ in range(H)] for _ in range(2)]
        for hi, h in enumerate(holdings):
            held = set(h)
            h3 = list(h) + [None]
            for c in pool:
                if c in held:
                    continue
                h3[-1] = c
                counts[0][hi][bucketing.bucket_of_holding(h3, up[0])] += 1
                counts[1][hi][bucketing.bucket_of_holding(h3, up[1])] += 1
        return ('down', denom, counts)

    def _build_up_tables(street, pool, up, dead, holdings):
        """Up-card deals: pick the CRN deal set once, and per deal precompute
        the compatible-holding index list + each player's post-deal bucket id."""
        N = len(pool)
        k = len(holdings[0]) if holdings else down_count(street)
        n_pairs = N * (N - 1)
        n_compat = max(0, (N - k) * (N - k - 1))
        pairs = [(a, b) for a in range(N) for b in range(N) if a != b]
        if n_pairs > deal_samples:
            rng = random.Random(_stable_seed(street, up, dead))
            pairs = [pairs[t] for t in
                     sorted(rng.sample(range(n_pairs), deal_samples))]
        deals = []
        for a, b in pairs:
            c0, c1 = pool[a], pool[b]
            up_d = [list(up[0]) + [c0], list(up[1]) + [c1]]
            ok_idx, b0s, b1s = [], [], []
            for hi, h in enumerate(holdings):
                if c0 in h or c1 in h:          # card removal: h impossible
                    continue
                ok_idx.append(hi)
                b0s.append(bucketing.bucket_of_holding(h, up_d[0]))
                b1s.append(bucketing.bucket_of_holding(h, up_d[1]))
            deals.append((up_d, ok_idx, b0s, b1s))
        # fixed per-deal weight (see module docstring): exact zero-sum +
        # unbiased conditional mean; equals 1/n_compat under full enumeration.
        w = (1.0 / (len(deals) * (n_compat / n_pairs))
             if deals and n_compat > 0 and n_pairs > 0 else 0.0)
        return ('up', w, deals)

    def _predict_many(boards, extras, r0s, r1s):
        batch = getattr(predict_fn, 'batch', None)
        if batch is not None:
            return batch(boards, extras, r0s, r1s)
        v0s, v1s = [], []
        for i in range(len(boards)):
            v0, v1 = predict_fn(boards[i], extras[i], r0s[i], r1s[i])
            v0s.append(v0)
            v1s.append(v1)
        return v0s, v1s

    def leaf(street, up, dead, pot, holdings, reach0, reach1):
        if not (3 <= street <= 6):
            raise ValueError(f"deal leaf at street {street}? boundaries are "
                             "3->4 .. 6->7")
        tab = _tables(street, up, dead, holdings)
        H = len(holdings)

        if tab[0] == 'down':
            # ── 6th->7th: private card. One net call at street=7, same board.
            _, denom, counts = tab
            w = 1.0 / denom
            br0 = [0.0] * n_buckets
            br1 = [0.0] * n_buckets
            for hi in range(H):
                m0, m1 = reach0[hi] * w, reach1[hi] * w
                c0r, c1r = counts[0][hi], counts[1][hi]
                for b in range(n_buckets):
                    br0[b] += m0 * c0r[b]
                    br1[b] += m1 * c1r[b]
            br0n, s0 = _normalize(br0)
            br1n, s1 = _normalize(br1)
            feats = encode_pbs(PBS(street=street + 1, up=up, dead=dead,
                                   pot=pot, ranges=[br0n, br1n]))
            v0, v1 = predict_fn(feats[0], feats[1], br0n, br1n)
            v0, v1 = _zs_correct(v0, v1, br0n, br1n)
            a0, a1 = s1 * pot * w, s0 * pot * w      # chips; opp-mass scaling
            cfv0 = [0.0] * H
            cfv1 = [0.0] * H
            for hi in range(H):
                c0r, c1r = counts[0][hi], counts[1][hi]
                cfv0[hi] = a0 * sum(c0r[b] * v0[b] for b in range(n_buckets))
                cfv1[hi] = a1 * sum(c1r[b] * v1[b] for b in range(n_buckets))
            return cfv0, cfv1

        # ── 3rd/4th/5th -> next street: public upcards. M post-deal PBSs.
        _, w, deals = tab
        cfv0 = [0.0] * H
        cfv1 = [0.0] * H
        if w == 0.0 or not deals:
            return cfv0, cfv1
        boards, extras, r0s, r1s, metas = [], [], [], [], []
        for up_d, ok_idx, b0s, b1s in deals:
            br0 = [0.0] * n_buckets
            br1 = [0.0] * n_buckets
            for t, hi in enumerate(ok_idx):
                br0[b0s[t]] += reach0[hi]
                br1[b1s[t]] += reach1[hi]
            br0n, s0 = _normalize(br0)
            br1n, s1 = _normalize(br1)
            if s0 <= 0.0 and s1 <= 0.0:
                continue                          # deal carries no reach mass
            feats = encode_pbs(PBS(street=street + 1, up=up_d, dead=dead,
                                   pot=pot, ranges=[br0n, br1n]))
            boards.append(feats[0])
            extras.append(feats[1])
            r0s.append(br0n)
            r1s.append(br1n)
            metas.append((ok_idx, b0s, b1s, s0, s1))
        if not metas:
            return cfv0, cfv1
        v0s, v1s = _predict_many(boards, extras, r0s, r1s)
        for d, (ok_idx, b0s, b1s, s0, s1) in enumerate(metas):
            v0, v1 = _zs_correct(v0s[d], v1s[d], r0s[d], r1s[d])
            a0, a1 = s1 * pot, s0 * pot
            for t, hi in enumerate(ok_idx):
                cfv0[hi] += a0 * v0[b0s[t]]
                cfv1[hi] += a1 * v1[b1s[t]]
        for hi in range(H):
            cfv0[hi] *= w
            cfv1[hi] *= w
        return cfv0, cfv1

    return leaf


def _make_pre_deal_leaf(predict_fn, n_buckets, bucketing):
    """The ORIGINAL (pre-2026-07-02) glue, verbatim: evaluates the net on the
    PRE-deal boundary (current street's board + street index, un-removed and
    unnormalized reaches). CONFIRMED WRONG (M1a) — the net never trained on
    this distribution. Kept only for validate.py --ab-gate. Requires
    `holdings` == the full enumerate_holdings(board, k) (its bucket_map
    alignment assumption)."""
    def leaf(street, up, dead, pot, holdings, reach0, reach1):
        board_cards = up[0] + up[1] + dead
        k = down_count(street)
        bmap0 = bucketing.bucket_map(board_cards, k, up[0])
        bmap1 = bucketing.bucket_map(board_cards, k, up[1])
        br0 = bucketing.aggregate_range(reach0, bmap0, n_buckets)
        br1 = bucketing.aggregate_range(reach1, bmap1, n_buckets)
        feats = encode_pbs(PBS(street=street, up=up, dead=dead, pot=pot,
                               ranges=[br0, br1], toCall=0.0, betSize=0.0))
        board, extra = feats[0], feats[1]
        v0, v1 = predict_fn(board, extra, br0, br1)          # fraction of pot
        s = sum(br0) + sum(br1)
        if s > 1e-12:
            imb = (sum(br0[b] * v0[b] for b in range(len(v0)))
                   + sum(br1[b] * v1[b] for b in range(len(v1)))) / s
            v0 = [x - imb for x in v0]
            v1 = [x - imb for x in v1]
        cfv0 = bucketing.scatter_cfv([v * pot for v in v0], bmap0)  # -> chips
        cfv1 = bucketing.scatter_cfv([v * pot for v in v1], bmap1)
        return cfv0, cfv1
    return leaf


def torch_predict_fn(net) -> Callable:
    """A predict_fn backed by a CounterfactualValueNet (requires PyTorch).

    `net` must have been built with n_holdings=n_buckets and board_dim=
    BOARD_DIM. The returned function also carries a `.batch` attribute that
    evaluates a whole list of post-deal PBSs in one forward pass (the up-card
    sampled-deal path uses it)."""
    import torch

    def predict(board, extra, br0, br1):
        with torch.no_grad():
            t = lambda x: torch.tensor([x], dtype=torch.float32)
            v0, v1 = net(t(board), t(extra), t(br0), t(br1))
            return v0[0].tolist(), v1[0].tolist()

    def batch(boards, extras, r0s, r1s):
        with torch.no_grad():
            T = lambda x: torch.tensor(x, dtype=torch.float32)
            v0, v1 = net(T(boards), T(extras), T(r0s), T(r1s))
            return v0.tolist(), v1.tolist()

    predict.batch = batch
    return predict


if __name__ == "__main__":
    from pbs import enumerate_holdings, RANKS
    from resolve import resolve_subgame, _tiny_board, _uniform

    pot = 16.0
    const = lambda b, e, r0, r1: ([0.1] * B.N_BUCKETS, [-0.2] * B.N_BUCKETS)
    # street one-hot slot inside `extra` (pbs.encode_pbs layout)
    onehot = lambda extra, s: extra[3 + (s - 3)]

    # ── 1) DOWN boundary (6th->7th): 2 down + 4 up each; small live pool.
    up0, up1, dead = _tiny_board(['As', '4s', '5d', '7c'],
                                 ['Kh', 'Qd', 'Jc', '9h'],
                                 ['2c', '3d', '6h', '8s', 'Tc', 'Kd'])
    board = up0 + up1 + dead
    holds6 = enumerate_holdings(board, down_count(6))
    H6 = len(holds6)

    # 1a. the net is queried at the POST-deal street (7) on the SAME board.
    seen = []
    def rec(bd, ex, r0, r1):
        seen.append((bd, ex, r0, r1))
        return [0.1] * B.N_BUCKETS, [-0.2] * B.N_BUCKETS
    leaf = make_leaf_value_fn(rec)
    cfv0, cfv1 = leaf(6, [up0, up1], dead, pot, holds6,
                      _uniform(H6), _uniform(H6))
    assert len(seen) == 1 and onehot(seen[0][1], 7) == 1.0, "must query street 7"
    assert sum(seen[0][0][:len(RANKS)]) == 4.0          # board unchanged (4 up)
    assert abs(sum(seen[0][2]) - 1.0) < 1e-9            # normalized net input
    # 1b. constant predictor: zs-corrected to ±0.15; lift weights sum to 1 per
    # holding, uniform reaches have mass 1 -> exactly ±0.15·pot per holding.
    assert len(cfv0) == H6 and len(cfv1) == H6
    assert all(abs(c - 0.15 * pot) < 1e-9 for c in cfv0), cfv0[:3]
    assert all(abs(c + 0.15 * pot) < 1e-9 for c in cfv1), cfv1[:3]
    z = sum(_uniform(H6)[i] * (cfv0[i] + cfv1[i]) for i in range(H6))
    assert abs(z) < 1e-9, z                             # leaf is zero-sum

    # ── 2) UP boundary (5th->6th): 3 up each, live pool of 6 -> enumeration.
    u0, u1, d5 = _tiny_board(['As', '4s', '5d'], ['Kh', 'Qd', 'Jc'],
                             ['2c', '3d', '6h', '8s', 'Tc', 'Kd'])
    holds5 = enumerate_holdings(u0 + u1 + d5, down_count(5))
    H5 = len(holds5)

    # 2a. queries street 6 with one MORE upcard per player, normalized ranges.
    seen = []
    leafr = make_leaf_value_fn(rec)
    r0u, r1u = _uniform(H5), _uniform(H5)
    cfv0, cfv1 = leafr(5, [u0, u1], d5, pot, holds5, r0u, r1u)
    assert seen and all(onehot(ex, 6) == 1.0 for _, ex, _, _ in seen)
    assert all(sum(bd[:len(RANKS)]) == 4.0 for bd, _, _, _ in seen)  # 3+1 up
    assert all(abs(sum(r0) - 1.0) < 1e-9 for _, _, r0, _ in seen)
    # 2b. exact zero-sum with RANDOM (unnormalized) reaches + CRN determinism.
    rnd = random.Random(11)
    ra = [rnd.random() * 0.3 for _ in range(H5)]
    rb = [rnd.random() * 0.3 for _ in range(H5)]
    leafc = make_leaf_value_fn(const)
    x0, x1 = leafc(5, [u0, u1], d5, pot, holds5, ra, rb)
    z = sum(ra[i] * x0[i] for i in range(H5)) + sum(rb[i] * x1[i] for i in range(H5))
    assert abs(z) < 1e-9, z                              # EXACT zero-sum
    y0, y1 = leafc(5, [u0, u1], d5, pot, holds5, ra, rb)
    assert x0 == y0 and x1 == y1                          # deterministic (CRN)
    # 2c. card removal + deal weighting, exact values (full enumeration, N=6):
    # opp reach = point mass on (6h,8s); hero holding (2c,3d) disjoint from it.
    # Compatible deals avoid all 4 cards -> (N-4)(N-5)=2 of the (N-2)(N-3)=12
    # conditional deals -> cfv0 = 0.15·pot·2/12. Sharing a card (2c,6h) leaves
    # 3 free cards -> 6/12 -> 0.15·pot/2. Opp side mirrors with hero's mass.
    i_hero = holds5.index(('2c', '3d'))
    i_shar = holds5.index(('2c', '6h'))
    i_opp = holds5.index(('6h', '8s'))
    p0 = [0.0] * H5; p0[i_hero] = 1.0
    p1 = [0.0] * H5; p1[i_opp] = 1.0
    c0, c1 = leafc(5, [u0, u1], d5, pot, holds5, p0, p1)
    assert abs(c0[i_hero] - 0.15 * pot * (2.0 / 12.0)) < 1e-9, c0[i_hero]
    assert abs(c0[i_shar] - 0.15 * pot * (6.0 / 12.0)) < 1e-9, c0[i_shar]
    assert abs(c1[i_opp] + 0.15 * pot * (2.0 / 12.0)) < 1e-9, c1[i_opp]
    assert abs(c0[i_hero] + c1[i_opp]) < 1e-9            # zero-sum pairing

    # 2d. SAMPLED path (pool of 12 -> 132 ordered pairs > M=32): still exactly
    # zero-sum, deterministic, finite.
    u0b, u1b, d5b = _tiny_board(['As', '4s', '5d'], ['Kh', 'Qd', 'Jc'],
                                ['2c', '3d', '6h', '8s', 'Tc', 'Kd',
                                 '2d', '3h', '6s', '8c', 'Th', 'Ks'])
    holds5b = enumerate_holdings(u0b + u1b + d5b, down_count(5))
    H5b = len(holds5b)
    rc = [rnd.random() * 0.2 for _ in range(H5b)]
    rd = [rnd.random() * 0.2 for _ in range(H5b)]
    s0, s1 = leafc(5, [u0b, u1b], d5b, pot, holds5b, rc, rd)
    z = sum(rc[i] * s0[i] for i in range(H5b)) + sum(rd[i] * s1[i] for i in range(H5b))
    assert abs(z) < 1e-9, z
    t0, t1 = leafc(5, [u0b, u1b], d5b, pot, holds5b, rc, rd)
    assert s0 == t0 and s1 == t1
    assert all(abs(v) < 1e6 for v in s0 + s1)

    # ── 3) resolve integration: zero-value leaf -> runs + zero-sum, on the
    # DOWN boundary (6th) and on an UP boundary (5th, previously impossible
    # without a net — this is the depth-limited path the fix unblocks).
    zero = make_leaf_value_fn(lambda b, e, r0, r1: ([0.0] * B.N_BUCKETS,
                                                    [0.0] * B.N_BUCKETS))
    res = resolve_subgame(PBS(street=6, up=[up0, up1], dead=dead, pot=pot,
                              ranges=[_uniform(H6), _uniform(H6)]),
                          iters=120, depth_limit=1, leaf_value_fn=zero)
    assert abs(res['value'][0] + res['value'][1]) < 1e-9, res['value']
    res5 = resolve_subgame(PBS(street=5, up=[u0, u1], dead=d5, pot=pot,
                               ranges=[_uniform(H5), _uniform(H5)]),
                           iters=120, depth_limit=1, leaf_value_fn=zero)
    assert abs(res5['value'][0] + res5['value'][1]) < 1e-9, res5['value']
    assert abs(res5['value'][0]) < 0.02 * pot, res5['value']

    # ── 4) razz: the SAME glue with bucket_razz + game=RAZZ stays zero-sum.
    import bucket_razz as BR
    from razz_game import RAZZ
    zero_rz = make_leaf_value_fn(lambda b, e, r0, r1: ([0.0] * BR.N_BUCKETS,
                                                       [0.0] * BR.N_BUCKETS),
                                 bucketing=BR)
    cfv0_rz, _ = zero_rz(6, [up0, up1], dead, pot, holds6,
                         _uniform(H6), _uniform(H6))
    assert len(cfv0_rz) == H6
    res_rz = resolve_subgame(PBS(street=6, up=[up0, up1], dead=dead, pot=pot,
                                 ranges=[_uniform(H6), _uniform(H6)]),
                             iters=120, depth_limit=1, leaf_value_fn=zero_rz,
                             game=RAZZ)
    assert abs(res_rz['value'][0] + res_rz['value'][1]) < 1e-9, res_rz['value']
    # razz const on the down boundary: same ±0.15·pot closed form as stud.
    leaf_rz = make_leaf_value_fn(lambda b, e, r0, r1: ([0.1] * BR.N_BUCKETS,
                                                       [-0.2] * BR.N_BUCKETS),
                                 bucketing=BR)
    q0, q1 = leaf_rz(6, [up0, up1], dead, pot, holds6,
                     _uniform(H6), _uniform(H6))
    assert all(abs(c - 0.15 * pot) < 1e-9 for c in q0)
    assert all(abs(c + 0.15 * pot) < 1e-9 for c in q1)

    # ── 5) the legacy pre_deal mode still reproduces the OLD glue exactly
    # (kept only for the A/B gate): constant predictor -> flat ±0.15·pot.
    old = make_leaf_value_fn(const, mode='pre_deal')
    o0, o1 = old(6, [up0, up1], dead, pot, holds6, _uniform(H6), _uniform(H6))
    assert all(abs(c - 0.15 * pot) < 1e-9 for c in o0)
    assert all(abs(c + 0.15 * pot) < 1e-9 for c in o1)

    print("ok: net_leaf.py self-tests pass (M1a post-deal leaf: down-boundary "
          "street-7 lift, up-boundary sampled deals w/ card removal + CRN + "
          "exact zero-sum, resolve integration on 5th & 6th, Stud 8 + razz, "
          "legacy pre_deal preserved for the gate)")
