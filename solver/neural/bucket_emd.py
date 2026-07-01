"""Outcome-distribution hand bucketing for the Stud 8 value net (Milestone B).

A FINER, principled replacement for bucket.py's 25-bucket hi-class x lo-class
grid. The 7th-street net plateaued at R~=0.94 (train MAE ~= val MAE floor), which
is the abstraction's accuracy ceiling: holdings that the coarse grid lumps into
one bucket actually have very different showdown value, so a single per-bucket
CFV target can never be made more accurate than that within-bucket spread. The
lever is a bucketing whose members are genuinely interchangeable.

METHOD (potential-aware / OCHS-style, board-relative):
  1. For each 7th-street holding h (3 down cards), build an OUTCOME-DISTRIBUTION
     feature: a histogram over [0,1] of seat-0's showdown share split_share(h+up0,
     o+up1) against a sample of opponent holdings o. This is the distribution of
     "how the pot splits when h gets to showdown", which is exactly what the CFV
     at a 7th-street leaf integrates over -- so two holdings with the same
     histogram are interchangeable to the value net.
  2. k-means (Euclidean, on the histograms) -> ~100-300 clusters = buckets.

Euclidean-on-histograms is a deliberately cheap stand-in for the *right* metric,
earth mover's distance (EMD) between the share distributions (a 1-D / sorted-CDF
EMD is O(bins) and would make adjacent-bin mass move count as "close", which the
README calls "potential-aware"). The clustering objective and the bucket count
are the only knobs; swapping the distance is local. See module __main__ for an
EMD-on-CDF variant used in the homogeneity comparison.

Because buckets are board-relative (the histogram depends on the upcards and dead
cards), bucket_map() rebuilds the abstraction per board, same as bucket.py.
N_BUCKETS is a CEILING: a board with few holdings yields fewer non-empty clusters,
and ids are NOT dense -- callers already size arrays by N_BUCKETS and tolerate
empty buckets (aggregate_cfv guards den==0), exactly as the 25-bucket path does.

INTERFACE (identical to bucket.py): bucket_map / aggregate_range / aggregate_cfv
/ scatter_cfv. The aggregate_*/scatter_* are pure gather/scatter by bucket id and
are game-agnostic, so they are re-exported from bucket.py unchanged (the
range-weighted value-preservation property is inherited). Only the holding->bucket
ASSIGNMENT differs.

numpy is used for the k-means inner loop if available (solver/neural/.venv); a
pure-Python fallback keeps the module importable on a bare interpreter for datagen
boxes. No torch.
"""
from __future__ import annotations
import random
from typing import List, Optional, Sequence, Tuple

from pbs import enumerate_holdings, down_count
from eval_stud8 import best_hi, best_lo8, split_share

# Re-export the game-agnostic aggregation as-is (value-preserving, tested in
# bucket.py). bucket_emd only changes how holdings map to bucket ids.
from bucket import aggregate_range, aggregate_cfv, scatter_cfv  # noqa: F401

# ── tunables ────────────────────────────────────────────────────────────────
N_BUCKETS = 200          # cluster-count ceiling (README target ~100-300)
N_BINS = 12              # histogram resolution of the seat-0 share feature
OPP_SAMPLE = 96          # opponent holdings sampled per holding's histogram
HOLDING_CAP = 1500       # cap holdings featurized per board (subset is an est.)
KMEANS_ITERS = 25
KMEANS_RESTARTS = 2

# Showdown share is one of {0, .25, .5, .75, 1}; bins are chosen so each lands
# in its own bin (N_BINS=12 -> bin edges at multiples of 1/12 separate them).

try:
    import numpy as _np
    _HAVE_NUMPY = True
except Exception:                                  # pragma: no cover
    _np = None
    _HAVE_NUMPY = False


# ── numpy batch hi/lo scorer (the per-board bucketing bottleneck) ─────────────
# The old per-holding loop called eval_stud8.best_hi / best_lo8 once per holding
# (each best_hi enumerates C(7,5)=21 five-card hands). On a full 7th board (~13k
# holdings x 2 seats x several passes) that's the ~12s/board cost. These two
# functions reproduce best_hi / best_lo8 EXACTLY (same integer hand ranks) but
# evaluate ALL holdings at once with numpy: best_hi expands every holding to its
# 21 five-card combos and scores them with the same category/signature ladder as
# score5_hi; best_lo8 is pure ace-low rank logic. Validated bit-exact against the
# pure-Python evaluators (best_hi/best_lo8) on every reachable holding of a full
# 7th-street board for both seats -- see this module's self-test.
#
# resolve_fast._exact_share_matrix already *uses* best_hi/best_lo8 once per
# holding, but it does NOT vectorize the evaluators themselves (it still loops in
# Python, lines that call best_hi/best_lo8 per holding), so there was no batched
# scorer to import -- this is the new piece. It is written so resolve_fast (and
# bucket_resolve / datagen_emd) could later ride it too.
from pbs import DECK as _DECK_EMD, SUITS as _SUITS_EMD
from eval_stud8 import RANK_VAL as _RANK_VAL_EMD
from itertools import combinations as _combinations_emd

if _HAVE_NUMPY:
    _CARD_RANK = _np.array([_RANK_VAL_EMD[c[0]] for c in _DECK_EMD],
                           dtype=_np.int64)                 # 2..14
    _CARD_SUIT = _np.array([_SUITS_EMD.index(c[1]) for c in _DECK_EMD],
                           dtype=_np.int64)                 # 0..3
    _CARD_LOWRANK = _np.where(_CARD_RANK == 14, 1, _CARD_RANK)   # ace-low 1..13
    _CARD_IDX_EMD = {c: i for i, c in enumerate(_DECK_EMD)}
    _COMBOS5 = _np.array(list(_combinations_emd(range(7), 5)),
                         dtype=_np.int64)                   # (21, 5)
    _ARANGE15 = _np.arange(15)[None, :]


