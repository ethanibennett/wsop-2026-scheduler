#!/usr/bin/env bash
# emd_study.sh — comprehensive EMD scaling + bucket-count study on the now-fast
# vectorized stack. Board-DISJOINT eval throughout (the only honest generalization
# metric). Answers: does canonical EMD's edge over the 25-grid hold/grow with more
# boards, and what bucket count is best? Datagen is CPU-bound so configs run
# SEQUENTIALLY (4 niced workers each); evals fan out cheaply. External + crash-safe.
set -uo pipefail
ND=/Users/ethanibennett/Desktop/fg_solver/wsop/solver/neural
PY="$ND/.venv/bin/python"
DD="$HOME/fg_solver_data.noindex"
RES="$DD/emd_study.txt"
log(){ echo "[$(date '+%m-%d %H:%M:%S')] $*" >> "$RES"; }
: > "$RES"
log "EMD SCALING + BUCKET-COUNT STUDY — board-disjoint, vectorized stack (prior 400-board pt: EMD-80 0.51 vs 25bkt 0.38)"

dg_emd(){ rm -f "$1"/shard_e*.jsonl 2>/dev/null; mkdir -p "$1"; local i=0
  for t in e0 e1 e2 e3; do
    OMP_NUM_THREADS=1 nice -n 10 "$PY" "$ND/datagen_emd.py" --out "$1" --tag "$t" \
      --boards "$2" --per-board 10 --iters 150 --shard-size 100 --n-buckets "$3" \
      --seed $((1+i*100000)) >> "$1/gen_$t.log" 2>&1 & i=$((i+1)); done; wait; }
dg_25(){ rm -f "$1"/shard_b*.jsonl 2>/dev/null; mkdir -p "$1"; local i=0
  for t in b0 b1 b2 b3; do
    OMP_NUM_THREADS=1 nice -n 10 "$PY" "$ND/datagen_bucketed.py" --street 7 --out "$1" --tag "$t" \
      --boards "$2" --per-board 10 --iters 150 --shard-size 100 \
      --seed $((1+i*100000)) >> "$1/gen_$t.log" 2>&1 & i=$((i+1)); done; wait; }
evaldj(){ OMP_NUM_THREADS=4 nice -n 10 "$PY" "$ND/eval_disjoint.py" --shards "$1" --max "$2" >> "$RES" 2>&1; }

log "datagen EMD-80 (1600 boards)…";  dg_emd "$DD/study_emd80" 400 80
log "  EMD-80: $(find "$DD/study_emd80" -name 'shard_e*' -exec cat {} + 2>/dev/null|wc -l|tr -d ' ') ex"
log "datagen 25-bucket (1600 boards)…"; dg_25 "$DD/study_25" 400
log "  25-bucket: $(find "$DD/study_25" -name 'shard_b*' -exec cat {} + 2>/dev/null|wc -l|tr -d ' ') ex"
log "datagen EMD-40 (800 boards)…";    dg_emd "$DD/study_emd40" 200 40
log "  EMD-40 done"

echo "==== SCALING: canonical EMD-80 (board-disjoint) ====" >> "$RES"
for m in 4000 8000 16000; do echo "-- EMD-80 ~$((m/10)) boards --" >> "$RES"; evaldj "$DD/study_emd80" $m; done
echo "==== SCALING: 25-bucket grid (board-disjoint) ====" >> "$RES"
for m in 4000 8000 16000; do echo "-- 25bkt ~$((m/10)) boards --" >> "$RES"; evaldj "$DD/study_25" $m; done
echo "==== BUCKET-COUNT @ ~800 boards ====" >> "$RES"
echo "-- EMD-40 ~800 boards --" >> "$RES"; evaldj "$DD/study_emd40" 8000
echo "-- EMD-80 ~800 boards --" >> "$RES"; evaldj "$DD/study_emd80" 8000
echo "-- 25bkt ~800 boards --" >> "$RES"; evaldj "$DD/study_25" 8000
log "STUDY COMPLETE — scaling curves + bucket-count comparison above"
