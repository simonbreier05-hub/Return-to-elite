#!/usr/bin/env bash
#
# Live-Sync: poll the remote branch and fast-forward the local working copy,
# so a running `npm run dev` hot-reloads changes as soon as they are pushed.
#
#   Terminal 1:  npm run dev
#   Terminal 2:  npm run sync
#
# Usage: bash scripts/watch-remote.sh [branch] [interval-seconds]
set -u

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
INTERVAL="${2:-10}"

echo "Watching origin/$BRANCH every ${INTERVAL}s — Ctrl+C to stop."
echo "Local commit: $(git log --oneline -1)"

while true; do
  git fetch -q origin "$BRANCH" 2>/dev/null || {
    echo "⚠ fetch failed (offline?) — retrying in ${INTERVAL}s"
    sleep "$INTERVAL"
    continue
  }

  LOCAL="$(git rev-parse HEAD)"
  REMOTE="$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "$LOCAL")"

  if [ "$LOCAL" != "$REMOTE" ]; then
    if git merge --ff-only "origin/$BRANCH" -q 2>/dev/null; then
      echo ""
      echo "↓ $(date '+%H:%M:%S')  $(git log --oneline -1)"
      CHANGED="$(git diff --name-only "$LOCAL" HEAD)"

      # Hot reload covers .tsx/.ts under src/. These do not reload themselves:
      echo "$CHANGED" | grep -q '^package.json$'  && echo "  ⚠ package.json geändert → npm install"
      echo "$CHANGED" | grep -q '^prisma/schema'  && echo "  ⚠ Prisma-Schema geändert → npm run db:push"
      echo "$CHANGED" | grep -q '^prisma/seed'    && echo "  ⚠ Seed geändert → npm run db:seed"
      echo "$CHANGED" | grep -q '^server.js$'     && echo "  ⚠ server.js geändert → npm run dev neu starten"
      true
    else
      echo "⚠ Kein Fast-Forward möglich — du hast lokale Änderungen."
      echo "  Verwerfen mit:  git reset --hard origin/$BRANCH"
    fi
  fi

  sleep "$INTERVAL"
done
