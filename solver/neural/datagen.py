"""Training-data generation for the Stud 8 value network (Milestone C).

Loop (DeepStack / ReBeL):
  1. sample a reachable public state (street, upcards, dead, pot);
  2. sample both players' ranges with a coverage-oriented procedure (cover the
     PBSs that actually arise, per ReBeL's random-CFR-iteration trick) — here a
     mixture of uniform / dense-random / sparse / Dirichlet ranges (a simpler
     proxy; the random-CFR-iteration snapshot is a future upgrade);
  3. resolve.resolve_subgame(pbs) -> per-holding CFVs;
  4. write (pbs, cfv) to JSONL shards on disk.
Bootstrap: generate 7th-street data first (exact, no leaf net); then earlier
streets with the trained net as `leaf_value_fn` (depth_limit=1).

Pure Python (no numpy/torch) so it runs on any CPU box. The records store the
raw PBS + per-holding CFVs (chips); train.py encodes/buckets them. CFVs are
chips; divide by `pot` for the net's fraction-of-pot target.

NOTE ON SCALE: the pure-Python re-solver is O(#holdings^2) at showdown leaves,
so full boards (no dead cards -> ~13k holdings on 7th) are slow. Generate at
that scale only after Milestone B (holding bucketing) shrinks the space, or with
sampled/low-iter solves. The pipeline itself is exercised here on small boards.
"""
from __future__ import annotations
import json
import os
import random
from typing import Callable, List, Optional

from pbs import PBS, RANKS, SUITS, enumerate_holdings, down_count
from resolve import resolve_subgame, bet_size

DECK = [r + s for r in RANKS for s in SUITS]


def up_count(street: int) -> int:
    """Upcards per player on `street` (3..7): 1,2,3,4,4 (7th card is down)."""
    return min(street - 2, 4)


def sample_public_state(street: int, rng: random.Random, n_dead: int = 0):
    """Deal both players' upcards (+ optional dead cards) and pick a pot."""
    d = DECK[:]
    rng.shuffle(d)
    uc = up_count(street)
    up0 = d[:uc]
    up1 = d[uc:2 * uc]
    dead = d[2 * uc:2 * uc + n_dead]
    # Pot at the start of a betting round is even (equal contributions). Scale
    # loosely with the street so later streets see bigger pots.
    bb = bet_size(street - 3)
    pot = float(2 * rng.randint(1, 6) * bb)
    return [up0, up1], dead, pot