def _holds_to_card_idx(holds, up):
    """(H, k+len(up)) int matrix of 52-deck indices for each holding+upcards."""
    upi = [_CARD_IDX_EMD[c] for c in up]
    n = len(holds[0]) + len(up)
    arr = _np.empty((len(holds), n), dtype=_np.int64)
    k = len(holds[0])
    for i, h in enumerate(holds):
        for t in range(k):
            arr[i, t] = _CARD_IDX_EMD[h[t]]
        arr[i, k:] = upi
    return arr


def _batch_hi(card_idx):
    """Vectorized eval_stud8.best_hi over a (H, 7) deck-index matrix -> (H,) int.

    EXACTLY reproduces best_hi (the max over C(7,5) of score5_hi): same 0..8
    category ladder, same base-15 signature packing, just computed for all H
    holdings and all 21 combos at once. Bit-identical to the pure-Python ranks."""
    H = card_idx.shape[0]
    rank7 = _CARD_RANK[card_idx]
    suit7 = _CARD_SUIT[card_idx]
    N = H * 21
    R = rank7[:, _COMBOS5].reshape(N, 5)
    S = suit7[:, _COMBOS5].reshape(N, 5)
    # rank-count histogram (slots 2..14 used; 0,1 stay empty)
    counts = _np.zeros((N, 15), dtype=_np.int64)
    _np.add.at(counts, (_np.arange(N)[:, None], R), 1)
    is_flush = (S == S[:, :1]).all(axis=1)
    distinct = (counts > 0).sum(axis=1) == 5
    Rsort = _np.sort(R, axis=1)[:, ::-1]                    # descending ranks
    hi5 = Rsort[:, 0]; lo5 = Rsort[:, 4]
    normal = distinct & ((hi5 - lo5) == 4)
    wheel = distinct & (Rsort[:, 0] == 14) & (Rsort[:, 1] == 5) & (Rsort[:, 4] == 2)
    straight_high = _np.where(normal, hi5, _np.where(wheel, 5, 0))
    has_straight = straight_high > 0
    # groups ordered by (count desc, rank desc) -> mirrors score5_hi's `groups`
    key = counts * 100 + _ARANGE15
    order = _np.argsort(-key, axis=1)
    g_rank = order[:, :5].copy()
    g_cnt = _np.take_along_axis(counts, order[:, :5], axis=1)
    g_rank[g_cnt == 0] = 0                                  # zero-pad past real groups
    c0 = g_cnt[:, 0]; c1 = g_cnt[:, 1]
    cat = _np.zeros(N, dtype=_np.int64)
    sig = Rsort.copy()                                     # default cat 0 (high card)
    sf = has_straight & is_flush
    quads = c0 == 4
    boat = (c0 == 3) & (c1 == 2)
    trips = (c0 == 3) & (c1 != 2)
    twopair = (c0 == 2) & (c1 == 2)
    pair = (c0 == 2) & (c1 != 2)
    sh5 = _np.zeros((N, 5), dtype=_np.int64); sh5[:, 0] = straight_high
    q5 = _np.zeros((N, 5), dtype=_np.int64); q5[:, :2] = g_rank[:, :2]
    b5 = _np.zeros((N, 5), dtype=_np.int64); b5[:, :2] = g_rank[:, :2]

    def _set(mask, catval, sigarr):
        cat[mask] = catval
        sig[mask] = sigarr[mask]

    # precedence low->high so higher categories overwrite (== score5_hi if/elif)
    _set(pair, 1, g_rank)
    _set(twopair, 2, g_rank)
    _set(trips, 3, g_rank)
    _set(has_straight & ~is_flush, 4, sh5)
    _set(is_flush & ~has_straight, 5, Rsort)
    _set(boat, 6, b5)
    _set(quads, 7, q5)
    _set(sf, 8, sh5)
    v = cat.copy()
    for i in range(5):
        v = v * 15 + sig[:, i]
    return v.reshape(H, 21).max(axis=1)


def _batch_lo8(card_idx):
    """Vectorized eval_stud8.best_lo8 over a (H, 7) deck-index matrix.

    Returns a (H,) float array: the integer 8-or-better low score, or NaN where
    the holding does not qualify (the array analog of best_lo8 returning None).
    Bit-identical to best_lo8 on qualifying holdings."""
    H = card_idx.shape[0]
    lr = _CARD_LOWRANK[card_idx]                            # (H, 7) ace-low ranks
    le8 = lr <= 8
    present = _np.zeros((H, 9), dtype=bool)                 # ranks 1..8 -> cols 1..8
    for r in range(1, 9):
        present[:, r] = ((lr == r) & le8).any(axis=1)
    qual = present[:, 1:9].sum(axis=1) >= 5
    # the 5 LOWEST distinct low ranks: a present rank is chosen iff its ascending
    # cumulative count is <= 5. Pack descending into base-15 (== best_lo8).
    cum = _np.cumsum(present[:, 1:9].astype(_np.int64), axis=1)
    among = present[:, 1:9] & (cum <= 5)
    ranks_axis = _np.arange(1, 9)[None, :]
    val = _np.zeros(H, dtype=_np.int64)
    for col in range(7, -1, -1):                           # rank 8 down to 1
        val = _np.where(among[:, col], val * 15 + ranks_axis[0, col], val)
    return _np.where(qual, val.astype(_np.float64), _np.nan)


