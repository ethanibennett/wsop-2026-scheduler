"""solve_range — range-vs-range GTO spot solver for Stud 8 / razz (study tool).

The companion to solve_spot.py. Where solve_spot makes you enumerate a small,
explicit list of holdings (it caps the COMBINED range support so the exact CFR
stays fast), solve_range lets you solve with WIDE / FULL ranges — true
range-vs-range equilibrium — with NO hand-listing cap. Give it a public board
(both players' upcards + any dead cards), each player's range (the literal `all`
= uniform over EVERY valid holding on the board, or a weighted holding list),
the pot, and it returns the equilibrium strategy of each RANGE at every betting
node plus the game value and exploitability.

Two engines, auto-selected by the combined distinct holding count:
  * EXACT  — raw-holding CFR+ via resolve.resolve_subgame, for ranges narrow
             enough to solve in a few seconds (the node-locked study case).
  * BUCKETED — full-range CFR+ over hi×lo (Stud 8, 25) / low (razz, 8) buckets
             via bucket_resolve.resolve_bucketed, for ranges too big for exact
             (e.g. `all` on a full 7th board ≈ 13k holdings solves in ~2s).

resolve.resolve_subgame solves BOTH players to an approximate equilibrium over
the given range supports (range-form CFR+, DeepStack/Libratus public-tree
formulation); it is NOT a one-sided best response. The reported `exploitability`
is the sum of both players' exact best-response gains vs the solved average
strategy (7th street), → 0 as the subgame is solved.

CLI (7th street; both ranges FULL):
  python3 solve_range.py --game stud8 --street 7 --up0 As4s5d7c --up1 KhQdJc9h \
      --pot 20 --r0 all --r1 all

  python3 solve_range.py --street 7 --up0 As4s5d7c --up1 KhQdJc9h --pot 20 \
      --r0 "Kc Kd 2c, Qs Js Tc:2.0" --r1 all --me "2h 3h 6c"

Run with NO args for the self-test (`.venv/bin/python solve_range.py`).
"""
from __future__ import annotations
import json
import random
from typing import Dict, List, Optional

from pbs import down_count, enumerate_holdings, unseen, PBS
from resolve import (_Resolver, _deck_index, _sort_holding, is_leaf,
                     legal_actions, apply_action, STUD8)
from razz_game import RAZZ
# Reuse solve_spot's parsing verbatim (card splitting, holding tuples, range spec).
from solve_spot import _split_cards, _holding, _parse_range, ACTION_LABEL

# NumPy-vectorized EXACT re-solver — numerically equivalent to resolve_subgame
# (asserted in resolve_fast's self-test) but ~hundreds× faster at the showdown,
# so the exact path can solve FAR more holdings. Optional: if NumPy / the module
# is unavailable we transparently fall back to the pure-Python reference.
try:
    import numpy as _np                              # noqa: F401
    from resolve_fast import _FastResolver
    _HAVE_FAST = True
except Exception:                                    # pragma: no cover
    _FastResolver = None
    _HAVE_FAST = False

import bucket as B_STUD
import bucket_razz as B_RAZZ
import bucket_resolve as BR_STUD
import bucket_resolve_razz as BR_RAZZ
import bucket_emd as B_EMD                 # stud8-only CANONICAL value-ordered EMD buckets
from datagen_emd import sample_share_matrix_emd

# --game name -> (GameSpec, bucket module, bucket_resolve module)
_GAME = {
    'stud8': (STUD8, B_STUD, BR_STUD),
    'razz':  (RAZZ,  B_RAZZ, BR_RAZZ),
}

# ── Engine-selection threshold + per-engine CFR budgets (set EMPIRICALLY) ──
#
# Timing of real 7th-street solves on this stack (MacBook, single core) drove
# these numbers:
#
#   EXACT — NumPy-vectorized resolve_fast.resolve_subgame_fast (numerically
#   equivalent to the pure-Python resolve_subgame; see resolve_fast.py). The
#   per-pair O(H²) showdown is now an EXACT precomputed H×H matrix + BLAS matvecs,
#   ~hundreds× faster than the old pure-Python loop, so the exact path scales to
#   over a thousand holdings in a "few-seconds" study budget (full solve incl.
#   strategy report + exact best-response, iters=200):
#       H= 165  0.2s | H= 455  0.6s | H= 680  1.2s
#       H= 969  4.3s | H=1140  6.5s | H=1330  8.8s   (exploit ≈ 0.6% pot)
#   so ~1200 distinct holdings stays under ~8s; past that the O(H²·iters) matvecs
#   grow. (The OLD pure-Python cap was 80: H=84 took ~15s there.) Hence:
EXACT_HOLDING_CAP = 1200        # combined distinct holdings ≤ this -> EXACT
#                                 (vectorized; falls back to 80-ish speed only if
#                                 NumPy is unavailable, but still CORRECT there)
EXACT_ITERS_CAP = 200           # exact path caps CFR iters here (well-converged:
#                                 exploitability < 0.7% of pot up to the cap)
#
#   BUCKETED (resolve_bucketed), cost = matrix sample + O(n_buckets² · iters):
#       matrix(holding_cap=1500) ≈ 0.8s (stud8) / 1.2s (razz)
#       solve(250it): stud8 (25 buckets) ≈ 1.8s ; razz (8 buckets) ≈ 0.7s
#   so a FULL 7th board finishes in ≈ 2.5s (stud8) / ≈ 2s (razz):
BUCKET_ITERS_CAP = 250          # bucketed path caps CFR iters here
BUCKET_HOLDING_CAP = 1500       # share-matrix per-board precompute subset size
BUCKET_SAMPLES = 40             # share-matrix samples per bucket pair

