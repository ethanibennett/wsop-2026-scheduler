"""emd_ceiling.py — does the 200-bucket EMD abstraction raise the R² ceiling?

A CHEAP, decisive gate BEFORE committing to the ~8h EMD datagen grind. The 7th
net plateaued at R²≈0.94, which is the 25-bucket abstraction's irreducible error:
the reach-weighted within-bucket spread of true per-holding value. We measure that
spread directly for BOTH abstractions on real 7th boards and convert each to an
achievable-R² ceiling = 1 - within_var/total_var. No datagen, no net training.

Per-holding value proxy: E[showdown share] (exactly what a 7th-leaf CFV
integrates), the same proxy bucket_emd.within_bucket_variance uses. Uniform reach
— the relative comparison (EMD vs 25 under matched reach) is what decides the
question. mean_share is computed ONCE per board and reused for both abstractions.

  .venv/bin/python emd_ceiling.py [n_boards]
"""
from __future__ import annotations
import os
import random
import statistics
from collections import defaultdict

from pbs import enumerate_holdings, down_count
from bucket import bucket_map as bmap25
from bucket_emd import bucket_map as bmapEMD, within_bucket_variance

DECK = [r + s for r in "23456789TJQKA" for s in "cdhs"]


def _within(mean_share, bmap, reach):
    """Reach-weighted within-bucket variance of mean_share under `bmap`."""
    members = defaultdict(list)
    for i, b in enumerate(bmap):
        members[b].append(i)
    tw, tv = 0.0, 0.0
    for _b, idxs in members.items():
        w = sum(reach[i] for i in idxs)
        if w <= 1e-12:
            continue
        mu = sum(reach[i] * mean_share[i] for i in idxs) / w
        tv += w * (sum(reach[i] * (mean_share[i] - mu) ** 2 for i in idxs) / w)
        tw += w
    return tv / tw if tw > 0 else 0.0


def _total(mean_share, reach):
    w = sum(reach)
    mu = sum(reach[i] * mean_share[i] for i in range(len(reach))) / w
    return sum(reach[i] * (mean_share[i] - mu) ** 2 for i in range(len(reach))) / w


def run(n_boards=10, emd_buckets=200, seed=0, out=None):
    if out:
        os.makedirs(os.path.dirname(out), exist_ok=True)
    rng = random.Random(seed)
    k = down_count(7)
    r25s, remds = [], []
    for bi in range(n_boards):
        d = DECK[:]
        rng.shuffle(d)
        up0, up1 = d[:4], d[4:8]
        board = up0 + up1
        holds = enumerate_holdings(board, k)
        H = len(holds)
        reach = [1.0 / H] * H
        be = bmapEMD(board, k, up0, up1=up1, seed=seed + bi, n_buckets=emd_buckets)
        # returns (within_var_emd, mean_share) — reuse mean_share for the 25-bucket pass
        wv_emd, mean_share = within_bucket_variance(board, k, up0, up1, be, reach, rng)
        b25 = bmap25(board, k, up0)
        wv_25 = _within(mean_share, b25, reach)
        tv = _total(mean_share, reach)
        r2_25 = 1 - wv_25 / tv if tv > 0 else 0.0
        r2_emd = 1 - wv_emd / tv if tv > 0 else 0.0
        r25s.append(r2_25)
        remds.append(r2_emd)
        line = (f"board {bi+1}/{n_boards}: H={H} buckets(25={len(set(b25))},"
                f"emd={len(set(be))}) ceiling R2: 25={r2_25:.4f} emd={r2_emd:.4f}")
        print(line, flush=True)
        if out:
            with open(out, 'a') as f:
                f.write(line + "\n")
    m25, memd = statistics.mean(r25s), statistics.mean(remds)
    verdict = ("EMD raises the ceiling — heavier datagen justified"
               if memd > m25 + 0.01 else
               "EMD does NOT meaningfully raise the ceiling — skip the grind")
    summ = (f"\n=== EMD CEILING TEST ({n_boards} boards, emd_buckets={emd_buckets}) ===\n"
            f"mean ceiling R2  25-bucket : {m25:.4f}\n"
            f"mean ceiling R2  EMD-{emd_buckets}   : {memd:.4f}\n"
            f"lift               : {memd - m25:+.4f}   (25-bucket net achieved ~0.94)\n"
            f"verdict: {verdict}")
    print(summ, flush=True)
    if out:
        with open(out, 'a') as f:
            f.write(summ + "\n")
    return m25, memd


if __name__ == "__main__":
    import sys
    out_path = os.path.expanduser("~/fg_solver_data.noindex/emd_ceiling.txt")
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    run(n_boards=n, out=out_path)
