#!/usr/bin/env bash
# M2b: 24/7 BADUGI bucketed-datagen keeper (collect-daemon.sh pattern).
# Keeps WORKERS datagen_badugi.py workers alive (relaunches if any die) and
# logs a heartbeat (example count + rate) every CHECK seconds.
#
# Workers run the PURE-PYTHON resolve_draw2 path (the numpy backend did NOT
# pass its exactness verifiers) under PyPy — verified bit-identical to CPython
# (max |CFV diff| = 0.0 at 1000 iters; identical abstraction hash) but ~18x
# faster. Falls back to python3 if pypy3.10 is missing.
#
# CAP: WORKERS defaults to 4 — razz-v2 training/eval owns the other cores.
#
#   nohup bash solver/neural/collect-badugi.sh > solver/neural/data/badugi1/collect.log 2>&1 &
#   tail -f solver/neural/data/badugi1/collect.log
#   kill $(cat solver/neural/data/badugi1/collect.pid)   # stop keeper (workers keep running)
#   pkill -f "datagen_badugi.py --out data/badugi1"      # stop workers too
set -uo pipefail
cd "$(dirname "$0")"
OUT="${OUT:-data/badugi1}"
WORKERS="${WORKERS:-4}"
ITERS="${ITERS:-1000}"
SHARD_SIZE="${SHARD_SIZE:-25}"
CHECK="${CHECK:-300}"
# Anti-wedge + throughput bounds (2026-07-05). BUDGET_S: hard per-solve
# wall-clock budget — a solve slower than this is abandoned+resampled so no
# spot can pin a worker at 100% CPU producing zero shards. DEEP_KEEP: keep-prob
# for the deep (slow, bets<=1) start shapes; sub-sampled for throughput but NOT
# zeroed (corpus coverage of deep spots preserved). Emitted labels stay exact
# (iters unchanged). See datagen_badugi.py.
BUDGET_S="${BUDGET_S:-150}"
DEEP_KEEP="${DEEP_KEEP:-0.10}"
PY="$(command -v pypy3.10 || command -v python3)"
mkdir -p "$OUT"
echo $$ > "$OUT/collect.pid"

alive(){ pgrep -f "datagen_badugi.py --out $OUT" | wc -l | tr -d ' '; }
ensure(){
  local n; n=$(alive)
  if [ "$n" -lt "$WORKERS" ]; then
    pkill -f "datagen_badugi.py --out $OUT" 2>/dev/null || true
    perl -e 'select(undef,undef,undef,2)'
    # DISTINCT + NON-REPLAYING seeds: base is time-jittered per (re)launch so a
    # restart after a stall never replays the exact slow deterministic sequence
    # that stalled, and workers are spaced 100003 apart so no two ever converge
    # on the same subsequence.  --budget-s / --deep-keep-prob are the anti-wedge
    # + throughput bounds (see datagen_badugi.py); tunable via env.
    local base; base=$(( (RANDOM<<15 ^ $(date +%s)) % 1000000 + 1 ))
    for i in $(seq 0 $((WORKERS-1))); do
      nohup "$PY" datagen_badugi.py --out "$OUT" --tag "w$i" --iters "$ITERS" \
        --shard-size "$SHARD_SIZE" --seed $(( base + 100003 * i )) \
        --budget-s "$BUDGET_S" --deep-keep-prob "$DEEP_KEEP" --forever \
        > "$OUT/worker_w$i.log" 2>&1 &
    done
    echo "[$(date '+%m-%d %H:%M:%S')] (re)launched $WORKERS badugi workers ($PY, iters $ITERS, base_seed $base, budget ${BUDGET_S}s, deep_keep $DEEP_KEEP; found $n alive)"
  fi
}

echo "[$(date '+%m-%d %H:%M:%S')] collect-badugi up: target $WORKERS workers ($PY), heartbeat every ${CHECK}s -> $OUT"
prev=""; prevt=""
while true; do
  ensure
  n=$(find "$OUT" -name 'shard_*.jsonl' -print0 2>/dev/null | xargs -0 cat 2>/dev/null | wc -l | tr -d ' '); t=$(date +%s)
  extra=""
  if [ -n "$prev" ] && [ "$t" -gt "$prevt" ]; then
    extra=$(perl -e "printf '  (+%d, ~%.0f/hr)', $n-$prev, ($n-$prev)/(($t-$prevt)/3600.0)")
  fi
  echo "[$(date '+%m-%d %H:%M:%S')] examples: $n  workers: $(alive)$extra"
  prev=$n; prevt=$t
  perl -e "select(undef,undef,undef,$CHECK)"
done
