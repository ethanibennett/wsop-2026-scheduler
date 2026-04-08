#!/usr/bin/env bash
set -euo pipefail

# ── Config ──
PROD_URL="https://futurega.me"
LOCAL_URL="http://localhost:3001"
RENDER_API_KEY="${RENDER_API_KEY:-$(grep RENDER_API_KEY "$HOME/.claude/projects/-Users-ethanibennett-WSOP-scheduler/render.env" 2>/dev/null | cut -d= -f2)}"
RENDER_SERVICE_ID="srv-d6b8ujfgi27c73d5v3p0"
TMPDIR="${TMPDIR:-/tmp}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}▸${NC} $*"; }
warn()  { echo -e "${YELLOW}▸${NC} $*"; }
error() { echo -e "${RED}✕${NC} $*"; }

# ── Step 0: Check prerequisites ──
if [ -z "$RENDER_API_KEY" ]; then
  error "RENDER_API_KEY not set. Export it or add to render.env"
  exit 1
fi

# Prompt for admin credentials (used for DB sync)
if [ -z "${ADMIN_EMAIL:-}" ]; then
  read -rp "Admin email: " ADMIN_EMAIL
fi
if [ -z "${ADMIN_PASS:-}" ]; then
  read -rsp "Admin password: " ADMIN_PASS
  echo
fi

# ── Step 1: Build ──
info "Building..."
node build.js

# ── Step 2: Export local tournament DB ──
info "Logging in to local server..."
LOCAL_TOKEN=$(curl -sf "$LOCAL_URL/api/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null) || {
  warn "Could not log in to local server (is it running on port 3001?). Skipping local → prod sync."
  LOCAL_TOKEN=""
}

if [ -n "$LOCAL_TOKEN" ]; then
  info "Exporting local tournament database..."
  curl -sf "$LOCAL_URL/api/tournaments/export" \
    -H "Authorization: Bearer $LOCAL_TOKEN" > "$TMPDIR/deploy-local-export.json" || {
    warn "Failed to export local DB"
    LOCAL_TOKEN=""
  }
  if [ -n "$LOCAL_TOKEN" ]; then
    COUNT=$(python3 -c "import json; print(json.load(open('$TMPDIR/deploy-local-export.json'))['count'])")
    info "Exported $COUNT tournaments from local DB"
    # Prepare sync body
    python3 -c "import json; d=json.load(open('$TMPDIR/deploy-local-export.json')); json.dump({'tournaments':d['tournaments']}, open('$TMPDIR/deploy-sync-body.json','w'))"
  fi
fi

# ── Step 3: Git push ──
info "Pushing to origin/master..."
git push origin master

# ── Step 4: Wait for Render deploy ──
info "Waiting for Render deploy to start..."
sleep 5

# Poll Render API for deploy status
DEPLOY_ID=""
for i in $(seq 1 10); do
  DEPLOYS=$(curl -sf -H "Authorization: Bearer $RENDER_API_KEY" \
    "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys?limit=1" 2>/dev/null) || true
  if [ -n "$DEPLOYS" ]; then
    DEPLOY_ID=$(echo "$DEPLOYS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['deploy']['id'] if d else '')" 2>/dev/null) || true
    STATUS=$(echo "$DEPLOYS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['deploy']['status'] if d else '')" 2>/dev/null) || true
    if [ -n "$DEPLOY_ID" ]; then
      info "Deploy $DEPLOY_ID — status: $STATUS"
      break
    fi
  fi
  sleep 3
done

if [ -n "$DEPLOY_ID" ]; then
  info "Waiting for deploy to finish..."
  for i in $(seq 1 60); do
    STATUS=$(curl -sf -H "Authorization: Bearer $RENDER_API_KEY" \
      "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys/$DEPLOY_ID" \
      | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null) || true
    case "$STATUS" in
      live)
        info "Deploy is live!"
        break
        ;;
      build_failed|update_failed|canceled|deactivated)
        error "Deploy failed with status: $STATUS"
        exit 1
        ;;
      *)
        echo -n "."
        sleep 10
        ;;
    esac
  done
  echo
