#!/usr/bin/env bash
set -euo pipefail

# ── Flags ──
DEPLOY_IOS=false
for arg in "$@"; do
  case "$arg" in
    --ios) DEPLOY_IOS=true ;;
  esac
done

# ── Config ──
PROD_URL="https://futurega.me"
LOCAL_URL="http://localhost:3001"
RENDER_API_KEY="${RENDER_API_KEY:-$(grep RENDER_API_KEY "$HOME/.claude/projects/-Users-ethanibennett-WSOP-scheduler/render.env" 2>/dev/null | cut -d= -f2)}"
RENDER_SERVICE_ID="srv-d6b8ujfgi27c73d5v3p0"
TMPDIR="${TMPDIR:-/tmp}"

# App Store Connect API Key
ASC_KEY_ID="UCFMFW9636"
ASC_ISSUER_ID="764173fa-5f16-4c11-a782-a2e8e153e929"
ASC_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"

# iOS project paths
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
IOS_PROJECT="$PROJECT_ROOT/ios/App/App.xcodeproj"
IOS_SCHEME="futurega.me"
EXPORT_OPTIONS="$PROJECT_ROOT/ios/ExportOptions.plist"
ARCHIVE_PATH="$TMPDIR/futuregame.xcarchive"
EXPORT_PATH="$TMPDIR/futuregame-export"

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

# Admin credentials for DB sync — check render.env, then env vars, then prompt
CREDS_FILE="$HOME/.claude/projects/-Users-ethanibennett-WSOP-scheduler/render.env"
if [ -z "${ADMIN_EMAIL:-}" ]; then
  ADMIN_EMAIL=$(grep '^ADMIN_EMAIL=' "$CREDS_FILE" 2>/dev/null | cut -d= -f2-) || true
fi
if [ -z "${ADMIN_PASS:-}" ]; then
  ADMIN_PASS=$(grep '^ADMIN_PASS=' "$CREDS_FILE" 2>/dev/null | cut -d= -f2-) || true
fi
if [ -z "${ADMIN_EMAIL:-}" ]; then
  read -rp "Admin email: " ADMIN_EMAIL
  # Save for next time
  echo "ADMIN_EMAIL=$ADMIN_EMAIL" >> "$CREDS_FILE"
fi
if [ -z "${ADMIN_PASS:-}" ]; then
  read -rsp "Admin password: " ADMIN_PASS
  echo
  # Save for next time
  echo "ADMIN_PASS=$ADMIN_PASS" >> "$CREDS_FILE"
fi

# ── Step 1: Build web ──
info "Building web assets..."
node build.js

if $DEPLOY_IOS; then
  # ── Step 2: Bump iOS build number, reconciled with App Store Connect ──
  # Apple's ExportOptions.plist has manageAppVersionAndBuildNumber=true, which
  # lets App Store Connect auto-bump past any conflict. That caused the local
  # pbxproj to silently drift from the actual TestFlight number. Instead, query
  # ASC for the highest build number on this bundle and set NEW_BUILD =
  # max(local, apple) + 1 so the pushed pbxproj matches what Apple accepts.
  BUNDLE_ID=$(node -e "console.log(require('./capacitor.config.json').appId)")
  CURRENT_BUILD=$(grep -m1 'CURRENT_PROJECT_VERSION' "$IOS_PROJECT/project.pbxproj" | sed 's/.*= //;s/;.*//')
  APPLE_LATEST=$(node "$PROJECT_ROOT/scripts/asc-latest-build.js" \
    "$ASC_KEY_PATH" "$ASC_KEY_ID" "$ASC_ISSUER_ID" "$BUNDLE_ID" 2>/dev/null || echo "0")
  # If ASC lookup failed or returned 0, fall back to local+1; otherwise bump
  # past whatever Apple has.
  if [ -z "$APPLE_LATEST" ] || [ "$APPLE_LATEST" = "0" ] || [ "$APPLE_LATEST" -lt "$CURRENT_BUILD" ]; then
    NEW_BUILD=$((CURRENT_BUILD + 1))
    info "iOS build number: $CURRENT_BUILD → $NEW_BUILD (local counter; ASC reported $APPLE_LATEST)"
  else
    NEW_BUILD=$((APPLE_LATEST + 1))
    info "iOS build number: $CURRENT_BUILD → $NEW_BUILD (reconciled past ASC latest $APPLE_LATEST for $BUNDLE_ID)"
  fi
  sed -i '' "s/CURRENT_PROJECT_VERSION = $CURRENT_BUILD;/CURRENT_PROJECT_VERSION = $NEW_BUILD;/g" "$IOS_PROJECT/project.pbxproj"

  # ── Step 3: Sync web assets to iOS ──
  info "Syncing to iOS..."
  npx cap sync ios 2>&1 | grep -E "✔|error" || true
