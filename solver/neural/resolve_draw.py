"""DRAW-game subgame re-solver (M1: EXACT single-draw-remaining BADUGI).

The badugi analogue of razz_game.py: it turns resolve.py's game-agnostic CFR+ /
exact-best-response core into a DRAW game by supplying its OWN betting tree
(heads-up fixed-limit blinds — a faithful port of ../games/draw-game.js's
bet-node state machine) and its OWN showdown (badugi, via eval_badugi.py). It
does NOT reuse the stud public-card / chance seams (`_deal_leaf`,
`_exact_6th_to_7th`, the upcard `encode_board` path) — a draw hand is 4 private
cards with NO upcards, so the leaf is a pure private-hand showdown, exactly like
razz's 7th street but with the draw betting structure.

M1 scope — a SINGLE betting round that closes into showdown, solved over the
enumerated (or supplied) 4-card badugi holdings. This is the "betting-only" tree:
the draw action + its chance (cards-across-the-draw) boundary is DEFERRED to M3.
M1 delivers the three gates (zero-sum to machine precision, exact best-response
exploitability → 0, and JS↔Py parity) exactly as razz's 7th-street subgame did.

Reuse map (how the DRAW subgame plugs into resolve.py's `_cfr`):
  * `_DrawResolver` SUBCLASSES `_Resolver`; the CFR+ traversal (`_cfr`), the
    average-strategy eval (`_eval_avg`), the exact best response (`_br` /
    `exploitability`), the fold/showdown leaf (`_leaf_value`) and the strategy
    report are inherited VERBATIM. Only the three betting-tree seams
    (`_is_leaf` / `_legal_actions` / `_apply_action`) and `_root_node` are
    overridden — the whole game-shape difference lives there.
  * `self.up = [[], []]` (no upcards) so `_share(i,j)` calls the DRAW GameSpec's
    `share` on the raw 4-card holdings; `self.k = 4` (badugi hand size).

Pure Python (no numpy/torch); self-tests on run.
"""
from __future__ import annotations
from typing import Callable, List, Optional

from pbs import DECK, PBS
from resolve import _Resolver, GameSpec
from eval_badugi import badugi_share

# ── Draw fixed-limit constants (port of draw-game.js) ──────────────────────
# Blinds 1/2 = SB 1 (seat 0 / button), BB 2 (seat 1). Small bet 2 on the first
# two betting rounds, big bet 4 on the last two, 4-bet cap. For the single M1
# betting round the bet size is a parameter (defaults to the big bet, the
# post-final-draw round in the full game).
SMALL_BET, BIG_BET, CAP = 2, 4, 4
HAND_SIZE = 4


def draw_bet_size(street: int) -> int:
    """Bet increment for a draw street (0..3): small on 0/1, big on 2/3."""
    return SMALL_BET if street < 2 else BIG_BET


# The DRAW GameSpec. Only `share` (the badugi showdown) is meaningful for the
# betting-only M1 tree; bring_in / first_actor are stud-only seat rules and are
# never consulted by the draw betting tree (position is fixed by the blinds), so
# they raise if reached — a guard that this spec isn't accidentally driven
# through the stud root path.
def _no_stud_seam(*_a):
    raise NotImplementedError("draw games have no stud bring-in / upcard seat rule")


BADUGI = GameSpec('badugi', badugi_share, _no_stud_seam, _no_stud_seam)


