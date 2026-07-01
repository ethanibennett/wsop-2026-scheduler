"""200-bucket EMD datagen for the Stud 8 7th-street value net — the ABSTRACTION
TEST. Identical pipeline to datagen_bucketed.py, but a board's bucket structure
comes from bucket_emd (k-means on outcome-distribution histograms, ~200 buckets)
instead of bucket.py's 25 hi×lo classes. The question this answers: does a finer,
homogeneity-tighter abstraction lift the 7th net past its R²≈0.94 ceiling?

Only the share-matrix builder changes. resolve_bucketed (bucket_resolve.py) is
abstraction-agnostic when handed a share_matrix + n_buckets — it runs CFR over
range(n_buckets) — so it is reused verbatim. We group holdings by bucket_emd's
board-relative, per-seat k-means bmap rather than the stateless hi×lo grid.

7th street ONLY: the EMD feature is each complete hand's showdown-share
distribution, which is well-defined only when holdings are complete (3 down + 4
up). That is exactly the leaf street where the ceiling lives.

Same JSONL schema as datagen_bucketed (n_buckets=200 + abstraction='emd' stamped
per record), so train.py / validate.py consume it unchanged — PROVIDED they read
n_buckets from the record rather than a fixed import. VERIFY that before a full
run (see OVERNIGHT.md note).

Writes OUTSIDE the scanned project tree by default (~/fg_solver_data.noindex) per
the stability rule: never grind tiny shards into the directory Claude Code scans.

  .venv/bin/python datagen_emd.py --boards 200 --per-board 20 --iters 150
"""
from __future__ import annotations
import glob
import json
import os
import random
import re
from collections import defaultdict
from typing import List, Optional

from pbs import enumerate_holdings, down_count
from eval_stud8 import best_hi, best_lo8
from bucket_emd import N_BUCKETS, bucket_map
from bucket_resolve import _share_from_scores, resolve_bucketed
from datagen import sample_range, read_shards
from datagen_bucketed import sample_board, _pot

DEFAULT_OUT = os.path.expanduser("~/fg_solver_data.noindex/st7_emd")


def sample_share_matrix_emd(board: List[str], k: int, up0: List[str],
                            up1: List[str], n_buckets: int = N_BUCKETS,
                            samples: int = 60, rng: Optional[random.Random] = None,
                            seed: int = 0,
                            holding_cap: int = 4000) -> List[List[float]]:
    """Seat-0 expected pot share per (emd_bucket0, emd_bucket1), sampled.

    Mirrors bucket_resolve.sample_share_matrix but groups holdings by the EMD
    k-means bmap (board-relative, per-seat perspective) instead of the stateless
    25-bucket hi×lo grid. seat-0 features its holdings vs up1; seat-1 features vs
    up0 (the perspectives, hence the buckets, differ per seat). The bmap is
    aligned to enumerate_holdings(board, k), so we subsample by INDEX to keep the
    holding<->bucket alignment intact under holding_cap."""
    rng = rng or random.Random(seed)
    holds = enumerate_holdings(board, k)
    bmap0 = bucket_map(board, k, up0, up1=up1, seed=seed, n_buckets=n_buckets)
    bmap1 = bucket_map(board, k, up1, up1=up0, seed=seed, n_buckets=n_buckets)

    idxs = list(range(len(holds)))
    if len(idxs) > holding_cap:
        idxs = rng.sample(idxs, holding_cap)

    by0, by1 = defaultdict(list), defaultdict(list)
    for i in idxs:
        h = holds[i]
        c0 = list(h) + up0
        by0[bmap0[i]].append((frozenset(h), best_hi(c0), best_lo8(c0)))
        c1 = list(h) + up1
        by1[bmap1[i]].append((frozenset(h), best_hi(c1), best_lo8(c1)))

    M = [[0.5] * n_buckets for _ in range(n_buckets)]
    for a in range(n_buckets):
        ha = by0.get(a)
        if not ha:
            continue
        for b in range(n_buckets):
            hb = by1.get(b)
            if not hb:
                continue
            tot, cnt = 0.0, 0
            for _ in range(samples):
                cx, hix, lox = rng.choice(ha)
                cy, hiy, loy = rng.choice(hb)
                if cx & cy:
                    continue
                tot += _share_from_scores(hix, lox, hiy, loy)
                cnt += 1
            if cnt:
                M[a][b] = tot / cnt
    return M