fi

# ── Step 5: Login to production ──
info "Logging in to production..."
PROD_TOKEN=$(curl -sf "$PROD_URL/api/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null) || {
  error "Could not log in to production. DB sync skipped."
  PROD_TOKEN=""
}

# ── Step 6: Sync local → production ──
if [ -n "$LOCAL_TOKEN" ] && [ -n "$PROD_TOKEN" ]; then
  info "Syncing local tournaments → production..."
  SYNC_RESULT=$(curl -sf "$PROD_URL/api/tournaments/sync" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $PROD_TOKEN" \
    -d @"$TMPDIR/deploy-sync-body.json" 2>/dev/null) || {
    error "Tournament sync to production failed"
    SYNC_RESULT=""
  }
  if [ -n "$SYNC_RESULT" ]; then
    echo "$SYNC_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"  → {d['inserted']} new, {d['updated']} updated, {d['skipped']} skipped\")"
  fi

  # Sync venue colors local → prod
  LOCAL_COLORS=$(curl -sf "$LOCAL_URL/api/venue-colors") || LOCAL_COLORS=""
  if [ -n "$LOCAL_COLORS" ] && [ "$LOCAL_COLORS" != "{}" ]; then
    info "Syncing venue colors → production..."
    echo "$LOCAL_COLORS" | python3 -c "
import sys, json, subprocess, urllib.parse
colors = json.load(sys.stdin)
for abbr, color in colors.items():
    subprocess.run([
        'curl', '-sf', '-X', 'PUT',
        '$PROD_URL/api/venue-colors/' + urllib.parse.quote(abbr, safe=''),
        '-H', 'Content-Type: application/json',
        '-H', 'Authorization: Bearer $PROD_TOKEN',
        '-d', json.dumps({'color': color})
    ], capture_output=True)
    print(f'  {abbr} → {color}')
" 2>/dev/null
  fi
fi

# ── Step 7: Sync production → local ──
if [ -n "$LOCAL_TOKEN" ] && [ -n "$PROD_TOKEN" ]; then
  info "Exporting production tournaments..."
  curl -sf "$PROD_URL/api/tournaments/export" \
    -H "Authorization: Bearer $PROD_TOKEN" > "$TMPDIR/deploy-prod-export.json" || {
    warn "Failed to export production DB"
  }
  if [ -f "$TMPDIR/deploy-prod-export.json" ]; then
    PROD_COUNT=$(python3 -c "import json; print(json.load(open('$TMPDIR/deploy-prod-export.json'))['count'])")
    info "Syncing $PROD_COUNT production tournaments → local..."
    python3 -c "import json; d=json.load(open('$TMPDIR/deploy-prod-export.json')); json.dump({'tournaments':d['tournaments']}, open('$TMPDIR/deploy-prod-sync.json','w'))"
    SYNC_RESULT=$(curl -sf "$LOCAL_URL/api/tournaments/sync" \
      -H 'Content-Type: application/json' \
      -H "Authorization: Bearer $LOCAL_TOKEN" \
      -d @"$TMPDIR/deploy-prod-sync.json" 2>/dev/null) || {
      error "Sync production → local failed"
      SYNC_RESULT=""
    }
    if [ -n "$SYNC_RESULT" ]; then
      echo "$SYNC_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"  → {d['inserted']} new, {d['updated']} updated, {d['skipped']} skipped\")"
    fi
  fi
elif [ -n "$PROD_TOKEN" ]; then
  warn "Local server not available — skipping production → local sync"
fi

# Cleanup temp files
rm -f "$TMPDIR/deploy-local-export.json" "$TMPDIR/deploy-sync-body.json" "$TMPDIR/deploy-prod-export.json" "$TMPDIR/deploy-prod-sync.json"

echo
info "Deploy complete ✓"
echo -e "  ${GREEN}→${NC} $PROD_URL"
