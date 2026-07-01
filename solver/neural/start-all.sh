#!/usr/bin/env bash
# Bring the solver stack back up after a reboot — LEAN by design (the box is an
# 8-physical-core i9; piling 8 grind + 4 bootstrap + EMD onto it thrashed it).
# Core budget: keep sustained compute well under 8 cores so the machine stays
# responsive.  Run from anywhere:  bash solver/neural/start-all.sh
set -uo pipefail
ND="$(cd "$(dirname "$0")" && pwd)"
echo "starting solver stack (lean)…"

# 1. keep awake (one now + self-healing keeper)
pgrep -x caffeinate >/dev/null 2>&1 || (caffeinate -dimsu >/dev/null 2>&1 &)
nohup bash -c 'while sleep 120; do if ! pgrep -x caffeinate >/dev/null 2>&1; then caffeinate -dimsu & fi; done' >/dev/null 2>&1 &

# 2. 6th-street bootstrap — 3 workers (the frontier). niced low so it yields.
for t in s6a s6b s6c; do
  OMP_NUM_THREADS=1 nohup nice -n 8 "$ND/.venv/bin/python" "$ND/datagen_6th.py" \
    --net "$ND/nets/st7_200k.pt" --out "$ND/data/st6" --tag "$t" --forever \
    --boards 30 --per-board 20 --iters 150 --shard-size 100 >> "$ND/data/datagen6_$t.log" 2>&1 &
done

# 3. solver study-tool server (GUI fetches it on :8000)
nohup python3 "$ND/solve_server.py" > "$ND/data/solve_server.log" 2>&1 &

# 4. 7th-street grind — INTENTIONALLY PAUSED. The 7th net is at the 25-bucket
#    ceiling (R²0.94) and 3.6M examples are banked, so more 25-bucket data is
#    low-value and the cores are better spent on the bootstrap + the EMD retrain.
#    To re-enable (only if the EMD pivot fails): nohup bash "$ND/collect-daemon.sh" > "$ND/data/collect.log" 2>&1 &

sleep 6
echo "── lean stack up ──"
echo "  6th bootstrap: $(ps ax -o command= | grep -iE 'python.*datagen_6th' | grep -v grep | wc -l | tr -d ' ') workers   (7th grind paused)"
echo "  caffeinate:    $(pgrep -x caffeinate | wc -l | tr -d ' ')"
echo "  solve_server:  $(ps ax -o command= | grep -iE 'python.*solve_server' | grep -v grep | wc -l | tr -d ' ')  (http://127.0.0.1:8000)"
echo "  load: $(uptime | sed 's/.*load average[s]*: //')   (8 physical cores — keep this well under 8)"
