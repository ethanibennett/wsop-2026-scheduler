"""eval_disjoint.py — board-DISJOINT generalization eval (the honest number).

validate.py shuffles EXAMPLES, but each board contributes per_board of them, so
val shares boards with train -> optimistic. Here we split by BOARD so no board
appears in both sets, measuring generalization to UNSEEN boards (what a re-solver
actually faces). Reuses train.featurize + validate._fit/cfv_accuracy verbatim, so
the model and training are identical to validate.py — only the split differs.

  .venv/bin/python eval_disjoint.py --shards DIR [--max N]
"""
from __future__ import annotations
import argparse
import random
from collections import defaultdict

from datagen import read_shards
from train import featurize
from validate import _fit, cfv_accuracy


def board_key(ex):
    up, dead = ex['up'], ex['dead']
    return (tuple(up[0]), tuple(up[1]), tuple(dead))


def run(shards_dir, max_examples=None, val_board_frac=0.2, epochs=200,
        lr=1e-3, batch=128, seed=0):
    by_board = defaultdict(list)
    n = 0
    for ex in read_shards(shards_dir):
        by_board[board_key(ex)].append(ex)
        n += 1
        if max_examples and n >= max_examples:
            break
    boards = list(by_board.keys())
    rng = random.Random(seed)
    rng.shuffle(boards)
    n_val_b = max(1, int(len(boards) * val_board_frac))
    val_boards = set(boards[:n_val_b])
    # A single-board shard dir (or a val_board_frac that captures every board)
    # routes ALL boards to val, leaving train_ex empty -> train_ex[0] below
    # IndexErrors. Require >=2 boards and a non-empty train split up front.
    assert len(boards) >= 2 and n_val_b < len(boards), (
        f"need >=2 boards and a non-empty train split (got {len(boards)} boards, "
        f"{n_val_b} val); lower --val-board-frac or add boards")
    train_ex, val_ex = [], []
    for b, exs in by_board.items():
        dst = val_ex if b in val_boards else train_ex
        dst.extend(featurize(e) for e in exs)
    n_buckets = len(train_ex[0]['r0'])
    print(f"  boards: {len(boards)} ({len(boards)-n_val_b} train / {n_val_b} val), "
          f"examples: {len(train_ex)} train / {len(val_ex)} val, {n_buckets} buckets",
          flush=True)
    net = _fit(train_ex, epochs, lr, batch, seed, n_buckets=n_buckets)
    acc = cfv_accuracy(net, val_ex)
    tr = cfv_accuracy(net, train_ex[:len(val_ex)])
    print(f"  UNSEEN-board  R^2={acc['r2']:.4f}  MAE={acc['net_mae']:.4f}  "
          f"(predict-mean baseline {acc['baseline_mae']:.4f})", flush=True)
    print(f"  train         R^2={tr['r2']:.4f}  MAE={tr['net_mae']:.4f}  "
          f"(gap => overfit)", flush=True)
    return acc['r2'], acc['net_mae']


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument('--shards', required=True)
    p.add_argument('--max', type=int, default=None, dest='max_examples')
    p.add_argument('--val-board-frac', type=float, default=0.2)
    p.add_argument('--epochs', type=int, default=200)
    p.add_argument('--seed', type=int, default=0)
    a = p.parse_args()
    run(a.shards, a.max_examples, a.val_board_frac, a.epochs, seed=a.seed)
