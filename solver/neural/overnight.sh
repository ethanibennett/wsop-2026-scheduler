#!/usr/bin/env bash
# Overnight orchestration. Keeps the bucketed data grind alive and, on a
# schedule, re-validates the value net on the accumulating data — logging a
# SCALING CURVE (val/train MAE vs #examples) to data/validation_curve.csv and
# saving the latest net to nets/st7_latest.pt. By morning the curve answers the
# one open question: does the val/train gap CLOSE as data grows (=> the approach
# works, scale it) or PLATEAU (=> 25 buckets is the limit, build EMD bucketing)?
#
# Run detached:   nohup bash solver/neural/overnight.sh > /dev/null 2>&1 &
# Watch:          tail -f solver/neural/data/overnight.log
#                 column -s, -t solver/neural/data/validation_curve.csv
# Stop:           kill $(cat solver/neural/data/overnight.pid)
set -uo pipefail
cd "$(dirname "$0")"
PY=.venv/bin/python
SHARDS="${SHARDS:-data/st7}"
EVERY="${EVERY:-1800}"        # seconds between validation runs (30 min)
EPOCHS="${EPOCHS:-200}"
MAX_RUNS="${MAX_RUNS:-24}"    # ~12 hours, then exit cleanly
WORKERS="${WORKERS:-3}"
mkdir -p nets "$SHARDS"
echo $$ > data/overnight.pid

grind_alive() { pgrep -f "datagen_bucketed.py --street 7 --out $SHARDS" >/dev/null; }
ensure_grind() {
  if ! grind_alive; then
    echo "[$(date +%H:%M:%S)] grind not running — (re)launching $WORKERS workers"
    nohup env STREET=7 OUT="$SHARDS" WORKERS="$WORKERS" ITERS=150 SAMPLES=60 \
      SHARD_SIZE="${SHARD_SIZE:-25}" bash datagen-24-7.sh > data/datagen.log 2>&1 &
    echo $! > data/datagen.pid
  fi
}

echo "[$(date +%H:%M:%S)] overnight start: validate $SHARDS every ${EVERY}s, up to $MAX_RUNS runs"
for run in $(seq 1 "$MAX_RUNS"); do
  ensure_grind
  n=$(cat "$SHARDS"/*.jsonl 2>/dev/null | wc -l | tr -d ' ')
  if [ "${n:-0}" -ge 200 ]; then
    echo "[$(date +%H:%M:%S)] run $run/$MAX_RUNS: validating on $n examples"
    if "$PY" validate.py --shards "$SHARDS" --epochs "$EPOCHS" \
         --log data/validation_curve.csv --save nets/st7_latest.pt \
         >> data/overnight.log 2>&1; then
      tail -1 data/validation_curve.csv | sed "s/^/[$(date +%H:%M:%S)] curve: /"
    else
      echo "[$(date +%H:%M:%S)] run $run validate FAILED (see data/overnight.log)"
    fi
  else
    echo "[$(date +%H:%M:%S)] run $run: only $n examples, skipping"
  fi
  perl -e "select(undef,undef,undef,$EVERY)"
done
echo "[$(date +%H:%M:%S)] overnight done after $MAX_RUNS runs ($(cat "$SHARDS"/*.jsonl 2>/dev/null | wc -l | tr -d ' ') examples)"