# EMD abstraction (stud8-only). bucket_emd's CANONICAL value-ordered buckets
# generalize far better than the 25-grid (board-disjoint R² 0.51 vs 0.33), so
# `--abstraction emd` swaps the hi×lo grid for them on the stud8 BUCKETED path.
# The clustering seed is fixed so the per-seat bucket assignment matches the
# share matrix (both call bucket_emd.bucket_map with this seed).
EMD_DEFAULT_BUCKETS = 80        # default --emd-buckets (a board yields ≤ this many)
EMD_SEED = 0                    # bucket_emd clustering seed (assignment ↔ matrix)
#   The bucketed CFR leaf is O(n_buckets² · iters); EMD's ~80 buckets cost ~10×
#   the hi×lo grid's 25 at the showdown, so the EMD path gets its OWN, lower iter
#   cap to stay in the interactive budget. At 80 buckets ~60 iters converges to
#   ≈1.7% of pot exploitability (well within the study tolerance) in ~1.6s CFR.
EMD_ITERS_CAP = 60              # EMD bucketed path caps CFR iters here


# ─────────────────────────────────────────────────────────────────────────────
# Range parsing
# ─────────────────────────────────────────────────────────────────────────────
def parse_range(spec: str, board: List[str], k: int) -> Dict[tuple, float]:
    """Range spec -> {holding_tuple: weight}. `all` = uniform over every valid
    holding on the board; else a comma-separated weighted holding list (reuses
    solve_spot._parse_range — same `'Kc Kd 2c, Qs Js Tc:2.0'` grammar). NO cap.

    Every explicit holding is validated for board-consistency AND internal
    uniqueness: a card already on the board, or a duplicate card within a
    holding, is rejected with a clear error here (the single parse chokepoint)
    instead of crashing downstream (EMD KeyError) or silently returning a
    confident-but-wrong value (HILO/EXACT)."""
    out = _parse_range(spec, board, k)
    if spec.strip().lower() != 'all':
        valid = set(enumerate_holdings(board, k))
        for h in out:
            if h not in valid:
                raise ValueError(
                    f"holding {' '.join(h)} is not a valid {k}-card holding on "
                    f"this board (uses a board card or a duplicate)")
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Per-holding strategy extraction (for --me in EXACT mode)
# ─────────────────────────────────────────────────────────────────────────────
def _me_strategy_exact(R: "_Resolver", me_idx: int) -> Dict[str, dict]:
    """The average strategy of ONE holding (me_idx) at every betting node it
    reaches — the exact analog of R.strategy_report() but for a single holding
    instead of the reach-weighted aggregate. Traverses the public tree; at each
    node where `me` is the actor, reports that holding's average sigma row."""
    rep: Dict[str, dict] = {}

    def rec(node: dict):
        if is_leaf(node):
            return
        p = node['toAct']
        acts = legal_actions(node)
        A = len(acts)
        key = node['curSeq']
        if p in (0, 1):
            row = R._avg_sigma_row(key, me_idx, A)
            rep[key or '(root)'] = {
                'who': 'me' if p == 0 else 'opp',
                'actions': [ACTION_LABEL.get(a, a) for a in acts],
                'freq': [round(f, 4) for f in row],
            }
        for a in acts:
            rec(apply_action(node, a))

    rec(R.root)
    return rep


def _decisions_from_report(report: Dict[str, dict]) -> Dict[str, dict]:
    """resolve.strategy_report() -> the public `decisions` shape (relabel the
    actor me/opp, name the actions, round the reach-weighted aggregate freqs)."""
    out: Dict[str, dict] = {}
    for hist, node in report.items():
        out[hist or '(root)'] = {
            'who': 'me' if node['player'] == 0 else 'opp',
            'actions': [ACTION_LABEL.get(a, a) for a in node['actions']],
            'freq': [round(f, 4) for f in node['freq']],
        }
    return out


# ─────────────────────────────────────────────────────────────────────────────
# EXACT engine (raw holdings)
# ─────────────────────────────────────────────────────────────────────────────
def _solve_exact(street: int, up, dead, pot: float,
                 me_range: Dict[tuple, float], opp_range: Dict[tuple, float],
                 iters: int, game, gamename: str,
                 me_holding: Optional[tuple],
                 leaf_value_fn=None, depth_limit=None) -> dict:
    """Exact range-vs-range solve over the union of both ranges' raw holdings."""
    k = down_count(street)
    union = sorted(set(me_range) | set(opp_range),
                   key=lambda h: tuple(_deck_index(c) for c in h))
    if not union:
        raise ValueError("both ranges are empty")
    idx = {h: i for i, h in enumerate(union)}
    H = len(union)
    r0 = [0.0] * H
    r1 = [0.0] * H
    for h, w in me_range.items():
        r0[idx[h]] += w
    for h, w in opp_range.items():
        r1[idx[h]] += w
    s0, s1 = sum(r0), sum(r1)
    r0 = [x / s0 for x in r0] if s0 else r0
    r1 = [x / s1 for x in r1] if s1 else r1

    # Build the resolver directly so one solve yields the aggregate decisions,
    # the value, the exploitability AND (for --me) a single holding's strategy.
    # Prefer the NumPy-vectorized resolver (resolve_fast._FastResolver) — it is
    # numerically equivalent to the pure-Python _Resolver (asserted in
    # resolve_fast's self-test) but ~hundreds× faster at the showdown, which is
    # what lets EXACT_HOLDING_CAP be in the thousands. Fall back to the
    # pure-Python reference if NumPy is unavailable.
    iters_eff = min(iters, EXACT_ITERS_CAP)
    if _HAVE_FAST:
        R = _FastResolver(street, up, dead, float(pot), r0, r1,
                          leaf_value_fn, iters_eff, depth_limit,
                          holdings=union, game=game)
        cfv0, cfv1 = R.solve()
        v0 = float(_np.dot(R.r0, cfv0))
        v1 = float(_np.dot(R.r1, cfv1))
        st0 = R.st0
        pot_root = R.root_betting['contrib'][0] + R.root_betting['contrib'][1]
        decisions = _decisions_from_report(R.strategy_report())
        exploit = R.exploitability() if st0 == 4 else None
        me_strat = (R.me_strategy(idx[me_holding], ACTION_LABEL)
                    if me_holding is not None and me_holding in idx else None)
    else:
        R = _Resolver(street, up, dead, float(pot), r0, r1,
                      leaf_value_fn, iters_eff, depth_limit,
                      holdings=union, game=game)
        cfv0, cfv1 = R.solve()
        v0 = sum(R.range[0][i] * cfv0[i] for i in range(H))
        v1 = sum(R.range[1][i] * cfv1[i] for i in range(H))
        st0 = R.st0
        pot_root = R.root['contrib'][0] + R.root['contrib'][1]
        decisions = _decisions_from_report(R.strategy_report())
        exploit = R.exploitability() if st0 == 4 else None
        me_strat = (_me_strategy_exact(R, idx[me_holding])
                    if me_holding is not None and me_holding in idx else None)

    out = {
        'game': gamename, 'street': street,
        'pot': pot_root,
        'mode': 'exact', 'n': H,
        'value': {'me': round(v0, 4), 'opp': round(v1, 4)},
        'decisions': decisions,
    }
    if exploit is not None:                           # exact BR gauge (7th only)
        out['exploitability'] = round(exploit, 4)

    if me_holding is not None:
        if me_holding not in idx:
            raise ValueError(
                f"--me holding {me_holding} is not in --r0's support (and is not "
                f"a valid holding on this board); cannot report its line")
        out['me_strategy'] = me_strat
    return out


