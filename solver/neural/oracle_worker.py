"""Persistent TRUE-GTO grading ORACLE worker (JSON-lines over stdin/stdout).

The engine behind "oracle grading" for 7th-street hero decisions in the mixed-
games Trainer. The JS grader (solver/razz-trainer/grade.js) assembles a 7th-
street spot — hero up/down cards, opponent upcards, dead cards, pot, and the
reach-weighted opponent range it already computes — and asks this worker for the
TRUE per-action EV (chips) from resolve.root_action_ev (the EXACT re-solver: 7th
street is a real showdown, no value net). The blueprint grader charges evLoss vs
its own bucketed self; this worker charges it vs true GTO.

Protocol (one JSON object per line, one JSON response per line):

  request:  {"id": <any>, "game": "razz"|"stud8", "up0": ["2c",...],
             "up1": ["Kc",...], "dead": ["Th",...], "pot": 20,
             "me": ["Ah","6c","7d"],
             "opp_range": [[["Kh","Qs","9c"], 1.0], ...],   # [holding, weight]
             "iters": 2000}
  response: {"id": <echoed>, "ok": true,
             "per_action_ev": {"k": 10.01, "b": 10.007},
             "gtoMix": {"actions":["k","b"], "freq":[0.83,0.17]},
             "exploitability": 0.012, "pot": 20.0}
  on error: {"id": <echoed>, "ok": false, "error": "..."}

It is PERSISTENT (one process, imports torch-free pure-Python resolve once) so a
GUI grade is a warm round-trip, not a cold `python` spawn per spot. A control
line {"cmd":"ping"} -> {"ok":true,"pong":true}; {"cmd":"shutdown"} exits.

Run (the JS bridge spawns this):
  solver/neural/.venv/bin/python solver/neural/oracle_worker.py

Only 7th-street spots are supported (street is fixed at 7): early streets need a
trained value net at the leaf and are gated until the net-leaf-vs-exact check
passes. A request that isn't a well-formed 7th-street node-locked spot returns
{"ok":false,...} so the JS side can gracefully fall back to the blueprint grade.

DRAW GAMES (M2): a request whose "game" is "badugi" or "td27" is routed to the
EXACT post-last-draw resolver (resolve_draw_final.draw_root_action_ev) instead
of the stud path — the stud request/response handling above is untouched.

  request:  {"id": <any>, "game": "badugi"|"td27",
             "me": ["As","2d","3c","4h"],            # hero's exact hand (4/5)
             "opp_range": [[["Kh","Qs","9c","8d"], 1.0], ...],
             "contrib": [6, 10],       # [hero, opp] TOTAL chips in this hand
             "bets": 1,                # bets/raises so far THIS round
             "acted": [false, true],   # optional; this round's acted flags
             "street": 3,              # optional; must be 3 (post-last-draw)
             "iters": 800}
  response: {"id":..., "ok": true, "per_action_ev": {"f":-6.0,"c":...,"r":...},
             "gtoMix": {...}, "exploitability": <EXACT BR gap>, "pot": 16.0}

Anything malformed — wrong hand size, empty/colliding range, a street other
than 3 (a PRE-last-draw node needs the 2-round tree / a value-net leaf and is
NOT served here) — returns {"ok":false,...} for the JS blueprint fallback.

CERTIFIED-NET DRAW GRADE (M-PROD, badugi PRE-last-draw): a request with
"mode":"net" (game "badugi", street 2 = the betting round BEFORE the 3rd/last
draw) is graded by the trained badugi value net (nets/badugi_draw1.npz, certified
0.059 SB mean grade error) served TORCH-FREE via net_forward_numpy.NumpyValueNet.
The net is the equilibrium value function over any pre-last-draw betting node of
the one-draw (final-draw) subgame; per-action EV = the net's value of each child
node (after the hero action) for hero's bucket. This is a DEPTH-LIMITED
pre-last-draw resolve with the net as the post-last-draw boundary. The EXACT
tiers above stay pure-python — numpy is imported ONLY inside this net path, so
post-last-draw + stud paths never require numpy.

  request:  {"id": <any>, "game": "badugi", "mode": "net",
             "me": ["As","2d","3c","5h"],            # hero's exact 4-card hand
             "opp_range": [[["Kh","Qs","9c","8d"], w], ...],  # posterior
             "contrib": [c_hero, c_opp],  # TOTAL chips in this hand
             "bets": 0, "acted": [false,false], "toAct": 0,
             "street": 2, "draws_remaining": 1}
  response: {"id":..., "ok": true, "tier": "certified-net",
             "certification_sb": 0.059, "per_action_ev": {"f":..,"c":..,"r":..},
             "net_value_gauge": <|zero-sum residual|>, "pot": <chips>}

The tier is ALWAYS labelled 'certified-net' (NEVER 'exact'/'GTO' — those are
reserved for the pure-python exact resolvers) with the honest certification.
Any malformed net request, or badugi net asset missing, returns {"ok":false,...}
so the JS side falls back to the blueprint grade.
"""
from __future__ import annotations

