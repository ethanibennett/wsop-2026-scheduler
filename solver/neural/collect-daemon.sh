#!/usr/bin/env bash
# 24/7 data-collection keeper. Keeps WORKERS datagen workers alive (relaunches
# the grind if any die or it crashes) and logs a heartbeat (example count +
# rate) every CHECK seconds. Collection-only — validation is run on demand.
# Survives a closed terminal via nohup; for reboot survival see the LaunchAgent
# note in PROGRESS / ask to install one.
#
#   nohup bash solver/neural/collect-daemon.sh > solver/neural/data/collect.log 2>&1 &
#   tail -f solver/neural/data/collect.log          # watch it
#   kill $(cat solver/neural/data/collect.pid)      # stop the keeper (grind keeps running)
set -uo pipefail
cd "$(dirname "$0")"
SHARDS="${SHARDS:-data/st7}"
WORKERS="${WORKERS:-8}"           # = physical cores; more just thrashes memory bandwidth
SHARD_SIZE="${SHARD_SIZE:-25}"    # small so the monitor moves within ~1-2 min
CHECK="${CHECK:-300}"             # seconds between health checks
mkdir -p "$SHARDS"
echo $$ > data/collect.pid

alive(){ pgrep -f "datagen_bucketed.py --street 7 --out $SHARDS" | wc -l | tr -d ' '; }
ensure(){
  local n; n=$(alive)
  if [ "$n" -lt "$WORKERS" ]; then
    pkill -f "datagen_bucketed.py --street 7 --out $SHARDS" 2>/dev/null || true
    pkill -f "datagen-24-7.sh" 2>/dev/null || true
    perl -e 'select(undef,undef,undef,3)'
    WORKERS="$WORKERS" SHARD_SIZE="$SHARD_SIZE" STREET=7 OUT="$SHARDS" \
      nohup bash datagen-24-7.sh > data/datagen.log 2>&1 &
    echo "[$(date '+%m-%d %H:%M:%S')] (re)launched grind: $WORKERS workers, shard $SHARD_SIZE (found $n alive)"
  fi
}

echo "[$(date '+%m-%d %H:%M:%S')] collect-daemon up: target $WORKERS workers, heartbeat every ${CHECK}s -> $SHARDS"
prev=""; prevt=""
while true; do
  ensure
  n=$(cat "$SHARDS"/*.jsonl 2>/dev/null | wc -l | tr -d ' '); t=$(date +%s)
  extra=""
  if [ -n "$prev" ] && [ "$t" -gt "$prevt" ]; then
    extra=$(perl -e "printf '  (+%d, ~%.0f/hr)', $n-$prev, ($n-$prev)/(($t-$prevt)/3600.0)")
  fi
  echo "[$(date '+%m-%d %H:%M:%S')] examples: $n  workers: $(alive)$extra"
  prev=$n; prevt=$t
  perl -e "select(undef,undef,undef,$CHECK)"
done