# ─────────────────────────────────────────────────────────────────────────────
# BUCKETED engine (full range)
# ─────────────────────────────────────────────────────────────────────────────
def _aggregate_one(rng_map, upcards, bmod, rng) -> List[float]:
    """Aggregate ONE seat's {holding: weight} range to a per-bucket probability
    vector by mapping each *support* holding with bmod.bucket_of_holding. For a
    huge range (`all` ≈ 13k holdings) the support is subsampled to
    BUCKET_HOLDING_CAP — the bucket-population estimate from ~1500 holdings is
    accurate and consistent with the share matrix (itself a capped estimate),
    and it avoids a full-board bucket_map (~1.6s/seat for razz). For explicit
    weighted lists (small support) every holding is mapped, so it's exact."""
    nb = bmod.N_BUCKETS
    items = list(rng_map.items())
    if len(items) > BUCKET_HOLDING_CAP:
        items = rng.sample(items, BUCKET_HOLDING_CAP)
    br = [0.0] * nb
    for h, w in items:
        br[bmod.bucket_of_holding(h, upcards)] += w
    s = sum(br)
    return [x / s for x in br] if s else br


def _bucket_ranges(me_range, opp_range, board, k, up, bmod, rng):
    """Per-bucket reach vectors (probability) for both seats."""
    return (_aggregate_one(me_range, up[0], bmod, rng),
            _aggregate_one(opp_range, up[1], bmod, rng))


# ── EMD abstraction (stud8-only): CANONICAL value-ordered buckets ────────────
def _emd_holding_buckets(board, k, up, n_buckets):
    """Per-seat {holding_tuple: emd_bucket} maps for the canonical EMD buckets.

    bucket_emd.bucket_map returns a list ALIGNED to enumerate_holdings(board, k),
    and is per-seat (the histogram feature is from that seat's perspective): seat
    0 features its holdings vs up1, seat 1 vs up0 — mirroring datagen_emd's
    sample_share_matrix_emd so the assignment matches the share matrix. The fixed
    EMD_SEED keeps both in lockstep. We invert each list to a {holding: bucket}
    dict so a specific holding (range support / --me) maps to its EMD bucket."""
    holds = enumerate_holdings(board, k)
    bmap0 = B_EMD.bucket_map(board, k, up[0], up1=up[1], seed=EMD_SEED,
                             n_buckets=n_buckets)
    bmap1 = B_EMD.bucket_map(board, k, up[1], up1=up[0], seed=EMD_SEED,
                             n_buckets=n_buckets)
    bof0 = {h: bmap0[i] for i, h in enumerate(holds)}
    bof1 = {h: bmap1[i] for i, h in enumerate(holds)}
    return bof0, bof1


def _aggregate_one_emd(rng_map, bof, n_buckets, rng) -> List[float]:
    """Aggregate ONE seat's {holding: weight} range to a per-EMD-bucket vector
    using a precomputed {holding: emd_bucket} map (the EMD analog of
    _aggregate_one). Same BUCKET_HOLDING_CAP subsample so the population estimate
    is consistent with the (capped) EMD share matrix."""
    items = list(rng_map.items())
    if len(items) > BUCKET_HOLDING_CAP:
        items = rng.sample(items, BUCKET_HOLDING_CAP)
    br = [0.0] * n_buckets
    for h, w in items:
        br[bof[h]] += w
    s = sum(br)
    return [x / s for x in br] if s else br


