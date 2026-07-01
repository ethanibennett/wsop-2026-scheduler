#!/usr/bin/env bash
# emd_match.sh — apples-to-apples 25-bucket baseline at the SAME board structure
# as the canonical EMD-80 run (400 boards, per_board=10, distinct seeds), so the
# board-disjoint comparison isolates the BUCKETING effect (25-grid vs canon-EMD-80)
# instead of confounding it with board diversity. Detached, external-only.
set -uo pipefail
ND=/Users/ethanibennett/Desktop/fg_solver/wsop/solver/neural
PY="$ND/.venv/bin/python"
OUT="$HOME/fg_solver_data.noindex/st7_25_matched"
RES="$HOME/fg_solver_data.noindex/emd_match.txt"
mkdir -p "$OUT"
log(){ echo "[$(date '+%m-%d %H:%M:%S')] $*" >> "$RES"; }
: > "$RES"
log "MATCHED 25-BUCKET BASELINE — same structure as EMD-80 (400 boards, per_board=10)"
rm -f "$OUT"/shard_b*.jsonl

log "phase 1: datagen 4 workers x 100 boards x 10/board, 25-bucket, distinct seeds…"
i=0
for t in b0 b1 b2 b3; do
  OMP_NUM_THREADS=1 nice -n 10 "$PY" "$ND/datagen_bucketed.py" --street 7 --out "$OUT" \
    --tag "$t" --boards 100 --per-board 10 --iters 150 --shard-size 100 \
    --seed $((1 + i*100000)) >> "$OUT/gen_$t.log" 2>&1 &
  i=$((i+1))
done
wait
N=$(find "$OUT" -name 'shard_b*.jsonl' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
log "phase 1 done: $N examples"

log "phase 2: board-disjoint eval — 25-bucket at matched structure…"
echo "======== 25-BUCKET MATCHED (board-disjoint, 400 boards, per_board=10) ========" >> "$RES"
OMP_NUM_THREADS=4 nice -n 10 "$PY" "$ND/eval_disjoint.py" --shards "$OUT" >> "$RES" 2>&1
log "DONE — compare to canonical EMD-80 R^2=0.5103 (unmatched 25-bucket was 0.3341)"
