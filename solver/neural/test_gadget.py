"""M3 EXACT SOUNDNESS GATE for the CFR-D safe re-solving gadget (resolve.py +
carry.py). This is THE sound/unsound line for continual re-solving (ROADMAP M3;
Burch/Johanson/Bowling 2014; DeepStack/Moravcik 2017). If this gate is not green,
NO chained / continual re-solve may grade anyone.

WHAT THE GATE PROVES (per spot, on an EXACTLY-solved subgame):

  Solve a subgame fully (the reference equilibrium). Read the OPPONENT's exact
  per-holding root counterfactual values w = carry.carry_cfv(solve, opp). Then
  RE-SOLVE the SAME subgame with the gadget, given ONLY the hero range + w (not
  the full-game context). A SOUND gadget reproduces the reference to <= 1e-3:

    (A) STRATEGY fingerprint / core CFR-D theorem — the opponent's exact
        per-holding BEST-RESPONSE value against the hero's re-solved strategy
        equals its carried floor w[i]:  max_i |BR_opp[i] - w[i]| <= 1e-3.
        (This is the observable, exploitability-relevant content of the strategy;
        the raw root action-frequencies are NOT gated because a zero-sum subgame
        has non-unique equilibria — many strategy mixes share the value and the
        BR profile. The raw-freq deviation is REPORTED as telemetry.)
    (B) VALUE — the opponent's realized value under the gadget equals the
        reference value:  |value_ref[opp] - value_gadget[opp]| <= 1e-3. By
        zero-sum at the true equilibrium the hero value reproduces with it.
    (C) SAFETY MARGIN (always-on telemetry) — the re-solve delivers every carried
        floor: min_i (BR_opp[i] - w[i]) >= -1e-3. A clearly-negative margin would
        mean the hero fails to defend the opponent to its promised value — an
        UNSAFE re-solve (the composite-exploitability bound would be violated).

Run:  python3 test_gadget.py            # full gate: 3 stud + 3 draw
      python3 test_gadget.py --quick    # 2 stud + 1 draw (fast smoke)

Pure python (stock python3, no numpy/torch). Not in run_tests.sh (that suite
stays fast + gadget-default-off byte-identical); this is the M3 milestone gate.
"""
from __future__ import annotations
import sys
from itertools import combinations

from pbs import DECK, PBS
from resolve import resolve_subgame, _Resolver, enumerate_holdings, RANKS, SUITS
from resolve_draw import resolve_draw_subgame, _DrawResolver, HAND_SIZE
import carry

TOL = 1e-3


def _tiny_board(up0, up1, live):
    """A stud board whose unseen pool is exactly `live` (rest dead) — fast."""
    used = set(up0) | set(up1) | set(live)
    dead = [c for c in (r + s for r in RANKS for s in SUITS) if c not in used]
    return up0, up1, dead


def _rand_range(H, seed):
    import random
    rng = random.Random(seed)
    r = [0.2 + rng.random() for _ in range(H)]
    s = sum(r)
    return [x / s for x in r]


def _root_freq_dev(ref_strategy, gad_strategy):
    """Raw root action-frequency deviation (TELEMETRY ONLY — not gated). The root
    is the shortest non-gadget history key; both reports share the betting tree."""
    keys = [k for k in ref_strategy if not k.startswith('@')]
    if not keys:
        return 0.0
    rk = min(keys, key=len)
    ref = ref_strategy.get(rk)
    gad = gad_strategy.get(rk)
    if ref is None or gad is None or ref['actions'] != gad['actions']:
        return float('nan')
    return max(abs(a - b) for a, b in zip(ref['freq'], gad['freq']))


def _check(label, H, repA, repB, margin, freq_dev):
    okA = repA <= TOL
    okB = repB <= TOL
    okC = margin >= -TOL
    ok = okA and okB and okC
    print(f"  [{label:8s}] H={H:3d}  "
          f"(A) oppBR-vs-carried={repA:.2e} {'ok' if okA else 'FAIL'}  "
          f"(B) value={repB:.2e} {'ok' if okB else 'FAIL'}  "
          f"(C) safety_margin={margin:+.2e} {'ok' if okC else 'FAIL'}  "
          f"| rootfreq_dev={freq_dev:.2e} (telemetry)")
    return ok, repA, repB, margin