import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pbs import PBS  # noqa: E402
from resolve import root_action_ev, _sort_holding, STUD8  # noqa: E402
from razz_game import RAZZ  # noqa: E402
from resolve_draw_final import draw_root_action_ev, DRAW_FINAL_GAMES  # noqa: E402

_GAME = {"razz": RAZZ, "stud8": STUD8}


def _solve_draw(req: dict) -> dict:
    """EXACT post-last-draw (badugi/td27) per-action EV — the M2 draw rung.
    Any malformed or pre-last-draw request raises (-> ok:false fallback)."""
    game_name = str(req.get("game", "")).strip().lower()
    if game_name not in DRAW_FINAL_GAMES:
        raise ValueError(f"unknown draw game {game_name!r}")

    # POST-LAST-DRAW ONLY: draw-game streets are 0..3; the final betting round
    # (street 3, no draws remaining) is the only exact rung served here. A
    # pre-last-draw node has private-draw chance ahead of it and needs the
    # 2-round tree (resolve_draw2) or a certified value-net leaf — refuse fast
    # so the JS side falls back to the blueprint grade.
    street = int(req.get("street", 3))
    if street != 3:
        raise ValueError("only post-last-draw (street 3) decisions are exact; "
                         "earlier draw streets need the 2-round tree / a "
                         "certified net leaf")
    if int(req.get("draws_remaining", 0)) != 0:
        raise ValueError("draws remain: not a post-last-draw decision")

    me = req.get("me")
    if not me:
        raise ValueError("me (hero's exact hand) is required")
    opp_raw = req.get("opp_range")
    if not opp_raw:
        raise ValueError("opp_range (reach-weighted opponent holdings) is required")
    opp_range = []
    for entry in opp_raw:
        opp_range.append((tuple(entry[0]), float(entry[1])))

    contrib = req.get("contrib")
    if (not isinstance(contrib, (list, tuple)) or len(contrib) != 2):
        raise ValueError("contrib=[hero_chips_in, opp_chips_in] is required")
    bets = int(req.get("bets", 0))
    acted = req.get("acted")
    if acted is not None:
        if not isinstance(acted, (list, tuple)) or len(acted) != 2:
            raise ValueError("acted must be [hero_acted, opp_acted]")
        acted = [bool(acted[0]), bool(acted[1])]

    iters = int(req.get("iters", 800))
    iters = max(1, min(iters, 8000))

    out = draw_root_action_ev(game_name, me, opp_range,
                              contrib=[float(contrib[0]), float(contrib[1])],
                              bets=bets, acted=acted, iters=iters)
    return {
        "per_action_ev": out["per_action_ev"],
        "gtoMix": out["gtoMix"],
        "exploitability": out["exploitability"],
        "pot": out["pot"],
    }


# ── CERTIFIED-NET pre-last-draw badugi path (numpy, guarded) ─────────────────
# All numpy + net machinery is confined to this section and imported lazily
# INSIDE the functions, so the exact tiers (stud, post-last-draw draw) never
# import numpy. The net (nets/badugi_draw1.npz) is a torch-free NumpyValueNet
# whose forward is bit-exact vs torch (3.9e-14, commit 7e9598e).
_NET_STATE = {"net": None, "loaded": False, "error": None}

# The badugi net models the ONE-DRAW (final-draw) subgame as a
# small-bet(pre_bet=2) round -> 1 draw -> big-bet(post_bet=4) round -> showdown,
# with draws_left=1 — the exact constants train_badugi/datagen_badugi trained on.
_NET_PRE_BET = 2
_NET_POST_BET = 4
_NET_CAP = 4
_NET_CERT_SB = 0.059      # certified mean grade error (badugi_draw1, M6)


def _net_path():
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "nets", "badugi_draw1.npz")


