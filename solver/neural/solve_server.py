"""solve_server — tiny standalone HTTP server wrapping solve_spot.py for the GUI.

A self-contained local study tool: exposes POST/GET /solve, parses spot params,
runs the EXACT node-locked solve in-process (solve_spot.solve_spot), and returns
its JSON with permissive CORS so the file:// razz-solver-gui.html can fetch it.

This is a SEPARATE standalone tool — it does NOT touch the production app
(server.js / vite-app / public). Pure stdlib (http.server), no Flask/torch needed.

Run:
  cd solver/neural && python3 solve_server.py          # listens on 127.0.0.1:8000
  # then open ../razz-solver-gui.html in a browser

Endpoints:
  GET  /health                      -> {"ok": true, ...}
  POST /solve  (JSON body)          -> solve_spot JSON  (see PARAMS below)
  GET  /solve?game=razz&street=7&.. -> same, params as query string
  POST /solve/range  (JSON body)    -> solve_range JSON (see RANGE PARAMS below)
  GET  /solve/range?game=razz&..    -> same, params as query string

PARAMS for /solve (JSON keys or query params):
  game        "razz" | "stud8"        (default "razz")
  street      int 3..7                (default 7)
  up0         my upcards   e.g. "As4s3d2c"
  up1         opp upcards  e.g. "KhQdJc9h"
  dead        dead/exposed cards      (optional, default "")
  me          my exact down cards     e.g. "5h6h7c"   (provide me OR meRange)
  meRange     my range, "all" or "Kc Kd 2h, Qs Js Tc"
  oppRange    opp range (node-locked), "all" or comma-separated holdings  (required)
  pot         number                  (default 20)
  iters       int                     (default 1000)

WIDE-RANGE GUARD (/solve only): the exact node-locked solve restricts CFR to the
union of both ranges' support, so narrow / node-locked spots solve in <1s. A bare
"all" range (or any range bigger than MAX_HOLDINGS) blows up to thousands of
holdings and is REJECTED with a 400 explaining why — keep /solve ranges narrow.

RANGE PARAMS for /solve/range (JSON keys or query params) — true range-vs-range,
NO 60-holding cap (auto-buckets wide ranges, even bare 'all'):
  game        "razz" | "stud8"        (default "razz")
  street      int                     (default 7; 7 full, 6 needs the trained net)
  up0         my upcards   e.g. "2s3d7c9h"
  up1         opp upcards  e.g. "4c5h6sJd"
  dead        dead/exposed cards      (optional, default "")
  pot         number                  (default 20)
  r0          my range:  "all" OR weighted "Kc Kd 2c, Qs Js Tc:2.0"   (default "all")
  r1          opp range: same grammar                                  (default "all")
  me          a specific hero holding to report the line for           (optional)
  mode        "exact" | "bucketed"    (optional; default = auto by holding count)
  abstraction "hilo" | "emd"          (default "hilo"; emd is stud8-only)
  emd_buckets int                     (default 80; only used with abstraction=emd)
  iters       int                     (default 1000)
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# import the solver from this same directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pbs import down_count, enumerate_holdings  # noqa: E402
from solve_spot import _split_cards, _holding, _parse_range, solve_spot, _GAME  # noqa: E402
# Range-vs-range engine (true range solve, no holding cap — auto-buckets wide
# ranges). Imported in-process exactly like solve_spot above. solve_range's own
# parse_range validates every explicit holding for board-consistency/duplicates
# and raises ValueError on bad input, which _handle_range maps to HTTP 400.
import solve_range as SR  # noqa: E402

HOST = os.environ.get("SOLVER_HOST", "127.0.0.1")
PORT = int(os.environ.get("SOLVER_PORT", "8000"))

# Union-of-support size above which we refuse to solve (keeps every solve <~1s).
# A full "all" range on 7th street is ~13k holdings; a node-locked spot is a handful.
MAX_HOLDINGS = int(os.environ.get("SOLVER_MAX_HOLDINGS", "60"))
# Hard ceiling on iters so a pathological request can't hang the server.
MAX_ITERS = 5000


class SolveError(Exception):
    """A user-input problem -> HTTP 400 with this message (not a 500)."""


def _as_str(params: dict, key: str, default=None):
    v = params.get(key, default)
    if isinstance(v, list):  # parse_qs gives lists
        v = v[0] if v else default
    return v


def _build_and_solve(params: dict) -> dict:
    """Validate params, guard against wide ranges, run the exact solve."""
    game_name = (_as_str(params, "game", "razz") or "razz").strip().lower()
    if game_name not in _GAME:
        raise SolveError(f"unknown game {game_name!r} (use 'razz' or 'stud8')")

    try:
        street = int(_as_str(params, "street", 7))
    except (TypeError, ValueError):
        raise SolveError("street must be an integer 3..7")
    if street not in (3, 4, 5, 6, 7):
        raise SolveError("street must be one of 3,4,5,6,7")

    up0 = _as_str(params, "up0")
    up1 = _as_str(params, "up1")
    if not up0 or not up1:
        raise SolveError("up0 and up1 (both players' upcards) are required")
    dead_s = _as_str(params, "dead", "") or ""

    try:
        up = [_split_cards(up0), _split_cards(up1)]
        dead = _split_cards(dead_s) if dead_s.strip() else []
    except Exception as e:
        raise SolveError(f"could not parse cards: {e}")

    board = up[0] + up[1] + dead
    k = down_count(street)

    me_s = _as_str(params, "me")
    me_range_s = _as_str(params, "meRange") or _as_str(params, "me_range")
    opp_range_s = _as_str(params, "oppRange") or _as_str(params, "opp_range")

    if not opp_range_s or not opp_range_s.strip():
        raise SolveError("oppRange (node-locked opponent range) is required")

    try:
        if me_s and me_s.strip():
            me = {_holding(me_s, k): 1.0}
        elif me_range_s and me_range_s.strip():
            me = _parse_range(me_range_s, board, k)
        else:
            raise SolveError("provide 'me' (exact down cards) or 'meRange'")
        opp = _parse_range(opp_range_s, board, k)
    except SolveError:
        raise
    except Exception as e:
        raise SolveError(
            f"could not parse a range/holding (each holding must be {k} card(s) "
            f"for street {street}, e.g. {'Kc Kd 2h' if k == 3 else 'Kc Kd'}): {e}"
        )

    if not me or not opp:
        raise SolveError("both ranges must be non-empty")

    # ── wide-range guard: union-of-support size is what the CFR actually solves ──
    union = set(me) | set(opp)
    if len(union) > MAX_HOLDINGS:
        # If they literally asked for 'all', report what that expands to.
        hint = ""
        if "all" in (str(me_range_s).lower(), str(opp_range_s).lower()):
            try:
                hint = (f" An 'all' range here expands to "
                        f"{len(enumerate_holdings(board, k))} holdings.")
            except Exception:
                pass
        raise SolveError(
            f"range too wide: {len(union)} combined holdings "
            f"(cap {MAX_HOLDINGS}).{hint} This tool solves NODE-LOCKED spots — "
            f"narrow the opponent (and hero) to a handful of explicit holdings "
            f"like 'Kc Kd 2h, Qs Js Tc' so it solves in <1s."
        )

    try:
        iters = int(_as_str(params, "iters", 1000))
    except (TypeError, ValueError):
        iters = 1000
    iters = max(1, min(iters, MAX_ITERS))

    try:
        pot = float(_as_str(params, "pot", 20))
    except (TypeError, ValueError):
        raise SolveError("pot must be a number")

    out = solve_spot(street, up, dead, pot, me, opp, iters, game=_GAME[game_name])
    # echo back the resolved inputs so the GUI can render exactly what was solved
    out["game"] = game_name
    out["input"] = {
        "street": street, "up0": up[0], "up1": up[1], "dead": dead,
        "pot": pot, "iters": iters,
        "meHoldings": [" ".join(h) for h in sorted(me)],
        "oppHoldings": [" ".join(h) for h in sorted(opp)],
    }
    return out


def _build_and_solve_range(params: dict) -> dict:
    """Validate params and run the range-vs-range solve (solve_range.solve_range).

    Unlike /solve there is NO wide-range cap: solve_range auto-selects the EXACT
    raw-holding engine for narrow ranges and the BUCKETED engine for wide ones
    (so a bare 'all' range solves fine). Returns solve_range's JSON verbatim
    {game, street, mode, abstraction?, n, pot, value:{me,opp}, decisions{},
    exploitability?, me_strategy?, me_bucket?}. Bad input (unknown game/street,
    unparseable cards, or a board-card/duplicate holding rejected by
    solve_range.parse_range) -> SolveError -> HTTP 400."""
    game_name = (_as_str(params, "game", "razz") or "razz").strip().lower()
    if game_name not in SR._GAME:
        raise SolveError(f"unknown game {game_name!r} (use 'razz' or 'stud8')")

    try:
        street = int(_as_str(params, "street", 7))
    except (TypeError, ValueError):
        raise SolveError("street must be an integer")

    up0 = _as_str(params, "up0")
    up1 = _as_str(params, "up1")
    if not up0 or not up1:
        raise SolveError("up0 and up1 (both players' upcards) are required")
    dead_s = _as_str(params, "dead", "") or ""

    try:
        up = [_split_cards(up0), _split_cards(up1)]
        dead = _split_cards(dead_s) if dead_s.strip() else []
    except Exception as e:
        raise SolveError(f"could not parse cards: {e}")

    r0 = _as_str(params, "r0", "all") or "all"
    r1 = _as_str(params, "r1", "all") or "all"
    me = _as_str(params, "me")
    me = me.strip() if (me and me.strip()) else None

    mode = _as_str(params, "mode")
    if mode is not None:
        mode = (mode.strip().lower() or None)
    if mode not in (None, "exact", "bucketed"):
        raise SolveError("mode must be 'exact', 'bucketed', or omitted (auto)")

    abstraction = (_as_str(params, "abstraction", "hilo") or "hilo").strip().lower()
    if abstraction not in ("hilo", "emd"):
        raise SolveError("abstraction must be 'hilo' or 'emd'")

    try:
        emd_buckets = int(_as_str(params, "emd_buckets", SR.EMD_DEFAULT_BUCKETS))
    except (TypeError, ValueError):
        raise SolveError("emd_buckets must be an integer")

    try:
        iters = int(_as_str(params, "iters", 1000))
    except (TypeError, ValueError):
        iters = 1000
    iters = max(1, min(iters, MAX_ITERS))

    try:
        pot = float(_as_str(params, "pot", 20))
    except (TypeError, ValueError):
        raise SolveError("pot must be a number")

    # solve_range supports 7th street fully, 6th via the trained net leaf; map
    # both engine-input problems (ValueError, e.g. a board-card/duplicate holding)
    # and 6th-street/net-missing SystemExit to a 400 the GUI can show.
    try:
        if street == 7:
            out = SR.solve_range(street, up, dead, pot, r0, r1, iters,
                                 game_name, me, force_mode=mode,
                                 abstraction=abstraction, emd_buckets=emd_buckets)
        elif street == 6:
            out = SR.solve_range_6th(street, up, dead, pot, r0, r1, iters,
                                     game_name, me)
            if out is None:
                raise SolveError(
                    f"6th street needs the trained 7th-street net "
                    f"({SR._NET_FILE.get(game_name)}) + PyTorch, and the combined "
                    f"range must be <= {SR.EXACT_HOLDING_CAP} holdings (exact path "
                    f"only). Either narrow the ranges, or solve street 7 directly.")
        else:
            raise SolveError(
                f"street {street} not supported. 7th street is fully supported "
                f"(exact + bucketed); 6th street via the trained net leaf "
                f"(exact, narrow ranges). Streets 3-5 need the neural search leaf "
                f"— not built into this study tool.")
    except SolveError:
        raise
    except ValueError as e:                 # bad range/holding -> user-input error
        raise SolveError(str(e))
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "RazzSolver/1.0"

    # ── CORS: permissive so a file:// page (Origin: null) can call us ──
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ("/health", "/"):
            self._json(200, {
                "ok": True, "service": "razz/stud8 solver server",
                "games": sorted(_GAME.keys()),
                "endpoints": {
                    "/solve": {
                        "what": "EXACT node-locked spot (wraps solve_spot)",
                        "maxHoldings": MAX_HOLDINGS,
                        "note": (f"combined range support capped at {MAX_HOLDINGS} "
                                 f"holdings — keep ranges narrow / node-locked"),
                    },
                    "/solve/range": {
                        "what": "range-vs-range equilibrium (wraps solve_range)",
                        "maxHoldings": None,
                        "note": ("NO 60-holding cap — auto-buckets wide ranges "
                                 "(even bare 'all'); auto-selects exact vs bucketed "
                                 "by combined holding count"),
                        "abstraction": ["hilo", "emd"],
                        "streets": "7 (full); 6 (needs trained net + narrow range)",
                    },
                },
                "iters_max": MAX_ITERS,
            })
            return
        if parsed.path == "/solve":
            params = parse_qs(parsed.query, keep_blank_values=True)
            self._handle_solve(params)
            return
        if parsed.path == "/solve/range":
            params = parse_qs(parsed.query, keep_blank_values=True)
            self._handle_range(params)
            return
        self._json(404, {"error": f"no such path {parsed.path!r}"})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path not in ("/solve", "/solve/range"):
            self._json(404, {"error": f"no such path {parsed.path!r}"})
            return
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            params = json.loads(raw.decode("utf-8")) if raw.strip() else {}
            if not isinstance(params, dict):
                raise ValueError("body must be a JSON object")
        except Exception as e:
            self._json(400, {"error": f"invalid JSON body: {e}"})
            return
        if parsed.path == "/solve":
            self._handle_solve(params)
        else:
            self._handle_range(params)

    def _handle_solve(self, params: dict):
        try:
            result = _build_and_solve(params)
            self._json(200, result)
        except SolveError as e:
            self._json(400, {"error": str(e)})
        except Exception as e:  # unexpected -> 500 with a short trace for debugging
            traceback.print_exc()
            self._json(500, {"error": f"solve failed: {e}",
                             "type": type(e).__name__})

    def _handle_range(self, params: dict):
        try:
            result = _build_and_solve_range(params)
            self._json(200, result)
        except SolveError as e:                 # bad user input -> 400
            self._json(400, {"error": str(e)})
        except Exception as e:  # unexpected -> 500 with a short trace for debugging
            traceback.print_exc()
            self._json(500, {"error": f"range solve failed: {e}",
                             "type": type(e).__name__})

    def log_message(self, fmt, *args):  # concise one-line access log
        sys.stderr.write("[solve_server] %s - %s\n" % (self.address_string(),
                                                       fmt % args))


def main():
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[solve_server] razz/stud8 solver listening on http://{HOST}:{PORT}")
    print(f"[solve_server]   POST/GET /solve         (node-locked, "
          f"maxHoldings={MAX_HOLDINGS}, iters<= {MAX_ITERS})")
    print(f"[solve_server]   POST/GET /solve/range   (range-vs-range, NO cap, "
          f"auto-buckets wide ranges)")
    print(f"[solve_server]   open ../razz-solver-gui.html in a browser to use it")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[solve_server] shutting down")
        httpd.shutdown()


if __name__ == "__main__":
    main()
