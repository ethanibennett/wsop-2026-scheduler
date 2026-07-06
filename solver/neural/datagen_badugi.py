"""M2b: 24/7 BUCKETED one-draw BADUGI datagen (the badugi value-net grind).

Samples reachable pre-draw PBS spots (varied start states / pots / bucket
ranges), solves each EXACTLY on the 19-bucket lifted 2-round game
(draw_bucket.resolve_draw2_bucketed -> resolve_draw2's CFR+ tree,
PURE-PYTHON path — the numpy backend did not pass its exactness verifiers),
and writes JSONL CFV shards in the SAME bucketed schema train.py consumes
(street/up/dead/pot/bucketed/n_buckets/branges/cfv/value/exploitability).
Badugi extras ride along in keys train.featurize ignores today ('game',
'start', 'draws_left', 'pre_bet'/'post_bet') for a badugi-aware featurize.

Badugi has no public board, so the expensive abstraction (19x19 share matrix +
draw projections) depends only on the deck: built ONCE, cached to
<out>/abstraction.json, shared by every worker and every spot — the amortized
analogue of stud's per-board share matrix, amortized over the WHOLE corpus.

Start states are reachable one-draw badugi pre-draw states: legal blinds
betting prefixes (fresh / limp / raise / 3-bet / cap) plus symmetric dead
money, and even fresh-round mid-hand states (the resolve_draw2 wart-fix shape).

CLI:
  python3 datagen_badugi.py --out data/badugi1 --tag w0 --n 200 --iters 400
  python3 datagen_badugi.py --out data/badugi1 --tag w0 --forever
"""
from __future__ import annotations
import glob
import json
import os
import random
import re
import signal
from typing import List, Optional

from datagen import sample_range
from draw_bucket import (N_DRAW_BUCKETS, load_or_build_abstraction,
                         resolve_draw2_bucketed)

PRE_BET, POST_BET = 2, 4

# ── Throughput / anti-wedge robustness (added 2026-07-05) ────────────────────
# ROOT CAUSE of the silent stall: solve time is dominated NOT by the holding
# universe (H = N_DRAW_BUCKETS = 19, constant) but by the REMAINING BETTING
# DEPTH of the sampled start = CAP(4) - start['bets']. A fresh/even spot
# (bets 0-1) expands the full pre-draw tree AND all 4x4 post-draw subgames, so
# at 1000 iters it takes ~20-33s, vs ~3-8s once several bets are already in.
# With ~43% of samples being these deep spots and a 25-example shard buffer, a
# cluster of them looks like a wedged worker (minutes with zero shards). A
# too-slow pathological spot (unseen range x start combo) could genuinely wedge.
#
# TWO bounds, neither of which lowers iters (so every EMITTED label stays exact
# at 1000 iters — the cap changes WHICH spots, not solve quality):
#   (a) SOLVE_BUDGET_S: a hard SIGALRM wall-clock budget per solve. If a solve
#       exceeds it, abandon + resample a fresh spot. Guarantees no single solve
#       can ever wedge a worker. Sized to fire ONLY on a pathological tail, not
#       on a legitimate deep spot even under full contention (the deepest normal
#       spot is ~30s solo / ~60s under 4-way contention) — abandoning a real
#       deep solve just burns that time for no shard, so the budget is a safety
#       net and DEEP_KEEP_PROB is the actual throughput lever.
#   (b) DEEP_KEEP_PROB: predictive (pre-solve, from start['bets']) sub-sampling
#       of the deepest spots so shards flow. Deep spots are the ~25s ones; we
#       still EMIT a fraction of them (corpus coverage of deep spots preserved,
#       NOT zeroed), but skip most so per-shard time is dominated by the fast
#       spots -> ~3x throughput. Skipped spots are resampled, not emitted short.
SOLVE_BUDGET_S = 150.0       # PATHOLOGICAL-only safety net: abandon+resample a
                             # solve slower than this. NOT a throughput knob —
                             # sized so it NEVER fires on a legitimate deep spot
                             # even under full N-worker CPU contention (measured:
                             # the deepest 'even' spot is ~30s solo, ~60s under
                             # 4-way contention). A budget that abandons real
                             # deep solves just burns that time for no shard —
                             # the throughput lever is DEEP_KEEP_PROB, not this.