def _solve_bucketed(street: int, up, dead, pot: float,
                    me_range, opp_range, iters: int,
                    bmod, brmod, game, gamename: str,
                    me_holding: Optional[tuple],
                    abstraction: str = 'hilo',
                    emd_buckets: int = EMD_DEFAULT_BUCKETS) -> dict:
    """Full-range solve over buckets. Reach-weighted aggregate decisions fall
    straight out of the bucketed solve (its reach vectors ARE the aggregated
    ranges), so node freqs are already the range's overall strategy.

    abstraction='hilo' (default): hi×lo grid (stud8, 25) / low ladder (razz, 8)
        via bmod/brmod — byte-for-byte the original behavior.
    abstraction='emd' (stud8 only): bucket_emd's CANONICAL value-ordered buckets
        (emd_buckets ceiling) with an EMD-grouped share matrix. The bucket-of-
        holding map is per-seat; me_bucket/--me reporting maps the hero holding
        through seat 0's EMD map so it still plays its bucket's line."""
    board = up[0] + up[1] + dead
    k = down_count(street)
    rng = random.Random(0)

    if abstraction == 'emd':
        nb = emd_buckets
        iters_cap = EMD_ITERS_CAP
        bof0, bof1 = _emd_holding_buckets(board, k, up, nb)
        # nb is the CEILING handed to the resolver as its index space; the EMD
        # clustering populates only some of those buckets (and collapses to 1 on
        # card-starved boards). Report the ACTUAL distinct buckets used, not the
        # ceiling, so `n` reflects real abstraction granularity.
        n_used = len(set(bof0.values()) | set(bof1.values()))
        br0 = _aggregate_one_emd(me_range, bof0, nb, rng)
        br1 = _aggregate_one_emd(opp_range, bof1, nb, rng)
        M = sample_share_matrix_emd(board, k, up[0], up[1], n_buckets=nb,
                                    samples=BUCKET_SAMPLES, rng=rng,
                                    seed=EMD_SEED,
                                    holding_cap=BUCKET_HOLDING_CAP)
        # me_bucket comes from seat 0's EMD map (hero is seat 0).
        me_bucket_of = (lambda h: bof0[h]) if me_holding is not None else None
    else:
        nb = bmod.N_BUCKETS
        iters_cap = BUCKET_ITERS_CAP
        br0, br1 = _bucket_ranges(me_range, opp_range, board, k, up, bmod, rng)
        M = brmod.sample_share_matrix(board, k, up[0], up[1], nb,
                                      BUCKET_SAMPLES, rng,
                                      holding_cap=BUCKET_HOLDING_CAP)
        me_bucket_of = (lambda h: bmod.bucket_of_holding(h, up[0])
                        ) if me_holding is not None else None

    res = brmod.resolve_bucketed(street, up, dead, float(pot), br0, br1,
                                 iters=min(iters, iters_cap),
                                 share_matrix=M, n_buckets=nb)

    out = {
        'game': gamename, 'street': street, 'pot': res['pot'],
        'mode': 'bucketed', 'abstraction': abstraction,
        'n': (n_used if abstraction == 'emd' else nb),
        'value': {'me': round(res['value'][0], 4),
                  'opp': round(res['value'][1], 4)},
        'decisions': _decisions_from_report(res['strategy']),
    }
    if 'exploitability' in res:
        out['exploitability'] = round(res['exploitability'], 4)

    if me_holding is not None:
        if len(me_holding) != k or (set(me_holding) & set(board)) or \
                len(set(me_holding)) != len(me_holding):
            raise ValueError(f"--me holding {me_holding} is not a valid {k}-card "
                             f"holding on this board")
        me_bucket = me_bucket_of(me_holding)
        # In bucketed mode every holding plays its bucket's strategy; report it.
        me_strat: Dict[str, dict] = {}
        for hist, node in res['strategy'].items():
            if node['player'] != 0:
                continue
            me_strat[hist or '(root)'] = {
                'who': 'me',
                'actions': [ACTION_LABEL.get(a, a) for a in node['actions']],
                'freq': None,  # filled below
            }
        # Re-extract per-bucket freqs from the solved resolver. resolve_bucketed
        # returns only the aggregate report, so rebuild the resolver to read the
        # me-bucket's own sigma row at each node (cheap: nb buckets).
        R = _Resolver(street, up, dead, float(pot), br0, br1, None,
                      min(iters, iters_cap), None,
                      holdings=list(range(nb)), share_matrix=M, game=game)
        R.solve()
        for hist, node in me_strat.items():
            key = '' if hist == '(root)' else hist
            acts = res['strategy'][key]['actions']
            node['freq'] = [round(f, 4) for f in
                            R._avg_sigma_row(key, me_bucket, len(acts))]
        out['me_strategy'] = me_strat
        out['me_bucket'] = me_bucket
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Public entry: auto-select engine
# ─────────────────────────────────────────────────────────────────────────────
def solve_range(street: int, up, dead, pot: float,
                r0_spec: str, r1_spec: str,
                iters: int = 1000, game_name: str = 'stud8',
                me: Optional[str] = None,
                force_mode: Optional[str] = None,
                abstraction: str = 'hilo',
                emd_buckets: int = EMD_DEFAULT_BUCKETS) -> dict:
    """Solve a range-vs-range spot. r0_spec/r1_spec are range specs (`all` or a
    weighted holding list). Auto-selects EXACT (raw holdings) vs BUCKETED (full
    range) by the combined distinct holding count, unless `force_mode` pins it.

    `abstraction` selects the BUCKETED engine's hand abstraction (the EXACT path
    is independent of it): 'hilo' (default, current behavior) = the hi×lo grid
    (stud8) / low ladder (razz); 'emd' = bucket_emd's CANONICAL value-ordered
    buckets — STUD8 ONLY (razz ignores it with a note and stays on its ladder).
    `emd_buckets` is the EMD bucket-count ceiling."""
    game, bmod, brmod = _GAME[game_name]
    k = down_count(street)
    board = up[0] + up[1] + dead
    me_range = parse_range(r0_spec, board, k)
    opp_range = parse_range(r1_spec, board, k)
    me_holding = _holding(me, k) if me else None

    # EMD bucketing is stud8-only; on razz fall back to the default ladder.
    if abstraction == 'emd' and game_name != 'stud8':
        print(f"note: --abstraction emd is stud8-only; {game_name} stays on its "
              f"default bucketing ({bmod.N_BUCKETS}-bucket ladder). Proceeding.")
        abstraction = 'hilo'

    n_distinct = len(set(me_range) | set(opp_range))
    # A card-starved board (live pool < 2k) can't seat two disjoint k-card
    # holdings, so the bucketed/EMD abstraction collapses every hand to ONE
    # bucket — a silent, degenerate result. Such boards have a tiny holding
    # count (well within the exact path's capacity), so force exact: always
    # safe, and it can never be the collapsing path.
    mode = ('exact' if len(unseen(board)) < 2 * k else force_mode) or \
        ('exact' if n_distinct <= EXACT_HOLDING_CAP else 'bucketed')

    if mode == 'exact':
        # leaf_value_fn=None, depth_limit=None -> solve to the end of the hand
        # (exact 7th-street showdown; on 6th, resolve's exact one-level 6th->7th
        # recursion). The net-leaf 6th path is solve_range_6th instead. The EXACT
        # path (raw-holding CFR+) is independent of --abstraction by design.
        return _solve_exact(street, up, dead, pot, me_range, opp_range, iters,
                            game, game_name, me_holding,
                            leaf_value_fn=None, depth_limit=None)
    return _solve_bucketed(street, up, dead, pot, me_range, opp_range, iters,
                          bmod, brmod, game, game_name, me_holding,
                          abstraction=abstraction, emd_buckets=emd_buckets)


