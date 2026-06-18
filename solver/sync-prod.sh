#!/usr/bin/env bash
# ── Sync trained solver strategies to production ─────────────
# The dedicated box improves solver/strategies/<game>.json as it trains.
# Production (Render) serves those committed files from git, so shipping an
# improvement = commit the files + deploy. This script does it safely:
#   1. REVIEW   — show each game's iteration delta (working tree vs prod) and
#                 its current exploitability lower bound, so you never ship a
#                 regression by accident.
#   2. COMMIT   — commit ONLY the strategy files on the current branch + push.
#   3. DEPLOY   — (only with --deploy) put just those files onto master via a
#                 throwaway worktree — no feature-branch merge — push master,
#                 and poll Render until the deploy is live.
#
# Usage:
#   bash solver/sync-prod.sh --dry-run        # review only, change nothing
#   bash solver/sync-prod.sh                  # review + commit/push current branch
#   bash solver/sync-prod.sh --deploy         # + ship strategies to master & Render
#   bash solver/sync-prod.sh --deploy --yes   # no prompts (for cron)
#   bash solver/sync-prod.sh --hands 40000    # tighter meter pass during review
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DEPLOY=false; YES=false; DRYRUN=false; HANDS=8000
while [ $# -gt 0 ]; do
  case "$1" in
    --deploy) DEPLOY=true ;;
    --yes) YES=true ;;
    --dry-run) DRYRUN=true ;;
    --hands) HANDS="$2"; shift ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
  shift
done

RENDER_API_KEY="${RENDER_API_KEY:-$(grep RENDER_API_KEY "$HOME/.claude/projects/-Users-ethanibennett-WSOP-scheduler/render.env" 2>/dev/null | cut -d= -f2 || true)}"
RENDER_SERVICE_ID="${RENDER_SERVICE_ID:-srv-d6b8ujfgi27c73d5v3p0}"
PROD_BRANCH="${PROD_BRANCH:-master}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

metaField() { node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))[process.argv[2]])}catch(e){console.log('—')}" "$1" "$2" 2>/dev/null || echo '—'; }

# Games = those with a strategy file present.
GAMES=()
for f in solver/strategies/*.json; do
  [ -e "$f" ] || continue
  case "$f" in *.meta.json|*.ckpt.json) continue ;; esac
  GAMES+=("$(basename "${f%.json}")")
done
if [ "${#GAMES[@]}" -eq 0 ]; then echo "No strategy files in solver/strategies/." >&2; exit 1; fi

git fetch -q origin "$PROD_BRANCH" 2>/dev/null || true

echo "════════════════════════════════════════════════════════════════"
echo " Strategy sync review   (branch: $BRANCH -> prod: $PROD_BRANCH)"
echo "════════════════════════════════════════════════════════════════"
printf " %-8s %14s %14s %12s   %s\n" game prod_iters new_iters infosets "exploit_lb (chips/hand)"
CHANGED=false
for g in "${GAMES[@]}"; do
  new_iters="$(metaField "solver/strategies/$g.meta.json" iterations)"
  infosets="$(metaField "solver/strategies/$g.meta.json" infosets)"
  prod_iters="$(git show "origin/$PROD_BRANCH:solver/strategies/$g.meta.json" 2>/dev/null \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).iterations)}catch(e){console.log('—')}})" 2>/dev/null || echo '—')"
  exploit="$(node solver/exploitability.js --game "$g" --hands "$HANDS" 2>/dev/null | sed -n 's/.*EXPLOITABILITY (lower bound): \([0-9.]*\).*/\1/p' | head -1)"
  [ -z "$exploit" ] && exploit="n/a"
  printf " %-8s %14s %14s %12s   %s\n" "$g" "$prod_iters" "$new_iters" "$infosets" "$exploit"
  if ! git diff --quiet -- "solver/strategies/$g.json" "solver/strategies/$g.meta.json" 2>/dev/null; then CHANGED=true; fi
done
echo "════════════════════════════════════════════════════════════════"

if [ "$CHANGED" = false ]; then
  echo "No uncommitted strategy changes vs HEAD."
  if [ "$DEPLOY" = false ]; then exit 0; fi
fi

if [ "$DRYRUN" = true ]; then echo "(dry run — nothing committed or pushed)"; exit 0; fi

confirm() {
  [ "$YES" = true ] && return 0
  read -r -p "$1 [y/N] " a; [ "$a" = y ] || [ "$a" = Y ]
}

push_retry() { # $1 = refspec
  for i in 1 2 3 4; do
    git push origin "$1" && return 0
    echo "push failed, retry $i..."; sleep $((2 ** i))
  done
  return 1
}

# ── Commit on the current branch ──
if [ "$CHANGED" = true ]; then
  if confirm "Commit updated strategies on '$BRANCH' and push?"; then
    SUMMARY="$(for g in "${GAMES[@]}"; do printf "%s %s; " "$g" "$(metaField "solver/strategies/$g.meta.json" iterations)"; done)"
    git add solver/strategies/*.json solver/strategies/*.meta.json
    git commit -q -m "Update solver strategies (${SUMMARY})"
    push_retry "$BRANCH"
    echo "Committed + pushed to $BRANCH."
  else
    echo "Aborted."; exit 0
  fi
fi

# ── Deploy: ship just the strategy files to master + Render ──
if [ "$DEPLOY" = true ]; then
  if ! confirm "Deploy these strategies to PRODUCTION ($PROD_BRANCH -> Render)?"; then echo "Skipped deploy."; exit 0; fi
  WT="$(mktemp -d)"
  echo "Staging strategies onto $PROD_BRANCH in a worktree..."
  git worktree add -q --detach "$WT" "origin/$PROD_BRANCH"
  mkdir -p "$WT/solver/strategies"
  cp solver/strategies/*.json solver/strategies/*.meta.json "$WT/solver/strategies/"
  (
    cd "$WT"
    git add solver/strategies/*.json solver/strategies/*.meta.json
    if git diff --cached --quiet; then echo "Production already up to date."; exit 0; fi
    git commit -q -m "Sync solver strategies to production"
    for i in 1 2 3 4; do git push origin "HEAD:$PROD_BRANCH" && break || { echo "retry $i"; sleep $((2 ** i)); }; done
  )
  git worktree remove --force "$WT" 2>/dev/null || true

  # Poll Render (auto-deploys on the master push), mirroring deploy.sh.
  if [ -n "$RENDER_API_KEY" ]; then
    echo "Waiting for Render deploy..."
    sleep 5
    DEPLOY_ID=""
    for i in $(seq 1 10); do
      D=$(curl -sf -H "Authorization: Bearer $RENDER_API_KEY" "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys?limit=1" 2>/dev/null) || true
      DEPLOY_ID=$(echo "$D" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['deploy']['id'] if d else '')" 2>/dev/null) || true
      [ -n "$DEPLOY_ID" ] && { echo "Deploy $DEPLOY_ID started"; break; }
      sleep 3
    done
    for i in $(seq 1 90); do
      S=$(curl -sf -H "Authorization: Bearer $RENDER_API_KEY" "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys/$DEPLOY_ID" | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])" 2>/dev/null) || true
      case "$S" in
        live) echo "✅ Deploy is live."; break ;;
        build_failed|update_failed|canceled|deactivated) echo "❌ Deploy failed: $S" >&2; exit 1 ;;
        *) printf "."; sleep 10 ;;
      esac
    done
  else
    echo "Pushed to $PROD_BRANCH. (No RENDER_API_KEY — Render will auto-deploy; not polling.)"
  fi
fi