DEEP_BETS_MAX = 1            # start['bets'] <= this == a deep (slow) spot
DEEP_KEEP_PROB = 0.10        # keep ~1/10 of deep spots (coverage kept, NOT
                             # zeroed); resample the rest. The deep 'even'/'fresh'
                             # spots are the 30-60s solves; skipping most of them
                             # PRE-SOLVE (cheap RNG, no wasted compute) keeps the
                             # emission mix near the fast shallow spots so shards
                             # flow. Every EMITTED deep-spot label is still the
                             # exact 1000-iter solve (iters unchanged).


class _SolveBudgetExceeded(Exception):
    pass


def _solve_with_budget(r0, r1, abs_, iters, start, budget_s):
    """resolve_draw2_bucketed under a hard SIGALRM wall-clock budget. Returns
    the result, or None if the solve exceeded budget_s (abandon + resample).
    The CFR solve is pure Python, so SIGALRM interrupts it between bytecodes."""
    if budget_s <= 0:
        return resolve_draw2_bucketed(r0, r1, abs_, iters=iters, start=start,
                                      pre_bet=PRE_BET, post_bet=POST_BET)

    def _fire(_sig, _frm):
        raise _SolveBudgetExceeded()

    prev = signal.signal(signal.SIGALRM, _fire)
    try:
        signal.setitimer(signal.ITIMER_REAL, budget_s)
        return resolve_draw2_bucketed(r0, r1, abs_, iters=iters, start=start,
                                      pre_bet=PRE_BET, post_bet=POST_BET)
    except _SolveBudgetExceeded:
        return None
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)   # disarm
        signal.signal(signal.SIGALRM, prev)


def sample_start(rng: random.Random) -> dict:
    """A reachable pre-draw start state: a legal blinds betting prefix
    (small bet 2, cap 4) + optional symmetric dead money, or an even
    fresh-round state (arbitrary mid-hand spot, both flavors resolve_draw2
    accepts). Weighted toward the common shapes."""
    d = rng.choice([0, 0, 0, 2, 4, 8, 12])         # symmetric dead money
    kind = rng.choices(
        ['fresh', 'limp', 'raise', 'threebet', 'cap', 'even'],
        weights=[3, 2, 3, 2, 1, 3])[0]
    if kind == 'fresh':      # blinds, button (seat 0) to act
        st = dict(contrib=[1, 2], bets=1, toAct=0, acted=[False, False])
    elif kind == 'limp':     # SB completed, BB may raise
        st = dict(contrib=[2, 2], bets=1, toAct=1, acted=[True, False])
    elif kind == 'raise':    # SB raised to 4
        st = dict(contrib=[4, 2], bets=2, toAct=1, acted=[True, False])
    elif kind == 'threebet':  # BB 3-bet to 6
        st = dict(contrib=[4, 6], bets=3, toAct=0, acted=[True, True])
    elif kind == 'cap':      # SB capped at 8, BB facing 2
        st = dict(contrib=[8, 6], bets=4, toAct=1, acted=[True, True])
    else:                    # even fresh-round mid-hand state
        c = rng.choice([2, 3, 4, 6, 8, 12])
        st = dict(contrib=[c, c], bets=0, toAct=rng.randint(0, 1),
                  acted=[False, False])
        d = 0
    st['contrib'] = [st['contrib'][0] + d, st['contrib'][1] + d]
    st['base'] = d
    st['kind'] = kind
    return st