def _load_net():
    """Lazy-load the badugi NumpyValueNet ONCE. Never raises — on any failure
    sets _NET_STATE['error'] and returns False so the caller emits ok:false (JS
    blueprint fallback).

    The serving path needs ONLY the .npz (the net weights) + draw_bucket's pure
    bucket_of_holding function — NOT the sampled bucket ABSTRACTION json (which
    lives out-of-repo under a symlinked data/ dir and is a datagen/exact-solve
    artifact, never consumed here). So the sole shippable asset is the .npz."""
    if _NET_STATE["loaded"]:
        return _NET_STATE["net"] is not None
    _NET_STATE["loaded"] = True
    try:
        import numpy  # noqa: F401  (only inside the net path)
        from net_forward_numpy import NumpyValueNet
        from draw_bucket import bucket_of_holding  # noqa: F401 (pure fn, no abstraction)
        npz_path = _net_path()
        if not os.path.exists(npz_path):
            raise FileNotFoundError(f"missing badugi net {npz_path}")
        _NET_STATE["net"] = NumpyValueNet.load(npz_path)
    except Exception as e:  # numpy missing / asset missing / import error
        _NET_STATE["error"] = f"{type(e).__name__}: {e}"
        _NET_STATE["net"] = None
        return False
    return True


def _net_encode_extra(pot, contrib, bets, to_act, acted):
    """Reproduce train_badugi.encode_extra EXACTLY for a live pre-last-draw node.
    The net's public conditioning: pot ratio, to-call/pot, dead/pot, big-round
    flag, draws_left/3, toAct one-hot, acted flags, bets one-hot 0..4, start_kind
    one-hot. We do NOT know the node's original start_kind, so the kind one-hot is
    ALL-ZERO (an in-distribution 'no-kind' context the ZeroSumLayer tolerates —
    every kind bit is a small linear feature, and the certification is measured on
    the net's outputs including this featurization)."""
    pot = float(pot) or 1.0
    c0, c1 = float(contrib[0]), float(contrib[1])
    to_call = abs(c0 - c1)
    base = 0.0
    big_round = 1.0 if _NET_POST_BET > _NET_PRE_BET else 0.0
    draws_left = 1.0
    feats = [pot / 100.0, to_call / pot, base / pot, big_round, draws_left / 3.0]
    feats += [float(to_act == 0), float(to_act == 1)]
    feats += [1.0 if acted[0] else 0.0, 1.0 if acted[1] else 0.0]
    feats += [1.0 if bets == b else 0.0 for b in range(5)]
    feats += [0.0] * 6   # start_kind one-hot unknown at grade time -> all-zero
    return feats


def _net_value_at(node, r0b, r1b):
    """Net value (fraction-of-pot per bucket) at a pre-last-draw betting node,
    for BOTH seats: (v0[19], v1[19]). node = {contrib,bets,toAct,acted}. Uses the
    CURRENT bucket ranges (hero point-mass + opponent posterior)."""
    import numpy as np
    net = _NET_STATE["net"]
    pot = node["contrib"][0] + node["contrib"][1]
    extra = _net_encode_extra(pot, node["contrib"], node["bets"],
                              node["toAct"], node["acted"])
    v0, v1 = net.forward([], np.asarray(extra, dtype=np.float32),
                         np.asarray(r0b, dtype=np.float32),
                         np.asarray(r1b, dtype=np.float32))
    return v0, v1


def _net_legal_actions(node):
    """Legal betting actions at a pre-last-draw node (mirrors draw-game.js /
    resolve_draw2._legal_actions for the bet phase)."""
    p = node["toAct"]
    facing = node["contrib"][1 - p] - node["contrib"][p]
    if facing > 0:
        acts = ["f", "c"]
        if node["bets"] < _NET_CAP:
            acts.append("r")
        return acts
    acts = ["k"]
    if node["bets"] < _NET_CAP:
        acts.append("b")
    return acts


