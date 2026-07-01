#!/usr/bin/env python3
"""Live terminal dashboard for the parallel agent fleet — the agent analog of
solver/neural/monitor.py. Each agent writes a JSONL transcript while it works;
this shows per-agent status (working / quiet / done), elapsed time, and a
progress bar driven by transcript activity (agents don't report a true %, so the
bar is an activity proxy — it fills as the agent does more, and an agent that
goes idle for >90s is almost certainly finished).

  python3 solver/agents_monitor.py          # live, refreshes every 4s (Ctrl-C to quit)
  python3 solver/agents_monitor.py --once    # one frame
"""
import os
import sys
import time

# This session's background-task dir + the launched agents (name, task id).
TASKS_DIR = ("/private/tmp/claude-501/-Users-ethanibennett-Desktop-fg-solver/"
             "5e033693-0662-4aeb-865e-a0a1df1d07a3/tasks")
AGENTS = [
    ("Shard consolidation",          "a97fdd39dc71630b5"),
    ("Code review (bug audit)",      "ac68fce66d02677b4"),
    ("SOTA research (EMD/multiway)",  "a2f593fbd3a9e722e"),
    ("Live solver tool (product)",   "ab0195f14549470d7"),
    ("Draw-game LBR",                "a401f51f13e032db3"),
    ("A-5 triple draw (new game)",   "aa4f9da57dff96fb9"),
    ("EMD bucketing prototype",      "adfcb7bf58ca5dc78"),
]

R = "\033[0m"; B = "\033[1m"; D = "\033[2m"
GRN = "\033[32m"; YEL = "\033[33m"; CYN = "\033[36m"; BLU = "\033[34m"; GRY = "\033[90m"


def linecount(p):
    try:
        with open(p, 'rb') as f:
            return sum(1 for _ in f)
    except OSError:
        return 0


def stat_agent(aid):
    p = os.path.join(TASKS_DIR, aid + ".output")
    try:
        st = os.stat(p)
    except OSError:
        return None
    return {'mtime': st.st_mtime, 'birth': getattr(st, 'st_birthtime', st.st_ctime),
            'lines': linecount(p)}


def dur(s):
    s = int(s); m, s = divmod(s, 60); h, m = divmod(m, 60)
    return f"{h}h{m:02d}m" if h else f"{m}m{s:02d}s"


def bar(frac, w=20):
    frac = max(0.0, min(1.0, frac)); n = int(round(frac * w))
    return "█" * n + "░" * (w - n)


def frame():
    now = time.time()
    rows = [f"{B}  Agent fleet — live progress{R}    {D}{time.strftime('%H:%M:%S')}{R}",
            f"  {D}{'─' * 70}{R}"]
    working = done = 0
    for name, aid in AGENTS:
        s = stat_agent(aid)
        if not s:
            rows.append(f"  {GRY}◌ {name:<30} starting…{R}")
            continue
        elapsed, idle, steps = now - s['birth'], now - s['mtime'], s['lines']
        if idle < 25:
            working += 1
            icon, status, col, fill = f"{GRN}●{R}", f"{GRN}working{R}", CYN, min(steps / 120.0, 0.95)
        elif idle < 90:
            icon, status, col, fill = f"{YEL}◑{R}", f"{YEL}quiet {int(idle)}s{R}", YEL, min(steps / 120.0, 0.97)
        else:
            done += 1
            icon, status, col, fill = f"{BLU}○{R}", f"{BLU}done?{R}", BLU, 1.0
        rows.append(f"  {icon} {name:<30}{col}{bar(fill)}{R} {steps:>3} steps "
                    f"{dur(elapsed):>6}  {status}")
    rows.append(f"  {D}{'─' * 70}{R}")
    rows.append(f"  {GRN}{working} working{R} · {BLU}{done} likely done{R}   "
                f"{D}activity-based — agents don't report %; idle >90s ≈ finished{R}")
    return "\n".join(rows)


def main():
    once = "--once" in sys.argv
    try:
        while True:
            out = frame()
            if once:
                print(out); return
            sys.stdout.write("\033[2J\033[H" + out + "\n"); sys.stdout.flush()
            time.sleep(4)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
