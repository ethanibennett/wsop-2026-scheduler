"""LIGHT validation: outcome-distribution buckets vs the 25-bucket scheme.

Measures, on a handful of 7th-street boards, how much MORE HOMOGENEOUS the
bucket_emd buckets are than bucket.py's 25-bucket grid. Homogeneity metric =
reach-weighted within-bucket variance of each holding's expected seat-0 showdown
share E[split_share(h+up0, o+up1)] (the scalar proxy for its true leaf CFV).
Lower = the holdings sharing a bucket really do behave alike = less abstraction
error. We also report a 1-D EMD-on-CDF variance, the "right" metric, to show the
finer scheme wins under the potential-aware distance too, not just Euclidean.

Does NOT train a net and does NOT run datagen. A few boards only. Run:
    .venv/bin/python _emd_homogeneity.py
"""
from __future__ import annotations
import random
import time

from pbs import enumerate_holdings, down_count
import bucket as b25
import bucket_emd as bemd

N_BUCKETS_FINE = 200       # the finer scheme's ceiling for this comparison
SAMPLE_BOARDS = 4
OPP_SAMPLE = 120           # opponents per holding for the *evaluation* histogram
SEED = 20260624

DECK = [r + s for r in "23456789TJQKA" for s in "cdhs"]


def sample_board(rng):
    d = DECK[:]
    rng.shuffle(d)
    up0, up1 = d[:4], d[4:8]     # 7th street: 4 upcards each (3 down)
    return up0, up1


def emd_cdf_variance(board, k, up0, up1, bmap, reach, mean_hist):
    """Reach-weighted within-bucket variance under 1-D EMD on the share CDF.

    EMD between two 1-D distributions = L1 distance of their CDFs. We summarize a
    bucket by its reach-weighted mean histogram (its centroid distribution) and
    measure each member's EMD to that centroid; the reach-weighted mean squared
    EMD inside a bucket is the potential-aware analog of value variance.
    """
    from collections import defaultdict
    nb = bemd.N_BINS
    members = defaultdict(list)
    for i, b in enumerate(bmap):
        members[b].append(i)

    def cdf(h):
        c, acc = [], 0.0
        for x in h:
            acc += x
            c.append(acc)
        return c

    tot_w, tot = 0.0, 0.0
    for b, idxs in members.items():
        w = sum(reach[i] for i in idxs)
        if w <= 1e-12:
            continue
        # centroid distribution = reach-weighted mean histogram
        cen = [0.0] * nb
        for i in idxs:
            for t in range(nb):
                cen[t] += reach[i] * mean_hist[i][t]
        cen = [x / w for x in cen]
        ccen = cdf(cen)
        var = 0.0
        for i in idxs:
            ci = cdf(mean_hist[i])
            emd = sum(abs(ci[t] - ccen[t]) for t in range(nb)) / nb
            var += reach[i] * emd * emd
        tot += var
        tot_w += w
    return tot / tot_w if tot_w > 0 else 0.0


