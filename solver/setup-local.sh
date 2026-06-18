#!/usr/bin/env bash
# ── One-command local setup for the CFR solver training stack ──
# Run this once on your dedicated machine from the repo root:
#   bash solver/setup-local.sh
# It installs deps, restores any checkpoint .gz files you dropped in
# (so training resumes instead of restarting), runs the test suite, and
# prints the exact supervisor command tuned to this machine's cores/RAM.
#
# Nothing here calls any network API — training is pure local compute.
set -euo pipefail

# repo root = parent of this script's dir
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Repo: $(pwd)"

# ── Node check ──
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found. Install Node.js 18+ and re-run." >&2; exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
echo "Node: $(node -v)"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: need Node 18+ (worker_threads/resourceLimits). Upgrade and re-run." >&2; exit 1
fi

# ── Deps ──
echo "Installing dependencies..."
npm install --no-audit --no-fund

# ── Restore checkpoints (resume instead of restart) ──
mkdir -p solver/strategies
shopt -s nullglob
restored=0
for gz in solver/strategies/*.ckpt.json.gz ./*.ckpt.json.gz ~/Downloads/*.ckpt.json.gz; do
  base="$(basename "${gz%.gz}")"
  out="solver/strategies/$base"
  echo "  restoring $base"
  gunzip -c "$gz" > "$out"
  restored=$((restored + 1))
done
if [ "$restored" -eq 0 ]; then
  echo "  (no *.ckpt.json.gz found — games will start from zero unless checkpoints already exist)"
  for g in td27 badugi stud8; do
    [ -f "solver/strategies/$g.ckpt.json" ] && echo "  found existing solver/strategies/$g.ckpt.json"
  done
fi

# ── Sanity: tests ──
echo "Running solver tests..."
npm run test:solver

# ── Detect cores + RAM (Linux or macOS) ──
if command -v nproc >/dev/null 2>&1; then CORES="$(nproc)"; else CORES="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"; fi
if [ -r /proc/meminfo ]; then
  RAM_GB=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo)
else
  RAM_BYTES="$(sysctl -n hw.memsize 2>/dev/null || echo 0)"
  RAM_GB=$(( RAM_BYTES / 1024 / 1024 / 1024 ))
fi
[ "${RAM_GB:-0}" -lt 1 ] && RAM_GB=8

# heap per child ≈ half the RAM split across ~2 concurrent big tables, capped.
HEAP=$(( RAM_GB * 1024 / 4 ))
[ "$HEAP" -gt 16384 ] && HEAP=16384
[ "$HEAP" -lt 4096 ] && HEAP=4096

echo
echo "════════════════════════════════════════════════════════════════"
echo " Setup complete.  Machine: ${CORES} cores, ${RAM_GB} GB RAM"
echo "════════════════════════════════════════════════════════════════"
echo " Launch continuous training (survives disconnect via tmux):"
echo
echo "   tmux new -s solver"
echo "   npm run supervise -- --heap ${HEAP} --meter-min 20"
echo "   # detach: Ctrl-b then d   |   reattach: tmux attach -t solver"
echo
echo " Watch the convergence curve:"
echo "   tail -f solver/strategies/curve.csv"
echo
echo " Heuristics + allocation report (free, no API):"
echo "   npm run analyst"
echo "════════════════════════════════════════════════════════════════"
