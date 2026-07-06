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
set -u
cd /Users/ethanibennett/Desktop/fg_solver/wsop || exit 1

LOG=/private/tmp/claude-501/-Users-ethanibennett-Desktop-fg-solver/5e033693-0662-4aeb-865e-a0a1df1d07a3/scratchpad/razz3_grind.log
OUT=solver/strategies/razz3.json
CKPT_EVERY=180  # seconds between incremental full-state checkpoints

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
    --ckpt-every "$CKPT_EVERY" --out "$OUT" >> "$LOG" 2>&1
  echo "=== perpetual pass exited code=$? $(date) ===" >> "$LOG"
done
