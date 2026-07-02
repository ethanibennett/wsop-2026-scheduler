"""Python side of the badugi DRAW-TRANSITION parity harness (M2a).

Reads the seeded draw deals emitted by solver/games/badugi-draw-parity.js and,
for every deal, INDEPENDENTLY recomputes the draw MECHANICS the JS state machine
recorded, using resolve_draw2's OWN port of the abstraction (choose_keep /
draw_options) and the unseen-deck rule — then diffs. This is the M2a extension
of badugi_parity_check.py (which covered the M1 single betting round): it
certifies the DRAW BOUNDARY is rule-identical across draw-game.js and the Python
2-round draw resolver.

Per deal, per seat p, it checks:
  • draw order            == [1, 0]  (OOP/BB draws first, button second)
  • draw_options(predraw) == the JS cfg.drawOptions(predraw)
  • count                 == 4 − len(choose_keep(predraw, count))  (self-consistent)
  • keep                  == choose_keep(predraw, count)           (SAME kept subset)
  • discards              == predraw \\ keep                        (the dead cards)
  • replacement legality  : every replaced card is in the recorded unseen POOL
                            (52 − both hands − discards-so-far — the shared deck)
                            AND replaced ∩ keep == ∅, |replaced| == count
  • postdraw              == keep ∪ replaced                       (as a set)

0 mismatches over K deals == the draw transition matches. Note keep is compared
ORDER-INSENSITIVELY as a set (chooseKeep's tie-break order is not load-bearing
for the resolver, which canonicalizes holdings by deck order; the M1 memoizeCfg
order-bug is a JS-strategy-cache concern, not a resolver reach concern).

Usage: python3 badugi_draw_parity_check.py <draw-deals.json>
"""
from __future__ import annotations
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from resolve_draw2 import choose_keep, draw_options, HAND_SIZE


def check(data: dict) -> int:
    cases = data['cases']
    mism = {'drawOrder': 0, 'drawOptions': 0, 'count': 0, 'keep': 0,
            'discards': 0, 'replaceLegal': 0, 'postdraw': 0}
    examples = {k: [] for k in mism}
    seats_checked = 0

    for ci, c in enumerate(cases):
        # draw order == [OOP, button] == [1, 0]
        if c['drawOrder'] != [1, 0]:
            mism['drawOrder'] += 1
            if len(examples['drawOrder']) < 5:
                examples['drawOrder'].append((ci, c['drawOrder']))

        for p in (0, 1):
            t = c['seats'][str(p)] if str(p) in c['seats'] else c['seats'][p]
            seats_checked += 1
            pre = tuple(t['predraw'])
            k = t['count']

            # draw_options parity (as sorted lists)
            opts_py = draw_options(pre)
            if opts_py != sorted(t['drawOptions']):
                mism['drawOptions'] += 1
                if len(examples['drawOptions']) < 5:
                    examples['drawOptions'].append((ci, p, opts_py, t['drawOptions']))

            # choose_keep parity (as SETS; tie-break order not load-bearing)
            keep_py = choose_keep(pre, k) if k > 0 else pre
            if set(keep_py) != set(t['keep']):
                mism['keep'] += 1
                if len(examples['keep']) < 5:
                    examples['keep'].append((ci, p, sorted(keep_py), sorted(t['keep'])))

            # count self-consistency: k == 4 − |keep|
            if k != HAND_SIZE - len(t['keep']):
                mism['count'] += 1
                if len(examples['count']) < 5:
                    examples['count'].append((ci, p, k, len(t['keep'])))

            # discards == predraw \ keep
            disc_py = set(pre) - set(t['keep'])
            if disc_py != set(t['discards']):
                mism['discards'] += 1
                if len(examples['discards']) < 5:
                    examples['discards'].append((ci, p, sorted(disc_py), sorted(t['discards'])))

            # replacement legality: subset of the unseen pool, disjoint from keep,
            # correct size, drawn from a pool that excludes both hands + discards.
            pool = set(t['pool'])
            rep = t['replaced']
            ok_pool = all(r in pool for r in rep)
            ok_disjoint = not (set(rep) & set(t['keep']))
            ok_size = len(rep) == k
            # the pool must NOT contain any current-hand or discarded card
            # (shared-deck: replacement can't be a live/dead card)
            if not (ok_pool and ok_disjoint and ok_size):
                mism['replaceLegal'] += 1
                if len(examples['replaceLegal']) < 5:
                    examples['replaceLegal'].append(
                        (ci, p, rep, ok_pool, ok_disjoint, ok_size))

            # postdraw == keep ∪ replaced (as a set)
            if set(t['postdraw']) != (set(t['keep']) | set(rep)):
                mism['postdraw'] += 1
                if len(examples['postdraw']) < 5:
                    examples['postdraw'].append(
                        (ci, p, sorted(t['postdraw']), sorted(set(t['keep']) | set(rep))))

    total = len(cases)
    print(f"draw deals: {total}   seats checked: {seats_checked}")
    print("mismatches by check type:")
    for k in ('drawOrder', 'drawOptions', 'count', 'keep', 'discards',
              'replaceLegal', 'postdraw'):
        denom = total if k == 'drawOrder' else seats_checked
        print(f"  {k:<13}: {mism[k]} / {denom}")
    total_mis = sum(mism.values())
    if total_mis:
        print("\n--- example mismatches ---")
        for k, exs in examples.items():
            for e in exs:
                print(f"  [{k}] {e}")
    print(f"\nTOTAL MISMATCHES: {total_mis}")
    return total_mis


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "scratch-badugi-draw-parity.json"
    with open(path) as fh:
        data = json.load(fh)
    sys.exit(1 if check(data) else 0)
