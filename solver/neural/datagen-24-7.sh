#!/usr/bin/env bash
# Continuous BUCKETED data generation across all cores. Each worker is a separate
# Python process (real parallelism — no GIL contention), writing uniquely-tagged
# shards into one dir. Restart-safe (workers continue their shard numbering).
#
# Run it in tmux on the dedicated box (alongside or instead of the trainers):
#   tmux new -s datagen
#   STREET=7 OUT=solver/neural/data/st7 bash solver/neural/datagen-24-7.sh
#   # detach: Ctrl-b d   |   reattach: tmux attach -t datagen   |   stop: Ctrl-C
#
# Env knobs (all optional):
#   STREET (7)  OUT (data/st<STREET>)  WORKERS (auto = cores-1)
#   ITERS (150) SAMPLES (60) PER_BOARD (30) BOARDS (200)
set -euo pipefail
cd "$(dirname "$0")"

STREET="${STREET:-7}"
OUT="${OUT:-data/st${STREET}}"
WORKERS="${WORKERS:-0}"
ITERS="${ITERS:-150}"
SAMPLES="${SAMPLES:-60}"
PER_BOARD="${PER_BOARD:-30}"
BOARDS="${BOARDS:-200}"
SHARD_SIZE="${SHARD_SIZE:-250}"   # flush a shard every N examples (durability)

if [ "$WORKERS" -le 0 ]; then
  CORES=$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu)
  WORKERS=$(( CORES > 1 ? CORES - 1 : 1 ))
fi

mkdir -p "$OUT"
echo "datagen 24/7: street=$STREET out=$OUT workers=$WORKERS iters=$ITERS samples=$SAMPLES per-board=$PER_BOARD"

pids=()
cleanup() {
  echo; echo "stopping $WORKERS workers..."
  for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
  echo "stopped."
}
trap cleanup INT TERM

# Workers run at low priority (nice 19) so the periodic validation — which needs
# a burst of CPU every 30 min — preempts them instead of starving on a saturated
# box. Datagen still uses every otherwise-idle cycle.
for ((i=0; i<WORKERS; i++)); do
  nice -n 19 python3 datagen_bucketed.py --street "$STREET" --out "$OUT" --tag "w$i" \
    --seed "$(( i * 7919 + 1 ))" --boards "$BOARDS" --per-board "$PER_BOARD" \
    --iters "$ITERS" --samples "$SAMPLES" --shard-size "$SHARD_SIZE" --forever &
  pids+=($!)
done
echo "launched workers: ${pids[*]}"
echo "shards -> $OUT  (count: ls $OUT/*.jsonl | wc -l)"
wait
