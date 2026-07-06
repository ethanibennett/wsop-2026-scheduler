"""Belief carrier for continual re-solving (M3 — the carrier half).

Continual re-solving walks a hand one public boundary at a time. At every
boundary each seat carries FORWARD two things (DeepStack / Burch-Johanson-Bowling
CFR-D 2014):

  * a RANGE  r  — a reach vector over that seat's hidden holdings, updated for
    every public observation between the last re-solve and this one, and
  * for the seat we do NOT control the range of (the "gadget player" in the
    re-solve), a vector of COUNTERFACTUAL VALUES w — the value that seat could
    guarantee itself entering the subgame, which the resolving gadget
    (resolve.py, gadget=/carried_cfv=) uses to keep the re-solve exploitability-safe.

This module is the pure-python plumbing that produces the carried range. It is
intentionally tiny and dependency-free (stock python3, no numpy/torch) — the four
operations are exactly the four kinds of public observation that occur between
re-solves:

  reach_update   r ∝ r ⊙ σ(a|·)          — an opponent (or our own) BETTING action
                                            we observed: Bayes-update the belief by
                                            the acting seat's strategy for that action,
                                            then renormalize.
  collision_zero r[h]=0 if h ∩ newpublic  — a newly PUBLIC card (a stud upcard, a
                                            dead/folded card): any holding that would
                                            have needed that exact card is now
                                            impossible, so its reach is zeroed.
  project_draw   r_post = PROJ[k] · r_pre  — an observed DRAW of k cards: send the
                                            pre-draw reach through the reach-remap
                                            resolve_draw2 already builds
                                            (choose_keep + replacement), the private-
                                            chance analogue of a public card.
  carry_cfv      w = root opponent CFV     — read the gadget player's exact root
                                            counterfactual values out of a solve, to
                                            hand to the next re-solve's gadget.

The forward reach remap (project_draw) is the SAME matrix resolve_draw2._proj[k]
uses; here we consume it as an (i -> [(j,w)...]) mapping so the carrier does not
depend on a live resolver instance.
"""
from __future__ import annotations
from typing import Dict, List, Optional, Sequence, Tuple


# ── 1. betting-action belief update:  r ∝ r ⊙ σ(a | ·)  ──────────────────────
def reach_update(reach: Sequence[float],
                 sigma_a: Sequence[float],
                 renormalize: bool = True) -> List[float]:
    """Bayes-update a reach vector after observing the acting seat take one action.

    `sigma_a[i]` is that seat's probability of the observed action GIVEN holding i
    (a single column of the average strategy at the node where the action was
    taken). The posterior reach is the elementwise product r_i * sigma_a[i],
    renormalized to a probability vector (the classic continual-resolving range
    update). Renormalization keeps the carried range a distribution; pass
    renormalize=False to keep the raw reach magnitudes (needed when a downstream
    consumer wants absolute reach, e.g. a counterfactual weighting).

    A zero-mass posterior (the seat would never take this action with any
    surviving holding — an off-tree/off-model observation) is returned unchanged-
    in-shape as an all-zero vector; the caller decides how to handle an
    impossible observation (widen the model, or fall back to the prior)."""
    if len(reach) != len(sigma_a):
        raise ValueError(f"reach ({len(reach)}) and sigma_a ({len(sigma_a)}) "
                         "must align to the same holdings")
    post = [reach[i] * sigma_a[i] for i in range(len(reach))]
    if not renormalize:
        return post
    s = sum(post)
    if s <= 0.0:
        return [0.0] * len(post)
    return [x / s for x in post]


