"""M2: EXACT post-last-draw (FINAL betting round -> showdown) resolver + the
TRUE-GTO grading-oracle primitive for the DRAW games (badugi and 2-7 triple
draw), over SUPPORT-RESTRICTED holding sets.

WHAT THIS ADDS OVER M1 (resolve_draw.py):
  * a TD27 GameSpec (2-7 triple draw showdown via eval_low27, 5-card hands) —
    the second draw game on the SAME single-round betting tree;
  * `_DrawFinalResolver`: the M1 single-round resolver generalized to an
    ARBITRARY mid-hand start state (contrib / bets / toAct / acted — the same
    wart fix resolve_draw2 made for the 2-round tree) and an arbitrary hand
    size (4 = badugi, 5 = td27), with resolve_draw2's dense showdown tables
    for speed. The betting seams (_is_leaf/_legal_actions/_apply_action) are
    INHERITED from M1's `_DrawResolver` verbatim — the JS-parity-certified
    state machine is untouched.
  * `draw_root_action_ev(...)`: the draw analogue of resolve.root_action_ev —
    the ORACLE primitive behind exact post-last-draw grading. Hero (seat 0,
    to act) holds a FIXED hand; the opponent holds a weighted range (the
    particle-filter posterior from solver/draw-trainer/grade.js). The subgame
    is solved to equilibrium over the UNION of both supports and the hero's
    per-root-action EV under the equilibrium continuation is returned.

WHY SUPPORT RESTRICTION IS MANDATORY FOR td27: the full 5-card holding space
is C(47,5) ~ 1.5M — never enumerated here. The solve runs over hero's hand +
the opponent range's support only, which resolve.py's test 9 proves is EXACT
for the holdings involved (zero-reach holdings contribute nothing anywhere in
range-form CFR). The self-test gates below re-prove it on this tree.

GATES (self-tests on run; python3 resolve_draw_final.py):
  a) zero-sum residual < 1e-14 on reduced-deck td27 solves;
  b) exact best-response exploitability monotone -> 0 with iterations;
  c) BRUTE-FORCE parity, two independent implementations:
     c1. perfect-information MINIMAX: for singleton ranges the subgame is a
         perfect-information zero-sum game whose value is computed by an
         INDEPENDENT from-scratch backward induction (own state transitions,
         own pot accounting) — CFR value must match within its own measured
         exploitability;
     c2. pure-strategy-ENUMERATION best response: the exact BR value is
         recomputed by enumerating EVERY pure hero plan over the betting tree
         (an exponential-space computation, nothing shared with _br's
         node-max recursion) — must equal _br to float precision;
  d) sparse-support EXACTNESS: a support-restricted solve equals the full
     C(live,5) solve restricted to those holdings;
  e) dominance scoop + oracle-primitive sanity (fold EV == -own contribution,
     per-action EVs cover exactly the legal actions);
  f) badugi REGRESSION: the generalized resolver reproduces M1's
     resolve_draw_subgame values on M1's own test instance to 1e-12.

Pure Python (no numpy/torch) — runs on stock python3, same deployment story
as the shipped stud 7th-street oracle (oracle_worker.py routes to this).
"""
from __future__ import annotations
from itertools import combinations, product
from typing import Dict, List, Optional, Tuple

from pbs import DECK
from resolve import GameSpec, _sort_holding, _deck_index
from resolve_draw import _DrawResolver, BADUGI, CAP, BIG_BET, SMALL_BET
from eval_badugi import badugi_share
from eval_low27 import low27_share

# ── the td27 GameSpec (same betting tree, 2-7 showdown, 5-card hands) ────────
def _no_stud_seam(*_a):
    raise NotImplementedError("draw games have no stud bring-in / upcard seat rule")


TD27 = GameSpec('td27', low27_share, _no_stud_seam, _no_stud_seam)

# game id -> (GameSpec, hand size). The oracle entry accepts these names.
DRAW_FINAL_GAMES: Dict[str, Tuple[GameSpec, int]] = {
    'badugi': (BADUGI, 4),
    'td27': (TD27, 5),
}


