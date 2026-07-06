#!/bin/bash
# ── razz3 perpetual grind ──────────────────────────────────────────────────
# "Never idle" accuracy floor for the 3-player razz blueprint.
# Runs train3.js in an escalating, restart-safe loop, writing the average
# strategy to solver/strategies/razz3.json (a NEW file — never touches the
# 2-player razz.json).
#
# CUMULATIVE (the whole point): --iters is an ABSOLUTE lifetime target and
# train3.js RESUMES from solver/strategies/razz3.ckpt.json (full regret + avg-
# strat state) on every launch. So each ladder rung continues the SAME trainer
# toward a higher total — it does NOT restart from scratch. train3.js also
# checkpoints INCREMENTALLY (--ckpt-every) and on SIGTERM/SIGINT, so a kill
# (OOM / lid / rotate) loses at most a few minutes, never the whole rung.
# A rung whose target was already reached is a fast no-op, so the ladder is
# fully restart-safe: relaunching the grind just picks up where it left off.
#
# Targets the ~1-3M infoset cap-2 abstraction (cap=2, antes=8, opp-pair key).
#
# DATA-PARALLEL (2026-07-06): train3.js CAN run W-worker data-parallel MCCFR
# (--workers) with a DCFR-SAFE AVERAGING merge (solver/multiway/parallel3.js +
# mccfr3-worker.js). Verified by solver/multiway/gate3.js on the exactly-
# enumerable razz3-reduced game: parallel W=2 exploitability <= single-thread at
# equal effective work (GREEN; a broken additive-delta merge goes RED there —
# the gate catches the exact HU bug from CLAUDE.md 2026-06-18).
#
# WHY THIS GRIND STAYS SINGLE-THREAD (WORKERS=1 default): the averaging merge is
# SAME-iteration-rate (2 workers each doing N iters advance the counter by N, not
# 2N — the parallelism buys VARIANCE REDUCTION, not more iterations). On the full
# ~100MB table each merge round also costs ~6-8s to serialize/broadcast/merge.
# Measured A/B from the live 774k checkpoint (already converged, exploit=0.000):
#   single-thread   +20000 = 513.8s (38.9 it/s)   exploit 0.000
#   parallel W=2    +20000 = 566.0s (35.3 it/s)    exploit 0.000
# i.e. on this ALREADY-CONVERGED blueprint parallel advances ~10% SLOWER with
# zero accuracy gain — so flipping it on would DEGRADE the grind. Variance
# reduction only pays when there is exploitability left to remove; use WORKERS>=2
# (with a LARGE MERGE_EVERY to amortize the merge) for a COLD/larger abstraction
# with real convergence headroom, NOT this converged cap-2 grind.
set -u
cd /Users/ethanibennett/Desktop/fg_solver/wsop || exit 1

LOG=/private/tmp/claude-501/-Users-ethanibennett-Desktop-fg-solver/5e033693-0662-4aeb-865e-a0a1df1d07a3/scratchpad/razz3_grind.log
OUT=solver/strategies/razz3.json
CKPT_EVERY=180  # seconds between incremental full-state checkpoints
WORKERS=${WORKERS:-1}       # 1 = byte-identical single-thread (see note above); WORKERS=2 opt-in for cold/large abstractions
MERGE_EVERY=${MERGE_EVERY:-20000}  # iters per parallel round (large: amortize the ~100MB merge) — only used when WORKERS>=2

# Escalating ABSOLUTE-target ladder. Each rung raises the lifetime iteration
# target; train3.js resumes the checkpoint and trains the delta, climbing
# cumulatively toward the 1-3M band.
LADDER="20000 50000 100000 200000 350000 500000 750000 1000000 1500000 2000000 3000000"

echo "=== razz3 grind started $(date) pid=$$ ===" >> "$LOG"
for ITERS in $LADDER; do
  echo "" >> "$LOG"
  echo "=== PASS target=$ITERS (cumulative)  $(date) ===" >> "$LOG"
  nice -n 10 node --max-old-space-size=6144 solver/multiway/train3.js \
    --iters "$ITERS" --cap 2 --antes 8 --seed 999 --measure-hands 6000 \
    --workers "$WORKERS" --merge-every "$MERGE_EVERY" \
    --ckpt-every "$CKPT_EVERY" --out "$OUT" >> "$LOG" 2>&1
  echo "=== pass target=$ITERS exited code=$? $(date) ===" >> "$LOG"
done
# After the ladder tops out, keep pushing the top target forever so the grind
# is genuinely perpetual (never idle) and the on-disk blueprint/checkpoint stay
# warm. Each relaunch resumes the checkpoint, so this keeps accumulating.
while true; do
  echo "" >> "$LOG"
  echo "=== PERPETUAL target=3000000  $(date) ===" >> "$LOG"
  nice -n 10 node --max-old-space-size=6144 solver/multiway/train3.js \
    --iters 3000000 --cap 2 --antes 8 --seed 999 --measure-hands 6000 \
    --workers "$WORKERS" --merge-every "$MERGE_EVERY" \
    --ckpt-every "$CKPT_EVERY" --out "$OUT" >> "$LOG" 2>&1
  echo "=== perpetual pass exited code=$? $(date) ===" >> "$LOG"
done
