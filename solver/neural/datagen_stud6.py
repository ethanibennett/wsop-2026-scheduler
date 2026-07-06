"""24/7 BUCKETED 6th-street datagen for the stud/razz value net (M5 lane).

Generates (bucketed 6th-street PBS -> per-bucket CFV) examples by solving 6th +
7th JOINTLY over the bucket abstraction (bucket_resolve_stud6.resolve_stud6_
bucketed). Mirrors datagen_bucketed.py: a board's expensive precompute (the 7th
share matrix + the 6th->7th transition T0/T1) depends ONLY on the board, so it is
computed ONCE per board and reused across many range samples (amortization).
Robustness/throughput bounds mirror datagen_badugi.py: a hard SIGALRM per-solve
wall-clock budget (abandon+resample a pathological solve so no spot wedges a
worker) — iters stays fixed, so every emitted label is the exact bucketed solve.

Records are JSONL, the SAME schema datagen_bucketed.py writes (street=6,
bucketed=True, branges, cfv, value), so train.py's featurize consumes them with
no change; `game` ('stud8'|'razz') tags the record.

Pure Python (numpy is OUT). Throughput scales with cores via collect-stud6.sh
(separate processes, unique shard tags). Runs on pypy3.10 for speed.

CLI:
  python3 datagen_stud6.py --out data/st6 --game stud8 --tag w0 \
      --boards 40 --per-board 20 --iters 300 --samples 400 --forever
"""
from __future__ import annotations
import glob
import json
import os
import random
import re
import signal
from typing import List, Optional

from pbs import down_count
from resolve import STUD8
from datagen import sample_range
from bucket_resolve_stud6 import (resolve_stud6_bucketed, _GameBuckets,
                                  sample_transition)

try:
    from razz_game import RAZZ
except Exception:                                   # pragma: no cover
    RAZZ = None

DECK = [r + s for r in "23456789TJQKA" for s in "cdhs"]

# PATHOLOGICAL-only safety net (mirrors datagen_badugi): abandon+resample a solve
# slower than this so no single spot can pin a worker at 100% CPU producing zero
# shards. Generous — a normal full-board bucketed 6th solve is ~1-2s on PyPy.
SOLVE_BUDGET_S = 90.0


class _Budget(Exception):
    pass


def _solve_with_budget(fn, budget_s: float):
    """Run `fn()` under a hard SIGALRM wall-clock budget. Returns fn()'s result,
    or None if it exceeded budget_s (abandon + resample). budget_s<=0 disables."""
    if budget_s <= 0:
        return fn()

    def _fire(signum, frame):
        raise _Budget()

    prev = signal.signal(signal.SIGALRM, _fire)
    try:
        signal.setitimer(signal.ITIMER_REAL, budget_s)
        return fn()
    except _Budget:
        return None
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)     # disarm
        signal.signal(signal.SIGALRM, prev)


def sample_board(rng: random.Random, n_dead_max: int = 6):
    """Deal a reachable 6th-street public state: 4 upcards each (6th street has 4
    up + 2 down) + a random number of dead cards (folded opponents' door cards —
    card removal), then a pot. Returns (up, dead, pot)."""
    d = DECK[:]
    rng.shuffle(d)
    up = [d[:4], d[4:8]]
    n_dead = rng.randint(0, n_dead_max)
    dead = d[8:8 + n_dead]
    bb = 8                                            # big bet on 5th+ (bet_size)
    pot = float(2 * rng.randint(1, 8) * bb)
    return up, dead, pot


def generate_stud6(out_dir: str, game_name: str, boards: int, per_board: int = 20,
                   iters: int = 300, samples: int = 400, seed: int = 0,
                   tag: str = "w0", shard_size: int = 25, n_dead_max: int = 6,
                   start_shard: int = 0, budget_s: float = SOLVE_BUDGET_S,
                   progress: Optional[callable] = None):
    """Generate `boards` x `per_board` bucketed 6th-street examples into out_dir.

    Returns (n_written, next_shard_idx). The 7th share matrix + transition T are
    computed once per board and reused across `per_board` range samples."""
    os.makedirs(out_dir, exist_ok=True)
    game = RAZZ if game_name == 'razz' else STUD8
    if game_name == 'razz' and RAZZ is None:
        raise RuntimeError("razz game unavailable")
    gb = _GameBuckets(game)
    nb = gb.nb6
    rng = random.Random(seed)
    shard: List[dict] = []
    shard_idx = start_shard
    written = 0

    def flush():
        nonlocal shard, shard_idx
        if not shard:
            return
        path = os.path.join(out_dir, f"shard_{game_name}_{tag}_{shard_idx:05d}.jsonl")
        with open(path, 'w') as f:
            for ex in shard:
                f.write(json.dumps(ex) + "\n")
        shard_idx += 1
        shard = []

    bi = 0
    while bi < boards:
        up, dead, pot0 = sample_board(rng, n_dead_max)
        board = up[0] + up[1] + dead
        # board-only precompute (amortized). Guard it too — a degenerate board
        # could in principle be slow to sample; abandon+resample.
        pre = _solve_with_budget(
            lambda: (gb.share_matrix7(board, up[0], up[1], samples, rng),
                     sample_transition(board, up[0], up[1], gb, samples, rng)),
            budget_s)
        if pre is None:
            continue
        share7, (T0, T1) = pre
        made = 0
        for _ in range(per_board):
            pot = pot0 if made == 0 else float(2 * rng.randint(1, 8) * 8)
            r0 = sample_range(nb, rng)
            r1 = sample_range(nb, rng)
            res = _solve_with_budget(
                lambda: resolve_stud6_bucketed(
                    up, dead, pot, r0, r1, iters=iters,
                    share7=share7, T0=T0, T1=T1, game=game),
                budget_s)
            if res is None:
                continue
            ex = {'street': 6, 'up': up, 'dead': dead, 'pot': pot,
                  'bucketed': True, 'n_buckets': nb, 'game': game_name,
                  'branges': [r0, r1], 'cfv': res['cfv'], 'value': res['value'],
                  'exploitability': res.get('exploitability'), 'iters': iters}
            shard.append(ex)
            written += 1
            made += 1
            if len(shard) >= shard_size:
                flush()
        bi += 1
        if progress:
            progress(bi, boards, written)
    flush()
    return written, shard_idx


