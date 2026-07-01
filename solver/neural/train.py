"""Train the Stud 8 counterfactual value network (Milestone C).

Standard supervised regression: load datagen JSONL shards, bucket each example
(bucket.py) and encode its PBS (pbs.encode_pbs), then fit
CounterfactualValueNet with Huber loss + Adam (lr 1e-3 -> 1e-4), selecting on
validation Huber and saving the best epoch. Targets are per-bucket CFVs as a
FRACTION OF THE POT (the net's normalization). One net per street (datagen
shards a single street per dir); latest streets first (bootstrapping).

`featurize` (example -> net inputs/targets) is pure Python and self-tested here;
the training loop needs PyTorch (imported lazily so this module loads without it).
"""
from __future__ import annotations
from typing import List

from datagen import read_shards
from bucket import bucket_map, aggregate_range, aggregate_cfv, N_BUCKETS
from pbs import PBS, encode_pbs, down_count, BOARD_DIM, EXTRA_DIM


def featurize(ex: dict) -> dict:
    """One datagen example -> {board, extra, r0, r1, t0, t1} as plain lists.

    Handles both record schemas: BUCKETED (datagen_bucketed.py — branges/cfv are
    already per-bucket) and RAW (datagen.py — per-holding, bucketed here). r0/r1
    are bucketed ranges; t0/t1 are per-bucket CFV targets as a fraction of the
    pot. Pure Python (no torch)."""
    street, up, dead, pot = ex['street'], ex['up'], ex['dead'], float(ex['pot'])
    cfv0, cfv1 = ex['cfv']
    if ex.get('bucketed'):
        br0, br1 = ex['branges']
        t0 = [v / pot for v in cfv0]
        t1 = [v / pot for v in cfv1]
    else:
        board = up[0] + up[1] + dead
        k = down_count(street)
        bmap0 = bucket_map(board, k, up[0])
        bmap1 = bucket_map(board, k, up[1])
        r0, r1 = ex['ranges']
        br0 = aggregate_range(r0, bmap0)
        br1 = aggregate_range(r1, bmap1)
        t0 = [v / pot for v in aggregate_cfv(cfv0, r0, bmap0)]
        t1 = [v / pot for v in aggregate_cfv(cfv1, r1, bmap1)]
    bfeat, efeat, _, _ = encode_pbs(PBS(street=street, up=up, dead=dead, pot=pot,
                                        ranges=[br0, br1]))
    return {'board': bfeat, 'extra': efeat, 'r0': br0, 'r1': br1, 't0': t0, 't1': t1}


def load_dataset(shards_dir: str) -> List[dict]:
    return [featurize(ex) for ex in read_shards(shards_dir)]