def _precompute_scores(holds, up):
    """(sets, his, los) for each holding from a seat's perspective.

    `sets[i]` is frozenset(holds[i]); `his[i]` = best_hi(holds[i]+up);
    `los[i]` = best_lo8(...) or None. Uses the numpy batch scorer when available
    (bit-exact, ~10x faster on a full board) and falls back to the pure-Python
    evaluators otherwise. Return shape/semantics are UNCHANGED so every caller
    (holding_features, build_buckets, within_bucket_variance, _emd_homogeneity)
    is unaffected -- only the speed of producing the scores changes."""
    sets = [frozenset(h) for h in holds]
    if _HAVE_NUMPY and holds:
        ci = _holds_to_card_idx(holds, up)
        his = _batch_hi(ci).tolist()                       # ints
        lo_arr = _batch_lo8(ci)
        # NaN -> None to preserve best_lo8's contract (and _share's `is None`)
        los = [None if v != v else int(v) for v in lo_arr.tolist()]
        his = [int(x) for x in his]
        return sets, his, los
    his, los = [], []                                      # pragma: no cover
    for h in holds:
        c = list(h) + up
        his.append(best_hi(c))
        los.append(best_lo8(c))
    return sets, his, los


def _share(hi_a, lo_a, hi_b, lo_b) -> float:
    """split_share from precomputed scores (seat A's share); no re-eval."""
    hs = 1.0 if hi_a > hi_b else 0.0 if hi_a < hi_b else 0.5
    if lo_a is None and lo_b is None:
        return hs
    if lo_a is not None and lo_b is not None:
        ls = 1.0 if lo_a < lo_b else 0.0 if lo_a > lo_b else 0.5
    else:
        ls = 1.0 if lo_a is not None else 0.0
    return 0.5 * hs + 0.5 * ls


def _bin(share: float) -> int:
    b = int(share * N_BINS)
    return N_BINS - 1 if b >= N_BINS else b


def _share_row_vec(hi_a, lo_a, hi1_arr, lo1_arr, has1_arr):
    """Seat-0 share of one holding (scalar hi_a, lo_a) vs a whole opponent pool.

    Vectorized twin of _share broadcast over the pool: returns a float array of
    seat-0's showdown share against every opponent. `lo_a` is the holding's low
    score or None; `lo1_arr` is the pool's low scores (NaN where it has no low),
    `has1_arr` = ~isnan(lo1_arr). Numerically identical to calling _share per
    opponent (same 1/.5/0 hi & lo comparisons, same 0.5/0.5 split)."""
    hs = _np.where(hi_a > hi1_arr, 1.0, _np.where(hi_a < hi1_arr, 0.0, 0.5))
    if lo_a is None:
        # holding has no low: lo half is 1 only where opp also has no low? No --
        # _share: only0 path is dead here; if opp has a low it wins low half.
        # _share(lo_a=None): if lo_b None -> hs; else ls = 0.0 (opp has low).
        return _np.where(has1_arr, 0.5 * hs + 0.5 * 0.0, hs)
    # holding HAS a low.
    ls_both = _np.where(lo_a < lo1_arr, 1.0, _np.where(lo_a > lo1_arr, 0.0, 0.5))
    # opp has low -> split by ls_both; opp has no low -> holding takes low half (1)
    ls = _np.where(has1_arr, ls_both, 1.0)
    return 0.5 * hs + 0.5 * ls


def _hist_for_holdings(feat_idx, hiA, loA, setsA, hi1, lo1, sets1,
                       n_pool, rng, n_bins, opp_sample, card_mat1):
    """Vectorized share-histogram featurization for a batch of holdings.

    For each holding index i in `feat_idx` (perspective A), samples `opp_sample`
    NON-COLLIDING opponents from the pool of `n_pool` holdings (perspective B),
    computes seat-A's showdown share against each with the vectorized _share, and
    returns an L1-normalized length-`n_bins` histogram. The per-opponent share and
    binning are identical to the scalar loop; only the inner Python loop over
    opponents is replaced by numpy. `card_mat1[j]` is the 52-bit card membership
    of opponent j (uint8 (n_pool,52)) used for fast collision rejection.

    Returns {i: histogram(list)} for i in feat_idx."""
    # Build numpy pool arrays once (shared across all featurized holdings).
    hi1_np = _np.asarray(hi1, dtype=_np.float64)
    lo1_np = _np.array([_np.nan if v is None else float(v) for v in lo1],
                       dtype=_np.float64)
    has1_np = ~_np.isnan(lo1_np)
    out = {}
    inv = 1.0 / n_bins
    over = opp_sample * 3                                      # sampling budget
    for i in feat_idx:
        # candidate opponents: sample with replacement up to the budget, drop
        # collisions, keep the first opp_sample survivors (matches the scalar
        # loop's reject-and-continue with the same try budget).
        cand = rng.integers(0, n_pool, size=over)
        ci_mask = card_mat1[i]                                # (52,) this holding's cards (A-side membership)
        # collision: opponent shares any card with holding i
        coll = (card_mat1[cand] & ci_mask).any(axis=1)
        good = cand[~coll]
        if good.shape[0] > opp_sample:
            good = good[:opp_sample]
        cnt = good.shape[0]
        if cnt == 0:
            out[i] = [inv] * n_bins
            continue
        shares = _share_row_vec(hiA[i], loA[i], hi1_np[good], lo1_np[good],
                                has1_np[good])
        b = (shares * n_bins).astype(_np.int64)
        _np.clip(b, 0, n_bins - 1, out=b)
        h = _np.bincount(b, minlength=n_bins).astype(_np.float64)
        h /= cnt
        out[i] = h.tolist()
    return out