def run():
    rng = random.Random(SEED)
    print(f"numpy={bemd._HAVE_NUMPY}  fine N_BUCKETS={N_BUCKETS_FINE}  "
          f"boards={SAMPLE_BOARDS}\n")
    rows = []
    for bi in range(SAMPLE_BOARDS):
        up0, up1 = sample_board(rng)
        board = up0 + up1
        k = down_count(7)
        holds = enumerate_holdings(board, k)
        H = len(holds)

        # a non-uniform reach so the weighting is meaningful (mix uniform+random)
        from datagen import sample_range
        reach = sample_range(H, rng, kind='random')

        # ---- evaluation feature: per-holding mean share + full histogram ----
        ev_rng = random.Random(hash(tuple(board)) & 0xffffffff)
        sets0, hi0, lo0 = bemd._precompute_scores(holds, up0)
        sets1, hi1, lo1 = bemd._precompute_scores(holds, up1)
        mean_hist = []
        for i in range(H):
            hh, _ = bemd._share_hist_full(holds, sets0, hi0, lo0, sets1, hi1, lo1,
                                          i, ev_rng, OPP_SAMPLE, bemd.N_BINS)
            mean_hist.append(hh)

        # ---- 25-bucket scheme (bucket.py) ----
        bmap25 = b25.bucket_map(board, k, up0)
        n25 = len(set(bmap25))

        # ---- finer outcome-distribution scheme (bucket_emd) ----
        t0 = time.time()
        bmapF = bemd.bucket_map(board, k, up0, up1=up1, seed=1,
                                n_buckets=N_BUCKETS_FINE)
        t_build = time.time() - t0
        nF = len(set(bmapF))

        # ---- homogeneity: reach-weighted within-bucket variance of mean share ----
        def wbv(bmap):
            from collections import defaultdict
            members = defaultdict(list)
            for i, b in enumerate(bmap):
                members[b].append(i)
            mean_share = [sum(mean_hist[i][t] * ((t + 0.5) / bemd.N_BINS)
                              for t in range(bemd.N_BINS)) for i in range(H)]
            tot_w, tot = 0.0, 0.0
            for b, idxs in members.items():
                w = sum(reach[i] for i in idxs)
                if w <= 1e-12:
                    continue
                mu = sum(reach[i] * mean_share[i] for i in idxs) / w
                var = sum(reach[i] * (mean_share[i] - mu) ** 2 for i in idxs) / w
                tot += w * var
                tot_w += w
            return tot / tot_w if tot_w > 0 else 0.0

        v25 = wbv(bmap25)
        vF = wbv(bmapF)
        e25 = emd_cdf_variance(board, k, up0, up1, bmap25, reach, mean_hist)
        eF = emd_cdf_variance(board, k, up0, up1, bmapF, reach, mean_hist)

        rows.append((up0, up1, H, n25, nF, v25, vF, e25, eF, t_build))
        print(f"board {bi+1}: up0={up0} up1={up1}")
        print(f"  holdings={H}  buckets: 25-scheme uses {n25}, "
              f"fine uses {nF}  (build {t_build:.1f}s)")
        print(f"  within-bucket var of E[share]:  25-bucket={v25:.5f}   "
              f"fine={vF:.5f}   reduction={100*(1-vF/v25):.1f}%")
        print(f"  within-bucket EMD-CDF var:      25-bucket={e25:.5f}   "
              f"fine={eF:.5f}   reduction={100*(1-eF/e25):.1f}%")
        # RMS abstraction error (std of share) is the interpretable units:
        print(f"  -> RMS share error: 25-bucket={v25**0.5:.4f}  "
              f"fine={vF**0.5:.4f}  (share is in [0,1])\n")

    # ---- aggregate ----
    import statistics as st
    red_var = [100 * (1 - r[6] / r[5]) for r in rows if r[5] > 0]
    red_emd = [100 * (1 - r[8] / r[7]) for r in rows if r[7] > 0]
    mv25 = st.mean(r[5] for r in rows)
    mvF = st.mean(r[6] for r in rows)
    print("=" * 64)
    print(f"AVERAGE over {len(rows)} boards:")
    print(f"  within-bucket var of E[share]:  25-bucket={mv25:.5f}  "
          f"fine={mvF:.5f}")
    print(f"  mean variance reduction (Euclidean feature): {st.mean(red_var):.1f}%")
    print(f"  mean variance reduction (EMD-CDF metric):    {st.mean(red_emd):.1f}%")
    print(f"  mean RMS share error: 25-bucket={mv25**0.5:.4f} -> "
          f"fine={mvF**0.5:.4f}")
    print(f"  mean buckets used: 25-scheme={st.mean(r[3] for r in rows):.0f}, "
          f"fine={st.mean(r[4] for r in rows):.0f} (ceiling {N_BUCKETS_FINE})")


if __name__ == "__main__":
    run()
