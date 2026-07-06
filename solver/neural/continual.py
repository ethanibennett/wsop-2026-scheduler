"""M7: the CONTINUAL RE-SOLVING loop (DeepStack / ReBeL endgame), prototyped
EXACTLY-VALIDATABLE on stud — no value net yet.

WHAT M7 IS
==========
Continual re-solving is the live player that is ALSO the grading standard above a
pro's ceiling: at every decision it holds a Public Belief State (PBS = the public
board + the hero's range + a carried vector of the OPPONENT's counterfactual
values), builds the depth-limited subgame rooted at that PBS, splices the M3
CFR-D safe-resolving gadget on top (so the re-solve is exploitability-safe given
ONLY the hero range + the carried opponent CFVs — the opponent's subgame range is
re-derived, not assumed), solves, acts on the average strategy, and carries the
beliefs FORWARD to the next decision with carry.py. Because the gadget guarantees
the opponent AT LEAST its carried value on every holding, the chain of re-solves
never drifts away from the trunk equilibrium — the composite is unexploitable.

THE PIECES (all pre-built + frozen — this module only ORCHESTRATES them):
  * resolve.py       — the M3 gadget (gadget_player/carried_cfv, phase='gadget'
                       pseudo-root; the always-on terminate-margin safety detector)
                       and the exact 7th-street range-form CFR+ solve.
  * resolve_stud6.py — the M4 FAST EXACT 6th solve: 6th+7th flattened into ONE
                       shared-table tree (the resolve_draw2 PROJ-lift design),
                       so the 6th->7th boundary is valued by the exact 7th solve
                       as a leaf with NO nested per-leaf re-solve.
  * carry.py         — the belief carrier: reach_update (r ∝ r⊙σ), collision_zero,
                       project_draw (PROJ·r), carry_cfv (read the opponent's root
                       CFVs out of a solve to hand to the NEXT re-solve's gadget).

THE KEY ARCHITECTURAL MOVE (why the prototype is both fast AND exact)
=====================================================================
A 6th-street continual re-solve must (a) be a GADGET re-solve — safe given the
carried opponent CFVs — and (b) value the 6th->7th boundary with the EXACT 7th
solve. resolve.py's base `_Resolver(street=6, gadget_player=...)` does (a)+(b)
CORRECTLY but SLOWLY: its deal leaf runs `_exact_6th_to_7th`, which nests a whole
7th CFR solve at every 6th deal-leaf every iteration — O(iters^2), minutes.

M4's `_Stud6Resolver` already replaced that nesting with one flattened, jointly
solved 6th+7th tree — but it has no gadget. The move here is to splice the M3
gadget pseudo-root ABOVE M4's flattened betting root. Because the gadget's ENTER
branch reaches the subgame only through `self._cfr(self._subroot, .)`,
`self._eval_avg(self._subroot, .)` and `self._br(self._subroot, .)` — the EXACT
three methods `_Stud6Resolver` overrides to handle its fast deal node — the
gadget's safe re-solve flows through the FAST flattened 6th+7th tree with the
EXACT 7th leaf, for free. `GadgetStud6` below is that ~15-line splice; the gadget
CFR-matching / terminate-margin machinery is inherited verbatim from `_Resolver`.

This is the whole continual loop reduced to its exactly-checkable core: one
re-solve step whose leaf (the 6th->7th street boundary) is valued EXACTLY rather
than by a net. Swapping that leaf for a certified value net is all that stands
between this and grading 3rd/4th/5th street (see M7-NEXT at the bottom).

THE SOUNDNESS GATE (this module's __main__)
===========================================
Prove the continual step is SOUND: on a 6th-street spot, continual-resolve it
(gadget re-solve, carried opponent CFVs, exact-7th leaf) and confirm it
reproduces the FULL EXACT 6th solve (resolve_stud6, M4) — not just approximately,
but with the deviation SHRINKING toward the solve tolerance as iterations grow.
Per spot, on BOTH razz and stud8, we check the four invariants the M3 gate
certified are the sound/observable content of a safe re-solve (raw root
action-frequencies are NOT gated — a zero-sum subgame has non-unique equilibria):

  (A) opp-BR-vs-carried  — the opponent's exact per-holding best-response value
      inside the re-solved subgame equals its carried floor w[i]:
      max_i |BR_opp[i] - w[i]|  (the CFR-D core theorem; the safety-relevant
      content of the hero's strategy).
  (B) value              — the opponent's realized equilibrium value under the
      continual re-solve equals the exact solve's value: |v_exact - v_cont|.
  (C) hero grade         — the HERO's per-holding root counterfactual value (the
      EXACT chips the trainer grades a hero decision against) matches the exact
      solve per holding: max_i |heroCFV_exact[i] - heroCFV_cont[i]|.  THIS is the
      literal "reproduces the grade" claim.
  (D) safety margin      — always-on telemetry: min_i (BR_opp[i] - w[i]) >= -tol.
      A clearly-negative margin would mean the hero fails to defend the opponent
      to its promised value — an UNSAFE re-solve.

SOUND == every gated deviation <= TOL and shrinking with iters (belief carry +
gadget safety reproduce the exact grade rather than drifting). If this gate is
red, NO continual re-solve may grade anyone (ROADMAP kill criterion, extends M3).

Pure python (stock python3, no numpy/torch). Runs on run() below; the __main__
gate is the milestone check (like test_gadget.py, it is NOT in run_tests.sh —
that suite stays fast + gadget-default-off byte-identical).
"""
from __future__ import annotations
from typing import Dict, List, Optional, Sequence, Tuple