def _net_apply_action(node, a):
    """Apply a betting action to a pre-last-draw node -> child node
    (contrib/bets/toAct/acted/closed). Mirrors resolve_draw2._apply_action's bet
    branch. 'closed' marks a round-closing call/check (both acted) — the child is
    the point at which OOP would draw, but the net values that continuation from
    the node AS-IS (it is trained on the whole remaining 2-round tree)."""
    n = dict(node)
    n["contrib"] = list(node["contrib"])
    n["acted"] = list(node["acted"])
    p = n["toAct"]
    n["acted"][p] = True
    facing = n["contrib"][1 - p] - n["contrib"][p]
    if a == "f":
        n["folded"] = p
        return n
    if a in ("c", "k"):
        n["contrib"][p] += facing
        if n["acted"][1 - p]:
            n["closed"] = True          # round closed -> draw/showdown continuation
        else:
            n["toAct"] = 1 - p
        return n
    # bet / raise: put in the current-round bet size on top of the call amount
    n["contrib"][p] = n["contrib"][1 - p] + _NET_PRE_BET
    n["bets"] += 1
    n["toAct"] = 1 - p
    return n


def _solve_draw_net(req: dict) -> dict:
    """CERTIFIED-NET per-action EV for a PRE-last-draw badugi bet decision.

    The net is the equilibrium value function over pre-last-draw nodes; per-action
    EV = the net's value of each child node (after the hero action) for HERO's
    bucket, in chips. Hero is seat 0 of contrib/acted (to-act convention). Fold is
    exact (terminal). Any malformed input raises -> ok:false (blueprint fallback).
    """
    import numpy as np
    from draw_bucket import bucket_of_holding, N_DRAW_BUCKETS

    game_name = str(req.get("game", "")).strip().lower()
    if game_name != "badugi":
        raise ValueError("certified-net path is badugi-only")
    if not _load_net():
        raise RuntimeError(f"badugi net unavailable ({_NET_STATE['error']})")

    # scope guard: PRE-last-draw = street 2 (the round before the 3rd draw), one
    # draw remaining. Refuse anything else so we never mislabel a spot.
    street = int(req.get("street", 2))
    draws_remaining = int(req.get("draws_remaining", 1))
    if street != 2 or draws_remaining != 1:
        raise ValueError("certified-net grades only the pre-last-draw (street 2, "
                         "1 draw remaining) badugi bet decision")

    me = req.get("me")
    if not me or len(me) != 4:
        raise ValueError("me (hero's exact 4-card badugi hand) is required")
    opp_raw = req.get("opp_range")
    if not opp_raw:
        raise ValueError("opp_range (posterior holdings) is required")
    contrib = req.get("contrib")
    if not isinstance(contrib, (list, tuple)) or len(contrib) != 2:
        raise ValueError("contrib=[hero_chips_in, opp_chips_in] is required")
    bets = int(req.get("bets", 0))
    acted = req.get("acted") or [False, False]
    acted = [bool(acted[0]), bool(acted[1])]
    to_act = int(req.get("toAct", 0))
    if to_act != 0:
        raise ValueError("hero must be seat 0 (to act) in the certified-net spot")

    # ── bucket ranges: hero = point mass on its bucket; opp = posterior binned ──
    hero_bucket = bucket_of_holding(me)
    r0b = [0.0] * N_DRAW_BUCKETS
    r0b[hero_bucket] = 1.0
    r1b = [0.0] * N_DRAW_BUCKETS
    zsum = 0.0
    for entry in opp_raw:
        hand, w = entry[0], float(entry[1])
        if w <= 0:
            continue
        b = bucket_of_holding(hand)
        r1b[b] += w
        zsum += w
    if zsum <= 0:
        raise ValueError("opp_range has no positive-weight holdings")
    r1b = [w / zsum for w in r1b]

    node = {"contrib": [float(contrib[0]), float(contrib[1])],
            "bets": bets, "toAct": to_act, "acted": acted}
    acts = _net_legal_actions(node)

    per_action_ev = {}
    for a in acts:
        child = _net_apply_action(node, a)
        if child.get("folded") is not None:
            # exact fold value: the folder loses their own contribution.
            per_action_ev[a] = -child["contrib"][0]
            continue
        v0, _v1 = _net_value_at(child, r0b, r1b)
        cpot = child["contrib"][0] + child["contrib"][1]
        # net outputs fraction-of-pot CFV for HERO (seat 0); hero is a point mass
        # on hero_bucket, so hero's EV = v0[hero_bucket] * pot (chips).
        per_action_ev[a] = float(v0[hero_bucket]) * cpot

    # HONEST self-consistency gauge (NOT an exact BR gap — the net is an
    # approximator): the zero-sum residual of the net at the DECISION node (should
    # be ~0 by the ZeroSumLayer; a large residual would flag an off-distribution
    # net query). Reported so the JS/UI can surface net trust honestly.
    v0n, v1n = _net_value_at(node, r0b, r1b)
    zs_resid = abs(float(np.dot(v0n, r0b)) + float(np.dot(v1n, r1b)))

    pot = node["contrib"][0] + node["contrib"][1]
    return {
        "tier": "certified-net",
        "certification_sb": _NET_CERT_SB,
        "per_action_ev": per_action_ev,
        "net_value_gauge": zs_resid,
        "pot": pot,
    }