class _DrawResolver(_Resolver):
    """Range-form CFR+ over ONE draw betting round that closes into a badugi
    showdown. Overrides only the betting-tree seams + the root; inherits the
    CFR+/exact-BR/showdown core from _Resolver unchanged."""

    def __init__(self, holdings: List[tuple], pot: float,
                 range0: List[float], range1: List[float],
                 iters: int, street: int = 3, bet_size: Optional[int] = None,
                 game: Optional[GameSpec] = None,
                 gadget_player: Optional[int] = None,
                 carried_cfv: Optional[List[float]] = None):
        self._street = street
        self._bet = bet_size if bet_size is not None else draw_bet_size(street)
        self._pot0 = float(pot)
        # A draw hand has NO public/upcards: the "board" that removes cards from
        # the deck is empty, holdings are the raw 4-card hands, and _share() runs
        # the GameSpec on the holdings directly (self.up[*] are []).
        # The CFR-D SAFE RE-SOLVING GADGET is inherited verbatim from _Resolver
        # (it lives in the shared _cfr / _eval_avg / _br traversals, not the
        # draw-specific betting seams), so it plugs in with a pure pass-through:
        # `gadget_player` + `carried_cfv` splice the same terminate-or-enter
        # pseudo-root above THIS class's draw betting root. Default None = OFF, so
        # every existing draw solve / self-test stays byte-identical.
        super().__init__(
            street=7,                      # >=7 so base sets down_count k -> 3;
            up=[[], []], dead=[], pot=pot, # we override k below to 4 (badugi).
            range0=range0, range1=range1,
            leaf_fn=None, iters=iters, depth_limit=None,
            holdings=holdings, share_matrix=None,
            game=game if game is not None else BADUGI,
            gadget_player=gadget_player, carried_cfv=carried_cfv,
        )
        self.k = HAND_SIZE                 # 4 private cards, not stud's 3
        self.street = street               # report the draw street (0..3)
        self.st0 = -1                      # NOT a stud street: disables the stud
        #                                    6th/7th exact-recursion + BR-street
        #                                    guards that key on st0 in ('3','4').

    # ── root: heads-up blinds (draw-game.js newHand), single betting round ──
    def _root_node(self, pot: float) -> dict:
        # Seat 0 = button/SB (1), seat 1 = BB (2). Pre-round the BB "bet" counts
        # (bets=1) exactly as draw-game.js, so the button faces a bet and the
        # first legal set is f/c/r; contributions reflect the posted blinds
        # scaled so the total equals `pot` (pot>=SB+BB). For a mid-hand subgame
        # (equal money already in), pass a pot that splits evenly and no blinds.
        return dict(contrib=[1, 2], base=0, bets=1,
                    toAct=0, acted=[False, False], folded=None,
                    phase='bet', curSeq='', preflop=True)

    # ── betting-tree seams (the only overrides the CFR core reaches) ──────────
    def _is_leaf(self, node: dict) -> bool:
        return node['folded'] is not None or node['phase'] == 'showdown'

    def _legal_actions(self, node: dict) -> List[str]:
        p = node['toAct']
        facing = node['contrib'][1 - p] - node['contrib'][p]
        if facing > 0:
            acts = ['f', 'c']
            if node['bets'] < CAP:
                acts.append('r')
            return acts
        acts = ['k']
        if node['bets'] < CAP:
            acts.append('b')
        return acts

    def _apply_action(self, node: dict, a: str) -> dict:
        n = dict(node)
        n['contrib'] = node['contrib'][:]
        n['acted'] = node['acted'][:]
        p = n['toAct']
        n['acted'][p] = True
        n['curSeq'] += a
        facing = n['contrib'][1 - p] - n['contrib'][p]

        if a == 'f':
            n['folded'] = p
            return n
        if a == 'c' or a == 'k':
            n['contrib'][p] += facing            # facing == 0 for a check
            if n['acted'][1 - p]:
                n['phase'] = 'showdown'          # both acted, betting closed
            else:
                n['toAct'] = 1 - p               # pre-round limp: BB keeps option
            return n
        # bet or raise
        n['contrib'][p] = n['contrib'][1 - p] + self._bet
        n['bets'] += 1
        n['toAct'] = 1 - p
        return n


def resolve_draw_subgame(pbs: PBS, iters: int = 1000, street: int = 3,
                         bet_size: Optional[int] = None,
                         holdings: Optional[List[tuple]] = None,
                         game: Optional[GameSpec] = None,
                         gadget_player: Optional[int] = None,
                         carried_cfv: Optional[List[float]] = None) -> dict:
    """Solve the M1 single-round DRAW (badugi) subgame rooted at `pbs`.

    `pbs.ranges` are over `holdings` (the 4-card badugi hands); if `holdings` is
    None it defaults to all C(unseen(pbs.dead), 4) — pass `pbs.dead` = the cards
    removed by the (irrelevant-here) public state, usually []. Returns the same
    dict shape as resolve.resolve_subgame, including the exact `exploitability`.

    `gadget_player` / `carried_cfv` opt in to the CFR-D SAFE RE-SOLVING GADGET
    (default None = OFF; a plain re-solve, byte-identical to before). When set,
    that seat's per-holding range is unknown and its carried counterfactual
    values `carried_cfv` (from carry.carry_cfv of a prior solve, aligned to
    `holdings`) are defended by a terminate-or-enter gadget spliced above the
    draw betting root — the same machinery resolve.resolve_subgame exposes for
    stud, inherited unchanged (the gadget is game-agnostic). The output then
    carries a `gadget` block with the always-on terminate-margin safety
    telemetry.
    """
    if holdings is None:
        from itertools import combinations
        seen = set(pbs.dead)
        live = [c for c in DECK if c not in seen]
        holdings = list(combinations(live, HAND_SIZE))
    R = _DrawResolver(holdings, float(pbs.pot),
                      list(pbs.ranges[0]), list(pbs.ranges[1]),
                      iters=iters, street=street, bet_size=bet_size, game=game,
                      gadget_player=gadget_player, carried_cfv=carried_cfv)
    cfv0, cfv1 = R.solve()
    subroot = R._subroot if R.gadget is not None else R.root
    out = {
        'strategy': R.strategy_report(),
        'cfv': [cfv0, cfv1],
        'holdings': R.holdings,
        'pot': subroot['contrib'][0] + subroot['contrib'][1],
        'value': [sum(R.range[0][i] * cfv0[i] for i in range(R.H)),
                  sum(R.range[1][i] * cfv1[i] for i in range(R.H))],
        'iters': iters,
    }
    # Exact exploitability is the plain-subgame gauge; the gadget root is not a
    # normal game node, so it is reported only when the gadget is OFF (a gadget
    # solve's safety gauge is the terminate-margin block below instead).
    if R.gadget is None:
        out['exploitability'] = R.exploitability()
    if R.gadget is not None:
        out['gadget'] = {
            'player': R.gadget,
            'carried_cfv': list(R._carried_cfv),
            'min_terminate_margin': R.min_terminate_margin(),
            'terminate_margins': R.terminate_margins(),
        }
    return out