# ── 2. newly-public card:  zero any holding that needs that card  ────────────
def collision_zero(reach: Sequence[float],
                   holdings: Sequence[Sequence[str]],
                   new_public: Sequence[str],
                   renormalize: bool = True) -> List[float]:
    """Zero the reach of every holding that shares a card with `new_public`.

    A stud upcard turning face-up, or a folded opponent's exposed card, removes
    that exact card from every player's still-hidden holding: a holding that
    contains it was never possible and its reach collapses to 0. Renormalizes the
    survivors to a distribution by default (an all-collision wipeout returns the
    all-zero vector, same as reach_update)."""
    if len(reach) != len(holdings):
        raise ValueError(f"reach ({len(reach)}) must align to holdings "
                         f"({len(holdings)})")
    pub = frozenset(new_public)
    out = [0.0 if (pub & frozenset(h)) else reach[i]
           for i, h in enumerate(holdings)]
    if not renormalize:
        return out
    s = sum(out)
    if s <= 0.0:
        return [0.0] * len(out)
    return [x / s for x in out]


# ── 3. observed private draw:  r_post = PROJ[k] · r_pre  ─────────────────────
def project_draw(reach: Sequence[float],
                 proj_k: Dict[int, List[Tuple[int, float]]],
                 n_post: Optional[int] = None,
                 renormalize: bool = True) -> List[float]:
    """Send a pre-draw reach through an observed count-k draw (the private-chance
    analogue of a newly-public card).

    `proj_k` is resolve_draw2's forward reach-remap for the observed count k:
    {pre_index i: [(post_index j, weight w), ...]} where w = 1/#replacement-combos
    (choose_keep(i,k) then a uniform k-card replacement from the unseen deck).
    This is exactly `_DrawResolver2._proj[k]` — pass `resolver._proj[k]` directly.
    The result is the post-draw reach over the SAME holding index space (size
    `n_post`, defaults to max post-index + 1 seen in proj_k). This is `PROJ[k] . r`;
    the resolver's own `_remap` computes the identical vector for its internal
    traversal — here it is exposed as a carrier step so the belief moves across a
    draw boundary without a live solve."""
    if n_post is None:
        n_post = 0
        for row in proj_k.values():
            for j, _w in row:
                if j + 1 > n_post:
                    n_post = j + 1
    out = [0.0] * n_post
    for i, r in enumerate(reach):
        if r == 0.0:
            continue
        row = proj_k.get(i)
        if not row:
            continue
        for j, w in row:
            out[j] += r * w
    if not renormalize:
        return out
    s = sum(out)
    if s <= 0.0:
        return [0.0] * n_post
    return [x / s for x in out]


# ── 4. opponent CFV carry (DeepStack):  read the gadget's carried values  ────
def carry_cfv(solve_result: dict, gadget_player: int) -> List[float]:
    """Extract the gadget player's per-holding ROOT counterfactual values from a
    solve, to hand to the NEXT re-solve's resolving gadget as `carried_cfv`.

    `solve_result` is a resolve.resolve_subgame / resolve_draw.resolve_draw_subgame
    return dict; `solve_result['cfv'][gadget_player]` is that seat's per-holding
    counterfactual value under the equilibrium average strategy at the subgame
    root — precisely the "value the opponent can achieve entering here" the gadget
    needs. Returned as a fresh list (the carried vector is state that travels; the
    solve dict should not be aliased into it)."""
    cfv = solve_result['cfv'][gadget_player]
    return [float(x) for x in cfv]


def align_cfv(cfv: Sequence[float],
              src_holdings: Sequence[Sequence[str]],
              dst_holdings: Sequence[Sequence[str]],
              default: float = 0.0) -> List[float]:
    """Re-index a carried CFV vector from one holding ordering to another.

    Between the solve that PRODUCED the CFVs and the re-solve that CONSUMES them,
    the holding universe can be enumerated in a different order (or restricted to a
    node-locked support). This maps by holding identity (deck-sorted card set);
    a dst holding absent from the source gets `default` (0 chips — a holding the
    prior solve never valued). Pure bookkeeping, no card logic."""
    src = {frozenset(h): float(cfv[i]) for i, h in enumerate(src_holdings)}
    return [src.get(frozenset(h), default) for h in dst_holdings]


