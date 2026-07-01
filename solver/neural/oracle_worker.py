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
"""
from __future__ import annotations

import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pbs import PBS  # noqa: E402
from resolve import root_action_ev, _sort_holding, STUD8  # noqa: E402
from razz_game import RAZZ  # noqa: E402

_GAME = {"razz": RAZZ, "stud8": STUD8}


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
    sys.stderr.write("[oracle_worker] ready (7th-street true-GTO EV oracle)\n")
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
            result = _solve(req)
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
