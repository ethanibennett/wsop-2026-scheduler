#!/usr/bin/env bash
# emd_run.sh — EMD abstraction test, end to end (detached, crash-resilient).
#   phase 1: datagen, 4 niced workers, bounded (40 boards x 20/board ~= 3200 ex)
#   phase 2: train the EMD-200 net -> bucket-level R^2
#   phase 3: train a 25-bucket net on the SAME #examples (fair, data-matched)
# Writes ONLY to external .noindex dirs (never the scanned project tree).
set -uo pipefail
ND=/Users/ethanibennett/Desktop/fg_solver/wsop/solver/neural
PY="$ND/.venv/bin/python"
EMD_OUT="$HOME/fg_solver_data.noindex/st7_emd"
ARCH25="$HOME/fg_solver_data_archive.noindex/st7"
RES="$HOME/fg_solver_data.noindex/emd_verdict.txt"
mkdir -p "$EMD_OUT"

log(){ echo "[$(date '+%m-%d %H:%M:%S')] $*" >> "$RES"; }

: > "$RES"
log "EMD ABSTRACTION TEST — pipeline start (4 workers, iters=150, n_buckets=200)"

# fresh datagen run
rm -f "$EMD_OUT"/shard_e*.jsonl

# ── phase 1: datagen ──────────────────────────────────────────────────────────
log "phase 1: datagen 4 workers x 40 boards x 20/board (~3200 ex)…"
for t in e0 e1 e2 e3; do
  OMP_NUM_THREADS=1 nice -n 10 "$PY" "$ND/datagen_emd.py" --out "$EMD_OUT" \
    --tag "$t" --boards 40 --per-board 20 --iters 150 --shard-size 100 \
    >> "$EMD_OUT/gen_$t.log" 2>&1 &
done
wait
NEMD=$(find "$EMD_OUT" -name 'shard_e*.jsonl' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
log "phase 1 done: $NEMD EMD examples"

# ── phase 2: train EMD-200 net ────────────────────────────────────────────────
log "phase 2: training EMD-200 net (epochs=200)…"
echo "================ EMD-200 NET ================" >> "$RES"
OMP_NUM_THREADS=4 nice -n 10 "$PY" "$ND/validate.py" --shards "$EMD_OUT" \
  --save "$HOME/fg_solver_data.noindex/emd200_net.pt" >> "$RES" 2>&1
log "phase 2 done"

# ── phase 3: data-matched 25-bucket baseline ─────────────────────────────────
if [ -d "$ARCH25" ] && [ "${NEMD:-0}" -gt 0 ]; then
  log "phase 3: training 25-bucket baseline on $NEMD archived examples (data-matched)…"
  echo "============ 25-BUCKET BASELINE (n=$NEMD) ============" >> "$RES"
  OMP_NUM_THREADS=4 nice -n 10 "$PY" "$ND/validate.py" --shards "$ARCH25" \
    --max "$NEMD" --save "$HOME/fg_solver_data.noindex/st25_baseline.pt" >> "$RES" 2>&1
  log "phase 3 done"
else
  log "phase 3 SKIPPED (archive missing at $ARCH25 or no EMD data)"
fi

log "PIPELINE COMPLETE — compare the two R^2 (val) lines above"