# ── self-tests (run: python3 carry.py) ───────────────────────────────────────
if __name__ == "__main__":
    # 1) reach_update: r ∝ r ⊙ σ, renormalized. A flat prior weighted by a
    #    lopsided action law lands on the normalized product.
    r = [0.25, 0.25, 0.25, 0.25]
    sig = [0.8, 0.4, 0.0, 0.2]
    post = reach_update(r, sig)
    raw = [0.25 * s for s in sig]
    tot = sum(raw)
    assert all(abs(post[i] - raw[i] / tot) < 1e-12 for i in range(4)), post
    assert abs(sum(post) - 1.0) < 1e-12
    # a holding the action rules out (σ=0) carries zero reach forward
    assert post[2] == 0.0
    # renormalize=False keeps raw magnitudes (absolute reach)
    assert reach_update(r, sig, renormalize=False) == raw
    # impossible observation (σ≡0) -> all-zero, no divide-by-zero
    assert reach_update(r, [0.0, 0.0, 0.0, 0.0]) == [0.0, 0.0, 0.0, 0.0]

    # 2) collision_zero: a newly-public card kills every holding that needs it.
    holds = [('As', '2d'), ('As', '3c'), ('4h', '5s'), ('2d', '4h')]
    rc = [0.4, 0.1, 0.3, 0.2]
    out = collision_zero(rc, holds, ['As'], renormalize=False)
    assert out == [0.0, 0.0, 0.3, 0.2], out          # both As-holdings zeroed
    outn = collision_zero(rc, holds, ['As'])          # renormalized survivors
    assert abs(sum(outn) - 1.0) < 1e-12
    assert abs(outn[2] - 0.6) < 1e-12 and abs(outn[3] - 0.4) < 1e-12
    # two public cards, and a total wipeout returns all-zero cleanly
    assert collision_zero(rc, holds, ['As', '2d', '4h']) == [0.0, 0.0, 0.0, 0.0]

    # 3) project_draw: PROJ[k]·r matches resolve_draw2._remap on a real instance,
    #    and equals a hand-built projection. (Reuses resolve_draw2's _proj.)
    from itertools import combinations
    from resolve_draw2 import _DrawResolver2, _blinds_start, BADUGI
    from resolve import _sort_holding
    live = ['As', '2d', '3c', '4h', '5s', '6d', '7c', '8h']
    holds4 = list(combinations(live, 4))
    H = len(holds4)
    R = _DrawResolver2(holds4, _blinds_start(), [1.0 / H] * H, [1.0 / H] * H,
                       iters=1, live=live)
    import random as _rnd
    rr = _rnd.Random(3)
    pre = [rr.random() for _ in range(H)]
    s = sum(pre); pre = [x / s for x in pre]
    for k in R._ucd:
        proj_k = R._proj[k]
        got = project_draw(pre, proj_k, n_post=H, renormalize=False)
        ref = R._remap(pre, k)                         # resolver's own forward remap
        assert max(abs(got[j] - ref[j]) for j in range(H)) < 1e-12, k
    # renormalized draw of the natural count is a distribution
    k0 = R._ucd[-1]
    pd = project_draw(pre, R._proj[k0], n_post=H)
    if sum(pd) > 0:
        assert abs(sum(pd) - 1.0) < 1e-12

    # 4) carry_cfv + align_cfv: pull the gadget player's root CFVs out of a solve
    #    and re-index them to a different holding order by identity.
    fake = {'cfv': [[1.0, 2.0, 3.0], [-1.0, -2.0, -3.0]],
            'holdings': [('As', '2d'), ('3c', '4h'), ('5s', '6d')]}
    w = carry_cfv(fake, gadget_player=1)
    assert w == [-1.0, -2.0, -3.0]
    dst = [('3c', '4h'), ('7c', '8h'), ('As', '2d')]   # reordered + one novel
    aligned = align_cfv(w, fake['holdings'], dst, default=0.0)
    assert aligned == [-2.0, 0.0, -1.0], aligned

    print("ok: carry.py self-tests pass "
          "(reach_update ∝ r⊙σ, collision zeroing, PROJ[k]·r == _remap, "
          "opponent-CFV carry + holding re-index)")