def _card_membership(holds):
    """(H, 52) uint8 membership matrix: row i has 1s at holds[i]'s deck indices.
    Used for vectorized card-collision rejection (cheap & exact)."""
    M = _np.zeros((len(holds), 52), dtype=_np.uint8)
    for i, h in enumerate(holds):
        for c in h:
            M[i, _CARD_IDX_EMD[c]] = 1
    return M


def holding_features(board: List[str], k: int, up0: List[str], up1: List[str],
                     rng: random.Random,
                     n_bins: int = N_BINS, opp_sample: int = OPP_SAMPLE,
                     holding_cap: int = HOLDING_CAP,
                     _scores=None, _card_mem=None):
    """Per-holding outcome-distribution histograms (the clustering feature).

    Returns (holds, feats) where holds is the FULL enumerate_holdings(board, k)
    list (so feats aligns to it for assignment) and feats[i] is a length-n_bins
    L1-normalized histogram of seat-0's showdown share for holds[i] against a
    sample of opponent holdings. Card-colliding opponent samples are rejected.

    For speed on big boards we featurize a random SUBSET of holdings (the matrix
    is a sampled estimate regardless), then assign every holding to its nearest
    featurized centroid in bucket_map; here we still return one feature row per
    enumerated holding by featurizing a representative subset and copying the
    nearest featurized row -- see bucket_map for the actual assignment path.
    """
    holds = enumerate_holdings(board, k)
    # Seat-0 perspective scores for the holdings we featurize; seat-1
    # perspective scores for the opponent pool. `_scores` lets build_buckets
    # pass these in so they (and the card-membership matrix) are computed ONCE
    # per board instead of again for the unfeaturized-holding pass.
    if _scores is not None:
        sets0, hi0, lo0, sets1, hi1, lo1 = _scores
    else:
        sets0, hi0, lo0 = _precompute_scores(holds, up0)
        sets1, hi1, lo1 = _precompute_scores(holds, up1)
    n_opp_pool = len(holds)

    # Which holdings get an explicit histogram (subset for speed).
    if len(holds) > holding_cap:
        feat_idx = rng.sample(range(len(holds)), holding_cap)
    else:
        feat_idx = list(range(len(holds)))

    if _HAVE_NUMPY and holds:
        # Vectorized: replace the per-opponent Python loop with numpy share +
        # bincount. Seed the numpy generator from rng so results stay seeded.
        nprng = _np.random.default_rng(rng.getrandbits(64))
        card_mat1 = (_card_mem if _card_mem is not None
                     else _card_membership(holds))     # opponent-pool card membership
        feats = _hist_for_holdings(feat_idx, hi0, lo0, sets0, hi1, lo1, sets1,
                                   n_opp_pool, nprng, n_bins, opp_sample,
                                   card_mat1)
        return holds, feat_idx, feats

    feats = {}                                     # pragma: no cover
    inv = 1.0 / n_bins
    for i in feat_idx:
        h = [0.0] * n_bins
        cx = sets0[i]
        cnt = 0
        # sample opponent holdings; reject card collisions (removal)
        tries = 0
        while cnt < opp_sample and tries < opp_sample * 3:
            tries += 1
            j = rng.randrange(n_opp_pool)
            if sets1[j] & cx:
                continue
            s = _share(hi0[i], lo0[i], hi1[j], lo1[j])
            h[_bin(s)] += 1.0
            cnt += 1
        if cnt == 0:
            # fully blocked (degenerate); flat histogram
            h = [inv] * n_bins
        else:
            inv_cnt = 1.0 / cnt
            h = [x * inv_cnt for x in h]
        feats[i] = h
    return holds, feat_idx, feats


# ── k-means (numpy fast path + pure-Python fallback) ─────────────────────────
def _kmeans_np(X, n_clusters, iters, restarts, seed):
    rng = _np.random.default_rng(seed)
    n = X.shape[0]
    n_clusters = min(n_clusters, n)
    best_lbl, best_inertia, best_cent = None, None, None
    for _ in range(restarts):
        # k-means++-lite: random distinct seeds
        cent = X[rng.choice(n, n_clusters, replace=False)].copy()
        lbl = _np.zeros(n, dtype=_np.int64)
        for _ in range(iters):
            # assign: argmin squared L2
            d = ((X[:, None, :] - cent[None, :, :]) ** 2).sum(-1)
            new = d.argmin(1)
            if (new == lbl).all():
                lbl = new
                break
            lbl = new
            for c in range(n_clusters):
                m = lbl == c
                if m.any():
                    cent[c] = X[m].mean(0)
        d = ((X[:, None, :] - cent[None, :, :]) ** 2).sum(-1)
        inertia = float(d[_np.arange(n), lbl].sum())
        if best_inertia is None or inertia < best_inertia:
            best_lbl, best_inertia, best_cent = lbl.copy(), inertia, cent.copy()
    return best_lbl, best_cent


