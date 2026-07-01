"""solve_spot — on-demand EXACT solve of a node-locked Stud 8 / razz spot (study tool).

Give it a public board (both players' upcards + any dead cards) and each player's
range over hidden (down) cards — node-lock the opponent to whatever range you
want — and it solves the subgame exactly and reports the equilibrium strategy,
action frequencies, and game value. It restricts the CFR to the ranges' support
(resolve.py `holdings=`), so narrow / node-locked spots solve fast. Pure Python.

CLI (7th street; me = my exact 3 down cards, opp = a node-locked range):
  python3 solve_spot.py --street 7 --up0 As4s5d7c --up1 KhQdJc9h \
      --me 2h3h6h --opp-range "Kc Kd 2c, Qs Js Tc, Ad Ac 5h" --pot 20

  # --me-range for an uncertain hero; --opp-range all = uniform (slow on big boards)

  # razz: add --game razz (high-card bring-in, lowest hand wins the WHOLE pot):
  python3 solve_spot.py --game razz --street 7 --up0 As4s3d2c --up1 KhQdJc9h \
      --me 5h6h7c --opp-range "Kc Kd 2h, Qs Js Tc" --pot 20
"""
from __future__ import annotations
import json
from typing import Dict, List, Optional

from pbs import PBS, down_count, enumerate_holdings, rank_val, suit_idx
from resolve import resolve_subgame, _deck_index, _sort_holding
from razz_game import RAZZ

# --game name -> GameSpec (None = Stud 8, the resolve.py default)
_GAME = {'stud8': None, 'razz': RAZZ}

ACTION_LABEL = {'f': 'fold', 'c': 'call', 'r': 'raise', 'k': 'check',
                'b': 'bet', 'br': 'bring-in', 'co': 'complete'}


def _split_cards(s: str) -> List[str]:
    s = s.replace(',', '').replace(' ', '')
    return [s[i:i + 2] for i in range(0, len(s), 2)]


def _holding(s: str, k: int) -> tuple:
    cards = _split_cards(s)
    if len(cards) != k:
        raise ValueError(f"holding {s!r} must be {k} cards, got {len(cards)}")
    return _sort_holding(cards)


def solve_spot(street: int, up, dead, pot: float,
               me_range: Dict[tuple, float], opp_range: Dict[tuple, float],
               iters: int = 1000, game=None) -> dict:
    """Solve a node-locked spot. me_range/opp_range: {holding_tuple: weight}.
    `game` selects the variant (None = Stud 8, RAZZ = razz).

    Returns a JSON-able dict: value (chips, hero=me=seat0), exploitability, and
    the equilibrium strategy at each decision (relabeled me/opp + action names)."""
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

    res = resolve_subgame(PBS(street=street, up=up, dead=dead, pot=pot,
                              ranges=[r0, r1]), iters=iters, holdings=union,
                          game=game)

    decisions = {}
    for hist, node in res['strategy'].items():
        decisions[hist or '(root)'] = {
            'who': 'me' if node['player'] == 0 else 'opp',
            'actions': [ACTION_LABEL.get(a, a) for a in node['actions']],
            'freq': [round(f, 4) for f in node['freq']],
        }
    out = {
        'street': street, 'pot': res['pot'], 'holdings': H,
        'value': {'me': round(res['value'][0], 4), 'opp': round(res['value'][1], 4)},
        'decisions': decisions,
    }
    if 'exploitability' in res:
        out['exploitability'] = round(res['exploitability'], 4)
    return out


def _parse_range(spec: str, board: List[str], k: int) -> Dict[tuple, float]:
    """'all' -> uniform over consistent holdings; else comma-separated holdings
    (each like 'KcKd2c' or 'Kc Kd 2c'), optional ':weight'."""
    spec = spec.strip()
    if spec.lower() == 'all':
        return {h: 1.0 for h in enumerate_holdings(board, k)}
    out: Dict[tuple, float] = {}
    for part in spec.split(','):
        part = part.strip()
        if not part:
            continue
        w = 1.0
        if ':' in part:
            part, ws = part.rsplit(':', 1)
            w = float(ws)
        out[_holding(part, k)] = out.get(_holding(part, k), 0.0) + w
    return out


def _cli():
    import argparse
    p = argparse.ArgumentParser(description="Solve a node-locked Stud 8 spot.")
    p.add_argument('--street', type=int, required=True)
    p.add_argument('--up0', required=True, help="my upcards, e.g. As4s5d7c")
    p.add_argument('--up1', required=True, help="opponent upcards")
    p.add_argument('--dead', default='', help="dead/exposed cards")
    p.add_argument('--me', help="my exact down cards (a single holding)")
    p.add_argument('--me-range', help="my range (comma-separated holdings or 'all')")
    p.add_argument('--opp-range', required=True, help="opp range (holdings or 'all')")
    p.add_argument('--pot', type=float, required=True)
    p.add_argument('--iters', type=int, default=1000)
    p.add_argument('--game', default='stud8', choices=['stud8', 'razz'],
                   help="stud variant (default stud8)")
    a = p.parse_args()

    up = [_split_cards(a.up0), _split_cards(a.up1)]
    dead = _split_cards(a.dead) if a.dead else []
    board = up[0] + up[1] + dead
    k = down_count(a.street)
    if a.me:
        me = {_holding(a.me, k): 1.0}
    elif a.me_range:
        me = _parse_range(a.me_range, board, k)
    else:
        raise SystemExit("provide --me or --me-range")
    opp = _parse_range(a.opp_range, board, k)
    print(json.dumps(solve_spot(a.street, up, dead, a.pot, me, opp, a.iters,
                                game=_GAME[a.game]), indent=2))


def _selftest():
    # 7th-street node-locked spot: hero holds a made 6-low+; opp node-locked to a
    # few hands. Narrow ranges -> sparse -> fast exact solve.
    up0 = ['As', '4s', '5d', '7c']      # hero shows wheel-ish low
    up1 = ['Kh', 'Qd', 'Jc', '9h']      # opp shows broadway (no low)
    dead: List[str] = []
    k = down_count(7)
    me = {_holding('2h3h6c', k): 1.0}                       # 6-4-3-2-A nut-ish low + pair-free
    opp = _parse_range('KcKd2c, QsJsTc, AdAc8d', up0 + up1 + dead, k)
    out = solve_spot(7, [up0, up1], dead, 20.0, me, opp, iters=300)
    assert out['holdings'] <= 4, out['holdings']               # tiny support
    assert abs(out['value']['me'] + out['value']['opp']) < 1e-6
    assert out['exploitability'] < 0.05 * out['pot']
    assert '(root)' in out['decisions']
    root = out['decisions']['(root)']
    assert abs(sum(root['freq']) - 1.0) < 1e-6

    # the SAME tool solves a razz spot via game=RAZZ (high bring-in, low scoops)
    rz = solve_spot(7, [up0, up1], dead, 20.0, me, opp, iters=300, game=RAZZ)
    assert abs(rz['value']['me'] + rz['value']['opp']) < 1e-6
    assert rz['exploitability'] < 0.05 * rz['pot']
    assert abs(sum(rz['decisions']['(root)']['freq']) - 1.0) < 1e-6

    print(f"ok: solve_spot self-test passes (node-locked 7th spot, "
          f"{out['holdings']} holdings, me EV {out['value']['me']:+.2f} chips, "
          f"exploit {out['exploitability']:.3f}; razz spot solved too)")


if __name__ == "__main__":
    import sys
    (_selftest if len(sys.argv) == 1 else _cli)()
