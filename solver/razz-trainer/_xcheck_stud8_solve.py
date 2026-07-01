"""TEST-ONLY cross-check helper for STUD 8 (abstraction-error validation, NOT
production).

Stud-8 analog of _xcheck_solve.py. Solves a node-locked 7th-street Stud 8 spot
with the EXACT neural re-solver (resolve.py's _Resolver with game=STUD8, hi/lo
split showdown via eval_stud8.split_share) and dumps everything the JS harness
(_xcheck_stud8.js) needs to reproduce the SAME equilibrium continuation:

  - the union holdings (deck-ordered), and seat-0 / seat-1 reach vectors,
  - per-public-node, per-holding average sigma rows (so the JS rollout can play
    the EXACT equilibrium continuation for any specific opp hand -> isolates the
    EV-engine rollout math from blueprint quality),
  - the aggregate per-node strategy report (the "GTO mix"),
  - the hero's per-action EV at the ROOT under equilibrium continuation, computed
    by best-responding ONLY at the root and playing equilibrium everywhere after
    (the exact analog of grade.js per-action EV).

The ONLY difference from the razz helper is `game=STUD8` (hi/lo split + 8-or-
better qualifier + lowest-card bring-in + best-high-board-acts-first). The
machinery (union/reach build, sigma dump, per-action EV via _eval_avg) is
identical, so any A-vs-B gap that appears in stud8 but not razz is in the
hi/lo split surface, not the harness.

Run via the venv:
  solver/neural/.venv/bin/python solver/razz-trainer/_xcheck_stud8_solve.py <spec.json>
"""
import sys, os, json

HERE = os.path.dirname(os.path.abspath(__file__))
NEURAL = os.path.join(HERE, '..', 'neural')
sys.path.insert(0, NEURAL)

from pbs import down_count
from resolve import (_Resolver, _deck_index, _sort_holding, is_leaf,
                     legal_actions, apply_action, STUD8)


def _holding(cards):
    return _sort_holding(cards)


def solve_spec(spec):
    street = 7
    k = down_count(street)
    up = [spec['up0'], spec['up1']]
    dead = spec.get('dead', [])
    pot = float(spec['pot'])

    me = _holding(spec['me'])                       # hero exact 3 down cards
    opp_list = [(_holding(h), w) for h, w in spec['opp_range']]  # [(holding, weight)]

    me_range = {me: 1.0}
    opp_range = {}
    for h, w in opp_list:
        opp_range[h] = opp_range.get(h, 0.0) + w

    union = sorted(set(me_range) | set(opp_range),
                   key=lambda h: tuple(_deck_index(c) for c in h))
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

    R = _Resolver(street, up, dead, pot, r0, r1, None, iters=spec.get('iters', 2000),
                  depth_limit=None, holdings=union, game=STUD8)
    cfv0, cfv1 = R.solve()
    v0 = sum(R.range[0][i] * cfv0[i] for i in range(H))
    v1 = sum(R.range[1][i] * cfv1[i] for i in range(H))

    # Per-public-node, per-holding average sigma rows.
    nodes = {}

    def walk(node):
        if is_leaf(node):
            return
        p = node['toAct']
        acts = legal_actions(node)
        A = len(acts)
        key = node['curSeq']
        rows = [R._avg_sigma_row(key, i, A) for i in range(H)]
        nodes[key] = {
            'player': p,
            'actions': acts,
            'sigma': rows,          # per-holding [H][A]
        }
        for a in acts:
            walk(apply_action(node, a))

    walk(R.root)

    # Aggregate strategy report (the GTO mix, reach-weighted).
    agg = R.strategy_report()
    agg_out = {key: {'player': nd['player'], 'actions': nd['actions'],
                     'freq': [round(f, 6) for f in nd['freq']]}
               for key, nd in agg.items()}

    # Root per-action hero EV under equilibrium continuation (exact analog of
    # grade.js per-action EV): hero plays a at the root, then BOTH play the
    # equilibrium average strategy thereafter, opp range = r1, hero hand = me.
    root = R.root
    assert root['toAct'] == 0, "harness expects hero (seat 0) to act first at root"
    racts = legal_actions(root)
    me_idx = idx[me]
    per_action_ev = {}
    for ai, a in enumerate(racts):
        child = apply_action(root, a)
        hero_reach = [0.0] * H
        hero_reach[me_idx] = 1.0
        c0, c1 = R._eval_avg(child, [hero_reach, R.range[1][:]])
        per_action_ev[a] = c0[me_idx]

    return {
        'holdings': [list(h) for h in union],
        'r0': r0, 'r1': r1,
        'me_idx': me_idx,
        'value': {'me': v0, 'opp': v1},
        'pot': R.root['contrib'][0] + R.root['contrib'][1],
        'root_actions': racts,
        'per_action_ev': {a: round(per_action_ev[a], 6) for a in racts},
        'nodes': nodes,
        'agg': agg_out,
        'exploitability': round(R.exploitability(), 6),
    }


if __name__ == '__main__':
    spec = json.load(open(sys.argv[1]))
    print(json.dumps(solve_spec(spec)))