def generate_badugi(out_dir: str, n: int, iters: int = 1000, seed: int = 0,
                    tag: str = 'w0', shard_size: int = 25,
                    abs_path: Optional[str] = None, start_shard: int = 0,
                    progress: Optional[callable] = None,
                    budget_s: float = SOLVE_BUDGET_S,
                    deep_keep_prob: float = DEEP_KEEP_PROB):
    """Generate `n` bucketed one-draw badugi examples. Returns
    (n_written, next_shard_idx).

    Robustness bounds (do NOT change solve quality — iters stays fixed, every
    emitted label is the exact 1000-iter solve):
      * deep_keep_prob: pre-solve, sub-sample the deepest (slowest) start
        shapes (start['bets'] <= DEEP_BETS_MAX) so shards flow; a skipped spot
        is RESAMPLED, never emitted under-solved.
      * budget_s: a hard per-solve wall-clock budget; a solve that exceeds it is
        abandoned and the spot resampled (no single solve can wedge a worker).
    """
    os.makedirs(out_dir, exist_ok=True)
    abs_ = load_or_build_abstraction(
        abs_path or os.path.join(out_dir, 'abstraction.json'))
    rng = random.Random(seed)
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

    def sample_solvable():
        """Draw a (start, kind, r0, r1, res) that passed both bounds. Loops
        until one is emitted; never returns an under-solved label."""
        while True:
            start = sample_start(rng)
            # (b) predictive deep-spot sub-sample: skip most slow (deep) spots
            # BEFORE solving. bets<=DEEP_BETS_MAX == full remaining betting tree.
            if start['bets'] <= DEEP_BETS_MAX and rng.random() >= deep_keep_prob:
                continue
            kind = start.pop('kind')
            r0 = sample_range(N_DRAW_BUCKETS, rng)
            r1 = sample_range(N_DRAW_BUCKETS, rng)
            # (a) hard wall-clock budget: abandon+resample a pathological solve.
            res = _solve_with_budget(r0, r1, abs_, iters, start, budget_s)
            if res is None:
                continue
            return start, kind, r0, r1, res

    for t in range(n):
        start, kind, r0, r1, res = sample_solvable()
        ex = {'street': 3, 'up': [[], []], 'dead': [], 'pot': res['pot'],
              'bucketed': True, 'n_buckets': N_DRAW_BUCKETS,
              'branges': [r0, r1], 'cfv': res['cfv'], 'value': res['value'],
              'exploitability': res['exploitability'],
              # badugi context (ignored by today's featurize, kept for the
              # badugi-aware one): the exact pre-draw start state + game tag
              'game': 'badugi', 'draws_left': 1, 'start': start,
              'start_kind': kind, 'pre_bet': PRE_BET, 'post_bet': POST_BET,
              'iters': iters}
        shard.append(ex)
        written += 1
        if len(shard) >= shard_size:
            flush()
        if progress:
            progress(t + 1, n)
    flush()
    return written, shard_idx


def _cli():
    import argparse
    p = argparse.ArgumentParser(description="24/7 bucketed badugi datagen.")
    p.add_argument('--out', required=True)
    p.add_argument('--tag', default='w0', help="unique per worker")
    p.add_argument('--n', type=int, default=200, help="examples per batch")
    p.add_argument('--iters', type=int, default=1000)
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--shard-size', type=int, default=25)
    p.add_argument('--abstraction', default=None,
                   help="abstraction JSON path (default <out>/abstraction.json)")
    p.add_argument('--budget-s', type=float, default=SOLVE_BUDGET_S,
                   help="hard per-solve wall-clock budget (s); abandon+resample "
                        "a slower solve so no spot can wedge a worker (0=off)")
    p.add_argument('--deep-keep-prob', type=float, default=DEEP_KEEP_PROB,
                   help="keep-probability for deep (slow) start shapes "
                        "(bets<=%d); sub-samples them for throughput "
                        "(1.0=keep all)" % DEEP_BETS_MAX)
    p.add_argument('--forever', action='store_true')
    a = p.parse_args()

    def prog(t, n):
        if t % 25 == 0 or t == n:
            print(f"  [{a.tag}] {t}/{n} solved", flush=True)

    # restart-safe: continue this tag's shard numbering
    next_shard = 0
    for f in glob.glob(os.path.join(a.out, f"shard_{a.tag}_*.jsonl")):
        m = re.search(rf"shard_{re.escape(a.tag)}_(\d+)\.jsonl$", f)
        if m:
            next_shard = max(next_shard, int(m.group(1)) + 1)
    batch, total, seed = 0, 0, a.seed + 7919 * next_shard
    while True:
        w, next_shard = generate_badugi(a.out, a.n, iters=a.iters, seed=seed,
                                        tag=a.tag, shard_size=a.shard_size,
                                        abs_path=a.abstraction,
                                        start_shard=next_shard, progress=prog,
                                        budget_s=a.budget_s,
                                        deep_keep_prob=a.deep_keep_prob)
        total += w
        batch += 1
        print(f"[{a.tag}] batch {batch}: +{w} ({total} total) -> {a.out}",
              flush=True)
        if not a.forever:
            break
        seed += 1_000_003
    print(f"[{a.tag}] done: {total} examples")


