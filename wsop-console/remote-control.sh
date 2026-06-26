#!/usr/bin/env bash
# Pull the WSOP 2027 Console branch and launch a Claude Code Remote Control
# session you can steer from your phone (Claude app -> Code tab).
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

BRANCH="claude/wsop-2027-pwa-console-q5vem7"
NAME="WSOP Console"

# Move to the repo root regardless of where this is invoked from.
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "→ Fetching $BRANCH …"
git fetch origin "$BRANCH"

echo "→ Checking out $BRANCH …"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH" || true

echo "→ Installing app dependencies (wsop-console/app) …"
( cd wsop-console/app && npm install )

if ! command -v claude >/dev/null 2>&1; then
  echo
  echo "✗ 'claude' CLI not found. Install Claude Code, then re-run this script."
  echo "  https://code.claude.com/docs/en/remote-control.md"
  exit 1
fi

echo
echo "→ Starting Remote Control as \"$NAME\"."
echo "  Scan the QR code with the Claude phone app (Code tab), or open the"
echo "  printed URL. Keep this terminal running and your laptop awake."
echo
exec claude remote-control --name "$NAME"
