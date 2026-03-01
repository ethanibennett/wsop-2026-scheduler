#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Install Node.js dependencies
npm install

# Initialize the database if it doesn't exist
if [ ! -f poker-tournaments.db ]; then
  npm run init-db
fi

# Set JWT_SECRET for the dev server
echo 'export JWT_SECRET="dev-secret-not-for-production"' >> "$CLAUDE_ENV_FILE"