def final_round_start(pot: float) -> dict:
    """Fresh post-last-draw betting round with `pot` already in (split evenly),
    seat 0 to act first (the oracle convention: seat 0 = hero)."""
    half = pot / 2.0
    return dict(contrib=[half, half], base=0, bets=0,
                toAct=0, acted=[False, False])


class _DrawFinalResolver(_DrawResolver):
    """Single FINAL betting round -> showdown, from an ARBITRARY start state,
    for any draw GameSpec / hand size. Inherits M1's betting seams and the
    CFR+/exact-BR core; overrides only the root (start-state wart fix), the
    hand size, and the showdown leaves (resolve_draw2's dense tables)."""

    def __init__(self, holdings: List[tuple], start: dict,
                 range0: List[float], range1: List[float], iters: int,
                 bet_size: int = BIG_BET, game: Optional[GameSpec] = None,
                 hand_size: int = 4):
        self._start = dict(start)
        pot = start['contrib'][0] + start['contrib'][1]
        super().__init__(holdings, pot, range0, range1, iters=iters,
                         street=3, bet_size=bet_size,
                         game=game if game is not None else BADUGI)
        self.k = hand_size                    # 4 = badugi, 5 = td27
        self._build_dense_showdown()

    # arbitrary start state (the resolve_draw2 wart fix, on the 1-round tree)
    def _root_node(self, pot: float) -> dict:
        s = getattr(self, '_start', None)
        if s is None:                          # parent __init__ runs before ours
            s = final_round_start(pot)
        return dict(contrib=list(s['contrib']), base=s.get('base', 0),
                    bets=s['bets'], toAct=s['toAct'], acted=list(s['acted']),
                    folded=None, phase='bet', curSeq='')

    # dense showdown tables (lifted from resolve_draw2; built once, reach-free)
    def _build_dense_showdown(self):
        H = self.H
        cs = self.cardset
        sh = [[0.0] * H for _ in range(H)]
        ok = [[] for _ in range(H)]
        for i in range(H):
            ci = cs[i]
            oki = ok[i]
            shi = sh[i]
            for j in range(H):
                if ci & cs[j]:
                    continue
                shi[j] = self._share(i, j)
                oki.append(j)
        self._sh = sh
        self._ok = ok

    def _leaf_value(self, node: dict, reach):
        H = self.H
        ok = self._ok
        c = node['contrib']
        if node['folded'] is not None:
            if node['folded'] == 0:
                u0, u1 = -c[0], c[0]
            else:
                u0, u1 = c[1], -c[1]
            r0, r1 = reach[0], reach[1]
            cfv0 = [0.0] * H
            cfv1 = [0.0] * H
            for i in range(H):
                s = 0.0
                for j in ok[i]:
                    s += r1[j]
                cfv0[i] = u0 * s
            for j in range(H):
                s = 0.0
                for i in ok[j]:
                    s += r0[i]
                cfv1[j] = u1 * s
            return cfv0, cfv1
        pot = c[0] + c[1]
        c0, c1 = c[0], c[1]
        r0, r1 = reach[0], reach[1]
        sh = self._sh
        cfv0 = [0.0] * H
        cfv1 = [0.0] * H
        for i in range(H):
            shi = sh[i]
            acc = 0.0
            for j in ok[i]:
                acc += r1[j] * (shi[j] * pot - c0)
            cfv0[i] = acc
        for j in range(H):
            acc = 0.0
            for i in ok[j]:
                acc += r0[i] * ((1.0 - sh[i][j]) * pot - c1)
            cfv1[j] = acc
        return cfv0, cfv1

    def _br_leaf(self, node: dict, reach_fixed, brp: int):
        if node['folded'] is not None:
            return super()._br_leaf(node, reach_fixed, brp)
        c = node['contrib']
        pot = c[0] + c[1]
        H = self.H
        sh, ok = self._sh, self._ok
        out = [0.0] * H
        if brp == 0:
            for i in range(H):
                acc = 0.0
                shi = sh[i]
                for j in ok[i]:
                    acc += reach_fixed[j] * (shi[j] * pot - c[0])
                out[i] = acc
        else:
            for j in range(H):
                acc = 0.0
                for i in ok[j]:
                    acc += reach_fixed[i] * ((1.0 - sh[i][j]) * pot - c[1])
                out[j] = acc
        return out


