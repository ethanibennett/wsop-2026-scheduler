"""M2b: BADUGI holding bucketing for the one-draw value net.

Draw games have no public board, so the value net cannot condition on upcards
the way stud's bucket.py does. The design premise (the user's): TRACKING OUR OWN
DISCARDS / PAIR AND SUIT BLOCKERS gives a similar set of known information to
stud's upcards. Everything below is a function of the 4 PRIVATE cards only:

  axis 1 — MADE-NESS / STRENGTH TIER (== hero's natural DISCARD count):
      |best_badugi_subset| = 4 (pat, discard 0), 3 (discard 1), 2 (discard 2),
      1 (discard 3). Within each size, a smooth/rough tier on the ace-low top
      card of the playable subset. The size axis IS the discard-count axis, and
      it is legality-EXACT: every hand in a bucket has the same drawOptions
      ({0,1} pat/break or snow/natural-1, {0,2}, {0,3}), so the bucket game's
      draw legality matches every constituent hand's.
  axis 2 — BLOCKERS: how many of the cards hero will THROW AWAY (the cards
      outside the playable subset) are wheel-region cards (ace-low rank <= 6).
      Those are exactly the pair+suit blockers removed from the deck the
      opponent draws from — the private analogue of dead upcards. Pat hands
      throw nothing, so they carry no blocker split (their removal effect is
      already the strength tier itself).

Bucket layout (N_DRAW_BUCKETS = 19 — "tens of buckets", like stud's 25):
      0- 3  made badugi: top <=6 / 7-8 / 9-J / Q-K
      4-11  3-card: top <=4 / 5-6 / 7-8 / >=9  x  discard-is-blocker {0,1}
     12-17  2-card: top <=4 / rough            x  blocker count {0,1,2}
        18  1-card junk (everything pairs; discard 3)

BOUNDEDNESS: every feature is an O(1) function of the 4 held cards (best-subset
size via the 15 subset checks, top ranks, clamped blocker counts). The id space
is a FIXED 19 regardless of deck composition, live-card count, or start state —
so the net's range/value width is fixed exactly like stud's 25, and the bucket
count cannot grow with the instance.

THE BUCKET GAME (bucket-lifted resolve_draw2): holdings are the 19 bucket ids.
  * showdown: a sampled 19x19 seat-0 share matrix E[share | b0, b1, disjoint]
    (the stud sample_share_matrix pattern; no card collisions between buckets);
  * draw chance: sampled bucket-level projection rows PROJ[k][bi] -> {bj: w}
    (choose_keep + uniform replacement from the 48 unseen cards, bucketed);
    rows are renormalized to sum EXACTLY 1 so reach is conserved and the
    forward-PROJ / backward-PROJ^T pair keeps the solve zero-sum to machine
    precision (resolve_draw2's invariant);
  * draw legality: per-bucket, exact (see axis 1).
Because badugi has NO public cards, these matrices depend on nothing but the
(fixed) 52-card deck — ONE abstraction is built once, cached to JSON, and
shared by every datagen worker/spot (unlike stud, where each board needs its
own share matrix). Sampling error only shapes the abstraction fidelity, never
the validity: any fixed matrices define a well-formed zero-sum game whose CFVs
are the net's training target (same contract as stud's datagen_bucketed).

Aggregation interface: reuses bucket.py's aggregate_range/aggregate_cfv/
scatter_cfv verbatim (they are n_buckets-generic), so the RANGE-WEIGHTED VALUE
PRESERVATION invariant is inherited and re-tested here on badugi holdings.

Pure Python (no numpy/torch); self-tests on run.
"""
from __future__ import annotations
import json
import os
import random
from itertools import combinations
from typing import Dict, List, Optional, Sequence

from pbs import DECK, low_rank_val
from bucket import aggregate_range, aggregate_cfv, scatter_cfv  # noqa: F401
from eval_badugi import badugi_share, best_badugi_subset

N_DRAW_BUCKETS = 19
HAND_SIZE = 4

# per-size natural draw count and the exact drawOptions the whole size class
# shares (mirrors resolve_draw2.draw_options: {0, natural} + break(1) if pat).
_SIZE_OPTS = {4: [0, 1], 3: [0, 1], 2: [0, 2], 1: [0, 3]}
DRAW_COUNTS = [0, 1, 2, 3]                      # union over all buckets