# ── stud (7th-street) spot: gadget player = seat 1 (opponent) ────────────────
def stud_spot(up0, up1, live, pot, iters, seed, label):
    up0, up1, dead = _tiny_board(up0, up1, live)
    holds = enumerate_holdings(up0 + up1 + dead, 3)
    H = len(holds)
    r0 = _rand_range(H, seed * 2)
    r1 = _rand_range(H, seed * 2 + 1)

    ref = resolve_subgame(PBS(7, [up0, up1], dead, pot, [r0[:], r1[:]]),
                          iters=iters)
    w = carry.carry_cfv(ref, gadget_player=1)              # opp exact root CFVs

    # gadget re-solve: hero(0) range known, opp(1) range unknown -> carried w.
    R = _Resolver(7, [up0, up1], dead, pot, r0[:], r1[:], None, iters, None,
                  holdings=holds, gadget_player=1, carried_cfv=w)
    cfv0, cfv1 = R.solve()
    # (A) opp exact BR per holding vs the hero's re-solved avg strategy.
    br1 = R._br(R._subroot, R.range[0][:], 1)
    repA = max(abs(br1[i] - w[i]) for i in range(H))
    # (B) opp realized value under the gadget vs reference value.
    gad_oppval = sum(R.range[1][i] * cfv1[i] for i in range(H))
    repB = abs(ref['value'][1] - gad_oppval)
    # (C) always-on safety margin (recorded by solve()).
    margin = R.min_terminate_margin()
    freq_dev = _root_freq_dev(ref['strategy'], R.strategy_report())
    return _check(label, H, repA, repB, margin, freq_dev)


# ── draw (single-round badugi) spot: gadget player = seat 1 ──────────────────
def draw_spot(live, pot, street, iters, seed, label):
    dead = [c for c in DECK if c not in set(live)]
    holds = list(combinations(live, HAND_SIZE))
    H = len(holds)
    r0 = _rand_range(H, seed * 2)
    r1 = _rand_range(H, seed * 2 + 1)

    ref = resolve_draw_subgame(PBS(street, [[], []], dead, pot, [r0[:], r1[:]]),
                               iters=iters, street=street, holdings=holds)
    w = carry.carry_cfv(ref, gadget_player=1)

    R = _DrawResolver(holds, pot, r0[:], r1[:], iters=iters, street=street,
                      gadget_player=1, carried_cfv=w)
    cfv0, cfv1 = R.solve()
    br1 = R._br(R._subroot, R.range[0][:], 1)
    repA = max(abs(br1[i] - w[i]) for i in range(H))
    gad_oppval = sum(R.range[1][i] * cfv1[i] for i in range(H))
    repB = abs(ref['value'][1] - gad_oppval)
    margin = R.min_terminate_margin()
    freq_dev = _root_freq_dev(ref['strategy'], R.strategy_report())
    return _check(label, H, repA, repB, margin, freq_dev)


STUD_SPOTS = [
    (['As', '4s', '5d', '7c'], ['Kh', 'Qd', 'Jc', '9h'],
     ['2c', '3d', '6h', '8s', 'Tc', 'Kd'], 20.0, 4000, 0, 'stud-A'),
    (['2h', '3h', '4d', '5c'], ['Ac', 'Kd', 'Qs', 'Jh'],
     ['6s', '7d', '8c', '9s', 'Th', 'Js'], 16.0, 4000, 1, 'stud-B'),
    (['9c', 'Tc', 'Jd', 'Qh'], ['2s', '3s', '4c', '6d'],
     ['5h', '7s', '8d', 'Kc', 'Ah', '9d'], 24.0, 4000, 2, 'stud-C'),
]
DRAW_SPOTS = [
    (['As', '2d', '3c', '4h', '6s', '7d', '9c', 'Th'], 3.0, 3, 800, 0, 'draw-A'),
    (['2s', '3d', '4c', '5h', '7s', '8d', 'Tc', 'Kh'], 4.0, 2, 800, 1, 'draw-B'),
    (['Ac', 'Kd', 'Qh', '2s', '5c', '6d', '8h', '9s'], 3.0, 3, 800, 2, 'draw-C'),
]


def main(argv):
    quick = '--quick' in argv
    stud = STUD_SPOTS[:2] if quick else STUD_SPOTS
    draw = DRAW_SPOTS[:1] if quick else DRAW_SPOTS
    print("M3 CFR-D gadget EXACT SOUNDNESS GATE "
          f"(tol={TOL:g}; {len(stud)} stud + {len(draw)} draw spots)")
    print("  each: exact solve -> carry opp CFVs -> gadget re-solve from hero "
          "range + carried CFVs only")
    results = []
    print(" STUD (7th street):")
    for s in stud:
        results.append(stud_spot(*s))
    print(" DRAW (single-round badugi):")
    for s in draw:
        results.append(draw_spot(*s))

    worst_repA = max(r[1] for r in results)
    worst_repB = max(r[2] for r in results)
    worst_margin = min(r[3] for r in results)
    all_ok = all(r[0] for r in results)
    print(f"\n worst deviations across {len(results)} spots:  "
          f"oppBR-vs-carried={worst_repA:.2e}  value={worst_repB:.2e}  "
          f"min safety-margin={worst_margin:+.2e}")
    if all_ok:
        print(f"ok: M3 exact soundness gate PASS — gadget re-solve reproduces the "
              f"exactly-solved subgame to <= {TOL:g} on every spot; terminate-margin "
              f"telemetry always-on and non-negative (SAFE).")
        return 0
    print("FAIL: M3 gate did NOT reproduce to tolerance — the re-solve is UNSOUND. "
          "STOP all chained/continual re-solving (ROADMAP kill criterion M3).")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