def _resolve_game(game) -> Tuple[GameSpec, int]:
    """Accept a game id ('badugi'/'td27') or a (GameSpec, hand_size) pair."""
    if isinstance(game, str):
        g = DRAW_FINAL_GAMES.get(game.strip().lower())
        if g is None:
            raise ValueError(f"unknown draw game {game!r} "
                             f"(use one of {sorted(DRAW_FINAL_GAMES)})")
        return g
    if isinstance(game, tuple) and len(game) == 2:
        return game
    raise ValueError("game must be 'badugi'/'td27' or (GameSpec, hand_size)")


def resolve_draw_final(game, holdings: List[tuple], range0: List[float],
                       range1: List[float], start: Optional[dict] = None,
                       iters: int = 800, bet_size: int = BIG_BET) -> dict:
    """Solve the exact FINAL-betting-round draw subgame over `holdings`.

    `start` is an arbitrary in-round state (contrib=[c0,c1] TOTAL chips each
    seat has contributed this hand, bets = bets/raises so far this round,
    toAct, acted). Defaults to a fresh round with the pot split evenly and
    seat 0 first to act. Returns the resolve.resolve_subgame dict shape
    (value/cfv/strategy/exploitability); values are NET chips per seat
    relative to the start of the hand (the draw-game.js utility convention).
    """
    spec, hand_size = _resolve_game(game)
    if start is None:
        start = final_round_start(2.0)
    R = _DrawFinalResolver(holdings, start, list(range0), list(range1),
                           iters=iters, bet_size=bet_size, game=spec,
                           hand_size=hand_size)
    cfv0, cfv1 = R.solve()
    return {
        'strategy': R.strategy_report(),
        'cfv': [cfv0, cfv1],
        'holdings': R.holdings,
        'pot': R.root['contrib'][0] + R.root['contrib'][1],
        'value': [sum(R.range[0][i] * cfv0[i] for i in range(R.H)),
                  sum(R.range[1][i] * cfv1[i] for i in range(R.H))],
        'iters': iters,
        'exploitability': R.exploitability(),
        '_resolver': R,
    }