def generate_emd(out_dir: str, boards: int, per_board: int = 20, iters: int = 150,
                 samples: int = 60, seed: int = 0, tag: str = "e0",
                 shard_size: int = 2000, n_dead: int = 0,
                 n_buckets: int = N_BUCKETS, street: int = 7,
                 start_shard: int = 0, progress: Optional[callable] = None):
    """Generate `boards` × `per_board` EMD-bucketed 7th-street examples. Returns
    (n_written, next_shard_idx). The per-board EMD clustering + share matrix is
    computed ONCE per board and amortized across per_board range samples."""
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
        # per-board EMD bucketing seed is board-stable so bmap matches the matrix
        M = sample_share_matrix_emd(board, k, up[0], up[1], n_buckets, samples,
                                    rng, seed=seed + bi)
        for _ in range(per_board):
            pot = _pot(street, rng)
            r0 = sample_range(n_buckets, rng)
            r1 = sample_range(n_buckets, rng)
            res = resolve_bucketed(street, up, dead, pot, r0, r1, iters=iters,
                                   share_matrix=M, n_buckets=n_buckets)
            ex = {'street': street, 'up': up, 'dead': dead, 'pot': pot,
                  'bucketed': True, 'n_buckets': n_buckets, 'abstraction': 'emd',
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
    p = argparse.ArgumentParser(description="200-bucket EMD 7th-street datagen.")
    p.add_argument('--out', default=DEFAULT_OUT,
                   help=f"shard dir (default external: {DEFAULT_OUT})")
    p.add_argument('--tag', default='e0', help="unique per worker (shard prefix)")
    p.add_argument('--boards', type=int, default=200)
    p.add_argument('--per-board', type=int, default=20)
    p.add_argument('--iters', type=int, default=150)
    p.add_argument('--samples', type=int, default=60)
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--shard-size', type=int, default=2000)
    p.add_argument('--n-dead', type=int, default=0)
    p.add_argument('--n-buckets', type=int, default=N_BUCKETS)
    p.add_argument('--forever', action='store_true', help="loop batches until killed")
    a = p.parse_args()

    def prog(b, n, w):
        if b % 5 == 0 or b == n:
            print(f"  [{a.tag}] board {b}/{n}, {w} examples", flush=True)

    next_shard = 0
    for f in glob.glob(os.path.join(a.out, f"shard_{a.tag}_*.jsonl")):
        m = re.search(rf"shard_{re.escape(a.tag)}_(\d+)\.jsonl$", f)
        if m:
            next_shard = max(next_shard, int(m.group(1)) + 1)
    batch, total, seed = 0, 0, a.seed + next_shard
    while True:
        w, next_shard = generate_emd(
            a.out, a.boards, a.per_board, a.iters, a.samples, seed=seed,
            tag=a.tag, shard_size=a.shard_size, n_dead=a.n_dead,
            n_buckets=a.n_buckets, start_shard=next_shard, progress=prog)
        total += w
        batch += 1
        print(f"[{a.tag}] batch {batch}: +{w} ({total} total) -> {a.out}", flush=True)
        if not a.forever:
            break
        seed += 1_000_003
    print(f"[{a.tag}] done: {total} EMD examples")


def _selftest():
    """Tiny end-to-end check (needs the venv: numpy for k-means + eval_stud8)."""
    import shutil
    import tempfile
    out = tempfile.mkdtemp(prefix="st7_emd_gen_")
    try:
        # n_dead=34 shrinks 7th-street holdings (C(10,3)=120) for a fast test;
        # small n_buckets so k-means + matrix are quick.
        n, _ = generate_emd(out, boards=1, per_board=3, iters=40, samples=20,
                            seed=1, tag='t', shard_size=2, n_dead=34,
                            n_buckets=40)
        rows = list(read_shards(out))
        assert n == 3 and len(rows) == 3, (n, len(rows))
        for ex in rows:
            assert ex['street'] == 7 and ex['bucketed'] and ex['abstraction'] == 'emd'
            assert ex['n_buckets'] == 40
            assert len(ex['branges'][0]) == 40 and len(ex['cfv'][0]) == 40
            assert abs(sum(ex['branges'][0]) - 1.0) < 1e-9
            assert abs(ex['value'][0] + ex['value'][1]) < 1e-6, ex['value']  # zero-sum
        print(f"ok: datagen_emd self-test passes ({n} EMD examples, 200-bucket "
              f"abstraction, zero-sum + schema-compatible with datagen_bucketed)")
    finally:
        shutil.rmtree(out, ignore_errors=True)


if __name__ == "__main__":
    import sys
    (_selftest if len(sys.argv) == 1 else _cli)()