# ── first-actor / draw-order helpers (parity with draw-game.js) ────────────
def draw_pre_first_actor() -> int:
    """Pre-draw (and each betting round after a draw), the button/SB — seat 0 —
    acts first when facing the blinds; after that, the BB. draw-game.js sets
    newHand toAct = 0 (button first pre-draw)."""
    return 0


def draw_first_to_draw() -> int:
    """Out-of-position (BB, seat 1) draws first; the button draws second
    (draw-game.js endBettingRound / sampleChance)."""
    return 1


if __name__ == "__main__":
    from itertools import combinations

    # Build a small badugi board: restrict the live deck so the holding space is
    # tiny (fast exact solve). Keep only these 8 cards live; the rest are 'dead'
    # (removed) — the same trick resolve.py uses for its 7th-street tests.
    live = ['As', '2d', '3c', '4h', '5s', '6d', '7c', '8h']
    dead = [c for c in DECK if c not in set(live)]
    H = len(list(combinations(live, HAND_SIZE)))          # C(8,4) = 70

    def _uni(n):
        return [1.0 / n] * n if n else []

    # 1) single-round exact solve: zero-sum to MACHINE PRECISION + exploitability
    #    -> 0 as iters grow. (This is the razz-7th gate, ported to the draw tree.)
    pbs = PBS(street=3, up=[[], []], dead=dead, pot=3.0,
              ranges=[_uni(H), _uni(H)])
    res = resolve_draw_subgame(pbs, iters=400, street=3)
    assert len(res['cfv'][0]) == H and len(res['cfv'][1]) == H
    zs = abs(res['value'][0] + res['value'][1])
    assert zs < 1e-12, ('zero-sum residual', zs)
    assert res['exploitability'] < 0.02 * res['pot'], res['exploitability']
    for node in res['strategy'].values():
        assert abs(sum(node['freq']) - 1.0) < 1e-9

    # exploitability MONOTONE-ish decreasing toward 0 with iterations
    holds = list(combinations(live, HAND_SIZE))
    e_lo = resolve_draw_subgame(PBS(3, [[], []], dead, 3.0, [_uni(H), _uni(H)]),
                                iters=30)['exploitability']
    e_hi = resolve_draw_subgame(PBS(3, [[], []], dead, 3.0, [_uni(H), _uni(H)]),
                                iters=800)['exploitability']
    assert e_hi < e_lo and e_hi < 1e-3, (e_lo, e_hi)

    # 2) dominance: seat 0 holds the nut badugi (4-3-2-A rainbow) vs a K-high
    #    badugi -> seat 0 scoops the whole pot, net value ~ +half the pot in.
    from eval_badugi import badugi_share as _sh, badugi_score as _bs
    # the nut hand on this board = the holding with the LOWEST badugi score;
    # find it by identity in `holds` (holdings follow live-list order, not sorted)
    nut_i = min(range(H), key=lambda i: _bs(list(holds[i])))
    nut = holds[nut_i]
    # find a strictly-losing opponent hand (seat 1) disjoint from the nut
    opp_i = None
    for j, hj in enumerate(holds):
        if set(hj) & set(nut):
            continue
        if _sh(list(nut), list(hj)) == 1.0:
            opp_i = j
            break
    assert opp_i is not None, "expected a dominated opponent hand"
    r0 = [0.0] * H; r0[nut_i] = 1.0
    r1 = [0.0] * H; r1[opp_i] = 1.0
    res2 = resolve_draw_subgame(PBS(3, [[], []], dead, 4.0, [r0, r1]),
                                iters=400, street=3, holdings=holds)
    assert res2['value'][0] > 0 and res2['value'][1] < 0, res2['value']
    assert abs(res2['value'][0] + res2['value'][1]) < 1e-12, res2['value']
    assert res2['exploitability'] < 0.05 * res2['pot'], res2['exploitability']

    # 3) CFR core REUSE is literal: _DrawResolver inherits _Resolver's _cfr.
    assert _DrawResolver._cfr is _Resolver._cfr
    assert _DrawResolver._eval_avg is _Resolver._eval_avg
    assert _DrawResolver._br is _Resolver._br
    assert _DrawResolver.exploitability is _Resolver.exploitability
    assert _DrawResolver._leaf_value is _Resolver._leaf_value

    print("ok: resolve_draw self-tests pass "
          f"(single-round badugi |H|={H}: zero-sum {zs:.1e}, "
          f"exploitability {e_hi:.1e}, dominance scoop; reuses _Resolver._cfr)")