def sample_range(n: int, rng: random.Random, kind: Optional[str] = None) -> List[float]:
    """A probability vector over n holdings; `kind` controls the shape."""
    if n == 0:
        return []
    if kind is None:
        kind = rng.choice(['uniform', 'random', 'sparse', 'dirichlet'])
    if kind == 'uniform':
        return [1.0 / n] * n
    if kind == 'sparse':
        k = max(1, n // rng.randint(3, 8))
        w = [0.0] * n
        for i in rng.sample(range(n), k):
            w[i] = rng.random()
    elif kind == 'dirichlet':                 # Dirichlet(1..1) via exponentials
        w = [rng.expovariate(1.0) for _ in range(n)]
    else:                                     # 'random' dense
        w = [rng.random() for _ in range(n)]
    s = sum(w)
    return [x / s for x in w] if s > 0 else [1.0 / n] * n


def make_pbs(street: int, rng: random.Random, n_dead: int = 0) -> PBS:
    up, dead, pot = sample_public_state(street, rng, n_dead)
    board = up[0] + up[1] + dead
    k = down_count(street)
    H = len(enumerate_holdings(board, k))
    return PBS(street=street, up=up, dead=dead, pot=pot,
               ranges=[sample_range(H, rng), sample_range(H, rng)],
               toCall=0.0, betSize=float(bet_size(street - 3)))


def generate(out_dir: str, n: int, street: int, seed: int = 0, iters: int = 500,
             shard_size: int = 1000, n_dead: int = 0,
             leaf_value_fn: Optional[Callable] = None,
             depth_limit: Optional[int] = None,
             progress: Optional[Callable] = None):
    """Generate `n` (PBS -> CFV) examples for `street`, sharded into out_dir.

    Returns (n_written, n_shards). For street < 7 supply `leaf_value_fn` (the
    trained next-street net) + `depth_limit=1`; 7th street is exact with neither.
    """
    os.makedirs(out_dir, exist_ok=True)
    rng = random.Random(seed)
    shard: List[dict] = []
    shard_idx = 0
    written = 0

    def flush():
        nonlocal shard, shard_idx
        if not shard:
            return
        path = os.path.join(out_dir, f"shard_{shard_idx:04d}.jsonl")
        with open(path, 'w') as f:
            for ex in shard:
                f.write(json.dumps(ex) + "\n")
        shard_idx += 1
        shard = []

    for t in range(n):
        pbs = make_pbs(street, rng, n_dead)
        res = resolve_subgame(pbs, iters=iters, depth_limit=depth_limit,
                              leaf_value_fn=leaf_value_fn)
        ex = {
            'street': street,
            'up': pbs.up,
            'dead': pbs.dead,
            'pot': pbs.pot,
            'ranges': pbs.ranges,
            'cfv': res['cfv'],            # [cfv0, cfv1] per holding, chips
            'value': res['value'],
        }
        if 'exploitability' in res:
            ex['exploitability'] = res['exploitability']
        shard.append(ex)
        written += 1
        if len(shard) >= shard_size:
            flush()
        if progress:
            progress(t + 1, n)
    flush()
    return written, shard_idx


def read_shards(in_dir: str):
    """Yield example dicts from every shard_*.jsonl in `in_dir` (in order)."""
    for name in sorted(os.listdir(in_dir)):
        if not name.endswith('.jsonl'):
            continue
        with open(os.path.join(in_dir, name)) as f:
            for line in f:
                line = line.strip()
                if line:
                    ex = json.loads(line)
                    # Skip non-positive-pot records at the single ingest
                    # chokepoint (both train.load_dataset and eval_disjoint read
                    # through here): featurize divides CFV targets by pot, so a
                    # pot=0 line would otherwise ZeroDivisionError the whole run.
                    if float(ex.get('pot', 0)) > 0:
                        yield ex


def _cli():
    import argparse
    p = argparse.ArgumentParser(
        description="Generate Stud 8 value-net training data (CFV shards).")
    p.add_argument('--street', type=int, required=True, help="3..7")
    p.add_argument('--n', type=int, required=True, help="examples to generate")
    p.add_argument('--out', required=True, help="output dir for shard_*.jsonl")
    p.add_argument('--iters', type=int, default=500, help="CFR+ iters per solve")
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--shard-size', type=int, default=1000)
    p.add_argument('--n-dead', type=int, default=0,
                   help="dead cards to add (shrinks the holding space; tests use many)")
    p.add_argument('--net', default=None,
                   help="trained net .pt -> bootstrap leaf for streets < 7 (needs torch)")
    a = p.parse_args()

    leaf, depth = None, None
    if a.net:
        import torch
        from value_net import CounterfactualValueNet
        from net_leaf import make_leaf_value_fn, torch_predict_fn
        from bucket import N_BUCKETS
        from pbs import BOARD_DIM, EXTRA_DIM
        net = CounterfactualValueNet(n_holdings=N_BUCKETS, board_dim=BOARD_DIM,
                                     extra_dim=EXTRA_DIM)
        net.load_state_dict(torch.load(a.net))
        net.eval()
        leaf, depth = make_leaf_value_fn(torch_predict_fn(net)), 1

    def prog(t, n):
        if t % 50 == 0 or t == n:
            print(f"  {t}/{n} solved", flush=True)

    w, ns = generate(a.out, a.n, a.street, seed=a.seed, iters=a.iters,
                     shard_size=a.shard_size, n_dead=a.n_dead,
                     leaf_value_fn=leaf, depth_limit=depth, progress=prog)
    print(f"wrote {w} examples to {a.out} in {ns} shard(s)")


def _selftest():
    import shutil
    import tempfile

    # Generate a tiny 7th-street dataset (lots of dead cards -> small holding
    # space so the exact solves are fast) and validate the records.
    out = tempfile.mkdtemp(prefix="stud8_datagen_")
    try:
        # 7th street: 8 upcards; n_dead=38 -> 6 live -> C(6,3)=20 holdings.
        n_written, n_shards = generate(out, n=5, street=7, seed=7, iters=120,
                                       shard_size=3, n_dead=38)
        assert n_written == 5, n_written
        assert n_shards == 2, n_shards            # 5 examples / shard_size 3

        rows = list(read_shards(out))
        assert len(rows) == 5, len(rows)
        for ex in rows:
            board = ex['up'][0] + ex['up'][1] + ex['dead']
            H = len(enumerate_holdings(board, down_count(ex['street'])))
            assert H == 20, H
            assert len(ex['ranges'][0]) == H and len(ex['ranges'][1]) == H
            assert len(ex['cfv'][0]) == H and len(ex['cfv'][1]) == H
            assert abs(sum(ex['ranges'][0]) - 1.0) < 1e-9
            # CFVs are zero-sum (game value), and exploitability was logged
            assert abs(ex['value'][0] + ex['value'][1]) < 1e-6, ex['value']
            assert ex['exploitability'] < 0.05 * ex['pot']
            # public cards never appear in a holding (card removal)
            seen = set(board)
            holds = enumerate_holdings(board, down_count(ex['street']))
            assert all(not (set(h) & seen) for h in holds)

        # determinism: same seed -> identical first record
        out2 = tempfile.mkdtemp(prefix="stud8_datagen2_")
        try:
            generate(out2, n=1, street=7, seed=7, iters=120, n_dead=38)
            a = next(read_shards(out)); b = next(read_shards(out2))
            assert a['up'] == b['up'] and a['cfv'] == b['cfv'], "seed not deterministic"
        finally:
            shutil.rmtree(out2, ignore_errors=True)

        print(f"ok: datagen self-tests pass ({n_written} examples, {n_shards} "
              f"shards, records validated + deterministic)")
    finally:
        shutil.rmtree(out, ignore_errors=True)


if __name__ == "__main__":
    import sys
    (_selftest if len(sys.argv) == 1 else _cli)()