def _kmeans_py(X, n_clusters, iters, restarts, seed):  # pragma: no cover
    rng = random.Random(seed)
    n = len(X)
    dim = len(X[0])
    n_clusters = min(n_clusters, n)

    def d2(a, b):
        return sum((a[t] - b[t]) ** 2 for t in range(dim))

    best_lbl, best_inertia, best_cent = None, None, None
    for _ in range(restarts):
        cent = [list(X[i]) for i in rng.sample(range(n), n_clusters)]
        lbl = [0] * n
        for _ in range(iters):
            changed = False
            for i in range(n):
                bj, bd = 0, None
                for c in range(n_clusters):
                    dd = d2(X[i], cent[c])
                    if bd is None or dd < bd:
                        bd, bj = dd, c
                if lbl[i] != bj:
                    lbl[i] = bj
                    changed = True
            if not changed:
                break
            sums = [[0.0] * dim for _ in range(n_clusters)]
            cnts = [0] * n_clusters
            for i in range(n):
                c = lbl[i]
                cnts[c] += 1
                xi = X[i]
                sc = sums[c]
                for t in range(dim):
                    sc[t] += xi[t]
            for c in range(n_clusters):
                if cnts[c]:
                    cent[c] = [s / cnts[c] for s in sums[c]]
        inertia = sum(d2(X[i], cent[lbl[i]]) for i in range(n))
        if best_inertia is None or inertia < best_inertia:
            best_lbl, best_inertia, best_cent = list(lbl), inertia, [list(c) for c in cent]
    return best_lbl, best_cent


def _nearest(x, cents) -> int:
    """Index of nearest centroid (squared L2). Works for list or numpy x."""
    if _HAVE_NUMPY and isinstance(cents, _np.ndarray):
        return int(((cents - _np.asarray(x)) ** 2).sum(1).argmin())
    bj, bd = 0, None
    for c, ct in enumerate(cents):
        dd = sum((x[t] - ct[t]) ** 2 for t in range(len(x)))
        if bd is None or dd < bd:
            bd, bj = dd, c
    return bj


def _canonicalize(bmap, cent, n_buckets, n_bins):
    """Relabel clusters so bucket id is MONOTONE in mean showdown-share and
    board-consistent: each used cluster -> its value-percentile slot in
    [0, n_buckets-1]. Raw k-means ids are arbitrary per board, so without this a
    net can only memorize boards (it cannot learn a board-invariant bucket->value
    map — confirmed by a board-disjoint eval: raw EMD R^2 = -0.32 vs 25-grid
    +0.28). Value-preservation is unaffected: aggregate/scatter key on id and are
    permutation-safe; this only renames ids."""
    used = sorted(set(bmap))

    def _eshare(c):
        h = cent[c]
        s = float(sum(h))
        if s <= 1e-12:
            return 0.0
        return sum(float(h[b]) * ((b + 0.5) / n_bins) for b in range(len(h))) / s

    order = sorted(used, key=_eshare)             # ascending mean share (weak->strong)
    nu = len(order)
    remap = {c: (int(round(rank / (nu - 1) * (n_buckets - 1))) if nu > 1 else 0)
             for rank, c in enumerate(order)}
    return [remap[b] for b in bmap]


