#!/usr/bin/env bash
# Launch a Claude Code Remote Control session for the WSOP 2027 Console that you
# can steer from your phone (Claude app -> Code tab, or claude.ai/code).
#
# Run this on your LOCAL machine, inside a clone of the repo. It cannot run in
# the cloud web environment — Remote Control runs Claude on your own laptop.
#
#   ./wsop-console/remote-control.sh
#
# Requirements:
#   - Claude Code v2.1.51+        (check: claude --version)
#   - Logged in via /login on a Pro/Max/Team/Enterprise plan (not an API key)
#   - Laptop stays awake while the session is live
set -euo pipefail

BRANCH="master"   # all console work lives on master (Render auto-deploys it)
NAME="WSOP Console"

# Move to the repo root regardless of where this is invoked from.
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if ! command -v claude >/dev/null 2>&1; then
  echo "✗ 'claude' CLI not found. Install Claude Code, then re-run this script."
  echo "  https://code.claude.com/docs/en/remote-control.md"
  exit 1
fi

echo "→ Syncing $BRANCH …"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH" || true

echo "→ Installing app dependencies (wsop-console/app) …"
( cd wsop-console/app && npm install --no-audit --no-fund )

echo
echo "→ Starting Remote Control as \"$NAME\"."
echo "  Open the Claude phone app (Code tab) or claude.ai/code, find the"
echo "  \"$NAME\" session, and steer it from there."
echo "  Keep this terminal running and your laptop awake. Ctrl-C to stop."
echo "  Orientation for the session: wsop-console/HANDOFF.md"
echo
exec claude remote-control --name "$NAME"