# ── the ORACLE PRIMITIVE (draw analogue of resolve.root_action_ev) ───────────
def draw_root_action_ev(game, hero_holding, opp_range, contrib,
                        bets: int = 0, acted: Optional[List[bool]] = None,
                        iters: int = 800, bet_size: int = BIG_BET,
                        return_meta: bool = False) -> dict:
    """TRUE-GTO per-action EV at a POST-LAST-DRAW hero decision.

    Args:
        game: 'badugi' | 'td27' (or (GameSpec, hand_size)).
        hero_holding: hero's exact cards (4 badugi / 5 td27), card strings.
        opp_range: {holding: weight} or [[holding, weight], ...] — the
            reach-weighted opponent range (the particle-filter posterior).
            Holdings colliding with hero's cards are dropped; weights are
            renormalized over the remainder.
        contrib: [hero_chips_in, opp_chips_in] — TOTAL contributions this
            hand (hero is SEAT 0; the caller maps seats). facing =
            contrib[1]-contrib[0] must be >= 0 (hero is the one to act).
        bets: bets/raises already made THIS round (0..CAP).
        acted: [hero_acted, opp_acted] this round. Defaults to
            [False, facing > 0 or bets > 0] — pass explicitly for the
            checked-to-hero case ([False, True] with facing 0).
        iters: CFR+ iterations. bet_size: final-round bet (draw games: 4).

    Returns {'per_action_ev': {action: net_chips}, 'gtoMix': {...},
             'exploitability': float (EXACT best-response gap — the final
             round has no chance nodes, so this is a true certificate),
             'pot': float}.
    """
    spec, hand_size = _resolve_game(game)
    me = _sort_holding(hero_holding)
    if len(me) != hand_size:
        raise ValueError(f"hero holding must be {hand_size} cards for "
                         f"{spec.name}; got {len(me)}")
    if len(set(me)) != hand_size:
        raise ValueError("hero holding has duplicate cards")

    heroset = set(me)
    opp: Dict[tuple, float] = {}
    items = opp_range.items() if hasattr(opp_range, 'items') else opp_range
    for h, w in items:
        w = float(w)
        if w <= 0:
            continue
        hh = _sort_holding(h)
        if len(hh) != hand_size or len(set(hh)) != hand_size:
            raise ValueError(f"opp holding must be {hand_size} distinct cards")
        if set(hh) & heroset:
            continue                      # card-collision with hero: impossible
        opp[hh] = opp.get(hh, 0.0) + w
    if not opp:
        raise ValueError("opp_range has no positive-weight non-colliding holdings")

    union = sorted(set([me]) | set(opp),
                   key=lambda h: tuple(_deck_index(c) for c in h))
    idx = {h: i for i, h in enumerate(union)}
    H = len(union)
    r1 = [0.0] * H
    for h, w in opp.items():
        r1[idx[h]] += w
    s1 = sum(r1)
    r1 = [x / s1 for x in r1]
    r0 = [0.0] * H
    me_idx = idx[me]
    r0[me_idx] = 1.0

    c0, c1 = float(contrib[0]), float(contrib[1])
    facing = c1 - c0
    if facing < 0:
        raise ValueError("hero (seat 0, to act) cannot be ahead of the "
                         "opponent's contribution")
    bets = int(bets)
    if not (0 <= bets <= CAP):
        raise ValueError(f"bets must be in 0..{CAP}")
    if acted is None:
        acted = [False, facing > 0 or bets > 0]
    start = dict(contrib=[c0, c1], base=0, bets=bets, toAct=0,
                 acted=[bool(acted[0]), bool(acted[1])])

    R = _DrawFinalResolver(union, start, r0, r1, iters=iters,
                           bet_size=bet_size, game=spec, hand_size=hand_size)
    cfv0, cfv1 = R.solve()

    root = R.root
    racts = R._legal_actions(root)
    per_action_ev = {}
    hero_pt = [0.0] * H
    hero_pt[me_idx] = 1.0
    for a in racts:
        child = R._apply_action(root, a)
        cc0, _cc1 = R._eval_avg(child, [hero_pt, R.range[1][:]])
        per_action_ev[a] = cc0[me_idx]

    rep = R.strategy_report()
    root_rep = rep.get(root['curSeq'],
                       {'actions': racts, 'freq': [1.0 / len(racts)] * len(racts)})
    out = {
        'per_action_ev': {a: per_action_ev[a] for a in racts},
        'gtoMix': {'actions': root_rep['actions'], 'freq': list(root_rep['freq'])},
        'exploitability': R.exploitability(),
        'pot': root['contrib'][0] + root['contrib'][1],
    }
    if return_meta:
        out['holdings'] = [list(h) for h in union]
        out['r0'] = r0
        out['r1'] = r1
        out['me_idx'] = me_idx
        out['value'] = {'me': sum(r0[i] * cfv0[i] for i in range(H)),
                        'opp': sum(r1[i] * cfv1[i] for i in range(H))}
    return out