def train(shards_dir: str, epochs: int = 350, lr: float = 1e-3, batch: int = 128,
          val_frac: float = 0.1, seed: int = 0, out_path: str = 'value_net.pt',
          n_buckets: int = N_BUCKETS, board_dim: int = BOARD_DIM,
          extra_dim: int = EXTRA_DIM):
    """Fit CounterfactualValueNet on datagen shards; save + return the best net.

    Needs PyTorch. Selects on validation Huber, drops lr to 1e-4 at 60% of
    epochs, and saves the best-val state_dict to `out_path`."""
    import torch
    from torch.utils.data import DataLoader, TensorDataset
    from value_net import CounterfactualValueNet, huber_value_loss

    torch.manual_seed(seed)
    data = load_dataset(shards_dir)
    if not data:
        raise ValueError(f"no examples found in {shards_dir}")

    def col(key):
        return torch.tensor([d[key] for d in data], dtype=torch.float32)
    board, extra = col('board'), col('extra')
    r0, r1, t0, t1 = col('r0'), col('r1'), col('t0'), col('t1')

    n = board.shape[0]
    n_val = max(1, int(n * val_frac))
    perm = torch.randperm(n, generator=torch.Generator().manual_seed(seed))
    tr, va = perm[n_val:], perm[:n_val]
    ds = TensorDataset(board, extra, r0, r1, t0, t1)
    train_dl = DataLoader(torch.utils.data.Subset(ds, tr.tolist()),
                          batch_size=batch, shuffle=True)

    net = CounterfactualValueNet(n_holdings=n_buckets, board_dim=board_dim,
                                 extra_dim=extra_dim)
    opt = torch.optim.Adam(net.parameters(), lr=lr)
    best_val, best_state = float('inf'), None

    for epoch in range(epochs):
        if epoch == int(epochs * 0.6):
            for g in opt.param_groups:
                g['lr'] = 1e-4
        net.train()
        for bd, ex_, br0, br1, y0, y1 in train_dl:
            opt.zero_grad()
            p0, p1 = net(bd, ex_, br0, br1)
            loss = huber_value_loss(p0, y0) + huber_value_loss(p1, y1)
            loss.backward()
            opt.step()
        net.eval()
        with torch.no_grad():
            p0, p1 = net(board[va], extra[va], r0[va], r1[va])
            vloss = (huber_value_loss(p0, t0[va]) + huber_value_loss(p1, t1[va])).item()
        if vloss < best_val:
            best_val, best_state = vloss, {k: v.clone() for k, v in net.state_dict().items()}

    if best_state is not None:
        net.load_state_dict(best_state)
        torch.save(best_state, out_path)
    return net


def _cli():
    import argparse
    p = argparse.ArgumentParser(
        description="Train the Stud 8 value net on datagen shards (needs PyTorch).")
    p.add_argument('--shards', required=True, help="dir of datagen shard_*.jsonl")
    p.add_argument('--epochs', type=int, default=350)
    p.add_argument('--lr', type=float, default=1e-3)
    p.add_argument('--batch', type=int, default=128)
    p.add_argument('--val-frac', type=float, default=0.1)
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--out', default='value_net.pt')
    a = p.parse_args()
    train(a.shards, epochs=a.epochs, lr=a.lr, batch=a.batch,
          val_frac=a.val_frac, seed=a.seed, out_path=a.out)
    print(f"saved best net to {a.out}")


def _selftest():
    # featurize is pure Python; validate shapes/normalization on a synthetic
    # example without solving or PyTorch.
    from pbs import enumerate_holdings
    from resolve import _tiny_board

    up0, up1, dead = _tiny_board(['As', '4s', '5d', '7c'],
                                 ['Kh', 'Qd', 'Jc', '9h'],
                                 ['2c', '3d', '6h', '8s', 'Tc', 'Kd'])
    holds = enumerate_holdings(up0 + up1 + dead, down_count(7))
    H = len(holds)
    pot = 20.0
    rng = [1.0 / H] * H
    # arbitrary zero-sum-ish CFVs just to exercise featurize
    cfv0 = [(-1.0 if i % 2 else 1.0) for i in range(H)]
    cfv1 = [-c for c in cfv0]
    ex = {'street': 7, 'up': [up0, up1], 'dead': dead, 'pot': pot,
          'ranges': [rng, rng], 'cfv': [cfv0, cfv1]}

    f = featurize(ex)
    assert len(f['board']) == BOARD_DIM, len(f['board'])
    assert len(f['extra']) == EXTRA_DIM, len(f['extra'])
    assert len(f['r0']) == N_BUCKETS and len(f['t0']) == N_BUCKETS
    assert abs(sum(f['r0']) - 1.0) < 1e-9 and abs(sum(f['r1']) - 1.0) < 1e-9
    # targets are fraction-of-pot bucket means; bounded by max |cfv|/pot
    assert all(abs(t) <= 1.0 / pot + 1e-9 for t in f['t0']), f['t0']
    print(f"ok: train.py featurize self-test passes "
          f"(board={BOARD_DIM}, extra={EXTRA_DIM}, buckets={N_BUCKETS}; "
          f"train() needs PyTorch)")


if __name__ == "__main__":
    import sys
    (_selftest if len(sys.argv) == 1 else _cli)()
