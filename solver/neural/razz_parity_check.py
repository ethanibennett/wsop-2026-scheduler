"""Python side of the razz JS<->Python parity harness.

Reads the JSON deals emitted by `solver/games/razz-parity.js` and, for every
deal, INDEPENDENTLY recomputes the four quantities the JS oracle recorded:

  • bring-in seat            -> razz_game.razz_bring_in
  • first-to-act per street  -> razz_game.razz_first_actor (4th st+), bring-in (3rd)
  • legal actions at each     -> resolve.legal_actions, replaying the recorded
    sampled betting node         action path with resolve.apply_action under RAZZ
  • showdown winner          -> razz_game.razz_share

then diffs against the JS values and prints a per-check mismatch tally. Exit 0
iff every check matches on every deal.

The betting tree (legal_actions / apply_action) is the SAME pure-Python module
the re-solver uses; only the RAZZ GameSpec seams (bring-in, first-actor,
showdown) carry the razz rules, so a divergence is a genuine rule bug in one of
the two language ports.

Usage: python3 razz_parity_check.py <deals.json>
"""
from __future__ import annotations
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from razz_game import razz_bring_in, razz_first_actor, razz_share
from resolve import legal_actions, apply_action, ANTE, SMALL, bet_size


def build_root(up0_door: str, up1_door: str, bring: int) -> dict:
    """3rd-street root node, mirroring resolve.py's _root_node for st0=0."""
    return dict(st0=0, contrib=[ANTE, ANTE], base=ANTE, bets=0,
                toAct=bring, acted=[False, False], folded=None,
                phase='bet', bringIn=bring, starter=bring, curSeq='')


def advance_street(node: dict, new_st0: int, actor: int) -> dict:
    """Reset per-street betting fields when a '/' boundary is crossed, the way
    resolve.py does between streets: equal contributions, fresh bets/acted, the
    first-actor to move, curSeq cleared. base = current (equal) contribution."""
    n = dict(node)
    n['st0'] = new_st0
    n['base'] = node['contrib'][0]          # contributions are equal at a boundary
    n['contrib'] = node['contrib'][:]
    n['bets'] = 0
    n['acted'] = [False, False]
    n['toAct'] = actor
    n['starter'] = actor
    n['phase'] = 'bet'
    n['curSeq'] = ''
    return n


def replay_to_node(case: dict, path) -> dict:
    """Replay a recorded action path from the 3rd-street root, returning the
    node reached. `path` is a list of tokens: action-ids ('br','co','f','c',
    'r','k','b') and '/' street-boundary markers. The first-actor at each new
    street is recomputed from this case's per-street up boards via
    razz_first_actor."""
    up = case['upByStreet']
    bring = razz_bring_in(case['up'][0][0], case['up'][1][0])
    node = build_root(case['up'][0][0], case['up'][1][0], bring)
    street = 0
    for tok in path:
        if tok == '/':
            street += 1
            actor = razz_first_actor(up[street][0], up[street][1])
            node = advance_street(node, street, actor)
        else:
            node = apply_action(node, tok)
    return node


def check(data: dict) -> int:
    cases = data['cases']
    mism = {'bringIn': 0, 'firstActor': 0, 'legal': 0, 'showdown': 0}
    examples = {k: [] for k in mism}
    legal_total = 0

    for ci, c in enumerate(cases):
        up = c['upByStreet']

        # 1) bring-in seat
        bring = razz_bring_in(c['up'][0][0], c['up'][1][0])
        if bring != c['bringIn']:
            mism['bringIn'] += 1
            if len(examples['bringIn']) < 5:
                examples['bringIn'].append((ci, c['up'], bring, c['bringIn']))

        # 2) first-to-act per street: 3rd = bring-in, 4th-7th = razz_first_actor
        fa = [bring]
        for st in range(1, 5):
            fa.append(razz_first_actor(up[st][0], up[st][1]))
        if fa != c['firstActor']:
            mism['firstActor'] += 1
            if len(examples['firstActor']) < 5:
                examples['firstActor'].append((ci, up, fa, c['firstActor']))

        # 3) legal actions at each sampled betting node (replay the path)
        for nd in c['nodes']:
            legal_total += 1
            node = replay_to_node(c, nd['path'])
            got = legal_actions(node)
            if got != nd['legal'] or node['toAct'] != nd['toAct']:
                mism['legal'] += 1
                if len(examples['legal']) < 8:
                    examples['legal'].append(
                        (ci, nd['path'], got, nd['legal'], node['toAct'], nd['toAct']))

        # 4) showdown winner (whole pot to the lowest low; -1 == split)
        share = razz_share(c['full'][0], c['full'][1])
        winner = 0 if share == 1.0 else (1 if share == 0.0 else -1)
        if winner != c['showdown']:
            mism['showdown'] += 1
            if len(examples['showdown']) < 5:
                examples['showdown'].append((ci, c['full'], winner, c['showdown']))

    total = len(cases)
    print(f"deals: {total}   sampled betting nodes: {legal_total}")
    print("mismatches by check type:")
    print(f"  bring-in      : {mism['bringIn']} / {total}")
    print(f"  first-actor   : {mism['firstActor']} / {total}")
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
    path = sys.argv[1] if len(sys.argv) > 1 else "scratch-razz-parity.json"
    with open(path) as fh:
        data = json.load(fh)
    sys.exit(1 if check(data) else 0)
