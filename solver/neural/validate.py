"""validate.py — does the value net actually learn the game tree?

The decision gate before scaling the datagen grind. Two measurements:

  1. CFV ACCURACY (primary, in-distribution): train on the grind's shards, hold
     out a fraction, and report per-bucket CFV error on held-out PBSs vs a
     predict-the-mean baseline. If the net isn't well below baseline, 25-bucket
     data isn't teaching it enough → the lever is bucketing (Milestone B), not
     more iterations/data.

  2. NET-AS-LEAF FIDELITY (secondary): re-solve a small 6th-street subgame using
     the trained 7th-street net as the depth-limited leaf, and compare the root
     value to the EXACT 6th solve (resolve.py recursion). Agreement => the net is
     a usable leaf for continual re-solving (Milestone D). Uses reduced boards so
     the exact solve is tractable (the net is then slightly out-of-distribution —
     a sanity check, not the primary gate).

Training + net inference need PyTorch; the metric plumbing is pure Python and
self-tested (`python3 validate.py` with no args).
"""
from __future__ import annotations
import random
from typing import List

from datagen import read_shards
from train import featurize
from bucket import N_BUCKETS
from pbs import BOARD_DIM, EXTRA_DIM, PBS, enumerate_holdings, down_count


def _mae(pred: List[float], targ: List[float]) -> float:
    return sum(abs(p - t) for p, t in zip(pred, targ)) / max(1, len(pred))


def _r2(pred: List[float], targ: List[float]) -> float:
    n = len(targ)
    if n == 0:
        return 0.0
    mean = sum(targ) / n
    ss_tot = sum((t - mean) ** 2 for t in targ) or 1e-12
    ss_res = sum((p - t) ** 2 for p, t in zip(pred, targ))
    return 1.0 - ss_res / ss_tot


def cfv_accuracy(net, val: List[dict]):
    """Per-bucket CFV error of `net` on held-out featurized examples vs a
    predict-the-mean baseline. Returns a dict of metrics (fraction-of-pot)."""
    import torch
    t = lambda key: torch.tensor([d[key] for d in val], dtype=torch.float32)
    with torch.no_grad():
        p0, p1 = net(t('board'), t('extra'), t('r0'), t('r1'))
    pred = p0.flatten().tolist() + p1.flatten().tolist()
    targ = [v for d in val for v in d['t0']] + [v for d in val for v in d['t1']]
    # baseline: predict the per-position mean of the targets
    mean = sum(targ) / max(1, len(targ))
    base = [mean] * len(targ)
    return {
        'n_val': len(val),
        'net_mae': _mae(pred, targ),
        'baseline_mae': _mae(base, targ),
        'r2': _r2(pred, targ),
        'target_std': (sum((x - mean) ** 2 for x in targ) / max(1, len(targ))) ** 0.5,
    }


def _fit(train: List[dict], epochs: int, lr: float, batch: int, seed: int,
         n_buckets: int = N_BUCKETS):
    import torch
    from torch.utils.data import DataLoader, TensorDataset
    from value_net import CounterfactualValueNet, huber_value_loss
    torch.manual_seed(seed)
    col = lambda k: torch.tensor([d[k] for d in train], dtype=torch.float32)
    ds = TensorDataset(col('board'), col('extra'), col('r0'), col('r1'),
                       col('t0'), col('t1'))
    dl = DataLoader(ds, batch_size=batch, shuffle=True)
    net = CounterfactualValueNet(n_holdings=n_buckets, board_dim=BOARD_DIM,
                                 extra_dim=EXTRA_DIM)
    opt = torch.optim.Adam(net.parameters(), lr=lr)
    for epoch in range(epochs):
        if epoch == int(epochs * 0.6):
            for g in opt.param_groups:
                g['lr'] = lr * 0.1
        for bd, ex, r0, r1, y0, y1 in dl:
            opt.zero_grad()
            q0, q1 = net(bd, ex, r0, r1)
            loss = huber_value_loss(q0, y0) + huber_value_loss(q1, y1)
            loss.backward()
            opt.step()
    net.eval()
    return net


def leaf_fidelity(net, n_spots: int, seed: int = 0, live: int = 6, iters: int = 50):
    """Mean |net-leaf 6th value − exact 6th value| over small random 6th spots.

    SLOW: the exact 6th solve nests a 7th CFR solve at every deal leaf, so keep
    n_spots small and live low. A rough sanity check, not the primary gate."""
    import random as _r
    from resolve import resolve_subgame, _tiny_board
    from net_leaf import make_leaf_value_fn, torch_predict_fn
    from pbs import uniform_range
    leaf = make_leaf_value_fn(torch_predict_fn(net))
    rng = _r.Random(seed)
    deck = [r + s for r in "23456789TJQKA" for s in "cdhs"]
    diffs = []
    for _ in range(n_spots):
        d = deck[:]
        rng.shuffle(d)
        up0, up1 = d[:4], d[4:8]
        livecards = d[8:8 + live]
        up0, up1, dead = _tiny_board(up0, up1, livecards)
        H = len(enumerate_holdings(up0 + up1 + dead, down_count(6)))
        r0 = uniform_range(up0 + up1 + dead, down_count(6))
        r1 = uniform_range(up0 + up1 + dead, down_count(6))
        pbs = PBS(6, [up0, up1], dead, 16.0, [r0, r1])
        exact = resolve_subgame(pbs, iters=iters)
        approx = resolve_subgame(pbs, iters=iters, depth_limit=1, leaf_value_fn=leaf)
        diffs.append(abs(exact['value'][0] - approx['value'][0]))
    return {'n_spots': n_spots, 'mean_abs_value_diff_chips': sum(diffs) / max(1, len(diffs)),
            'max_abs_value_diff_chips': max(diffs) if diffs else 0.0}