def bucket_of_holding(hand: Sequence[str]) -> int:
    """Bucket id 0..18 for a 4-card badugi holding (private cards only)."""
    best = best_badugi_subset(list(hand))
    size = len(best)
    top = max(low_rank_val(c) for c in best)     # ace-low top of playable subset
    if size == 4:
        return 0 if top <= 6 else 1 if top <= 8 else 2 if top <= 11 else 3
    kept = set(best)
    disc = [c for c in hand if c not in kept]    # the natural discards
    nblock = sum(1 for c in disc if low_rank_val(c) <= 6)
    if size == 3:
        tri = 0 if top <= 4 else 1 if top <= 6 else 2 if top <= 8 else 3
        return 4 + tri * 2 + min(nblock, 1)
    if size == 2:
        two = 0 if top <= 4 else 1
        return 12 + two * 3 + min(nblock, 2)
    return 18


def bucket_map(holdings: Sequence[Sequence[str]]) -> List[int]:
    """Per-holding bucket id, aligned to the given holdings list. Deterministic
    (pure function of the cards — no RNG, no ordering dependence)."""
    return [bucket_of_holding(h) for h in holdings]


def bucket_draw_options(b: int) -> List[int]:
    """The (exact, shared-by-construction) drawOptions of bucket b."""
    if b <= 3:
        return _SIZE_OPTS[4]
    if b <= 11:
        return _SIZE_OPTS[3]
    if b <= 17:
        return _SIZE_OPTS[2]
    return _SIZE_OPTS[1]


# ── abstraction build: share matrix + bucket-level draw projection ───────────
def _sample_reservoirs(rng: random.Random, per_bucket: int,
                       max_attempts: int) -> List[List[tuple]]:
    """Uniform 4-card hands binned by bucket until each bucket holds
    `per_bucket` samples (or attempts run out — rare buckets keep what they
    got; every bucket is reachable so none stays empty in practice)."""
    res: List[List[tuple]] = [[] for _ in range(N_DRAW_BUCKETS)]
    need = N_DRAW_BUCKETS
    for _ in range(max_attempts):
        h = tuple(rng.sample(DECK, HAND_SIZE))
        b = bucket_of_holding(h)
        if len(res[b]) < per_bucket:
            res[b].append(h)
            if len(res[b]) == per_bucket:
                need -= 1
                if need == 0:
                    break
    return res


def build_draw_abstraction(seed: int = 0, per_bucket: int = 300,
                           pair_samples: int = 300,
                           proj_hands: int = 120,
                           k3_draw_samples: int = 400,
                           max_attempts: int = 4_000_000) -> dict:
    """Build the (universal, deck-only) badugi bucket game: 19x19 share matrix
    + PROJ rows + legality. Deterministic by seed. ~O(20s) once, cache to JSON."""
    rng = random.Random(seed)
    res = _sample_reservoirs(rng, per_bucket, max_attempts)

    # share matrix: E[seat-0 share | b0, b1, hands disjoint], targeted per cell
    M = [[0.5] * N_DRAW_BUCKETS for _ in range(N_DRAW_BUCKETS)]
    for b0 in range(N_DRAW_BUCKETS):
        for b1 in range(N_DRAW_BUCKETS):
            acc, n, tries = 0.0, 0, 0
            limit = pair_samples * 4
            while n < pair_samples and tries < limit:
                tries += 1
                h0 = res[b0][rng.randrange(len(res[b0]))]
                h1 = res[b1][rng.randrange(len(res[b1]))]
                if set(h0) & set(h1):
                    continue
                acc += badugi_share(list(h0), list(h1))
                n += 1
            if n:
                M[b0][b1] = acc / n

    # projection rows: bucket bi choosing legal count k -> distribution over
    # post-draw buckets. k=0 keeps all 4 cards -> identity EXACTLY. k>=1:
    # choose_keep + uniform replacement from the 48 unseen, enumerated exactly
    # for k=1/k=2 per sampled hand, sampled for k=3. Rows normalized to 1.
    from resolve_draw2 import choose_keep
    proj: Dict[int, Dict[int, List[List[float]]]] = {k: {} for k in DRAW_COUNTS}
    legal: Dict[int, List[int]] = {k: [] for k in DRAW_COUNTS}
    for b in range(N_DRAW_BUCKETS):
        for k in bucket_draw_options(b):
            legal[k].append(b)
            if k == 0:
                proj[0][b] = [[b, 1.0]]
                continue
            acc: Dict[int, float] = {}
            hands = res[b][:proj_hands]
            for h in hands:
                kept = choose_keep(h, k)
                pool = [c for c in DECK if c not in set(h)]
                if k <= 2:
                    outs = list(combinations(pool, k))
                else:
                    outs = [tuple(rng.sample(pool, k))
                            for _ in range(k3_draw_samples)]
                w = 1.0 / (len(outs) * len(hands))
                for R in outs:
                    j = bucket_of_holding(tuple(kept) + tuple(R))
                    acc[j] = acc.get(j, 0.0) + w
            tot = sum(acc.values())
            proj[k][b] = [[j, v / tot] for j, v in sorted(acc.items())]

    dlegal_ai = [[DRAW_COUNTS.index(k) for k in bucket_draw_options(b)]
                 for b in range(N_DRAW_BUCKETS)]
    return {'n_buckets': N_DRAW_BUCKETS, 'counts': DRAW_COUNTS,
            'share': M, 'proj': proj, 'legal': legal, 'dlegal_ai': dlegal_ai,
            'meta': {'seed': seed, 'per_bucket': per_bucket,
                     'pair_samples': pair_samples, 'proj_hands': proj_hands,
                     'k3_draw_samples': k3_draw_samples,
                     'reservoir_sizes': [len(r) for r in res]}}