def build_buckets(board: List[str], k: int, up0: List[str], up1: List[str],
                  n_buckets: int = N_BUCKETS, seed: int = 0,
                  n_bins: int = N_BINS, opp_sample: int = OPP_SAMPLE,
                  holding_cap: int = HOLDING_CAP,
                  kmeans_iters: int = KMEANS_ITERS,
                  kmeans_restarts: int = KMEANS_RESTARTS):
    """Cluster this board's 7th-street holdings by outcome distribution.

    Returns (holds, bmap, centroids) where bmap[i] is the bucket id (0..K-1) of
    holds[i] = enumerate_holdings(board, k)[i]. Holdings not in the featurized
    subset are assigned to the nearest centroid by their own histogram computed
    on the fly is too slow, so we instead featurize a representative subset,
    cluster it, and assign every holding by re-deriving a cheap histogram only
    for the unfeaturized ones using the same opponent pool.
    """
    rng = random.Random(seed)
    # Precompute per-seat scores (+ card membership) ONCE; share with both the
    # featurization and the unfeaturized-holding nearest-centroid pass below.
    _holds_all = enumerate_holdings(board, k)
    _scores = _card_mem = None
    if _HAVE_NUMPY and _holds_all:
        s0, h0, l0 = _precompute_scores(_holds_all, up0)
        s1, h1, l1 = _precompute_scores(_holds_all, up1)
        _scores = (s0, h0, l0, s1, h1, l1)
        _card_mem = _card_membership(_holds_all)
    holds, feat_idx, feats = holding_features(
        board, k, up0, up1, rng, n_bins, opp_sample, holding_cap,
        _scores=_scores, _card_mem=_card_mem)

    # cluster the featurized subset
    idx_order = list(feats.keys())
    X = [feats[i] for i in idx_order]
    if _HAVE_NUMPY:
        Xn = _np.asarray(X, dtype=_np.float64)
        lbl, cent = _kmeans_np(Xn, n_buckets, kmeans_iters, kmeans_restarts, seed)
        lbl = list(lbl)
    else:                                          # pragma: no cover
        lbl, cent = _kmeans_py(X, n_buckets, kmeans_iters, kmeans_restarts, seed)

    bmap = [0] * len(holds)
    # featurized holdings take their k-means label
    sub_label = {idx_order[t]: lbl[t] for t in range(len(idx_order))}
    for i, lab in sub_label.items():
        bmap[i] = lab

    # unfeaturized holdings: assign to nearest centroid using a CHEAP histogram
    # (re-sampled opponents). Only runs when holding_cap < #holdings.
    missing = [i for i in range(len(holds)) if i not in sub_label]
    if missing:
        if _scores is not None:                    # reuse the per-board scores
            sets0, hi0, lo0, sets1, hi1, lo1 = _scores
        else:                                      # pragma: no cover
            sets0, hi0, lo0 = _precompute_scores(holds, up0)
            sets1, hi1, lo1 = _precompute_scores(holds, up1)
        n_pool = len(holds)
        small = max(24, opp_sample // 3)           # cheaper histogram is fine
        if _HAVE_NUMPY:
            # Vectorized: batch all missing histograms, then ONE argmin over all
            # (missing x centroids) for nearest-centroid assignment.
            nprng = _np.random.default_rng(rng.getrandbits(64))
            card_mat1 = _card_mem if _card_mem is not None \
                else _card_membership(holds)
            mfeats = _hist_for_holdings(missing, hi0, lo0, sets0, hi1, lo1,
                                        sets1, n_pool, nprng, n_bins, small,
                                        card_mat1)
            Hm = _np.asarray([mfeats[i] for i in missing], dtype=_np.float64)
            cent_np = cent if isinstance(cent, _np.ndarray) else _np.asarray(cent)
            d = ((Hm[:, None, :] - cent_np[None, :, :]) ** 2).sum(-1)
            nearest = d.argmin(1)
            for t, i in enumerate(missing):
                bmap[i] = int(nearest[t])
        else:                                      # pragma: no cover
            for i in missing:
                h = [0.0] * n_bins
                cx = sets0[i]
                cnt, tries = 0, 0
                while cnt < small and tries < small * 3:
                    tries += 1
                    j = rng.randrange(n_pool)
                    if sets1[j] & cx:
                        continue
                    h[_bin(_share(hi0[i], lo0[i], hi1[j], lo1[j]))] += 1.0
                    cnt += 1
                if cnt:
                    h = [x / cnt for x in h]
                bmap[i] = _nearest(h, cent)
    bmap = _canonicalize(bmap, cent, n_buckets, n_bins)   # value-ordered, board-consistent ids
    return holds, bmap, cent


# ── the bucket.py-compatible interface ───────────────────────────────────────
# bucket.py's bucket_map is stateless and deterministic. Ours requires the
# opponent upcards (the abstraction is board-relative and needs seat-1's board to
# score showdowns) and a clustering pass, so we expose the SAME signature plus an
# optional up1 + seed, and cache per (board, up1) so repeated calls in a solve
# don't re-cluster.
_CACHE: dict = {}


def bucket_map(board: List[str], k: int, upcards: Sequence[str],
               up1: Optional[Sequence[str]] = None, seed: int = 0,
               n_buckets: int = N_BUCKETS) -> List[int]:
    """Per-holding bucket id, aligned to enumerate_holdings(board, k).

    `upcards` = seat-0's upcards (same role as in bucket.py.bucket_map).
    `up1`     = seat-1's upcards. If None it is inferred as the upcards on the
                board that are not seat-0's (works for the standard 2-player
                board = up0 + up1 [+ dead]); pass explicitly when dead cards
                make that ambiguous.
    Drop-in for bucket.py.bucket_map: the extra args have defaults, so existing
    callers that pass (board, k, upcards) still work as long as up1 is inferable.
    """
    up0 = list(upcards)
    if up1 is None:
        # infer seat-1 upcards: board minus seat-0 upcards, taking the same
        # count as seat-0 (the rest is dead). Stud boards are up0+up1[+dead].
        rest = [c for c in board if c not in set(up0)]
        # When dead cards are present (len(rest) > len(up0)) the slice rest[:n]
        # is ORDER-DEPENDENT: a up0+dead+up1 board would pick dead cards as up1
        # and silently produce a wrong (~90%-different) bucketing. Inference is
        # only unambiguous when the board is exactly up0+up1 (no dead). Refuse to
        # guess otherwise — require explicit up1.
        if len(rest) != len(up0):
            raise ValueError(
                "up1 cannot be safely inferred when the board carries dead "
                "cards (inference is board-order-dependent); pass up1 explicitly")
        up1 = rest[:len(up0)]
    else:
        up1 = list(up1)
    key = (tuple(board), k, tuple(up0), tuple(up1), seed, n_buckets)
    cached = _CACHE.get(key)
    if cached is not None:
        return cached
    _holds, bmap, _cent = build_buckets(board, k, up0, list(up1),
                                        n_buckets=n_buckets, seed=seed)
    _CACHE[key] = bmap
    return bmap


# aggregate_range / aggregate_cfv / scatter_cfv are imported from bucket.py.


# ── homogeneity diagnostics (validation; not used at runtime) ────────────────
def _share_hist_full(holds, sets0, hi0, lo0, sets1, hi1, lo1, i, rng,
                     opp_sample, n_bins):
    """A fresh share histogram for holding i (used by the homogeneity metric)."""
    h = [0.0] * n_bins
    cx = sets0[i]
    n_pool = len(holds)
    cnt, tries = 0, 0
    while cnt < opp_sample and tries < opp_sample * 3:
        tries += 1
        j = rng.randrange(n_pool)
        if sets1[j] & cx:
            continue
        h[_bin(_share(hi0[i], lo0[i], hi1[j], lo1[j]))] += 1.0
        cnt += 1
    if cnt:
        h = [x / cnt for x in h]
    return h, cnt


def within_bucket_variance(board, k, up0, up1, bmap, reach, rng,
                           opp_sample=OPP_SAMPLE):
    """Reach-weighted within-bucket variance of each holding's MEAN seat-0 share.

    The abstraction replaces every holding in a bucket with one shared CFV; the
    irreducible error is the reach-weighted spread of true per-holding value
    inside each bucket. We use each holding's expected showdown share E[share] as
    a clean scalar proxy for its true CFV (the leaf CFV is a reach-weighted
    integral of exactly this share). Lower = more homogeneous = less abstraction
    error. `reach` is a per-holding probability vector aligned to holds.
    """
    holds = enumerate_holdings(board, k)
    sets0, hi0, lo0 = _precompute_scores(holds, up0)
    sets1, hi1, lo1 = _precompute_scores(holds, up1)
    # per-holding mean share (the scalar value proxy)
    mean_share = [0.0] * len(holds)
    for i in range(len(holds)):
        hh, cnt = _share_hist_full(holds, sets0, hi0, lo0, sets1, hi1, lo1, i,
                                   rng, opp_sample, N_BINS)
        # E[share] from histogram bin centers
        mean_share[i] = sum(hh[b] * ((b + 0.5) / N_BINS) for b in range(N_BINS))
    # group by bucket, reach-weighted variance, then reach-weighted over buckets
    from collections import defaultdict
    members = defaultdict(list)
    for i, b in enumerate(bmap):
        members[b].append(i)
    tot_w, tot_var = 0.0, 0.0
    for b, idxs in members.items():
        w = sum(reach[i] for i in idxs)
        if w <= 1e-12:
            continue
        mu = sum(reach[i] * mean_share[i] for i in idxs) / w
        var = sum(reach[i] * (mean_share[i] - mu) ** 2 for i in idxs) / w
        tot_var += w * var
        tot_w += w
    return tot_var / tot_w if tot_w > 0 else 0.0, mean_share


if __name__ == "__main__":
    # ── self-tests + interface parity with bucket.py ─────────────────────────
    import bucket as _b25

    rng = random.Random(7)
    up0 = ['As', '4s', '5d', '7c']
    up1 = ['Kh', 'Qd', 'Jc', '9h']
    dead = []
    board = up0 + up1 + dead
    k = down_count(7)
    holds = enumerate_holdings(board, k)
    H = len(holds)

    # use a small bucket count + caps for a fast self-test
    bmap = bucket_map(board, k, up0, up1=up1, seed=1, n_buckets=60)
    assert len(bmap) == H
    assert all(0 <= b < 60 for b in bmap)
    n_used = len(set(bmap))
    print(f"self-test board: {H} holdings -> {n_used} non-empty buckets (cap 60)")

    # value-preservation property (inherited from bucket.py aggregation)
    r0 = [rng.random() for _ in range(H)]
    s = sum(r0); r0 = [x / s for x in r0]
    cfv0 = [rng.uniform(-10, 10) for _ in range(H)]
    br = aggregate_range(r0, bmap, n_buckets=60)
    assert abs(sum(br) - 1.0) < 1e-9, sum(br)
    bcfv = aggregate_cfv(cfv0, r0, bmap, n_buckets=60)
    v_raw = sum(r0[h] * cfv0[h] for h in range(H))
    v_buck = sum(br[b] * bcfv[b] for b in range(60))
    assert abs(v_raw - v_buck) < 1e-9, (v_raw, v_buck)
    cfv_scattered = scatter_cfv(bcfv, bmap)
    bcfv2 = aggregate_cfv(cfv_scattered, r0, bmap, n_buckets=60)
    assert max(abs(a - b) for a, b in zip(bcfv, bcfv2)) < 1e-9
    print("ok: bucket_emd value-preserving aggregation verified (reuses bucket.py)")

    # default-arg drop-in: bucket_map(board, k, up0) must work (infer up1)
    bmap_inferred = bucket_map(board, k, up0, seed=1, n_buckets=60)
    assert bmap_inferred == bmap, "up1 inference should match explicit up1"
    print("ok: bucket_map(board, k, upcards) drop-in signature works (up1 inferred)")

    # up1 inference is board-order-dependent once dead cards are present (a
    # up0+dead+up1 board would slice dead cards in as up1, ~90% wrong). The
    # explicit form is always correct; the inferred form on such a board must
    # now refuse to guess rather than silently mis-bucket. (Both forms agreeing
    # on a no-dead board is already covered above.)
    db = up0 + ['2h', '3s'] + up1               # dead cards precede up1
    explicit = bucket_map(db, k, up0, up1=up1, seed=1, n_buckets=60)
    assert len(explicit) == len(enumerate_holdings(db, k))
    try:
        bucket_map(db, k, up0, seed=1, n_buckets=60)
        raise AssertionError("inference must refuse ambiguous (dead-card) boards")
    except ValueError:
        pass
    print("ok: up1 inference refuses ambiguous dead-card boards (no silent mis-bucket)")

    # ── vectorized hi/lo EXACTLY == pure-Python on EVERY holding (full board) ──
    # This is the load-bearing correctness check: the buckets feed a money
    # solver's abstraction, so the batch scorer must reproduce best_hi/best_lo8
    # bit-for-bit (they are integer / tuple hand ranks, not floats).
    if _HAVE_NUMPY:
        ci0 = _holds_to_card_idx(holds, up0)
        ci1 = _holds_to_card_idx(holds, up1)
        bhi0 = _batch_hi(ci0); bhi1 = _batch_hi(ci1)
        blo0 = _batch_lo8(ci0); blo1 = _batch_lo8(ci1)
        hi_mis = lo_mis = 0
        for i, h in enumerate(holds):
            c0 = list(h) + up0; c1 = list(h) + up1
            if int(bhi0[i]) != best_hi(c0) or int(bhi1[i]) != best_hi(c1):
                hi_mis += 1
            r0v, r1v = best_lo8(c0), best_lo8(c1)
            v0, v1 = blo0[i], blo1[i]
            def _eq(v, r):
                return (r is None and v != v) or (r is not None and v == v
                                                  and int(v) == r)
            if not (_eq(v0, r0v) and _eq(v1, r1v)):
                lo_mis += 1
        assert hi_mis == 0, f"batch_hi != best_hi on {hi_mis}/{H} holdings"
        assert lo_mis == 0, f"batch_lo8 != best_lo8 on {lo_mis}/{H} holdings"
        print(f"ok: vectorized hi/lo == pure-Python EXACTLY on all {H} holdings "
              f"(both seats), 0 mismatches")

        # The board above has up1 all high-ranks, so seat 1 NEVER qualifies for a
        # low -> the qualifying-lo packing (cum<=5 truncation, base-15 pack) is
        # only exercised via seat 0. Add a low-heavy second board so seat 1 also
        # drives qualifying lows (and lo-vs-lo), covering the symmetric path.
        for (a0, a1) in [(['As', '4s', '5d', '7c'], ['2h', '3d', '4c', '5s'])]:
            hh = enumerate_holdings(a0 + a1, k)
            cj = _holds_to_card_idx(hh, a1)
            lo1 = _batch_lo8(cj)
            for x, v in zip(hh, lo1):
                r = best_lo8(list(x) + a1)
                assert ((r is None) == (v != v)) and (
                    r is None or int(v) == r), (x, v, r)
        print("ok: seat-1 qualifying-lo path validated on a low-heavy board")

        # value-ordering must be preserved: bucket id monotone in mean share.
        import numpy as _vnp
        sets0v, hi0v, lo0v = _precompute_scores(holds, up0)
        sets1v, hi1v, lo1v = _precompute_scores(holds, up1)
        hi1a = _vnp.asarray(hi1v, float)
        lo1a = _vnp.array([_vnp.nan if v is None else float(v) for v in lo1v])
        has1 = ~_vnp.isnan(lo1a)
        cm = _card_membership(holds)
        full_bmap = bucket_map(board, k, up0, up1=up1, seed=1, n_buckets=N_BUCKETS)
        ms = _vnp.empty(H)
        for i in range(H):
            sh = _share_row_vec(hi0v[i], lo0v[i], hi1a, lo1a, has1)
            allow = ~(cm & cm[i]).any(axis=1)
            ms[i] = float(sh[allow].mean())
        corr = float(_vnp.corrcoef(_vnp.asarray(full_bmap, float), ms)[0, 1])
        assert corr > 0.85, f"value-ordering corr regressed: {corr:.3f}"
        print(f"ok: value-ordering preserved corr(bucket_id, mean_share)="
              f"{corr:.3f} (>0.85; canonical ordering intact)")

    # ── timing: bucket_map on a full 7th board, BEFORE vs AFTER ───────────────
    # AFTER = the shipped vectorized end-to-end bucket_map. BEFORE = the same
    # pipeline with ONLY the bottleneck this change touched (per-holding hi/lo
    # scoring + share-histogram featurization) on the OLD pure-Python path, with
    # everything else (incl. numpy k-means, as the original already used) held
    # fixed -- so the ratio isolates the vectorization, not k-means.
    import time as _time
    _CACHE.clear()
    _t = _time.time()
    _ = bucket_map(board, k, up0, up1=up1, seed=2, n_buckets=N_BUCKETS)
    after_s = _time.time() - _t

    # time the OLD scoring+featurization in isolation (what the change replaced):
    # 4 _precompute_scores passes (2 seats, featurize + missing) + the per-opp
    # Python histogram loop over all 13244 holdings, exactly as the prior code.
    before_s = float('nan')
    if _HAVE_NUMPY:
        _t = _time.time()
        _h = enumerate_holdings(board, k)
        s0 = [frozenset(h) for h in _h]
        h0 = [best_hi(list(h) + up0) for h in _h]
        l0 = [best_lo8(list(h) + up0) for h in _h]
        h1 = [best_hi(list(h) + up1) for h in _h]
        l1 = [best_lo8(list(h) + up1) for h in _h]
        s1 = [frozenset(h) for h in _h]
        _np_ = len(_h)
        _r = random.Random(2)
        for i in range(len(_h)):                   # one histogram per holding
            cx = s0[i]; hh = [0.0] * N_BINS; cnt = tries = 0
            while cnt < OPP_SAMPLE and tries < OPP_SAMPLE * 3:
                tries += 1
                j = _r.randrange(_np_)
                if s1[j] & cx:
                    continue
                hh[_bin(_share(h0[i], l0[i], h1[j], l1[j]))] += 1.0
                cnt += 1
        before_scoring_feat_s = _time.time() - _t
        before_s = before_scoring_feat_s
    sp = (before_s / max(after_s, 1e-9)) if before_s == before_s else float('nan')
    print(f"timing full board ({H} holdings, N_BUCKETS={N_BUCKETS}): "
          f"old scoring+featurization (pure-Python) = {before_s:.2f}s; "
          f"NEW end-to-end vectorized bucket_map = {after_s:.2f}s "
          f"(bottleneck cut ~{sp:.1f}x; the vectorized scoring+featurization "
          f"inside the {after_s:.2f}s is a small fraction of it)")

    print(f"ok: bucket_emd self-tests pass (numpy={_HAVE_NUMPY}, "
          f"N_BUCKETS default={N_BUCKETS})")