# ─────────────────────────────────────────────────────────────────────────────
# 6th street via the trained 7th-net leaf (optional; needs the .pt + torch)
# ─────────────────────────────────────────────────────────────────────────────
_NET_FILE = {'stud8': 'nets/st7_200k.pt', 'razz': 'nets/razz7_3k.pt'}


def _load_net_leaf(game_name: str):
    """Build a resolve leaf_value_fn from the trained 7th-street net (lazy torch
    import). Returns None if torch / the .pt file is unavailable."""
    import os
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        _NET_FILE[game_name])
    if not os.path.exists(path):
        return None
    try:
        import torch
        from value_net import CounterfactualValueNet
        from net_leaf import make_leaf_value_fn, torch_predict_fn
        _, bmod, _ = _GAME[game_name]
        from pbs import BOARD_DIM, EXTRA_DIM
        ckpt = torch.load(path, map_location='cpu')
        sd = ckpt.get('model', ckpt) if isinstance(ckpt, dict) else ckpt
        net = CounterfactualValueNet(n_holdings=bmod.N_BUCKETS,
                                     board_dim=BOARD_DIM, extra_dim=EXTRA_DIM)
        net.load_state_dict(sd)
        net.eval()
        return make_leaf_value_fn(torch_predict_fn(net),
                                  n_buckets=bmod.N_BUCKETS, bucketing=bmod)
    except Exception:
        return None


def solve_range_6th(street, up, dead, pot, r0_spec, r1_spec, iters, game_name,
                    me=None):
    """6th street via a depth-limited resolve whose 7th boundary is valued by the
    trained net (net_leaf + resolve depth_limit). EXACT-only path (raw holdings):
    bucketed 6th is not built here. Returns None if the net is unavailable."""
    leaf = _load_net_leaf(game_name)
    if leaf is None:
        return None
    game, bmod, _ = _GAME[game_name]
    k = down_count(street)
    board = up[0] + up[1] + dead
    me_range = parse_range(r0_spec, board, k)
    opp_range = parse_range(r1_spec, board, k)
    me_holding = _holding(me, k) if me else None
    n_distinct = len(set(me_range) | set(opp_range))
    if n_distinct > EXACT_HOLDING_CAP:
        return None
    out = _solve_exact(street, up, dead, pot, me_range, opp_range, iters, game,
                       game_name, me_holding, leaf_value_fn=leaf, depth_limit=1)
    out['leaf'] = 'net(st7)'
    return out


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────
def _cli():
    import argparse
    p = argparse.ArgumentParser(
        description="Range-vs-range GTO solver for Stud 8 / razz (no hand cap).")
    p.add_argument('--game', default='stud8', choices=['stud8', 'razz'])
    p.add_argument('--street', type=int, default=7)
    p.add_argument('--up0', required=True, help="my upcards, e.g. As4s5d7c")
    p.add_argument('--up1', required=True, help="opponent upcards")
    p.add_argument('--dead', default='', help="dead/exposed cards (optional)")
    p.add_argument('--pot', type=float, required=True)
    p.add_argument('--iters', type=int, default=1000)
    p.add_argument('--r0', required=True, help="my range: 'all' or weighted list")
    p.add_argument('--r1', required=True, help="opp range: 'all' or weighted list")
    p.add_argument('--me', help="a specific hero holding to report the line for")
    p.add_argument('--mode', choices=['exact', 'bucketed'],
                   help="force engine (default: auto by holding count)")
    p.add_argument('--abstraction', choices=['hilo', 'emd'], default='hilo',
                   help="BUCKETED hand abstraction: 'hilo' (default, hi×lo grid / "
                        "razz ladder) or 'emd' (canonical value-ordered EMD "
                        "buckets; STUD8 ONLY). No effect on the exact path.")
    p.add_argument('--emd-buckets', type=int, default=EMD_DEFAULT_BUCKETS,
                   help=f"EMD bucket-count ceiling (default {EMD_DEFAULT_BUCKETS}; "
                        "only used with --abstraction emd)")
    a = p.parse_args()

    up = [_split_cards(a.up0), _split_cards(a.up1)]
    dead = _split_cards(a.dead) if a.dead else []

    if a.street == 7:
        out = solve_range(a.street, up, dead, a.pot, a.r0, a.r1, a.iters,
                          a.game, a.me, force_mode=a.mode,
                          abstraction=a.abstraction, emd_buckets=a.emd_buckets)
    elif a.street == 6:
        out = solve_range_6th(a.street, up, dead, a.pot, a.r0, a.r1, a.iters,
                              a.game, a.me)
        if out is None:
            raise SystemExit(
                "6th street needs the trained 7th-street net "
                f"({_NET_FILE[a.game]}) + PyTorch, and the combined range must be "
                f"≤ {EXACT_HOLDING_CAP} holdings (exact path only). "
                "Either narrow the ranges, or solve 7th street directly.")
    else:
        raise SystemExit(
            f"street {a.street} not supported. 7th street is fully supported "
            "(exact + bucketed); 6th street is supported via the trained net leaf "
            "(exact, narrow ranges). Streets 3-5 deal public upcards and need the "
            "neural search leaf — not built into this study tool.")
    print(json.dumps(out, indent=2))