def save_abstraction(abs_: dict, path: str) -> None:
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(abs_, f)
    os.replace(tmp, path)                        # atomic for concurrent workers


def load_abstraction(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def load_or_build_abstraction(path: str, seed: int = 0) -> dict:
    if os.path.exists(path):
        return load_abstraction(path)
    abs_ = build_draw_abstraction(seed=seed)
    save_abstraction(abs_, path)
    return abs_


# ── bucket-lifted 2-round solve (the M2b datagen engine) ─────────────────────
def resolve_draw2_bucketed(range0: Sequence[float], range1: Sequence[float],
                           abs_: dict, iters: int = 200,
                           start: Optional[dict] = None,
                           pre_bet: int = 2, post_bet: int = 4) -> dict:
    """Solve the one-draw badugi bucket game (H = 19) with resolve_draw2's
    2-round CFR+ tree. `abs_` is build_draw_abstraction's dict (or its JSON
    round-trip — key types are normalized inside _DrawResolver2). PURE-PYTHON
    path only (the numpy backend did not pass its exactness verifiers)."""
    from resolve_draw2 import _DrawResolver2, _blinds_start, BADUGI
    nb = int(abs_['n_buckets'])
    st = dict(start) if start is not None else _blinds_start()
    R = _DrawResolver2(list(range(nb)), st, list(range0), list(range1),
                       iters=iters, pre_bet=pre_bet, post_bet=post_bet,
                       live=[], game=BADUGI,
                       share_matrix=abs_['share'], draw_abs=abs_)
    cfv0, cfv1 = R.solve()
    return {'cfv': [cfv0, cfv1],
            'pot': R.root['contrib'][0] + R.root['contrib'][1],
            'value': [sum(R.range[0][i] * cfv0[i] for i in range(R.H)),
                      sum(R.range[1][i] * cfv1[i] for i in range(R.H))],
            'iters': iters,
            'exploitability': R.exploitability()}


if __name__ == "__main__":
    rng_ = random.Random(11)
    t = lambda s: tuple(s.split())

    # 1) known hands land in the intended buckets
    assert bucket_of_holding(t("As 2d 3c 4h")) == 0          # nut badugi
    assert bucket_of_holding(t("Ks 2d 3c 4h")) == 3          # K-rough badugi
    b = bucket_of_holding(t("As 2d 3c 3h"))                  # smooth 3-card,
    assert b == 5, b                                         # low discard (3h)
    assert bucket_of_holding(t("As 2d 3c Kc")) == 4          # K discard: no blk
    assert bucket_of_holding(t("As Ad 2s 2d")) in range(12, 18)   # 2-card
    assert bucket_of_holding(t("As Ad Ah Ac")) == 18         # 1-card junk

    # 2) determinism + full coverage over a big uniform sample
    hands = [tuple(rng_.sample(DECK, 4)) for _ in range(60000)]
    bm1 = bucket_map(hands)
    bm2 = bucket_map(hands)
    assert bm1 == bm2, "bucket_map not deterministic"
    seen = set(bm1) | {bucket_of_holding(t("As Ad Ah Ac"))}
    assert seen == set(range(N_DRAW_BUCKETS)), sorted(seen)
    assert all(0 <= b < N_DRAW_BUCKETS for b in bm1)

    # 3) legality-exactness: every hand's drawOptions == its bucket's
    from resolve_draw2 import draw_options
    for h in hands[:4000]:
        assert draw_options(h) == bucket_draw_options(bucket_of_holding(h)), h

    # 4) THE bucket.py INVARIANT, ported: range-weighted aggregation preserves
    # the range-weighted value EXACTLY (sum_h r[h]cfv[h] == sum_b br[b]bcfv[b])
    H = 3000
    hs = hands[:H]
    bmap = bucket_map(hs)
    r = [rng_.random() for _ in range(H)]
    s = sum(r); r = [x / s for x in r]
    cfv = [rng_.uniform(-10, 10) for _ in range(H)]
    br = aggregate_range(r, bmap, N_DRAW_BUCKETS)
    assert abs(sum(br) - 1.0) < 1e-9, sum(br)                # mass preserved
    bcfv = aggregate_cfv(cfv, r, bmap, N_DRAW_BUCKETS)
    v_raw = sum(r[h] * cfv[h] for h in range(H))
    v_buck = sum(br[b] * bcfv[b] for b in range(N_DRAW_BUCKETS))
    assert abs(v_raw - v_buck) < 1e-9, (v_raw, v_buck)
    # scatter-then-reaggregate is idempotent (inherited contract)
    bcfv2 = aggregate_cfv(scatter_cfv(bcfv, bmap), r, bmap, N_DRAW_BUCKETS)
    assert max(abs(a - b) for a, b in zip(bcfv, bcfv2)) < 1e-9

    # 5) abstraction build (small sampling for test speed): shape + row sums
    A = build_draw_abstraction(seed=3, per_bucket=60, pair_samples=40,
                               proj_hands=20, k3_draw_samples=60)
    assert all(len(row) == N_DRAW_BUCKETS for row in A['share'])
    assert all(0.0 <= v <= 1.0 for row in A['share'] for v in row)
    for k, pk in A['proj'].items():
        for bi, row in pk.items():
            assert abs(sum(w for _, w in row) - 1.0) < 1e-9, (k, bi)
    assert A['proj'][0] == {b: [[b, 1.0]] for b in range(N_DRAW_BUCKETS)}
    # JSON round-trip (what datagen workers load)
    import tempfile
    fd = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
    save_abstraction(A, fd.name)
    A2 = load_abstraction(fd.name)
    os.unlink(fd.name)

    # 6) bucket-lifted 2-round solve: zero-sum to machine precision, strategy
    # rows are distributions, exploitability shrinks with iters
    def ranges():
        rr = [[rng_.random() for _ in range(N_DRAW_BUCKETS)] for _ in range(2)]
        return [[x / sum(v) for x in v] for v in rr]
    r0, r1 = ranges()
    res = resolve_draw2_bucketed(r0, r1, A2, iters=150)
    assert abs(res['value'][0] + res['value'][1]) < 1e-9, res['value']
    lo = resolve_draw2_bucketed(r0, r1, A2, iters=10)['exploitability']
    hi = res['exploitability']
    assert hi < lo, (lo, hi)
    st = dict(contrib=[4, 6], base=0, bets=3, toAct=0, acted=[True, True])
    res2 = resolve_draw2_bucketed(r0, r1, A2, iters=120, start=st)
    assert abs(res2['value'][0] + res2['value'][1]) < 1e-9
    assert res2['pot'] == 10

    print(f"ok: draw_bucket self-tests pass (N_DRAW_BUCKETS={N_DRAW_BUCKETS}, "
          f"coverage {len(seen)}/19, legality-exact, value-preserving "
          f"aggregation, bucket-lifted solve zero-sum "
          f"{abs(res['value'][0]+res['value'][1]):.1e}, "
          f"exploitability {lo:.3f}->{hi:.3f} @150 iters, pot 3)")
