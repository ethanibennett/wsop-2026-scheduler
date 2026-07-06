#!/usr/bin/env bash
# M5: 24/7 BUCKETED 6th-street datagen keeper (collect-badugi.sh pattern).
# Keeps 2 datagen_stud6.py workers alive (one stud8, one razz) and logs a
# heartbeat (example count + rate) every CHECK seconds.
#
# CPU DISCIPLINE: the box is busy (razz3 train3.js + 4 pypy datagen_badugi + the
# badugi keeper). This runs ONLY 2 new workers at nice -19 so it does NOT starve
# them. Workers run under PyPy (pure-python resolve; numpy is OUT); falls back to
# python3 if pypy3.10 is missing.
#
#   nohup nice -n 19 bash solver/neural/collect-stud6.sh > solver/neural/data/st6/collect.log 2>&1 &
#   tail -f solver/neural/data/st6/collect.log
#   kill $(cat solver/neural/data/st6/collect.pid)   # stop keeper (workers keep running)
#   pkill -f "datagen_stud6.py --out data/st6"        # stop workers too
set -uo pipefail
cd "$(dirname "$0")"
OUT="${OUT:-data/st6}"
ITERS="${ITERS:-300}"
SAMPLES="${SAMPLES:-400}"
BOARDS="${BOARDS:-40}"
PER_BOARD="${PER_BOARD:-20}"
SHARD_SIZE="${SHARD_SIZE:-25}"
CHECK="${CHECK:-300}"
BUDGET_S="${BUDGET_S:-90}"
# Exactly 2 workers: one per game (CPU discipline — do NOT starve the existing
# razz3 + badugi grinds). GAMES is a space-separated list; add a second tag per
# game only if you deliberately want >2 workers.
GAMES="${GAMES:-stud8 razz}"
PY="$(command -v pypy3.10 || command -v python3)"
mkdir -p "$OUT"
echo $$ > "$OUT/collect.pid"

alive(){ pgrep -f "datagen_stud6.py --out $OUT" | wc -l | tr -d ' '; }
want(){ echo "$GAMES" | wc -w | tr -d ' '; }
ensure(){
  local n; n=$(alive); local target; target=$(want)
  if [ "$n" -lt "$target" ]; then
    pkill -f "datagen_stud6.py --out $OUT" 2>/dev/null || true
    perl -e 'select(undef,undef,undef,2)'
    # DISTINCT + NON-REPLAYING seeds: time-jittered base per (re)launch (a restart
    # after a stall never replays the exact slow deterministic sequence), workers
    # spaced 100003 apart so no two ever converge on the same subsequence.
    local base; base=$(( (RANDOM<<15 ^ $(date +%s)) % 1000000 + 1 ))
    local i=0
    for g in $GAMES; do
      nohup nice -n 19 "$PY" datagen_stud6.py --out "$OUT" --game "$g" --tag "w$i" \
        --boards "$BOARDS" --per-board "$PER_BOARD" --iters "$ITERS" \
        --samples "$SAMPLES" --shard-size "$SHARD_SIZE" \
        --seed $(( base + 100003 * i )) --budget-s "$BUDGET_S" --forever \
        > "$OUT/worker_${g}_w$i.log" 2>&1 &
      i=$((i+1))
    done
    echo "[$(date '+%m-%d %H:%M:%S')] (re)launched $target stud6 workers ($PY, games '$GAMES', iters $ITERS, base_seed $base, budget ${BUDGET_S}s; found $n alive)"
  fi
}

echo "[$(date '+%m-%d %H:%M:%S')] collect-stud6 up: target $(want) workers ($PY), games '$GAMES', heartbeat every ${CHECK}s -> $OUT"
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