# ─────────────────────────────────────────────────────────────────────────────
# Self-test
# ─────────────────────────────────────────────────────────────────────────────
def _tiny_board(up0, up1, live):
    """Board whose unseen pool is exactly `live` (everything else dead)."""
    from pbs import RANKS, SUITS
    used = set(up0) | set(up1) | set(live)
    dead = [c for c in (r + s for r in RANKS for s in SUITS) if c not in used]
    return up0, up1, dead


def _selftest():
    import time
    from pbs import enumerate_holdings

    up0 = ['As', '4s', '5d', '7c']
    up1 = ['Kh', 'Qd', 'Jc', '9h']

    # 1) stud8 7th, r0=all r1=all on a SHRUNK board (dead cards) -> EXACT path.
    #    live=6 -> C(6,3)=20 holdings each, ≤ EXACT_HOLDING_CAP -> exact.
    live = ['2c', '3d', '6h', '8s', 'Tc', 'Kd']
    u0, u1, dead = _tiny_board(up0, up1, live)
    H = len(enumerate_holdings(u0 + u1 + dead, 3))
    assert H <= EXACT_HOLDING_CAP, H
    t0 = time.time()
    s8 = solve_range(7, [u0, u1], dead, 20.0, 'all', 'all', iters=200,
                     game_name='stud8')
    dt8 = time.time() - t0
    assert s8['mode'] == 'exact', s8['mode']
    assert s8['n'] == H, (s8['n'], H)
    assert abs(s8['value']['me'] + s8['value']['opp']) < 1e-6, s8['value']
    assert s8['exploitability'] < 0.05 * s8['pot'], s8['exploitability']
    assert '(root)' in s8['decisions']
    assert abs(sum(s8['decisions']['(root)']['freq']) - 1.0) < 1e-6

    # 2) razz 7th, r0=all r1=all on the same shrunk board -> EXACT path.
    t0 = time.time()
    rz = solve_range(7, [u0, u1], dead, 20.0, 'all', 'all', iters=200,
                     game_name='razz')
    dtrz = time.time() - t0
    assert rz['mode'] == 'exact', rz['mode']
    assert abs(rz['value']['me'] + rz['value']['opp']) < 1e-6, rz['value']
    assert rz['exploitability'] < 0.05 * rz['pot'], rz['exploitability']
    assert abs(sum(rz['decisions']['(root)']['freq']) - 1.0) < 1e-6

    # 3) FULL 7th board (no dead) r0=all r1=all -> BUCKETED path, must be quick.
    full_H = len(enumerate_holdings(up0 + up1, 3))
    assert full_H > EXACT_HOLDING_CAP            # ≈ 13k -> routes to bucketed
    t0 = time.time()
    bk = solve_range(7, [up0, up1], [], 20.0, 'all', 'all', iters=1000,
                     game_name='stud8')
    dtbk = time.time() - t0
    assert bk['mode'] == 'bucketed', bk['mode']
    assert bk['n'] == B_STUD.N_BUCKETS, bk['n']
    assert abs(bk['value']['me'] + bk['value']['opp']) < 1e-6, bk['value']
    assert dtbk < 3.0, f"bucketed full board too slow: {dtbk:.2f}s"
    assert abs(sum(bk['decisions']['(root)']['freq']) - 1.0) < 1e-6

    # 3b) FULL 7th board razz -> bucketed, quick.
    t0 = time.time()
    bkrz = solve_range(7, [up0, up1], [], 20.0, 'all', 'all', iters=1000,
                       game_name='razz')
    dtbkrz = time.time() - t0
    assert bkrz['mode'] == 'bucketed' and bkrz['n'] == B_RAZZ.N_BUCKETS
    assert abs(bkrz['value']['me'] + bkrz['value']['opp']) < 1e-6
    assert dtbkrz < 3.0, f"bucketed razz full board too slow: {dtbkrz:.2f}s"

    # 4) dominance: hero range = a strong scooping holding, opp = a weak one ->
    #    hero value > 0. Pick a stud8 matchup where hero scoops on the live board.
    from eval_stud8 import split_share
    holds = enumerate_holdings(u0 + u1 + dead, 3)
    strong = weak = None
    for hi in holds:
        for hj in holds:
            if set(hi) & set(hj):
                continue
            if split_share(list(hi) + u0, list(hj) + u1) == 1.0:
                strong, weak = hi, hj
                break
        if strong:
            break
    assert strong is not None, "no scooping matchup found on the test board"
    fmt = lambda h: ' '.join(h)
    dom = solve_range(7, [u0, u1], dead, 20.0, fmt(strong), fmt(weak), iters=200,
                      game_name='stud8', me=fmt(strong))
    assert dom['value']['me'] > 0, dom['value']
    assert dom['exploitability'] < 0.05 * dom['pot']
    assert 'me_strategy' in dom and '(root)' in dom['me_strategy']

    # 4b) HIGHER-CAP CORRECTNESS: solve_range's EXACT path (now the NumPy fast
    #     resolver) PAST the old 80-holding cap must reproduce the pure-Python
    #     REFERENCE resolve_subgame on BOTH games and an ASYMMETRIC range — the
    #     guarantee the raised cap rests on.
    #
    #     NOTE on tolerances: the SOLVER equivalence (raw cfv/value, value 1e-6,
    #     freqs 1e-3, exploit 1e-4) is proven exhaustively in resolve_fast.py's
    #     own self-test (machine precision there). Here we compare solve_range's
    #     PUBLIC output, which rounds value/exploit/freqs to 4 decimals, so the
    #     achievable floor is the rounding granularity (5e-4) — we assert against
    #     that AND, separately, that the unrounded fast-resolver value matches the
    #     reference to 1e-6 (so we're testing the wiring, not the rounding). H and
    #     iters are kept modest so the SLOW reference doesn't bloat this
    #     interactive test (H=120 is 50% past the old 80 cap; reference ~20s).
    from resolve import resolve_subgame
    from pbs import RANKS as _RK, SUITS as _SU
    cap_dv = cap_df = cap_de = 0.0     # rounded public-output deviations
    cap_dv_raw = 0.0                   # unrounded solver-value deviation (→ 1e-6)
    cap_dt = 0.0
    cap_live = [c for c in (r + s for r in _RK for s in _SU)
                if c not in set(up0) | set(up1)][:10]      # C(10,3)=120 holdings
    cu0, cu1, cdead = _tiny_board(up0, up1, cap_live)
    cap_holds = enumerate_holdings(cu0 + cu1 + cdead, 3)
    cap_H = len(cap_holds)
    assert 80 < cap_H <= EXACT_HOLDING_CAP, cap_H            # past the old cap
    cap_iters = 120
    _rng = random.Random(11)
    fmtw = lambda hs, ws: ', '.join(
        f"{''.join(h)}:{w!r}" for h, w in zip(hs, ws) if w > 0)
    for gname, gobj in (('stud8', STUD8), ('razz', RAZZ)):
        # one ASYMMETRIC range (the hardest case) per game keeps this bounded.
        rr0 = [_rng.random() ** 2 + 1e-3 for _ in range(cap_H)]
        rr1 = [_rng.random() ** 3 + 1e-3 for _ in range(cap_H)]
        s0, s1 = sum(rr0), sum(rr1)
        rr0 = [x / s0 for x in rr0]
        rr1 = [x / s1 for x in rr1]
        ref = resolve_subgame(PBS(7, [cu0, cu1], cdead, 20.0, [rr0, rr1]),
                              iters=cap_iters, holdings=cap_holds, game=gobj)
        # unrounded fast-resolver value over the SAME support (1e-6 check)
        if _HAVE_FAST:
            fr = _FastResolver(7, [cu0, cu1], cdead, 20.0, rr0, rr1, None,
                               cap_iters, None, holdings=cap_holds, game=gobj)
            fc0, fc1 = fr.solve()
            cap_dv_raw = max(cap_dv_raw,
                             abs(ref['value'][0] - float(_np.dot(fr.r0, fc0))),
                             abs(ref['value'][1] - float(_np.dot(fr.r1, fc1))))
        t0 = time.time()
        sr = solve_range(7, [cu0, cu1], cdead, 20.0,
                         fmtw(cap_holds, rr0), fmtw(cap_holds, rr1),
                         iters=cap_iters, game_name=gname)
        cap_dt = max(cap_dt, time.time() - t0)
        assert sr['mode'] == 'exact' and sr['n'] == cap_H, (sr['mode'], sr['n'])
        cap_dv = max(cap_dv, abs(round(ref['value'][0], 4) - sr['value']['me']),
                     abs(round(ref['value'][1], 4) - sr['value']['opp']))
        cap_de = max(cap_de, abs(round(ref.get('exploitability', 0.0), 4)
                                 - sr.get('exploitability', 0.0)))
        refdec = _decisions_from_report(ref['strategy'])
        for key, nd in refdec.items():
            for x, y in zip(nd['freq'], sr['decisions'][key]['freq']):
                cap_df = max(cap_df, abs(x - y))
    assert cap_dv_raw < 1e-6, cap_dv_raw          # solver value matches reference
    assert cap_dv < 5e-4, cap_dv                  # public rounded value agrees
    assert cap_df < 1e-3, cap_df                  # action freqs agree
    assert cap_de < 5e-4, cap_de                  # public rounded exploit agrees

    # 5) --me in bucketed mode reports the holding's bucket + a strategy.
    me_bk = solve_range(7, [up0, up1], [], 20.0, 'all', 'all', iters=200,
                        game_name='stud8', me='Ad Ac Kd')
    assert 'me_bucket' in me_bk and 'me_strategy' in me_bk
    assert 0 <= me_bk['me_bucket'] < B_STUD.N_BUCKETS

    # 6) stud8 7th, r0=all r1=all, --abstraction emd --emd-buckets 80 -> BUCKETED
    #    on bucket_emd's CANONICAL value-ordered buckets (the sharper stud8
    #    abstraction). Asserts zero-sum, completes in <4s, and that n (buckets
    #    actually used) is reported and ≤ 80.
    #
    #    Board note: bucket_emd.bucket_map 7-card-evaluates EVERY holding on the
    #    board (per seat) to featurize the EMD histograms, so a FULL 7th board
    #    (~13k holdings) costs ~12s/solve — fine for amortized offline datagen,
    #    too slow for a <4s self-test. We exercise the full EMD path on a WIDE but
    #    bounded board (live=20 -> C(20,3)=1140 holdings ≫ 80 buckets, so the
    #    canonical buckets are genuinely populated and n is a real ≤80 subset).
    #    NOTE: 1140 holdings is now ≤ EXACT_HOLDING_CAP (the vectorized exact path
    #    handles it), so this test FORCES mode='bucketed' to exercise the EMD
    #    abstraction specifically (engine selection is covered by tests [1]/[3]).
    EMD_K = 80
    emd_live = ['2c', '2d', '3c', '3h', '6c', '6d', '8c', '8d', 'Tc', 'Td',
                'Th', 'Js', 'Qc', 'Qs', 'Kc', 'Kd', '4d', '5c', '9c', '9d']
    e0, e1, edead = _tiny_board(up0, up1, emd_live)
    emd_H = len(enumerate_holdings(e0 + e1 + edead, 3))
    assert emd_H > EMD_K, (emd_H, EMD_K)          # board wider than the bucket cap
    t0 = time.time()
    emd = solve_range(7, [e0, e1], edead, 20.0, 'all', 'all', iters=1000,
                      game_name='stud8', abstraction='emd', emd_buckets=EMD_K,
                      force_mode='bucketed')
    dtemd = time.time() - t0
    assert emd['mode'] == 'bucketed', emd['mode']
    assert emd['abstraction'] == 'emd', emd.get('abstraction')
    # n is the ACTUAL distinct-bucket count, not the ceiling. On this wide board
    # (1140 holdings ≫ 80) the EMD clustering genuinely populates many buckets,
    # so a collapse to 1 (the card-starved degenerate) would fail here — unlike
    # the old vacuous `emd['n'] <= EMD_K` (== nb == 80, can never fail).
    assert 1 < emd['n'] <= EMD_K, emd.get('n')   # real granularity reported
    assert abs(emd['value']['me'] + emd['value']['opp']) < 1e-6, emd['value']
    assert dtemd < 4.0, f"emd bucketed solve too slow: {dtemd:.2f}s"
    assert abs(sum(emd['decisions']['(root)']['freq']) - 1.0) < 1e-6
    # EMD --me still maps a specific hand to its EMD bucket's line.
    emd_me = solve_range(7, [e0, e1], edead, 20.0, 'all', 'all', iters=200,
                         game_name='stud8', me='2c 3c 6c',
                         abstraction='emd', emd_buckets=EMD_K,
                         force_mode='bucketed')
    assert 'me_bucket' in emd_me and 'me_strategy' in emd_me
    assert 0 <= emd_me['me_bucket'] < EMD_K
    assert '(root)' in emd_me['me_strategy']

    # 6b) DEFAULT (hilo) path is unchanged: a fresh default solve of test [3]'s
    #     spot reproduces test [3] byte-for-byte (the EMD option did not perturb
    #     the existing abstraction). abstraction defaults to 'hilo'.
    bk_default = solve_range(7, [up0, up1], [], 20.0, 'all', 'all', iters=1000,
                             game_name='stud8')
    assert bk_default['abstraction'] == 'hilo', bk_default.get('abstraction')
    assert bk_default['n'] == B_STUD.N_BUCKETS
    assert bk_default['value'] == bk['value'], (bk_default['value'], bk['value'])
    assert bk_default['decisions'] == bk['decisions'], "default hilo path changed!"

    print("ok: solve_range self-test passes")
    print(f"   [1] stud8 7th all-vs-all EXACT  (n={s8['n']:2d}): {dt8:5.2f}s  "
          f"v_me={s8['value']['me']:+.2f}  exploit={s8['exploitability']:.3f}"
          f" ({s8['exploitability']/s8['pot']*100:.2f}% pot)")
    print(f"   [2] razz  7th all-vs-all EXACT  (n={rz['n']:2d}): {dtrz:5.2f}s  "
          f"v_me={rz['value']['me']:+.2f}  exploit={rz['exploitability']:.3f}"
          f" ({rz['exploitability']/rz['pot']*100:.2f}% pot)")
    print(f"   [3] stud8 7th all-vs-all BUCKET (n={bk['n']:2d}, ~{full_H} raw): "
          f"{dtbk:5.2f}s  v_me={bk['value']['me']:+.2f}  "
          f"exploit={bk.get('exploitability', float('nan')):.3f}"
          f" ({bk.get('exploitability', 0)/bk['pot']*100:.2f}% pot)")
    print(f"   [3b] razz 7th all-vs-all BUCKET (n={bkrz['n']:2d}): {dtbkrz:5.2f}s "
          f" v_me={bkrz['value']['me']:+.2f}  "
          f"exploit={bkrz.get('exploitability', 0)/bkrz['pot']*100:.2f}% pot")
    print(f"   [4] dominance (hero scoops): v_me={dom['value']['me']:+.2f} > 0  ok")
    print(f"   [4b] EXACT high-cap (n={cap_H}, was capped at 80) == pure-Python "
          f"reference: solver value dev={cap_dv_raw:.1e} (<1e-6); public rounded "
          f"value={cap_dv:.1e} freq={cap_df:.1e} exploit={cap_de:.1e} "
          f"(4-dp floor); fast ~{cap_dt:.2f}s/solve")
    print(f"   [5] --me bucketed: landed in bucket {me_bk['me_bucket']}, "
          f"strategy reported at {len(me_bk['me_strategy'])} node(s)")
    print(f"   [6] stud8 7th all-vs-all BUCKET/EMD (n={emd['n']:2d} ≤ 80): "
          f"{dtemd:5.2f}s  v_me={emd['value']['me']:+.2f}  "
          f"exploit={emd.get('exploitability', float('nan')):.3f}"
          f" ({emd.get('exploitability', 0)/emd['pot']*100:.2f}% pot); "
          f"--me -> EMD bucket {emd_me['me_bucket']}; default-hilo path unchanged")
    print(f"   threshold: EXACT ≤ {EXACT_HOLDING_CAP} distinct holdings "
          f"(exact iters≤{EXACT_ITERS_CAP}); else BUCKETED "
          f"(iters≤{BUCKET_ITERS_CAP}, holding_cap={BUCKET_HOLDING_CAP})")


if __name__ == "__main__":
    import sys
    (_selftest if len(sys.argv) == 1 else _cli)()