# ── independent brute forces for the gates (test-only code) ──────────────────
def _minimax_value(h0, h1, share_fn, contrib, bets, to_act, acted, bet) -> float:
    """From-scratch PERFECT-INFORMATION backward induction of the final
    betting round for two KNOWN hands. Deliberately shares NO code with the
    resolver: its own facing/cap logic, own transitions, own pot accounting.
    Returns seat 0's net-chips game value (seat 0 maximizes, seat 1
    minimizes)."""
    def showdown(c0, c1):
        s = share_fn(list(h0), list(h1))
        return s * (c0 + c1) - c0

    def rec(c0, c1, bets, p, a0, a1):
        me_c = c0 if p == 0 else c1
        opp_c = c1 if p == 0 else c0
        facing = opp_c - me_c
        vals = []
        if facing > 0:
            # fold
            vals.append(-c0 if p == 0 else c1)
            # call -> round closes iff the opponent already acted
            nc0 = c0 + (facing if p == 0 else 0)
            nc1 = c1 + (facing if p == 1 else 0)
            if (a1 if p == 0 else a0):
                vals.append(showdown(nc0, nc1))
            else:
                if p == 0:
                    vals.append(rec(nc0, nc1, bets, 1, True, a1))
                else:
                    vals.append(rec(nc0, nc1, bets, 0, a0, True))
            if bets < CAP:                     # raise
                if p == 0:
                    vals.append(rec(c1 + bet, c1, bets + 1, 1, True, a1))
                else:
                    vals.append(rec(c0, c0 + bet, bets + 1, 0, a0, True))
        else:
            # check -> closes iff opponent acted
            if (a1 if p == 0 else a0):
                vals.append(showdown(c0, c1))
            else:
                if p == 0:
                    vals.append(rec(c0, c1, bets, 1, True, a1))
                else:
                    vals.append(rec(c0, c1, bets, 0, a0, True))
            if bets < CAP:                     # bet
                if p == 0:
                    vals.append(rec(c1 + bet, c1, bets + 1, 1, True, a1))
                else:
                    vals.append(rec(c0, c0 + bet, bets + 1, 0, a0, True))
        return max(vals) if p == 0 else min(vals)

    return rec(float(contrib[0]), float(contrib[1]), bets, to_act,
               acted[0], acted[1])


def _enum_pure_br(R: '_DrawFinalResolver', brp: int, reach_fixed) -> List[float]:
    """Exact best response by ENUMERATING every pure plan of the BR player
    (a plan = one action per BR-player betting history). Exponential-space —
    nothing shared with _br's per-node max recursion. Leaf values are
    recomputed from game.share directly (not from R's dense tables)."""
    # 1) collect the BR player's decision histories
    hists: Dict[str, List[str]] = {}

    def walk(node):
        if R._is_leaf(node):
            return
        acts = R._legal_actions(node)
        if node['toAct'] == brp:
            hists.setdefault(node['curSeq'], acts)
        for a in acts:
            walk(R._apply_action(node, a))

    walk(R.root)
    keys = sorted(hists)
    H = R.H
    holds = R.holdings
    cards = [set(h) for h in holds]

    def leaf_ev(node, i, rf):
        """BR-holding i's EV at a leaf against fixed-reach rf (recomputed
        from the GameSpec share, independent of R's tables)."""
        c = node['contrib']
        if node['folded'] is not None:
            u = -c[brp] if node['folded'] == brp else c[node['folded']]
            return u * sum(rf[j] for j in range(H) if not (cards[i] & cards[j]))
        pot = c[0] + c[1]
        acc = 0.0
        for j in range(H):
            if cards[i] & cards[j]:
                continue
            if brp == 0:
                s = R.game.share(list(holds[i]), list(holds[j]))
                acc += rf[j] * (s * pot - c[0])
            else:
                s = R.game.share(list(holds[j]), list(holds[i]))
                acc += rf[j] * ((1.0 - s) * pot - c[1])
        return acc

    def plan_value(plan, node, i, rf):
        if R._is_leaf(node):
            return leaf_ev(node, i, rf)
        acts = R._legal_actions(node)
        if node['toAct'] == brp:
            a = plan[node['curSeq']]
            return plan_value(plan, R._apply_action(node, a), i, rf)
        key = node['curSeq']
        tot = 0.0
        A = len(acts)
        for ai, a in enumerate(acts):
            sig = [R._avg_sigma_row(key, j, A)[ai] for j in range(H)]
            rf2 = [rf[j] * sig[j] for j in range(H)]
            tot += plan_value(plan, R._apply_action(node, a), i, rf2)
        return tot

    best = [-1e30] * H
    for choice in product(*(hists[k] for k in keys)):
        plan = dict(zip(keys, choice))
        for i in range(H):
            v = plan_value(plan, R.root, i, list(reach_fixed))
            if v > best[i]:
                best[i] = v
    return best