def _solve(req: dict) -> dict:
    game_name = str(req.get("game", "razz")).strip().lower()
    if game_name not in _GAME:
        raise ValueError(f"unknown game {game_name!r} (use 'razz' or 'stud8')")
    game = _GAME[game_name]

    up0 = req.get("up0")
    up1 = req.get("up1")
    if not up0 or not up1:
        raise ValueError("up0 and up1 (both players' upcards) are required")
    dead = req.get("dead") or []
    pot = float(req.get("pot", 20))
    me = req.get("me")
    if not me:
        raise ValueError("me (hero's exact down cards) is required")

    opp_raw = req.get("opp_range")
    if not opp_raw:
        raise ValueError("opp_range (reach-weighted opponent holdings) is required")

    # opp_range: [[holding, weight], ...] -> {holding_tuple: weight}
    opp_range = {}
    for entry in opp_raw:
        holding, weight = entry[0], float(entry[1])
        if weight <= 0:
            continue
        h = _sort_holding(holding)
        opp_range[h] = opp_range.get(h, 0.0) + weight
    if not opp_range:
        raise ValueError("opp_range has no positive-weight holdings")

    iters = int(req.get("iters", 2000))
    iters = max(1, min(iters, 8000))

    # DEFENSIVE GUARD: this worker configures NO value-net leaf, so anything but
    # 7th street would hit root_action_ev's exact 6th->7th recursion, which nests
    # a full 7th-street CFR solve per deal leaf per outer iter -> HOURS per
    # decision. That would hang this persistent process, stall the JS bridge
    # until its timeout, AND tie up the single worker for every other queued
    # grade. Bail fast (the handler in main() turns this into ok:false) rather
    # than hang. Default 7 keeps current callers (which send no "street") intact.
    street = int(req.get("street", 7))
    if street != 7:
        raise ValueError(
            "exact early-street recursion is intractable; needs a value-net leaf")

    # 7th street ONLY (a real showdown — exact, no value net). Early streets are
    # blocked until the net-leaf-vs-exact check passes.
    pbs = PBS(street=7, up=[list(up0), list(up1)], dead=list(dead),
              pot=pot, ranges=[[], []])

    out = root_action_ev(pbs, me, opp_range=opp_range, game=game, iters=iters)
    return {
        "per_action_ev": out["per_action_ev"],
        "gtoMix": out["gtoMix"],
        "exploitability": out["exploitability"],
        "pot": out["pot"],
    }


def main() -> None:
    # line-buffered stdout; the JS side reads one JSON line per request.
    out = sys.stdout
    sys.stderr.write("[oracle_worker] ready (stud 7th-street + draw "
                     "post-last-draw true-GTO EV oracle)\n")
    sys.stderr.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        rid = None
        try:
            req = json.loads(line)
            rid = req.get("id")
            cmd = req.get("cmd")
            if cmd == "ping":
                out.write(json.dumps({"id": rid, "ok": True, "pong": True}) + "\n")
                out.flush()
                continue
            if cmd == "shutdown":
                out.write(json.dumps({"id": rid, "ok": True, "bye": True}) + "\n")
                out.flush()
                break
            game_name = str(req.get("game", "razz")).strip().lower()
            mode = str(req.get("mode", "")).strip().lower()
            if mode == "net":
                result = _solve_draw_net(req)  # CERTIFIED-NET pre-last-draw badugi
            elif game_name in DRAW_FINAL_GAMES:
                result = _solve_draw(req)      # M2 draw rung (badugi/td27)
            else:
                result = _solve(req)           # stud path — unchanged
            result["id"] = rid
            result["ok"] = True
            out.write(json.dumps(result) + "\n")
            out.flush()
        except Exception as e:  # any failure -> ok:false so JS falls back cleanly
            out.write(json.dumps({"id": rid, "ok": False,
                                  "error": f"{type(e).__name__}: {e}"}) + "\n")
            out.flush()


if __name__ == "__main__":
    main()