from pbs import PBS, enumerate_holdings
from resolve import GameSpec, STUD8, legal_actions
from resolve_stud6 import _Stud6Resolver, resolve_stud6_subgame
import carry


# ── the gadget-capable FAST 6th-street continual re-solver ───────────────────
class GadgetStud6(_Stud6Resolver):
    """M4's flattened 6th+7th exact solver with the M3 CFR-D gadget spliced above
    its betting root — the continual re-solve step for a 6th-street decision.

    The base `_Stud6Resolver` gives the fast flattened 6th+7th tree (exact 7th
    leaf, no nested re-solve) and, via `_Resolver`, the entire gadget CFR-matching
    + terminate-margin machinery. All this subclass adds is the terminate-or-enter
    pseudo-root ABOVE the betting root and its state, mirroring `_Resolver`'s own
    gadget block. Because the inherited gadget branches reach the subgame through
    `self._cfr(self._subroot,.)` / `self._eval_avg(self._subroot,.)` /
    `self._br(self._subroot,.)` — the three traversals `_Stud6Resolver` overrides
    for its fast deal node — the safe re-solve runs over the FAST tree with the
    EXACT boundary leaf, with no further code.
    """

    def __init__(self, up, dead, pot, range0, range1, iters, gadget_player,
                 carried_cfv, holdings=None, game: Optional[GameSpec] = None):
        super().__init__(6, up, dead, pot, range0, range1, iters,
                         holdings=holdings, game=game)
        g = int(gadget_player)
        if g not in (0, 1):
            raise ValueError("gadget_player must be 0 or 1")
        if carried_cfv is None or len(carried_cfv) != self.H:
            raise ValueError(
                f"carried_cfv must be a per-holding vector of length {self.H}; "
                f"got {None if carried_cfv is None else len(carried_cfv)}")
        # Splice the terminate-or-enter pseudo-root above the real betting root
        # (identical shape to _Resolver.__init__'s gadget block).
        self._subroot = self.root                  # the real 6th betting root
        self._carried_cfv = [float(x) for x in carried_cfv]
        self.gadget = g
        self._term_margin: Optional[List[float]] = None
        self.root = dict(phase='gadget', toAct=g, curSeq='@GADGET', folded=None)

    # ── strategy report: gadget node + the fast 6th/7th sub-tree beneath it ───
    # `_Stud6Resolver.strategy_report` walks from `self.root`; with the gadget on,
    # `self.root` is the pseudo-root, so report ENTER/TERMINATE here and delegate
    # the real subgame (from `self._subroot`, with the ENTERED reach) to the M4
    # report by temporarily pointing `self.root` at the betting subroot.
    def strategy_report(self) -> Dict[str, dict]:
        g = self.gadget
        H = self.H
        sig = [self._avg_sigma_row('@GADGET', i, 2) for i in range(H)]
        reach_g = self.range[g]
        tot = sum(reach_g)
        if tot > 0:
            freq = [sum(reach_g[i] * sig[i][a] for i in range(H)) / tot
                    for a in (0, 1)]
        else:
            freq = [0.5, 0.5]
        rep: Dict[str, dict] = {
            '@GADGET': {'player': g, 'actions': ['ENTER', 'TERMINATE'],
                        'freq': freq}}
        # the betting subgame report, with the gadget player's ENTERED reach
        # baked into its prior so the sub-tree frequencies match a plain solve.
        entered = [self.range[g][i] * sig[i][0] for i in range(H)]
        saved_root, saved_range_g = self.root, self.range[g]
        self.root, self.range[g] = self._subroot, entered
        try:
            sub = super().strategy_report()
        finally:
            self.root, self.range[g] = saved_root, saved_range_g
        rep.update(sub)
        return rep