def _selftest():
    import shutil
    import tempfile
    from datagen import read_shards
    out = tempfile.mkdtemp(prefix="badugi_datagen_")
    try:
        # tiny abstraction for speed; the record contract is what's under test
        from draw_bucket import build_draw_abstraction, save_abstraction
        ap = os.path.join(out, 'abstraction.json')
        save_abstraction(build_draw_abstraction(
            seed=2, per_bucket=60, pair_samples=40, proj_hands=20,
            k3_draw_samples=60), ap)
        n, ns = generate_badugi(out, n=4, iters=120, seed=9, tag='t',
                                shard_size=3, abs_path=ap)
        assert n == 4 and ns == 2, (n, ns)
        rows = list(read_shards(out))
        assert len(rows) == 4
        kinds = set()
        for ex in rows:
            assert ex['bucketed'] and ex['n_buckets'] == N_DRAW_BUCKETS
            assert len(ex['branges'][0]) == N_DRAW_BUCKETS
            assert len(ex['cfv'][0]) == N_DRAW_BUCKETS
            assert len(ex['cfv'][1]) == N_DRAW_BUCKETS
            assert abs(sum(ex['branges'][0]) - 1.0) < 1e-9
            assert abs(ex['value'][0] + ex['value'][1]) < 1e-6, ex['value']
            assert ex['pot'] == sum(ex['start']['contrib'])
            assert ex['game'] == 'badugi' and ex['draws_left'] == 1
            kinds.add(ex['start_kind'])
        # determinism: same seed -> identical first record
        out2 = tempfile.mkdtemp(prefix="badugi_datagen2_")
        try:
            generate_badugi(out2, n=1, iters=120, seed=9, tag='t',
                            abs_path=ap)
            a = next(read_shards(out)); b = next(read_shards(out2))
            assert a['start'] == b['start'] and a['cfv'] == b['cfv']
        finally:
            shutil.rmtree(out2, ignore_errors=True)
        # train.py featurize consumes the record (schema compatibility)
        from train import featurize
        f = featurize(rows[0])
        assert len(f['r0']) == N_DRAW_BUCKETS and len(f['t0']) == N_DRAW_BUCKETS

        # ROBUSTNESS BOUNDS (added 2026-07-05):
        # (a) the budget path returns None on a forced timeout (never escapes,
        #     never wedges); a generous budget passes every solve through and
        #     still emits n exact records (labels never truncated).
        r0t = sample_range(N_DRAW_BUCKETS, random.Random(1))
        r1t = sample_range(N_DRAW_BUCKETS, random.Random(2))
        st_ = dict(contrib=[2, 2], base=0, bets=0, toAct=0,
                   acted=[False, False])
        A = load_or_build_abstraction(ap)
        assert _solve_with_budget(r0t, r1t, A, 120, st_, 1e-9) is None
        assert _solve_with_budget(r0t, r1t, A, 120, st_, 60.0) is not None
        outb = tempfile.mkdtemp(prefix="badugi_datagen_budget_")
        try:
            nb2, _ = generate_badugi(outb, n=3, iters=120, seed=5, tag='b',
                                     shard_size=3, abs_path=ap, budget_s=60.0)
            assert nb2 == 3, nb2
            for ex in read_shards(outb):
                assert abs(ex['value'][0] + ex['value'][1]) < 1e-6
        finally:
            shutil.rmtree(outb, ignore_errors=True)
        # (b) deep_keep_prob=0 skips ALL deep (bets<=DEEP_BETS_MAX) spots -> every
        #     emitted spot is shallow; still emits n exact records.
        outd = tempfile.mkdtemp(prefix="badugi_datagen_deep_")
        try:
            nd, _ = generate_badugi(outd, n=6, iters=120, seed=7, tag='d',
                                    shard_size=6, abs_path=ap, deep_keep_prob=0.0)
            assert nd == 6, nd
            for ex in read_shards(outd):
                assert ex['start']['bets'] > DEEP_BETS_MAX, ex['start']
        finally:
            shutil.rmtree(outd, ignore_errors=True)

        print(f"ok: datagen_badugi self-tests pass ({n} examples, kinds "
              f"{sorted(kinds)}, records validated + deterministic + "
              f"featurize-compatible + budget/deep-skip bounds honored)")
    finally:
        shutil.rmtree(out, ignore_errors=True)


if __name__ == "__main__":
    import sys
    (_selftest if len(sys.argv) == 1 else _cli)()
