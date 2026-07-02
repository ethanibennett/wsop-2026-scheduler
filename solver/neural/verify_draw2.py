"""M2a heavier verification driver (run manually; NOT in run_tests.sh).

The in-file resolve_draw2 self-tests keep the exact-BR gate fast by using a
narrow-range instance. This driver pushes the SAME four gates harder:

  (a) zero-sum residual ~ machine precision on a larger uniform-range instance;
  (b) exact best-response exploitability -> 0 over the FULL 2-round tree (incl.
      the draw chance node) as iters grow — printed as a convergence curve;
  (d) brute-force reach/value correctness re-checked on several hand pairs.

Usage:
  python3 verify_draw2.py                # default 8-card uniform + BR sweep
  python3 verify_draw2.py --iters 50 100 200 400 800
  python3 verify_draw2.py --deck 10      # 10-card (heavier)
"""
from __future__ import annotations
import sys
from itertools import combinations

sys.path.insert(0, __file__.rsplit('/', 1)[0])

from resolve_draw2 import (_DrawResolver2, _blinds_start, reachable_holdings,
                           choose_keep, HAND_SIZE)
from resolve import _sort_holding, _Resolver
from eval_badugi import best_badugi_subset, badugi_share


DECKS = {
    8: ['As', '2d', '3c', '4h', '5s', '6d', '7c', '8h'],
    10: ['As', '2d', '3c', '4h', '5s', '6d', '7c', '8h', '9s', 'Td'],
}


def uniform_gate(live, iters_list):
    holds = list(combinations(live, HAND_SIZE))
    H = len(holds)
    uni = [1.0 / H] * H
    print(f"\n== uniform-range gate: {len(live)}-card deck, |H|=C({len(live)},4)={H} ==")
    print("  iters   exploitability   zero-sum residual")
    prev = None
    for it in iters_list:
        R = _DrawResolver2(holds, _blinds_start(), uni[:], uni[:], iters=it,
                           pre_bet=2, post_bet=4, live=live)
        c0, c1 = R.solve()
        v0 = sum(uni[i] * c0[i] for i in range(H))
        v1 = sum(uni[i] * c1[i] for i in range(H))
        e = R.exploitability()
        zs = abs(v0 + v1)
        flag = '' if prev is None or e < prev else '  (NON-MONOTONE!)'
        print(f"  {it:>5}   {e:>14.6f}   {zs:>10.2e}{flag}")
        prev = e
    return e, zs


def brute_force_gate(live, npairs=3):
    """Independent reach/value correctness on several natural-draw-1 hand pairs."""
    allc = list(combinations(live, HAND_SIZE))
    pairs = []
    for a in allc:
        if 4 - len(best_badugi_subset(list(a))) != 1:
            continue
        for b in allc:
            if set(a) & set(b) or 4 - len(best_badugi_subset(list(b))) != 1:
                continue
            pairs.append((tuple(_sort_holding(a)), tuple(_sort_holding(b))))
            break
        if len(pairs) >= npairs:
            break
    print(f"\n== brute-force reach/value gate: {len(pairs)} hand pairs ==")
    worst = 0.0
    for h0, h1 in pairs:
        nat0 = 4 - len(best_badugi_subset(list(h0)))
        nat1 = 4 - len(best_badugi_subset(list(h1)))
        keep0 = set(choose_keep(h0, nat0))
        keep1 = set(choose_keep(h1, nat1))
        pool0 = [c for c in live if c not in set(h0)]
        pool1 = [c for c in live if c not in set(h1)]
        n0 = len(list(combinations(pool0, nat0)))
        n1 = len(list(combinations(pool1, nat1)))
        pot = 6.0
        bf = 0.0
        for R0 in combinations(pool0, nat0):
            f0 = keep0 | set(R0)
            for R1 in combinations(pool1, nat1):
                f1 = keep1 | set(R1)
                if f0 & f1:
                    continue
                bf += (1.0 / n0) * (1.0 / n1) * \
                    (badugi_share(list(f0), list(f1)) * pot - pot / 2.0)
        bf_holds = reachable_holdings([h0, h1], live)
        bidx = {tuple(_sort_holding(h)): i for i, h in enumerate(bf_holds)}
        i0 = bidx[h0]
        Hb = len(bf_holds)
        sr0 = [0.0] * Hb; sr0[i0] = 1.0
        sr1 = [0.0] * Hb; sr1[bidx[h1]] = 1.0
        Rt = _DrawResolver2(bf_holds, dict(contrib=[3, 3], base=3, bets=0,
                                           toAct=1, acted=[False, False]),
                            sr0, sr1, iters=1, pre_bet=2, post_bet=4, live=live)
        child = [Rt._remap(sr0, nat0), Rt._remap(sr1, nat1)]
        show = dict(contrib=[3.0, 3.0], folded=None, phase='showdown')
        scf0, _ = _Resolver._leaf_value(Rt, show, child)
        res = Rt._project_back(scf0, nat0)[i0]
        d = abs(res - bf)
        worst = max(worst, d)
        print(f"  {''.join(h0)} vs {''.join(h1)}: resolver {res:+.6f}  "
              f"brute {bf:+.6f}  |diff| {d:.1e}  ({n0 * n1} outcomes)")
    print(f"  worst |diff| = {worst:.1e}")
    return worst


if __name__ == "__main__":
    args = sys.argv[1:]
    deck = 8
    iters_list = [25, 50, 100, 200, 400, 800]
    if '--deck' in args:
        deck = int(args[args.index('--deck') + 1])
    if '--iters' in args:
        i = args.index('--iters')
        iters_list = [int(x) for x in args[i + 1:] if x.isdigit()]
    live = DECKS[deck]

    e, zs = uniform_gate(live, iters_list)
    worst = brute_force_gate(live)

    print("\n== SUMMARY ==")
    print(f"  final exploitability  : {e:.4f}  (over the full 2-round tree)")
    print(f"  final zero-sum residual: {zs:.1e}")
    print(f"  brute-force worst diff : {worst:.1e}")
    ok = zs < 1e-10 and worst < 1e-9
    print("  VERDICT:", "PASS" if ok else "REVIEW",
          "(exploitability should be trending to 0 above)")
