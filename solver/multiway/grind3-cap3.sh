#!/bin/bash
# ── razz3 CAP-3 perpetual grind ────────────────────────────────────────────
# A RICHER multiway blueprint than the converged cap-2 grind (grind3.sh).
#
# WHY cap-3: the cap-2 abstraction (grind3.sh) is CONVERGED (exploit 0.000) but
# its betting tree is TRUNCATED at 2 bets/street — it cannot represent 3-bet /
# 4-bet play. cap-3 restores one more raise level per street, a strictly more
# faithful game with REAL convergence headroom. Measured blowup is modest
# (~1.4x the infosets of cap-2 at equal 400-iter effort → ~1.5-3M infosets at
# convergence, ~150-300MB), so it is tractable on this 64GB box.
#
# SAFETY: writes to a SEPARATE file (razz3-cap3.json) with its own checkpoint —
# it NEVER touches the canonical cap-2 blueprint (solver/strategies/razz3.json),
# which stays live until cap-3 converges AND is validated more accurate.
#
# CUMULATIVE + restart-safe (same contract as grind3.sh): --iters is an ABSOLUTE
# lifetime target, train3.js resumes from <out>.ckpt.json and checkpoints
# incrementally + on SIGTERM. Single-thread (WORKERS=1): the DCFR-safe averaging
# merge is same-iteration-rate, so parallel only helps a COLD abstraction with a
# LARGE merge-every; the ladder below climbs a cold cap-3, but the per-round
# merge cost still favors single-thread until it is large — keep W=1 for now.
set -u
cd /Users/ethanibennett/Desktop/fg_solver/wsop || exit 1

LOG=/private/tmp/claude-501/-Users-ethanibennett-Desktop-fg-solver/5e033693-0662-4aeb-865e-a0a1df1d07a3/scratchpad/razz3_cap3_grind.log
OUT=solver/strategies/razz3-cap3.json
CKPT_EVERY=180
WORKERS=${WORKERS:-1}
MERGE_EVERY=${MERGE_EVERY:-20000}

# cap-3 has more infosets than cap-2, so it needs more iters for the same per-
# infoset visit count → the ladder tops out higher (5M vs cap-2's 3M).
LADDER="50000 100000 200000 350000 500000 750000 1000000 1500000 2000000 3000000 4000000 5000000"

echo "=== razz3 CAP-3 grind started $(date) pid=$$ ===" >> "$LOG"
for ITERS in $LADDER; do
  echo "" >> "$LOG"
  echo "=== PASS target=$ITERS (cumulative)  $(date) ===" >> "$LOG"
  nice -n 10 node --max-old-space-size=10240 solver/multiway/train3.js \
    --iters "$ITERS" --cap 3 --antes 8 --seed 999 --measure-hands 6000 \
    --workers "$WORKERS" --merge-every "$MERGE_EVERY" \
    --ckpt-every "$CKPT_EVERY" --out "$OUT" >> "$LOG" 2>&1
  echo "=== pass target=$ITERS exited code=$? $(date) ===" >> "$LOG"
done
# Once the ladder tops out and cap-3 converges, keep the blueprint/checkpoint
# warm WITHOUT the busy-spin bug from grind3.sh: sleep between no-op relaunches
# so a converged, target-reached run does not hammer a core re-parsing the
# checkpoint in a tight loop.
while true; do
  echo "" >> "$LOG"
  echo "=== PERPETUAL keep-warm target=5000000  $(date) ===" >> "$LOG"
  nice -n 10 node --max-old-space-size=10240 solver/multiway/train3.js \
    --iters 5000000 --cap 3 --antes 8 --seed 999 --measure-hands 6000 \
    --workers "$WORKERS" --merge-every "$MERGE_EVERY" \
    --ckpt-every "$CKPT_EVERY" --out "$OUT" >> "$LOG" 2>&1
  echo "=== perpetual pass exited code=$? $(date) ===" >> "$LOG"
  sleep 900   # 15-min keep-warm gap — no tight busy-spin on a reached target
done