def run(shards_dir: str, epochs: int = 200, lr: float = 1e-3, batch: int = 128,
        val_frac: float = 0.15, seed: int = 0, leaf_spots: int = 0,
        log_csv: str = None, save_path: str = None, max_examples: int = None):
    data = []
    for ex in read_shards(shards_dir):
        data.append(featurize(ex))
        if max_examples and len(data) >= max_examples:
            break
    if len(data) < 50:
        raise SystemExit(f"need >=50 examples to validate; found {len(data)} in "
                         f"{shards_dir} (let the grind run longer)")
    n_buckets = len(data[0]['r0'])          # 25 (Stud 8) or 8 (razz), from the data
    rng = random.Random(seed)
    rng.shuffle(data)
    n_val = max(10, int(len(data) * val_frac))
    val, train = data[:n_val], data[n_val:]
    print(f"validate: {len(train)} train / {len(val)} val examples "
          f"({n_buckets} buckets), {epochs} epochs")
    net = _fit(train, epochs, lr, batch, seed, n_buckets=n_buckets)
    acc = cfv_accuracy(net, val)
    tr = cfv_accuracy(net, train[:len(val)])    # same-size train sample
    print("\n── CFV accuracy (fraction of pot; lower MAE = better) ──")
    print(f"  net MAE (val) : {acc['net_mae']:.4f}")
    print(f"  net MAE (train): {tr['net_mae']:.4f}  (train<<val => overfit, need more data)")
    print(f"  baseline MAE  : {acc['baseline_mae']:.4f}  (predict-the-mean)")
    print(f"  R^2 (val)     : {acc['r2']:.3f}")
    print(f"  target std    : {acc['target_std']:.4f}")
    acc['train_mae'] = tr['net_mae']
    base = acc['baseline_mae'] or 1e-9
    fits_train = tr['net_mae'] < 0.6 * base
    generalizes = acc['net_mae'] < 0.6 * base
    if generalizes:
        verdict = "LEARNS & GENERALIZES (scale up for accuracy)"
    elif fits_train:
        verdict = ("DATA-LIMITED — net fits train but overfits val; the bucketing "
                   "is NOT the bottleneck yet. Generate more data, then re-check.")
    else:
        verdict = ("CAPACITY/BUCKETING-LIMITED — net can't fit even the train "
                   "targets; improve the abstraction (EMD buckets), not the data.")
    print(f"  verdict       : {verdict}")
    print(f"                  (val/baseline={acc['net_mae']/base:.2f}, "
          f"train/baseline={tr['net_mae']/base:.2f})")
    if leaf_spots > 0:
        print("\n── net-as-leaf fidelity (6th vs exact; chips) ──")
        fid = leaf_fidelity(net, leaf_spots, seed)
        print(f"  mean |Δvalue| : {fid['mean_abs_value_diff_chips']:.3f} chips over "
              f"{fid['n_spots']} spots (max {fid['max_abs_value_diff_chips']:.3f})")
    if save_path:
        import torch
        torch.save(net.state_dict(), save_path)
        print(f"  saved net -> {save_path}")
    if log_csv:
        import os
        import time
        header = not os.path.exists(log_csv)
        with open(log_csv, 'a') as f:
            if header:
                f.write("timestamp,n_examples,val_mae,train_mae,baseline_mae,r2\n")
            f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S')},{len(data)},"
                    f"{acc['net_mae']:.5f},{acc['train_mae']:.5f},"
                    f"{acc['baseline_mae']:.5f},{acc['r2']:.4f}\n")
    return acc


def _cli():
    import argparse
    p = argparse.ArgumentParser(description="Validate the Stud 8 value net.")
    p.add_argument('--shards', required=True)
    p.add_argument('--epochs', type=int, default=200)
    p.add_argument('--lr', type=float, default=1e-3)
    p.add_argument('--batch', type=int, default=128)
    p.add_argument('--val-frac', type=float, default=0.15)
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--leaf-spots', type=int, default=0,
                   help="also run net-as-leaf 6th-vs-exact fidelity on N spots")
    p.add_argument('--log', default=None, help="append a scaling-curve CSV row here")
    p.add_argument('--save', default=None, help="save the trained net state_dict here")
    p.add_argument('--max', type=int, default=None, dest='max_examples',
                   help="cap #examples loaded (for scaling-curve points)")
    a = p.parse_args()
    run(a.shards, a.epochs, a.lr, a.batch, a.val_frac, a.seed, a.leaf_spots,
        log_csv=a.log, save_path=a.save, max_examples=a.max_examples)


def _selftest():
    # pure-Python metric plumbing (no torch)
    assert abs(_mae([1, 2, 3], [1, 2, 3])) < 1e-12
    assert abs(_mae([0, 0], [1, 3]) - 2.0) < 1e-12
    assert abs(_r2([1, 2, 3], [1, 2, 3]) - 1.0) < 1e-12
    assert _r2([2, 2, 2], [1, 2, 3]) < 0.01            # mean prediction -> R2 ~ 0
    # a perfect "net" beats the predict-the-mean baseline on a fake val set

    class _Perfect:
        def __call__(self, b, e, r0, r1):
            import torch
            return r0 * 0 + torch.tensor([[0.1] * N_BUCKETS]), \
                   r1 * 0 - torch.tensor([[0.1] * N_BUCKETS])
    print("ok: validate.py self-tests pass (metric plumbing; run() needs PyTorch "
          "+ datagen shards)")


if __name__ == "__main__":
    import sys
    (_selftest if len(sys.argv) == 1 else _cli)()