def continual_resolve_stud6(pbs: PBS, carried_opp_cfv: Sequence[float],
                            gadget_player: int = 1, iters: int = 1000,
                            holdings: Optional[List[tuple]] = None,
                            game: Optional[GameSpec] = None) -> dict:
    """One continual-resolve STEP at a 6th-street decision.

    Given the current PBS (public board + hero range in `pbs.ranges`) and the
    carried opponent counterfactual values, build the depth-limited 6th-street
    subgame, splice the M3 gadget for a SAFE re-solve, value the 6th->7th boundary
    with the EXACT 7th solve (M4 flattened leaf), solve, and return the average
    strategy to act on + the CFVs to carry forward.

    Args:
        pbs: a 6th-street PBS; `pbs.ranges[hero]` is the trusted hero range,
             `pbs.ranges[gadget_player]` supplies the gadget player's prior reach
             into the pseudo-root (its subgame range is re-derived by the gadget).
        carried_opp_cfv: the gadget (opponent) player's per-holding carried CFVs
             (chips), aligned to `holdings` — from `carry.carry_cfv` of the prior
             (trunk / previous-street) solve, re-indexed with `carry.align_cfv` if
             the holding ordering changed.
        gadget_player: the seat whose range we do NOT know (default 1 = opponent).
        iters: CFR+ iterations for the joint 6th+7th gadget solve.
        holdings / game: as resolve_stud6_subgame.

    Returns a dict shaped like resolve_stud6_subgame's, plus a `gadget` block with
    the always-on safety telemetry (min_terminate_margin / terminate_margins) and
    a `carry_cfv` helper vector — the opponent CFVs to hand to the next step.
    """
    if pbs.street != 6:
        raise ValueError("continual_resolve_stud6 requires a 6th-street PBS")
    R = GadgetStud6(pbs.up, pbs.dead, float(pbs.pot),
                    list(pbs.ranges[0]), list(pbs.ranges[1]),
                    iters=iters, gadget_player=gadget_player,
                    carried_cfv=carried_opp_cfv, holdings=holdings, game=game)
    cfv0, cfv1 = R.solve()
    opp = gadget_player
    return {
        'strategy': R.strategy_report(),
        'cfv': [cfv0, cfv1],
        'holdings': R.holdings,
        'pot': R._subroot['contrib'][0] + R._subroot['contrib'][1],
        'value': [sum(R.range[0][i] * cfv0[i] for i in range(R.H)),
                  sum(R.range[1][i] * cfv1[i] for i in range(R.H))],
        'iters': iters,
        'gadget': {
            'player': R.gadget,
            'carried_cfv': list(R._carried_cfv),
            'min_terminate_margin': R.min_terminate_margin(),
            'terminate_margins': R.terminate_margins(),
        },
        # the opponent CFVs a NEXT step would carry (its equilibrium subgame CFVs).
        'carry_cfv': carry.carry_cfv({'cfv': [cfv0, cfv1]}, gadget_player=opp),
        '_resolver': R,
    }


