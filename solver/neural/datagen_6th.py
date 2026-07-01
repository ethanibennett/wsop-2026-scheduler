"""6th-street datagen via the trained 7th-street net as a depth-limited LEAF —
the DeepStack bootstrap step (train street N using street N+1's net as the leaf).

For each sampled 6th-street board + bucketed ranges, we solve the 6th betting
tree with `depth_limit=1`, valuing the 6th->7th boundary with the trained 7th
net (`net_leaf`) instead of an exact showdown. The resulting per-holding 6th CFVs
are aggregated to buckets — the training target for a 6th-street net. Same JSONL
schema as `datagen_bucketed` (street=6), so `validate.py`/`train.py` consume it
unchanged. Repeat (6th net -> 5th, etc.) to grow a full-game neural solver.

Needs the venv (torch + the 7th net):
  .venv/bin/python datagen_6th.py --net nets/st7_100k.pt --out data/st6 \
      --boards 200 --per-board 20 --iters 150
"""
from __future__ import annotations
import glob
import json
import os
import random
import re
from typing import List, Optional

from pbs import PBS, enumerate_holdings, down_count
from bucket import N_BUCKETS, bucket_map, aggregate_cfv
from resolve import resolve_subgame
from net_leaf import make_leaf_value_fn, torch_predict_fn
from datagen import sample_range, read_shards
from datagen_bucketed import sample_board, _pot


def _scatter(br: List[float], bmap: List[int], n_buckets: int) -> List[float]:
    """Bucketed range -> per-holding reach (uniform within each bucket)."""
    counts = [0] * n_buckets
    for b in bmap:
        counts[b] += 1
    return [br[bmap[i]] / counts[bmap[i]] if counts[bmap[i]] else 0.0
            for i in range(len(bmap))]


def _present_renorm(br: List[float], bmap: List[int], n_buckets: int) -> List[float]:
    """Zero out buckets that don't occur on this board and renormalize onto the
    PRESENT ones. A board only realizes a subset of the 25 hi×lo classes; without
    this, _scatter silently drops the sampled mass on absent buckets, scaling the
    CFV target while the stored range stays full-mass (input/target desync). After
    this, the scattered per-holding reach sums to 1 and matches the stored range."""
    present = set(bmap)
    m = [br[b] if b in present else 0.0 for b in range(n_buckets)]
    s = sum(m)
    return [x / s for x in m] if s > 1e-12 else m


def _load_net(path: str):
    import torch
    from value_net import CounterfactualValueNet
    from pbs import BOARD_DIM, EXTRA_DIM
    net = CounterfactualValueNet(n_holdings=N_BUCKETS, board_dim=BOARD_DIM,
                                 extra_dim=EXTRA_DIM)
    net.load_state_dict(torch.load(path, map_location='cpu'))
    net.eval()
    return net


