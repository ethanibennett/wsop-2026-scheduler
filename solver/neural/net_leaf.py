"""Adapter: a trained value net <-> resolve.py's `leaf_value_fn` contract.

resolve.resolve_subgame values a street boundary by calling
    leaf_value_fn(street, up, dead, pot, holdings, reach0, reach1) -> (cfv0, cfv1)
with CFVs in CHIPS, aligned to `holdings`. The DeepStack net instead predicts a
per-BUCKET counterfactual value as a FRACTION OF THE POT. This module bridges
the two: bucket the reach (bucket.py) -> net -> ×pot -> scatter to holdings.

It's the bootstrap leaf (datagen for streets < 7) and the Milestone D search
leaf (continual re-solving). The bucketing/scatter glue is pure Python and
self-tested here with a fake predictor; `torch_predict_fn` wires a real
CounterfactualValueNet (PyTorch).
"""
from __future__ import annotations
from typing import Callable, List, Tuple

from pbs import PBS, encode_pbs, down_count
import bucket as B


def make_leaf_value_fn(predict_fn: Callable, n_buckets: int = None,
                       bucketing=B) -> Callable:
    """Wrap a per-bucket, fraction-of-pot predictor into a resolve leaf_value_fn.

    predict_fn(board, extra, brange0, brange1) -> (v0, v1), each a length
    `n_buckets` list of fraction-of-pot counterfactual values. `bucketing` is the
    bucket module: `bucket` for Stud 8 (default), `bucket_razz` for razz (its
    aggregate/scatter helpers are the same; only the bucket map differs).
    """
    if n_buckets is None:
        n_buckets = bucketing.N_BUCKETS

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
        # Zero-sum correction (DeepStack): an unconstrained net's two heads don't
        # satisfy <br0,v0> + <br1,v1> = 0, so a depth-limited resolve drifts off
        # zero-sum. Subtract the shared range-weighted imbalance so the leaf — and
        # thus the whole resolve — is exactly zero-sum.
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

    `net` must have been built with n_holdings=n_buckets and board_dim=BOARD_DIM.
    """
    import torch

    def predict(board, extra, br0, br1):
        with torch.no_grad():
            t = lambda x: torch.tensor([x], dtype=torch.float32)
            v0, v1 = net(t(board), t(extra), t(br0), t(br1))
            return v0[0].tolist(), v1[0].tolist()
    return predict


if __name__ == "__main__":
    from pbs import enumerate_holdings
    from resolve import resolve_subgame, _tiny_board, _uniform

    # 6th-street board (2 down, 4 up each); small live pool for speed.
    up0, up1, dead = _tiny_board(['As', '4s', '5d', '7c'],
                                 ['Kh', 'Qd', 'Jc', '9h'],
                                 ['2c', '3d', '6h', '8s', 'Tc', 'Kd'])
    board = up0 + up1 + dead
    holds = enumerate_holdings(board, down_count(6))
    H = len(holds)
    pot = 16.0

    # 1) glue + zero-sum correction: raw (0.1, -0.2) has range-weighted imbalance
    #    -0.1 over both uniform ranges -> shift +0.05 -> (0.15, -0.15), then scatters
    #    to per-holding CFV. The corrected leaf is exactly zero-sum.
    const = make_leaf_value_fn(lambda b, e, r0, r1: ([0.1] * B.N_BUCKETS,
                                                     [-0.2] * B.N_BUCKETS))
    cfv0, cfv1 = const(6, [up0, up1], dead, pot, holds, _uniform(H), _uniform(H))
    assert len(cfv0) == H and len(cfv1) == H
    assert all(abs(c - 0.15 * pot) < 1e-9 for c in cfv0), cfv0[:3]
    assert all(abs(c + 0.15 * pot) < 1e-9 for c in cfv1), cfv1[:3]
    z0 = sum(_uniform(H)[i] * cfv0[i] for i in range(H))
    z1 = sum(_uniform(H)[i] * cfv1[i] for i in range(H))
    assert abs(z0 + z1) < 1e-9, (z0, z1)                  # leaf is zero-sum now

    # 2) integration: a zero-value net leaf -> resolve runs and stays zero-sum.
    zero = make_leaf_value_fn(lambda b, e, r0, r1: ([0.0] * B.N_BUCKETS,
                                                    [0.0] * B.N_BUCKETS))
    res = resolve_subgame(PBS(street=6, up=[up0, up1], dead=dead, pot=pot,
                              ranges=[_uniform(H), _uniform(H)]),
                          iters=120, depth_limit=1, leaf_value_fn=zero)
    assert abs(res['value'][0] + res['value'][1]) < 1e-9, res['value']

    # 3) razz: the SAME glue with bucket_razz + game=RAZZ stays zero-sum, so the
    #    razz net will drop straight into depth-limited resolving on early streets.
    import bucket_razz as BR
    from razz_game import RAZZ
    zero_rz = make_leaf_value_fn(lambda b, e, r0, r1: ([0.0] * BR.N_BUCKETS,
                                                       [0.0] * BR.N_BUCKETS),
                                 bucketing=BR)
    cfv0_rz, _ = zero_rz(6, [up0, up1], dead, pot, holds, _uniform(H), _uniform(H))
    assert len(cfv0_rz) == H
    res_rz = resolve_subgame(PBS(street=6, up=[up0, up1], dead=dead, pot=pot,
                                 ranges=[_uniform(H), _uniform(H)]),
                             iters=120, depth_limit=1, leaf_value_fn=zero_rz,
                             game=RAZZ)
    assert abs(res_rz['value'][0] + res_rz['value'][1]) < 1e-9, res_rz['value']

    print("ok: net_leaf.py self-tests pass (bucket->net->scatter glue + "
          "resolve integration, Stud 8 + razz; torch_predict_fn needs PyTorch)")