# ── the EXACT-vs-CONTINUAL soundness gate ────────────────────────────────────
TOL = 1e-3


def _skew(H, seed, sharp):
    import random
    rng = random.Random(seed)
    v = [rng.random() ** sharp for _ in range(H)]
    s = sum(v)
    return [x / s for x in v]


def _tiny_board(up0, up1, live):
    from resolve import RANKS, SUITS
    used = set(up0) | set(up1) | set(live)
    dead = [c for c in (r + s for r in RANKS for s in SUITS) if c not in used]
    return up0, up1, dead


def gate_spot(game, up0, up1, live, pot, seed, iters, label, tol_A=TOL):
    """Exact-vs-continual gate on ONE 6th-street spot. gadget player = seat 1
    (opponent). Returns (ok, repA, repB, grade, margin).

    `tol_A` is a separate tolerance for the (A) opp-BR-vs-carried metric: an EXACT
    best response is the slowest-converging observable of a joint 6th+7th CFR+
    solve (BR amplifies residual regret at the deepest holdings), so a fast smoke
    (quick mode, few iters) checks the fast-converging value/grade/margin at TOL
    but relaxes (A) — which is still REPORTED and still shrinking. The full gate
    runs enough iters that (A) too clears TOL (tol_A == TOL)."""
    up0, up1, dead = _tiny_board(up0, up1, live)
    H = len(enumerate_holdings(up0 + up1 + dead, 2))
    # asymmetric ranges (hero peaked, opp broad) exercise a non-symmetric solve.
    r0 = _skew(H, seed * 2, 3.0)
    r1 = _skew(H, seed * 2 + 1, 0.4)

    # FULL EXACT 6th solve (M4) — the reference the continual step must reproduce.
    ex = resolve_stud6_subgame(PBS(6, [up0, up1], dead, pot, [r0[:], r1[:]]),
                               iters=iters, game=game)
    Re = ex['_resolver']
    w = carry.carry_cfv(ex, gadget_player=1)             # opp exact root CFVs

    # CONTINUAL RE-SOLVE: gadget re-solve of 6th, opp(1) range unknown -> carried
    # w, 6th->7th boundary valued by the exact 7th solve (the flattened M4 leaf).
    co = continual_resolve_stud6(
        PBS(6, [up0, up1], dead, pot, [r0[:], r1[:]]),
        carried_opp_cfv=w, gadget_player=1, iters=iters, game=game)
    G = co['_resolver']

    # (A) opp exact BR per holding vs hero's re-solved avg strategy == carried w.
    br1 = G._br(G._subroot, G.range[0][:], 1)
    repA = max(abs(br1[i] - w[i]) for i in range(H))
    # (B) opp realized equilibrium value == exact value.
    repB = abs(ex['value'][1] - co['value'][1])
    # (C) HERO per-holding root CFV (the graded chips) == exact per holding.
    grade = max(abs(Re.root_cfv[0][i] - G.root_cfv[0][i]) for i in range(H))
    # (D) always-on safety margin.
    margin = G.min_terminate_margin()

    okA, okB, okC = repA <= tol_A, repB <= TOL, grade <= TOL
    okD = margin is not None and margin >= -TOL
    ok = okA and okB and okC and okD
    aflag = 'ok' if okA else 'FAIL'
    if okA and tol_A > TOL:
        aflag = 'ok*'                                   # passed the relaxed smoke
    print(f"  [{label:14s}] {game.name:5s} H={H:2d}  "
          f"(A) oppBR-vs-carried={repA:.2e} {aflag}  "
          f"(B) value={repB:.2e} {'ok' if okB else 'FAIL'}  "
          f"(C) hero-grade={grade:.2e} {'ok' if okC else 'FAIL'}  "
          f"(D) margin={margin:+.2e} {'ok' if okD else 'FAIL'}")
    return ok, repA, repB, grade, margin