def generate_6th(out_dir: str, net_path: str, boards: int, per_board: int = 20,
                 iters: int = 150, seed: int = 0, tag: str = "s6",
                 shard_size: int = 500, n_dead: int = 0, start_shard: int = 0,
                 progress: Optional[callable] = None):
    """Generate `boards` × `per_board` bucketed 6th-street examples. Returns
    (n_written, next_shard_idx)."""
    os.makedirs(out_dir, exist_ok=True)
    rng = random.Random(seed)
    leaf = make_leaf_value_fn(torch_predict_fn(_load_net(net_path)))   # 7th net leaf
    k = down_count(6)
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
        up, dead = sample_board(6, rng, n_dead)
        board = up[0] + up[1] + dead
        holds = enumerate_holdings(board, k)
        bmap0 = bucket_map(board, k, up[0])
        bmap1 = bucket_map(board, k, up[1])
        for _ in range(per_board):
            pot = _pot(6, rng)
            br0 = _present_renorm(sample_range(N_BUCKETS, rng), bmap0, N_BUCKETS)
            br1 = _present_renorm(sample_range(N_BUCKETS, rng), bmap1, N_BUCKETS)
            r0 = _scatter(br0, bmap0, N_BUCKETS)   # now sums to 1 — no mass dropped
            r1 = _scatter(br1, bmap1, N_BUCKETS)
            res = resolve_subgame(
                PBS(street=6, up=up, dead=dead, pot=pot, ranges=[r0, r1]),
                iters=iters, depth_limit=1, leaf_value_fn=leaf, holdings=holds)
            bcfv0 = aggregate_cfv(res['cfv'][0], r0, bmap0, N_BUCKETS)
            bcfv1 = aggregate_cfv(res['cfv'][1], r1, bmap1, N_BUCKETS)
            ex = {'street': 6, 'up': up, 'dead': dead, 'pot': pot,
                  'bucketed': True, 'n_buckets': N_BUCKETS,
                  'branges': [br0, br1], 'cfv': [bcfv0, bcfv1],
                  'value': res['value']}
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
    p = argparse.ArgumentParser(description="6th-street bootstrap datagen (7th net leaf).")
    p.add_argument('--net', required=True, help="trained 7th-street net (state_dict)")
    p.add_argument('--out', required=True)
    p.add_argument('--tag', default='s6')
    p.add_argument('--boards', type=int, default=200)
    p.add_argument('--per-board', type=int, default=20)
    p.add_argument('--iters', type=int, default=150)
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--shard-size', type=int, default=500)
    p.add_argument('--n-dead', type=int, default=0)
    p.add_argument('--forever', action='store_true')
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
        w, next_shard = generate_6th(a.out, a.net, a.boards, a.per_board, a.iters,
                                     seed=seed, tag=a.tag, shard_size=a.shard_size,
                                     n_dead=a.n_dead, start_shard=next_shard, progress=prog)
        total += w
        batch += 1
        print(f"[{a.tag}] batch {batch}: +{w} ({total} total) -> {a.out}", flush=True)
        if not a.forever:
            break
        seed += 1_000_003
    print(f"[{a.tag}] done: {total} examples")


def _selftest():
    """Tiny end-to-end check (needs the venv + a 7th net at nets/st7_100k.pt)."""
    import shutil
    import tempfile
    net = "nets/st7_100k.pt"
    if not os.path.exists(net):
        print("skip: no 7th net at nets/st7_100k.pt (run in venv with a trained net)")
        return
    out = tempfile.mkdtemp(prefix="st6_gen_")
    try:
        n, _ = generate_6th(out, net, boards=1, per_board=3, iters=60, seed=1,
                            tag='t', shard_size=2, n_dead=30)   # n_dead shrinks holdings
        rows = list(read_shards(out))
        assert n == 3 and len(rows) == 3, (n, len(rows))
        for ex in rows:
            assert ex['street'] == 6 and ex['bucketed'] and ex['n_buckets'] == N_BUCKETS
            assert len(ex['cfv'][0]) == N_BUCKETS and len(ex['branges'][0]) == N_BUCKETS
            assert abs(ex['value'][0] + ex['value'][1]) < 1e-6, ex['value']   # zero-sum
            # range mass preserved: the stored range scatters to a full sum-1 reach,
            # so the CFV target is consistent with the input range (regression guard).
            board = ex['up'][0] + ex['up'][1] + ex['dead']
            r0 = _scatter(ex['branges'][0], bucket_map(board, down_count(6), ex['up'][0]), N_BUCKETS)
            assert abs(sum(r0) - 1.0) < 1e-9, f"range mass dropped: {sum(r0)}"
        print(f"ok: datagen_6th self-test passes ({n} bootstrap examples, 6th-street "
              f"CFVs from the 7th net leaf, zero-sum + range-mass-preserved + "
              f"{N_BUCKETS}-bucket records)")
    finally:
        shutil.rmtree(out, ignore_errors=True)


if __name__ == "__main__":
    import sys
    (_selftest if len(sys.argv) == 1 else _cli)()