# ── self-tests / gates (run: python3 resolve_draw_final.py) ──────────────────
# ── self-tests / gates (run: python3 resolve_draw_final.py) ──────────────────
if __name__ == "__main__":
    import random as _rnd
    from resolve_draw import resolve_draw_subgame, HAND_SIZE as BADUGI_HAND
    from pbs import PBS

    rng = _rnd.Random(20260705)

    def _uni(n):
        return [1.0 / n] * n if n else []

    # td27 needs >=10 live cards for two DISJOINT 5-card hands (8 is degenerate:
    # every pair collides and all leaves are 0). Reduced decks used below:
    live10 = ['2s', '3d', '4c', '5h', '6s', '7d', '8c', '9h', 'Ts', 'Jd']
    live12 = live10 + ['Qc', 'Kh']
    holds252 = [tuple(_sort_holding(h)) for h in combinations(live10, 5)]
    H252 = len(holds252)

    # NARROW instance (the oracle's shape): seat 0's hands from the first 6 of
    # live12, seat 1's from the last 6 -> every cross pair is card-disjoint.
    pre0 = [tuple(_sort_holding(h)) for h in combinations(live12[:6], 5)]
    pre1 = [tuple(_sort_holding(h)) for h in combinations(live12[6:], 5)]
    union12 = sorted(set(pre0) | set(pre1),
                     key=lambda h: tuple(_deck_index(c) for c in h))
    u12 = {h: i for i, h in enumerate(union12)}
    H12 = len(union12)
    n0 = [0.0] * H12
    n1 = [0.0] * H12
    for h in pre0:
        n0[u12[h]] = 1.0 / len(pre0)
    for h in pre1:
        n1[u12[h]] = 1.0 / len(pre1)

    # GATE (a): zero-sum residual, narrow (400 iters) AND dense-uniform
    # (30 iters — zero-sum is structural, exact at any iteration count).
    res_n = resolve_draw_final('td27', union12, n0, n1,
                               start=final_round_start(8.0), iters=400)
    zs_n = abs(res_n['value'][0] + res_n['value'][1])
    assert zs_n < 1e-14, ('zero-sum narrow', zs_n)
    res_d = resolve_draw_final('td27', holds252, _uni(H252), _uni(H252),
                               start=final_round_start(8.0), iters=30)
    zs_d = abs(res_d['value'][0] + res_d['value'][1])
    assert zs_d < 1e-13, ('zero-sum dense', zs_d)
    for nd in res_n['strategy'].values():
        assert abs(sum(nd['freq']) - 1.0) < 1e-9

    # GATE (b): exact-BR exploitability monotone -> 0 (narrow instance).
    # Measured curve on this instance: 0.44 @50, 0.057 @500, 0.020 @2000,
    # 0.009 @6000, 0.0042 @20000 (chips; pot 8) — CFR+ ~1/T^0.7 here. The
    # gate asserts the monotone decay + <=0.01 chips (0.13% of pot) at 5k
    # iters; the SHARP exactness certificate is gate (c1), which bounds the
    # solved value by the MEASURED exploitability at any iteration count.
    def expl(iters):
        return resolve_draw_final('td27', union12, n0, n1,
                                  start=final_round_start(8.0),
                                  iters=iters)['exploitability']
    e_lo, e_mid, e_hi = expl(50), expl(500), expl(6000)
    assert e_hi < e_mid < e_lo, ('BR not monotone', e_lo, e_mid, e_hi)
    assert e_hi < 0.01, ('BR did not converge', e_hi)

    # GATE (c1): perfect-information MINIMAX parity on singleton ranges,
    # random start states, BOTH games. |CFR value - minimax| <= exploitability.
    checked = 0
    for game_id, hs, lv in (('td27', 5, live12),
                            ('badugi', 4, ['As', '2d', '3c', '4h',
                                           '5s', '6d', '7c', '8h'])):
        pool = [tuple(_sort_holding(h)) for h in combinations(lv, hs)]
        spec, _hs = DRAW_FINAL_GAMES[game_id]
        tried = 0
        while tried < 10:
            h0 = rng.choice(pool)
            disj = [h for h in pool if not (set(h) & set(h0))]
            if not disj:
                continue
            h1 = rng.choice(disj)
            tried += 1
            kind = rng.randrange(3)
            base = float(rng.choice([4, 8, 12]))
            if kind == 0:      # fresh round, hero first
                start = dict(contrib=[base, base], base=0, bets=0,
                             toAct=0, acted=[False, False])
            elif kind == 1:    # checked to hero
                start = dict(contrib=[base, base], base=0, bets=0,
                             toAct=0, acted=[False, True])
            else:              # hero facing a bet (bets so far: 1 or 2)
                nb = rng.randrange(1, 3)
                start = dict(contrib=[base, base + BIG_BET], base=0,
                             bets=nb, toAct=0, acted=[False, True])
            un = sorted({h0, h1}, key=lambda h: tuple(_deck_index(c) for c in h))
            ui = {h: i for i, h in enumerate(un)}
            r0 = [0.0] * len(un); r0[ui[h0]] = 1.0
            r1 = [0.0] * len(un); r1[ui[h1]] = 1.0
            r = resolve_draw_final(game_id, un, r0, r1, start=start, iters=600)
            mm = _minimax_value(h0, h1, spec.share, list(start['contrib']),
                                start['bets'], 0, list(start['acted']), BIG_BET)
            gap = abs(r['value'][0] - mm)
            assert gap <= r['exploitability'] + 1e-9, \
                ('minimax parity', game_id, h0, h1, start, r['value'][0], mm,
                 r['exploitability'])
            checked += 1
    assert checked == 20, checked

    # GATE (c2): pure-strategy-enumeration BR == _br (both seats, narrow).
    r0w = [x * (0.5 + rng.random()) for x in n0]
    r1w = [x * (0.5 + rng.random()) for x in n1]
    r0w = [x / sum(r0w) for x in r0w]
    r1w = [x / sum(r1w) for x in r1w]
    Rb = _DrawFinalResolver(union12, final_round_start(6.0), r0w, r1w,
                            iters=80, game=TD27, hand_size=5)
    Rb.solve()
    for brp, rf in ((0, r1w), (1, r0w)):
        enum = _enum_pure_br(Rb, brp, rf)
        fast = Rb._br(Rb.root, list(rf), brp)
        dmax = max(abs(enum[i] - fast[i]) for i in range(H12))
        assert dmax < 1e-9, ('pure-plan BR parity', brp, dmax)

    # GATE (d): sparse-support solve == full C(10,5) solve restricted to the
    # support (same iters -> identical traversals on the support, structural).
    sup0 = sorted(rng.sample(range(H252), 5))
    sup1 = sorted(rng.sample(range(H252), 5))
    f0 = [0.0] * H252; f1 = [0.0] * H252
    for i in sup0:
        f0[i] = 1.0 / len(sup0)
    for j in sup1:
        f1[j] = 1.0 / len(sup1)
    full = resolve_draw_final('td27', holds252, f0, f1,
                              start=final_round_start(8.0), iters=60)
    union_ids = sorted(set(sup0) | set(sup1))
    pos = {i: k for k, i in enumerate(union_ids)}
    sub_holds = [holds252[i] for i in union_ids]
    g0 = [f0[i] for i in union_ids]
    g1 = [f1[j] for j in union_ids]
    sp = resolve_draw_final('td27', sub_holds, g0, g1,
                            start=final_round_start(8.0), iters=60)
    assert abs(full['value'][0] - sp['value'][0]) < 1e-9, \
        (full['value'], sp['value'])
    for i in sup0:
        assert abs(full['cfv'][0][i] - sp['cfv'][0][pos[i]]) < 1e-9
    for j in sup1:
        assert abs(full['cfv'][1][j] - sp['cfv'][1][pos[j]]) < 1e-9

    # GATE (e): dominance + oracle primitive sanity. Hero holds the 2-7 nut
    # (7-5-4-3-2 offsuit) facing a bet vs a range of worse hands: calling or
    # raising must dominate folding; fold EV == -hero contribution exactly.
    nut = tuple(_sort_holding(('2s', '3d', '4c', '5h', '7d')))
    opp_pool = [c for c in live12 if c not in set(nut)]      # 7 cards left
    opp_hands = [tuple(_sort_holding(h))
                 for h in combinations(opp_pool, 5)][:8]
    assert len(opp_hands) == 8
    o = draw_root_action_ev('td27', nut, {h: 1.0 for h in opp_hands},
                            contrib=[4.0, 8.0], bets=1, iters=500)
    assert set(o['per_action_ev']) == {'f', 'c', 'r'}, o['per_action_ev']
    assert abs(o['per_action_ev']['f'] - (-4.0)) < 1e-12, o['per_action_ev']
    assert o['per_action_ev']['r'] > o['per_action_ev']['f']
    assert o['per_action_ev']['c'] > o['per_action_ev']['f']
    assert o['per_action_ev']['r'] >= o['per_action_ev']['c'] - 1e-9
    assert abs(sum(o['gtoMix']['freq']) - 1.0) < 1e-9
    assert o['exploitability'] >= -1e-12

    # badugi oracle path smoke: nut badugi, checked-to (k/b legal)
    bnut = ('As', '2d', '3c', '4h')
    blive = ['As', '2d', '3c', '4h', '5s', '6d', '7c', '8h', '9s', 'Td']
    bh = [tuple(_sort_holding(h)) for h in combinations(blive, 4)
          if not (set(h) & set(bnut))][:10]
    ob = draw_root_action_ev('badugi', bnut, {h: 1.0 for h in bh},
                             contrib=[6.0, 6.0], bets=0, acted=[False, True],
                             iters=400)
    assert set(ob['per_action_ev']) == {'k', 'b'}
    assert ob['per_action_ev']['b'] >= ob['per_action_ev']['k'] - 1e-9

    # GATE (f): badugi REGRESSION vs M1 resolve_draw_subgame on M1's instance
    # (blinds root: contrib [1,2], bets=1, button to act, BB owed its option).
    bl = ['As', '2d', '3c', '4h', '5s', '6d', '7c', '8h']
    bdead = [c for c in DECK if c not in set(bl)]
    bholds = list(combinations(bl, BADUGI_HAND))
    HB = len(bholds)
    m1 = resolve_draw_subgame(PBS(3, [[], []], bdead, 3.0,
                                  [_uni(HB), _uni(HB)]), iters=200, street=3)
    m2 = resolve_draw_final('badugi', bholds, _uni(HB), _uni(HB),
                            start=dict(contrib=[1, 2], base=0, bets=1,
                                       toAct=0, acted=[False, False]),
                            iters=200)
    assert abs(m1['value'][0] - m2['value'][0]) < 1e-12, \
        (m1['value'], m2['value'])
    assert abs(m1['exploitability'] - m2['exploitability']) < 1e-12

    print("ok: resolve_draw_final gates pass "
          f"(zero-sum narrow {zs_n:.1e} / dense-|H|={H252} {zs_d:.1e}; "
          f"exact-BR {e_lo:.2e}->{e_hi:.2e}; {checked} minimax-parity spots; "
          "pure-plan BR == _br; sparse-support exact; nut dominance; "
          "badugi == M1 regression)")
