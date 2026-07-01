#!/usr/bin/env python3
"""Live terminal dashboard for the 24/7 Stud 8 data-collection grind.

Run it in any terminal to watch progress; Ctrl-C to exit. On-demand only — it
does not touch the grind, just reads counts/status. Pure stdlib.

    python3 solver/neural/monitor.py
    python3 solver/neural/monitor.py --target 5000000 --refresh 5
    python3 solver/neural/monitor.py --once          # one frame (for watch/cron)
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys
import time
from collections import deque
from datetime import datetime

C = dict(g='\033[32m', y='\033[33m', c='\033[36m', r='\033[31m',
         dim='\033[2m', b='\033[1m', x='\033[0m')
MILES = [250_000, 500_000, 1_000_000, 2_000_000, 5_000_000,
         10_000_000, 15_000_000, 25_000_000, 50_000_000]
SPARK = "▁▂▃▄▅▆▇█"


def sh(cmd, timeout=30):
    try:
        return subprocess.run(cmd, shell=True, capture_output=True, text=True,
                              timeout=timeout).stdout
    except Exception:
        return ""


def du_bytes(d):
    out = sh(f"du -sk '{d}' 2>/dev/null").split()
    return int(out[0]) * 1024 if out and out[0].isdigit() else 0


def wc_count(d):
    out = sh(f"find '{d}' -name '*.jsonl' -exec cat {{}} + 2>/dev/null | wc -l")
    try:
        return int(out.strip() or 0)
    except ValueError:
        return 0


def workers(d):
    tag = os.path.basename(os.path.normpath(d))   # match basename (rel/abs agnostic)
    out = sh(f"pgrep -f 'datagen_bucketed.py.*{tag}' | wc -l")
    try:
        return int(out.strip() or 0)
    except ValueError:
        return 0


def daemon_alive(base):
    try:
        pid = int(open(os.path.join(base, 'data', 'collect.pid')).read().strip())
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def seed_history(log_path, hist, now):
    """Seed (time, count) history from collect.log heartbeats for an instant rate."""
    if not os.path.exists(log_path):
        return
    pat = re.compile(r'\[(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)\] examples: (\d+)')
    yr = datetime.now().year
    try:
        lines = open(log_path).read().splitlines()[-200:]
    except Exception:
        return
    for ln in lines:
        m = pat.search(ln)
        if not m:
            continue
        mo, dy, hh, mm, ss, n = (int(x) for x in m.groups())
        try:
            ts = datetime(yr, mo, dy, hh, mm, ss).timestamp()
        except ValueError:
            continue
        if now - ts <= 1800:
            hist.append((ts, n))


def quality_sample(d):
    """Cheap data-quality read from one recent shard: median exploit, zero-sum."""
    files = sorted(glob.glob(os.path.join(d, '*.jsonl')))
    if not files:
        return None
    ex, zs = [], 0.0
    try:
        for ln in open(files[-1]):
            ln = ln.strip()
            if not ln:
                continue
            r = json.loads(ln)
            pot = r.get('pot') or 1
            if 'exploitability' in r:
                ex.append(r['exploitability'] / pot)
            v = r.get('value')
            if v:
                zs = max(zs, abs(v[0] + v[1]))
    except Exception:
        return None
    if not ex:
        return None
    ex.sort()
    return dict(med=ex[len(ex) // 2] * 100, mx=ex[-1] * 100, zs=zs, n=len(ex))


def hum_t(s):
    s = int(s)
    if s >= 86400:
        return f"{s // 86400}d {s % 86400 // 3600}h"
    if s >= 3600:
        return f"{s // 3600}h {s % 3600 // 60}m"
    return f"{s // 60}m"


def render(d, base, hist, sparks, target_arg, calib):
    now = time.time()
    db = du_bytes(d)
    n = round(db * calib['ratio']) if calib['ratio'] else 0
    hist.append((now, n))
    while hist and now - hist[0][0] > 900:
        hist.popleft()
    rate = None
    if len(hist) >= 2 and now - hist[0][0] > 20:
        rate = (n - hist[0][1]) / (now - hist[0][0]) * 3600
    w = workers(d)
    dα = daemon_alive(base)
    tgt = target_arg or next((m for m in MILES if m > n), MILES[-1])
    pct = min(100.0, 100.0 * n / tgt) if tgt else 0
    fill = round(pct / 100 * 34)
    bar = '█' * fill + '░' * (34 - fill)
    eta = hum_t((tgt - n) / rate * 3600) if rate and rate > 0 and n < tgt else '—'
    if rate is not None:
        sparks.append(rate)
    while len(sparks) > 34:
        sparks.popleft()
    spk = ''
    if sparks:
        lo, hi = min(sparks), max(sparks) or 1
        rng = (hi - lo) or 1
        spk = ''.join(SPARK[min(7, int((v - lo) / rng * 7))] for v in sparks)

    dot = f"{C['g']}●{C['x']}" if w > 0 else f"{C['r']}●{C['x']}"
    stat = f"{C['g']}collecting{C['x']}" if w > 0 else f"{C['r']}stopped{C['x']}"
    keep = f"{C['g']}✓{C['x']}" if dα else f"{C['y']}off{C['x']}"
    rate_s = f"~{rate:,.0f}/hr" if rate is not None else "measuring…"
    q = calib.get('q')
    W = 58
    L = C['dim']

    def vlen(s):
        return len(re.sub(r'\033\[[0-9;?]*[a-zA-Z]', '', s))
    lines = [f"{L}┌" + "─" * (W - 2) + f"┐{C['x']}"]

    def row(s=""):
        pad = max(0, W - 3 - vlen(s))
        lines.append(f"{L}│{C['x']} " + s + " " * pad + f"{L}│{C['x']}")
    row(f"{C['b']}Stud 8 · data collection{C['x']}{L}    {time.strftime('%Y-%m-%d %H:%M:%S')}{C['x']}")
    row()
    row(f"{dot} {stat}    keeper {keep}    workers {C['b']}{w}{C['x']}")
    row()
    row(f"examples   {C['b']}{C['c']}{n:,}{C['x']}")
    row(f"rate       {C['c']}{rate_s}{C['x']}    disk {db/1e9:.2f} GB")
    row()
    row(f"toward {tgt:,}")
    row(f"{C['g']}{bar}{C['x']} {pct:.1f}%")
    row(f"eta {C['y']}{eta}{C['x']} at current rate")
    if spk:
        row()
        row(f"rate trend {C['c']}{spk}{C['x']}{L} (last {min(len(sparks) * 2, 30)} min){C['x']}")
    if q:
        row()
        qc = C['g'] if q['med'] < 2 else C['y']
        row(f"quality    exploit {qc}{q['med']:.2f}%{C['x']} med · zero-sum {q['zs']:.0e} {C['g']}✓{C['x']}")
    lines.append(f"{L}└" + "─" * (W - 2) + f"┘{C['x']}")
    lines.append(f"{L}  ctrl-c to exit{C['x']}")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default=os.path.join(os.path.dirname(__file__), 'data', 'st7'))
    ap.add_argument('--refresh', type=float, default=6)
    ap.add_argument('--target', type=int, default=0)
    ap.add_argument('--once', action='store_true')
    a = ap.parse_args()
    base = os.path.dirname(os.path.abspath(__file__))
    d = a.dir

    now = time.time()
    c0 = wc_count(d)
    b0 = du_bytes(d) or 1
    calib = {'ratio': c0 / b0 if b0 else 0, 'q': quality_sample(d), 'qt': now}
    hist = deque()
    seed_history(os.path.join(base, 'data', 'collect.log'), hist, now)
    sparks = deque()

    sys.stdout.write('\033[?25l')  # hide cursor
    try:
        while True:
            if time.time() - calib['qt'] > 300:           # refresh the data-quality sample
                calib['q'] = quality_sample(d)
                calib['qt'] = time.time()
            frame = render(d, base, hist, sparks, a.target, calib)
            sys.stdout.write('\033[H\033[J' + frame + '\n')
            sys.stdout.flush()
            if a.once:
                break
            time.sleep(a.refresh)
    except KeyboardInterrupt:
        pass
    finally:
        sys.stdout.write('\033[?25h\n')  # show cursor
        sys.stdout.flush()


if __name__ == '__main__':
    main()