def _cli():
    import argparse
    p = argparse.ArgumentParser(description="24/7 bucketed 6th-street datagen.")
    p.add_argument('--out', required=True)
    p.add_argument('--game', default='stud8', choices=['stud8', 'razz'])
    p.add_argument('--tag', default='w0', help="unique per worker (shard prefix)")
    p.add_argument('--boards', type=int, default=40)
    p.add_argument('--per-board', type=int, default=20)
    p.add_argument('--iters', type=int, default=300)
    p.add_argument('--samples', type=int, default=400,
                   help="board-precompute sample count (share matrix + T)")
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--shard-size', type=int, default=25)
    p.add_argument('--n-dead-max', type=int, default=6)
    p.add_argument('--budget-s', type=float, default=SOLVE_BUDGET_S,
                   help="hard per-solve wall-clock budget (s); abandon+resample "
                        "a slower solve so no spot can wedge a worker (0=off)")
    p.add_argument('--forever', action='store_true', help="loop until killed")
    a = p.parse_args()

    def prog(b, n, w):
        if b % 5 == 0 or b == n:
            print(f"  [{a.game}/{a.tag}] board {b}/{n}, {w} examples", flush=True)

    # restart-safe: continue this (game,tag)'s shard numbering
    next_shard = 0
    for f in glob.glob(os.path.join(a.out, f"shard_{a.game}_{a.tag}_*.jsonl")):
        m = re.search(rf"shard_{re.escape(a.game)}_{re.escape(a.tag)}_(\d+)\.jsonl$", f)
        if m:
            next_shard = max(next_shard, int(m.group(1)) + 1)
    batch, total, seed = 0, 0, a.seed + next_shard
    while True:
        w, next_shard = generate_stud6(
            a.out, a.game, a.boards, a.per_board, a.iters, a.samples,
            seed=seed, tag=a.tag, shard_size=a.shard_size,
            n_dead_max=a.n_dead_max, start_shard=next_shard,
            budget_s=a.budget_s, progress=prog)
        total += w
        batch += 1
        print(f"[{a.game}/{a.tag}] batch {batch}: +{w} ({total} total) -> {a.out}",
              flush=True)
        if not a.forever:
            break
        seed += 1_000_003
    print(f"[{a.game}/{a.tag}] done: {total} examples")


def _selftest():
    import shutil
    import tempfile
    from datagen import read_shards
    from bucket_resolve_stud6 import _GameBuckets as _GB
    out = tempfile.mkdtemp(prefix="stud6_datagen_")
    try:
        # tiny fast run per game
        for gname in (['stud8'] + (['razz'] if RAZZ is not None else [])):
            n, ns = generate_stud6(out, gname, boards=1, per_board=3, iters=120,
                                   samples=200, seed=1, tag='t', shard_size=2,
                                   n_dead_max=2)
            assert n == 3, (gname, n)
            gb = _GB(RAZZ if gname == 'razz' else STUD8)
            rows = [r for r in read_shards(out) if r.get('game') == gname]
            assert len(rows) == 3, (gname, len(rows))
            covered = set()
            for ex in rows:
                assert ex['street'] == 6 and ex['bucketed']
                assert ex['n_buckets'] == gb.nb6
                assert len(ex['branges'][0]) == gb.nb6
                assert len(ex['cfv'][0]) == gb.nb6 and len(ex['cfv'][1]) == gb.nb6
                assert abs(sum(ex['branges'][0]) - 1.0) < 1e-9
                assert abs(ex['value'][0] + ex['value'][1]) < 1e-6, ex['value']
                for r in ex['branges'][0] + ex['branges'][1]:
                    pass
                covered.update(b for b, m in enumerate(ex['branges'][0]) if m > 0)
            assert len(covered) >= 2, (gname, 'too few buckets covered', covered)
            print(f"ok: datagen_stud6 [{gname}] {n} examples, {gb.nb6}-bucket "
                  f"6th records validated (zero-sum, normalized, buckets covered)")
        # budget path: a 0-budget solve is abandoned (returns None, never wedges)
        assert _solve_with_budget(lambda: __import__('time').sleep(5), 1e-9) is None
        assert _solve_with_budget(lambda: 42, 30.0) == 42
        print("ok: datagen_stud6 budget safeguard honored (abandon+resample)")
    finally:
        shutil.rmtree(out, ignore_errors=True)


if __name__ == "__main__":
    import sys
    (_selftest if len(sys.argv) == 1 else _cli)()
