"""Validate a trained razz net as a re-solving LEAF — the full-game razz solver.

Loads a saved razz value net, wraps it as a resolve `leaf_value_fn` (via net_leaf
with bucket_razz), and on small 6th-street razz spots compares the net-leaf
depth-limited value to the EXACT 6th->7th value. This is what lets the razz
solver cover earlier streets (where exact upcard enumeration is intractable) and
run in real time: later streets exact, the boundary valued by the net.

Tiny boards (so the exact solve is feasible) are out-of-distribution for a net
trained on full boards, so treat the absolute error as a loose upper bound — the
point is that the integration runs, stays zero-sum, and tracks the exact value.

Run (in the venv):  .venv/bin/python razz_netleaf_check.py nets/razz7_3k.pt
"""
import sys
import random

from pbs import (PBS, BOARD_DIM, EXTRA_DIM, enumerate_holdings, down_count,
                 uniform_range)
from resolve import resolve_subgame, _tiny_board
from net_leaf import make_leaf_value_fn, torch_predict_fn
from razz_game import RAZZ
import bucket_razz as BR


def main(path):
    import torch
    from value_net import CounterfactualValueNet
    net = CounterfactualValueNet(n_holdings=BR.N_BUCKETS, board_dim=BOARD_DIM,
                                 extra_dim=EXTRA_DIM)
    net.load_state_dict(torch.load(path, map_location='cpu'))
    net.eval()
    leaf = make_leaf_value_fn(torch_predict_fn(net), bucketing=BR)

    rng = random.Random(0)
    deck = [r + s for r in "23456789TJQKA" for s in "cdhs"]
    diffs, pot = [], 16.0
    for t in range(4):
        d = deck[:]
        rng.shuffle(d)
        up0, up1, dead = _tiny_board(d[:4], d[4:8], d[8:14])   # unseen pool = 6 cards
        H = len(enumerate_holdings(up0 + up1 + dead, down_count(6)))
        r0 = uniform_range(up0 + up1 + dead, down_count(6))
        r1 = uniform_range(up0 + up1 + dead, down_count(6))
        pbs = PBS(6, [up0, up1], dead, pot, [r0, r1])
        exact = resolve_subgame(pbs, iters=120, game=RAZZ)                       # exact 6th->7th
        appr = resolve_subgame(pbs, iters=120, depth_limit=1,
                               leaf_value_fn=leaf, game=RAZZ)                    # net leaf
        assert abs(appr['value'][0] + appr['value'][1]) < 1e-9, appr['value']   # zero-sum
        diffs.append(abs(exact['value'][0] - appr['value'][0]))
        print(f"  spot {t} (|H|={H}): exact {exact['value'][0]:+.3f}  "
              f"net-leaf {appr['value'][0]:+.3f}  |diff| {diffs[-1]:.3f} chips")
    mean = sum(diffs) / len(diffs)
    print(f"ok: razz net-leaf integration runs + stays zero-sum; mean |value diff| "
          f"{mean:.3f} chips ({100*mean/pot:.1f}% of pot {pot:.0f}) over "
          f"{len(diffs)} 6th-street spots.")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "nets/razz7_3k.pt")
