"""24/7 BUCKETED razz data generation — the razz analog of datagen_bucketed.py.

Same grind, razz engine: sample a board, compute its 1-D-bucket share matrix
ONCE (bucket_resolve_razz), then solve many bucketed range samples on it
(amortization). Records are JSONL with the SAME schema as the Stud 8 grind
(bucketed per-bucket CFVs), tagged `game='razz'` and `n_buckets=8`, so
train.py / read_shards consume them unchanged. This is the data half of the razz
pipeline validation (RAZZ.md) — far less data is needed than Stud 8 because the
abstraction is 1-D and tiny.

Game-agnostic helpers (board/pot/range sampling, shard reading) are reused from
the Stud 8 datagen modules; only the solve swaps to the razz engine, so the
running Stud 8 grind is untouched. Pure Python.

CLI:
  python3 datagen_razz.py --street 7 --out data/razz7 --tag r0 \
      --boards 200 --per-board 30 --iters 150 --samples 60
  python3 datagen_razz.py --street 7 --out data/razz7 --tag r0 --forever
"""
from __future__ import annotations
import glob
import json
import os
import random
import re
from typing import List, Optional

from pbs import down_count
from datagen import sample_range, read_shards               # game-agnostic
from datagen_bucketed import sample_board, _pot             # game-agnostic helpers
from bucket_razz import N_BUCKETS
from bucket_resolve_razz import sample_share_matrix, resolve_bucketed


def generate_razz(out_dir: str, street: int, boards: int, per_board: int = 30,
                  iters: int = 150, samples: int = 60, seed: int = 0,
                  tag: str = "r0", shard_size: int = 2000, n_dead: int = 0,
                  n_buckets: int = N_BUCKETS, start_shard: int = 0,
                  progress: Optional[callable] = None):
    """Generate `boards` × `per_board` bucketed razz examples into out_dir.

    Returns (n_written, next_shard_idx)."""
    os.makedirs(out_dir, exist_ok=True)
    rng = random.Random(seed)
    k = down_count(street)
    shard: List[dict] = []
    shard_idx = start_shard
    written = 0

    def flush():
        nonlocal shard, shard_idx
        if not shard:
            return
        path = os.path.join(out_dir, f"shard_{tag}_{shard_idx:05d}.jsonl")
        with open(path, 'w') as f:
            for ex in shard:
                f.write(json.dumps(ex) + "\n")
        shard_idx += 1
        shard = []

    for bi in range(boards):
        up, dead = sample_board(street, rng, n_dead)
        board = up[0] + up[1] + dead
        M = sample_share_matrix(board, k, up[0], up[1], n_buckets, samples, rng)
        for _ in range(per_board):
            pot = _pot(street, rng)
            r0 = sample_range(n_buckets, rng)
            r1 = sample_range(n_buckets, rng)
            res = resolve_bucketed(street, up, dead, pot, r0, r1, iters=iters,
                                   share_matrix=M, n_buckets=n_buckets)
            ex = {'game': 'razz', 'street': street, 'up': up, 'dead': dead,
                  'pot': pot, 'bucketed': True, 'n_buckets': n_buckets,
                  'branges': [r0, r1], 'cfv': res['cfv'], 'value': res['value']}
            if 'exploitability' in res:
                ex['exploitability'] = res['exploitability']
            shard.append(ex)
            written += 1
            if len(shard) >= shard_size:
                flush()
        if progress:
            progress(bi + 1, boards, written)
    flush()
    return written, shard_idx


def _cli():
    import argparse
    p = argparse.ArgumentParser(description="24/7 bucketed razz datagen.")
    p.add_argument('--street', type=int, required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--tag', default='r0', help="unique per worker (shard prefix)")
    p.add_argument('--boards', type=int, default=200)
    p.add_argument('--per-board', type=int, default=30)
    p.add_argument('--iters', type=int, default=150)
    p.add_argument('--samples', type=int, default=60)
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--shard-size', type=int, default=2000)
    p.add_argument('--n-dead', type=int, default=0)
    p.add_argument('--forever', action='store_true', help="loop batches until killed")
    a = p.parse_args()

    def prog(b, n, w):
        if b % 10 == 0 or b == n:
            print(f"  [{a.tag}] board {b}/{n}, {w} examples", flush=True)

    next_shard = 0
    for f in glob.glob(os.path.join(a.out, f"shard_{a.tag}_*.jsonl")):
        m = re.search(rf"shard_{re.escape(a.tag)}_(\d+)\.jsonl$", f)
        if m:
            next_shard = max(next_shard, int(m.group(1)) + 1)
    batch, total, seed = 0, 0, a.seed + next_shard
    while True:
        w, next_shard = generate_razz(
            a.out, a.street, a.boards, a.per_board, a.iters, a.samples,
            seed=seed, tag=a.tag, shard_size=a.shard_size, n_dead=a.n_dead,
            start_shard=next_shard, progress=prog)
        total += w
        batch += 1
        print(f"[{a.tag}] batch {batch}: +{w} ({total} total) -> {a.out}", flush=True)
        if not a.forever:
            break
        seed += 1_000_003
    print(f"[{a.tag}] done: {total} examples")


def _selftest():
    import shutil
    import tempfile
    out = tempfile.mkdtemp(prefix="razz_bucketgen_")
    try:
        # tiny board (n_dead shrinks the matrix board) for a fast test
        n, ns = generate_razz(out, street=7, boards=1, per_board=3, iters=60,
                              samples=30, seed=1, tag='t', shard_size=2,
                              n_dead=30)
        assert n == 3, n
        rows = list(read_shards(out))
        assert len(rows) == 3
        for ex in rows:
            assert ex['game'] == 'razz'
            assert ex['bucketed'] and ex['n_buckets'] == N_BUCKETS
            assert len(ex['branges'][0]) == N_BUCKETS
            assert len(ex['cfv'][0]) == N_BUCKETS and len(ex['cfv'][1]) == N_BUCKETS
            assert abs(sum(ex['branges'][0]) - 1.0) < 1e-9
            assert abs(ex['value'][0] + ex['value'][1]) < 1e-6, ex['value']
        print(f"ok: datagen_razz self-tests pass ({n} bucketed razz examples, "
              f"{N_BUCKETS}-bucket records validated)")
    finally:
        shutil.rmtree(out, ignore_errors=True)


if __name__ == "__main__":
    import sys
    (_selftest if len(sys.argv) == 1 else _cli)()