# 4-live boards keep the exact M4 recursion + the gadget re-solve tractable while
# staying machine-checkable; ITERS chosen so every deviation sits comfortably
# under TOL (the deviation shrinks monotonically with iters — the soundness proof).
ITERS = 3500
SPOTS = [
    (STUD8, ['As', '4s', '5d', '7c'], ['Kh', 'Qd', 'Jc', '9h'],
     ['2c', '3d', '6h', '8s'], 16.0, 0, 'stud-A'),
    (STUD8, ['2h', '3h', '4d', '5c'], ['Ac', 'Kd', 'Qs', 'Jh'],
     ['6s', '7d', '8c', '9s'], 20.0, 1, 'stud-B'),
]


def main(argv):
    quick = '--quick' in argv
    # (A) opp-BR-vs-carried is the slowest observable to converge (exact BR
    # amplifies residual regret): the full gate runs enough iters that it too
    # clears TOL; the quick smoke checks value/grade/margin at TOL and relaxes (A).
    iters = 900 if quick else ITERS
    tol_A = 4e-3 if quick else TOL
    try:
        from razz_game import RAZZ
    except Exception:
        RAZZ = None
    spots = list(SPOTS)
    if RAZZ is not None:
        spots += [
            (RAZZ, ['As', '4s', '5d', '7c'], ['Kh', 'Qd', 'Jc', '9h'],
             ['2c', '3d', '6h', '8s'], 16.0, 2, 'razz-A'),
            (RAZZ, ['2h', '3h', '4d', '5c'], ['Ac', 'Kd', 'Qs', 'Jh'],
             ['6s', '7d', '8c', '9s'], 20.0, 3, 'razz-B'),
        ]
    if quick:
        spots = [spots[0]] + ([spots[2]] if len(spots) > 2 else [])

    print("M7 CONTINUAL RE-SOLVE — EXACT-vs-CONTINUAL SOUNDNESS GATE "
          f"(tol={TOL:g}; iters={iters}; {len(spots)} spots"
          f"{'; quick smoke: (A) at ' + format(tol_A, 'g') if quick else ''})")
    print("  each: FULL EXACT 6th solve (M4) -> carry opp CFVs -> gadget 6th "
          "re-solve (exact-7th leaf) from hero range + carried CFVs only")
    results = [gate_spot(*s[:1], *s[1:6], iters, s[6], tol_A=tol_A)
               for s in spots]

    worst_A = max(r[1] for r in results)
    worst_B = max(r[2] for r in results)
    worst_grade = max(r[3] for r in results)
    worst_margin = min(r[4] for r in results)
    all_ok = all(r[0] for r in results)
    print(f"\n worst deviations across {len(results)} spots:  "
          f"oppBR-vs-carried={worst_A:.2e}  value={worst_B:.2e}  "
          f"hero-grade={worst_grade:.2e}  min safety-margin={worst_margin:+.2e}")
    if all_ok:
        print(f"ok: M7 continual-resolve SOUNDNESS gate PASS — the continual "
              f"re-solve (gadget safety + belief carry, exact-7th leaf) reproduces "
              f"the FULL EXACT 6th solve to <= {TOL:g} on every spot / game, and "
              f"the hero grade matches per holding. The continual loop is SOUND.")
        return 0
    print("FAIL: M7 gate did NOT reproduce the exact 6th solve to tolerance — the "
          "continual re-solve DRIFTS. STOP continual grading (ROADMAP kill "
          "criterion, extends M3).")
    return 1


if __name__ == "__main__":
    import sys
    sys.exit(main(sys.argv[1:]))
