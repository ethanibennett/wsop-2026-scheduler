#!/bin/bash
# ── stud8 hi/lo multiway UNIFORM-DEAL grind — the DERIVED stud8 entry source ──
# Solves stud8-3way (--game stud8) with a UNIFORM 3rd-street deal so the entry
# range EMERGES from the CFR (the same de-circularization as razz's uniform grind),
# giving stud8 a horizon-correct, threshold-free entry range to REPLACE the ill-
# conditioned equity stopgap (solver/entry/DERIVATION_SPEC.md). Extract with
# extract-cfr-entry.js once converged (note: the extractor's bucketOf is razz-
# specific — it will need a stud8 bucket adapter before wiring stud8's oracle).
#
# SAFETY: distinct --out (stud8-3way-uniform.json), own ckpt/log — touches nothing
# else. cap-2 first (fastest). Engine validated: 42/42 gates + trains (commit 4a10b15).
set -u
cd /Users/ethanibennett/Desktop/fg_solver/wsop || exit 1

LOG=/private/tmp/claude-501/-Users-ethanibennett-Desktop-fg-solver/5e033693-0662-4aeb-865e-a0a1df1d07a3/scratchpad/stud8_uniform_grind.log
OUT=solver/strategies/stud8-3way-uniform.json
CKPT_EVERY=180
LADDER="50000 100000 200000 350000 500000 750000 1000000 1500000 2000000 3000000"

echo "=== stud8 UNIFORM grind started $(date) pid=$$ ===" >> "$LOG"
for ITERS in $LADDER; do
  echo "" >> "$LOG"
  echo "=== PASS target=$ITERS (cumulative, stud8 uniform)  $(date) ===" >> "$LOG"
  nice -n 12 node --max-old-space-size=6144 solver/multiway/train3.js \
    --game stud8 --uniform --iters "$ITERS" --cap 2 --antes 8 --seed 999 --measure-hands 6000 \
    --ckpt-every "$CKPT_EVERY" --out "$OUT" >> "$LOG" 2>&1
  echo "=== pass target=$ITERS exited code=$? $(date) ===" >> "$LOG"
done
while true; do
  echo "" >> "$LOG"
  echo "=== PERPETUAL keep-warm target=3000000 (stud8 uniform)  $(date) ===" >> "$LOG"
  nice -n 12 node --max-old-space-size=6144 solver/multiway/train3.js \
    --game stud8 --uniform --iters 3000000 --cap 2 --antes 8 --seed 999 --measure-hands 6000 \
    --ckpt-every "$CKPT_EVERY" --out "$OUT" >> "$LOG" 2>&1
  echo "=== perpetual pass exited code=$? $(date) ===" >> "$LOG"
  sleep 900
done