fi

# ── Step 4: Export local tournament DB ──
# Start local server if not running
LOCAL_STARTED=false
if ! curl -sf "$LOCAL_URL/api/tournaments" > /dev/null 2>&1; then
  info "Starting local server for DB sync..."
  JWT_SECRET="dev-secret-not-for-production" DB_PATH="$PROJECT_ROOT/poker-tournaments.db" node "$PROJECT_ROOT/server.js" &
  LOCAL_PID=$!
  LOCAL_STARTED=true
  # Wait for server to be ready
  for i in $(seq 1 15); do
    if curl -sf "$LOCAL_URL/api/tournaments" > /dev/null 2>&1; then break; fi
    sleep 1
  done
fi

info "Logging in to local server..."
LOCAL_TOKEN=$(curl -sf "$LOCAL_URL/api/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null) || {
  warn "Could not log in to local server. Skipping local → prod sync."
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
    python3 -c "import json; d=json.load(open('$TMPDIR/deploy-local-export.json')); json.dump({'tournaments':d['tournaments']}, open('$TMPDIR/deploy-sync-body.json','w'))"
  fi
fi

# ── Step 5: Git push ──
info "Pushing to origin/master..."
git push origin master

if $DEPLOY_IOS; then
  # ── Step 6: Archive iOS app ──
  info "Archiving iOS app..."
  xcodebuild -project "$IOS_PROJECT" \
    -scheme "$IOS_SCHEME" \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath "$ARCHIVE_PATH" \
    archive \
    -allowProvisioningUpdates \
    -authenticationKeyPath "$ASC_KEY_PATH" \
    -authenticationKeyID "$ASC_KEY_ID" \
    -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
    2>&1 | tail -3

  if [ ! -d "$ARCHIVE_PATH" ]; then
    error "Archive failed"
    exit 1
  fi
  info "Archive succeeded"

  # ── Step 7: Upload to TestFlight ──
  info "Uploading to TestFlight..."
  rm -rf "$EXPORT_PATH"
  xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportOptionsPlist "$EXPORT_OPTIONS" \
    -exportPath "$EXPORT_PATH" \
    -allowProvisioningUpdates \
    -authenticationKeyPath "$ASC_KEY_PATH" \
    -authenticationKeyID "$ASC_KEY_ID" \
    -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
    2>&1 | tail -5

  if [ $? -eq 0 ]; then
    info "TestFlight upload complete (build $NEW_BUILD)"
  else
    warn "TestFlight upload failed — you may need to upload from Xcode Organizer"
  fi
else
  info "Skipping iOS build (use --ios to include TestFlight)"
fi

# ── Step 8: Wait for Render deploy ──
info "Waiting for Render deploy to start..."
sleep 5

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

# ── Step 9: Login to production ──
info "Logging in to production..."
PROD_TOKEN=""
for attempt in 1 2 3; do
  PROD_TOKEN=$(curl -sf -m 30 "$PROD_URL/api/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null) && break
  warn "Login attempt $attempt failed, retrying in 5s..."
  PROD_TOKEN=""
  sleep 5
done
if [ -z "$PROD_TOKEN" ]; then
  error "Could not log in to production after 3 attempts. DB sync skipped."
fi

# ── Step 10: Sync local → production ──
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

# ── Step 11: Sync production → local ──
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

# Kill auto-started local server
if $LOCAL_STARTED; then
  info "Stopping local server (PID $LOCAL_PID)..."
  kill "$LOCAL_PID" 2>/dev/null || true
  wait "$LOCAL_PID" 2>/dev/null || true
fi

# Cleanup temp files
rm -f "$TMPDIR/deploy-local-export.json" "$TMPDIR/deploy-sync-body.json" "$TMPDIR/deploy-prod-export.json" "$TMPDIR/deploy-prod-sync.json"
rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH"

echo
info "Deploy complete ✓"
echo -e "  ${GREEN}Web:${NC}       $PROD_URL"
if $DEPLOY_IOS; then
  echo -e "  ${GREEN}TestFlight:${NC} Build $NEW_BUILD"
fi
