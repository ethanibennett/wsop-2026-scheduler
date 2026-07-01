"""Python side of the badugi JS<->Python parity harness (the DRAW analogue of
razz_parity_check.py).

Reads the JSON deals emitted by `solver/games/badugi-parity.js` and, for every
deal, INDEPENDENTLY recomputes the four quantities the JS oracle recorded:

  • first-actor (betting round)  -> resolve_draw.draw_pre_first_actor  (== 0)
  • draw order [first, second]   -> resolve_draw.draw_first_to_draw    (== [1, 0])
  • legal actions at each node    -> replay the recorded token path through a
                                     _DrawResolver's betting seams (_legal_actions
                                     / _apply_action) from the blinds root
  • showdown winner              -> eval_badugi.badugi_score on the 4-card hands

then diffs against the JS values and prints a per-check mismatch tally. Exit 0
iff every check matches on every deal.

The betting tree (_legal_actions / _apply_action) is the SAME pure-Python code
the DRAW re-solver uses, and the showdown eval is the SAME eval_badugi the
resolver's showdown leaf calls — so any divergence is a genuine rule bug in one
of the two language ports (JS draw-game.js/eval vs Python resolve_draw/eval).

Usage: python3 badugi_parity_check.py <deals.json>
"""
from __future__ import annotations
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from eval_badugi import badugi_score
from resolve_draw import (_DrawResolver, draw_pre_first_actor,
                          draw_first_to_draw, BADUGI)


def _fresh_resolver() -> _DrawResolver:
    """A throwaway _DrawResolver just to reach its betting-tree seams
    (_root_node / _legal_actions / _apply_action). Holdings/ranges are dummy —
    the betting tree is holding-independent, so 1 holding is enough."""
    return _DrawResolver(holdings=[('As', '2d', '3c', '4h')], pot=3.0,
                         range0=[1.0], range1=[1.0], iters=0,
                         street=3, game=BADUGI)


def replay_to_node(R: _DrawResolver, path):
    """Replay a recorded action-token path from the blinds root, returning the
    node reached. `path` is a list of betting tokens ('f','c','r','k','b')."""
    node = R._root_node(3.0)
    for tok in path:
        node = R._apply_action(node, tok)
    return node


def check(data: dict) -> int:
    cases = data['cases']
    mism = {'firstActor': 0, 'drawOrder': 0, 'legal': 0, 'showdown': 0}
    examples = {k: [] for k in mism}
    legal_total = 0

    R = _fresh_resolver()
    fa_py = draw_pre_first_actor()               # 0 (button acts first pre-draw)
    do_py = draw_first_to_draw()                 # 1 (OOP draws first)

    for ci, c in enumerate(cases):
        # 1) first-to-act of the betting round
        if fa_py != c['firstActor']:
            mism['firstActor'] += 1
            if len(examples['firstActor']) < 5:
                examples['firstActor'].append((ci, fa_py, c['firstActor']))

        # 2) draw order [first, second] == [OOP, button] == [1, 0]
        do_expected = [do_py, 1 - do_py]
        if do_expected != c['drawOrder']:
            mism['drawOrder'] += 1
            if len(examples['drawOrder']) < 5:
                examples['drawOrder'].append((ci, do_expected, c['drawOrder']))

        # 3) legal actions at each sampled betting node (replay the token path)
        for nd in c['nodes']:
            legal_total += 1
            node = replay_to_node(R, nd['path'])
            got = R._legal_actions(node)
            if got != nd['legal'] or node['toAct'] != nd['toAct']:
                mism['legal'] += 1
                if len(examples['legal']) < 8:
                    examples['legal'].append(
                        (ci, nd['path'], got, nd['legal'], node['toAct'], nd['toAct']))

        # 4) showdown winner (lower badugi score wins whole pot; -1 == split)
        a = badugi_score(c['hands'][0])
        b = badugi_score(c['hands'][1])
        winner = 0 if a < b else (1 if a > b else -1)
        if winner != c['showdown']:
            mism['showdown'] += 1
            if len(examples['showdown']) < 5:
                examples['showdown'].append((ci, c['hands'], winner, c['showdown']))

    total = len(cases)
    print(f"deals: {total}   sampled betting nodes: {legal_total}")
    print("mismatches by check type:")
    print(f"  first-actor   : {mism['firstActor']} / {total}")
    print(f"  draw-order    : {mism['drawOrder']} / {total}")
    print(f"  legal-actions : {mism['legal']} / {legal_total}")
    print(f"  showdown      : {mism['showdown']} / {total}")
    total_mis = sum(mism.values())
    if total_mis:
        print("\n--- example mismatches ---")
        for k, exs in examples.items():
            for e in exs:
                print(f"  [{k}] {e}")
    print(f"\nTOTAL MISMATCHES: {total_mis}")
    return total_mis


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "scratch-badugi-parity.json"
    with open(path) as fh:
        data = json.load(fh)
    sys.exit(1 if check(data) else 0)
