#!/bin/bash
# ── razz3 UNIFORM-DEAL grind — the DERIVED entry range source ────────────────
# Solves razz3 with a UNIFORM 3rd-street deal (--uniform) instead of the hand-
# tuned biased door-rank prior. The 3rd-street fold/enter EQUILIBRIUM frequencies
# then EMERGE from the solve = the principled entry range (solver/entry/
# DERIVATION_SPEC.md). This is the fix for BOTH hand-tuned entry approximations:
# the multiway deal (de-biased here) AND the oracle prior (reads P(enter) off this).
#
# Verified: --uniform flattens the door-rank histogram A..K to ~7.7% each (vs the
# biased ~17%->0.1% decay). Empirical negative result upstream: the equity fixed-
# point is ill-conditioned for entry (VPIP 69%@E*=0.20 -> 5.5%@1/m); the CFR prices
# the full betting tree so the horizon is right BY CONSTRUCTION and no threshold is
# tuned. cap-2 first (fastest convergence -> entry frequencies soonest); cap-3
# uniform is the later refinement.
#
# SAFETY: distinct --out (razz3-uniform.json) + own ckpt/log — NEVER touches the
# biased razz3.json / razz3-cap3.json blueprints or the running grinds.
set -u
cd /Users/ethanibennett/Desktop/fg_solver/wsop || exit 1

LOG=/private/tmp/claude-501/-Users-ethanibennett-Desktop-fg-solver/5e033693-0662-4aeb-865e-a0a1df1d07a3/scratchpad/razz3_uniform_grind.log
OUT=solver/strategies/razz3-uniform.json
CKPT_EVERY=180

# cap-2 converges around the biased cap-2's band (~1-3M iters, ~1M infosets).
LADDER="50000 100000 200000 350000 500000 750000 1000000 1500000 2000000 3000000"

echo "=== razz3 UNIFORM grind started $(date) pid=$$ ===" >> "$LOG"
for ITERS in $LADDER; do
  echo "" >> "$LOG"
  echo "=== PASS target=$ITERS (cumulative, uniform deal)  $(date) ===" >> "$LOG"
  nice -n 10 node --max-old-space-size=6144 solver/multiway/train3.js \
    --uniform --iters "$ITERS" --cap 2 --antes 8 --seed 999 --measure-hands 6000 \
    --ckpt-every "$CKPT_EVERY" --out "$OUT" >> "$LOG" 2>&1
  echo "=== pass target=$ITERS exited code=$? $(date) ===" >> "$LOG"
done
# keep-warm with a real sleep (no busy-spin) once converged
while true; do
  echo "" >> "$LOG"
  echo "=== PERPETUAL keep-warm target=3000000 (uniform)  $(date) ===" >> "$LOG"
  nice -n 10 node --max-old-space-size=6144 solver/multiway/train3.js \
    --uniform --iters 3000000 --cap 2 --antes 8 --seed 999 --measure-hands 6000 \
    --ckpt-every "$CKPT_EVERY" --out "$OUT" >> "$LOG" 2>&1
  echo "=== perpetual pass exited code=$? $(date) ===" >> "$LOG"
  sleep 900
done
