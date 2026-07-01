#!/usr/bin/env bash
# emd_run2.sh — CORRECTED EMD test: canonical value-ordered buckets (board-
# consistent ids) + DISTINCT per-worker seeds (real board diversity) + board-
# DISJOINT eval (honest generalization). NB=80 (6x cheaper solves than 200 ->
# 400 distinct boards in the budget). Detached, crash-resilient, external-only.
set -uo pipefail
ND=/Users/ethanibennett/Desktop/fg_solver/wsop/solver/neural
PY="$ND/.venv/bin/python"
EMD_OUT="$HOME/fg_solver_data.noindex/st7_emd_canon"
ARCH25="$HOME/fg_solver_data_archive.noindex/st7"
RES="$HOME/fg_solver_data.noindex/emd_verdict2.txt"
mkdir -p "$EMD_OUT"
log(){ echo "[$(date '+%m-%d %H:%M:%S')] $*" >> "$RES"; }
: > "$RES"
log "EMD CORRECTED TEST — canonical NB=80 buckets, distinct seeds, board-disjoint eval"
rm -f "$EMD_OUT"/shard_e*.jsonl

log "phase 1: datagen 4 workers x 100 boards x 10/board, NB=80, DISTINCT seeds (~400 boards, ~4000 ex)…"
i=0
for t in e0 e1 e2 e3; do
  OMP_NUM_THREADS=1 nice -n 10 "$PY" "$ND/datagen_emd.py" --out "$EMD_OUT" \
    --tag "$t" --boards 100 --per-board 10 --iters 150 --shard-size 100 \
    --n-buckets 80 --seed $((1 + i*100000)) >> "$EMD_OUT/gen_$t.log" 2>&1 &
  i=$((i+1))
done
wait
NEMD=$(find "$EMD_OUT" -name 'shard_e*.jsonl' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
log "phase 1 done: $NEMD EMD examples"

log "phase 2: board-disjoint eval — canonical EMD-80…"
echo "================ CANONICAL EMD-80 (board-disjoint) ================" >> "$RES"
OMP_NUM_THREADS=4 nice -n 10 "$PY" "$ND/eval_disjoint.py" --shards "$EMD_OUT" >> "$RES" 2>&1
log "phase 2 done"

if [ -d "$ARCH25" ] && [ "${NEMD:-0}" -gt 0 ]; then
  log "phase 3: board-disjoint eval — 25-bucket baseline (n=$NEMD)…"
  echo "============ 25-BUCKET (board-disjoint, n=$NEMD) ============" >> "$RES"
  OMP_NUM_THREADS=4 nice -n 10 "$PY" "$ND/eval_disjoint.py" --shards "$ARCH25" --max "$NEMD" >> "$RES" 2>&1
  log "phase 3 done"
fi
log "PIPELINE COMPLETE — compare UNSEEN-board R^2 (prior raw EMD: -0.32 ; 25-bucket: +0.28)"
