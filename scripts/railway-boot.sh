#!/usr/bin/env bash
#
# Railway boot step (start:railway). Runs on every container start — a
# fresh deploy AND a bare restart both re-execute this, not just the first
# boot ever.
#
# `prisma db push --accept-data-loss` makes the live database match this
# branch's schema.postgres.prisma, destructively if needed (dropping a
# column/table this branch's schema doesn't know about). That is exactly
# what makes it dangerous when more than one service points its
# DATABASE_URL at the same Postgres instance — which is what StayClean
# (production) and StayClean-preview used to do, from two different,
# independently-evolving branches, until they were split onto separate
# databases (postgres-preview) in mid-September 2026. This is a real,
# observed incident FROM BEFORE that split (Room.deferredSince, added by
# preview, dropped hours later by a prod boot, breaking every room query on
# preview with Prisma error P2022 until this fix): whichever service booted
# last "won" and could silently drop columns the other branch had just
# added. See the incident note in the Sept 2026 fix-up commit for the
# postmortem.
#
# The database separation removed the specific cross-service risk described
# above, but this step is kept regardless: db push is still destructive on
# its own schema, so it still prints the exact SQL it's about to run, with
# the eye-catching prefix DESTRUCTIVE CHANGE AHEAD, so an unexpected drop is
# visible in Railway's deploy log instead of only surfacing later as a
# Prisma error in a completely different request.
set -euo pipefail

SCHEMA="prisma/schema.postgres.prisma"

echo "── railway-boot: schema diff against the live database ──"
DIFF="$(npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel "$SCHEMA" \
  --script 2>&1 || true)"

if [ -n "$DIFF" ]; then
  echo "$DIFF"
  if echo "$DIFF" | grep -qiE '^\s*(DROP |ALTER TABLE .* DROP )'; then
    echo "⚠️  DESTRUCTIVE CHANGE AHEAD — db push is about to drop the column(s)/table(s) above."
    echo "⚠️  If this branch is not the one that added them, another service sharing this"
    echo "⚠️  database (see comment above) is about to lose data it still expects."
  fi
else
  echo "(no pending schema changes)"
fi
echo "───────────────────────────────────────────────────────────"

npx prisma db push --schema "$SCHEMA" --skip-generate --accept-data-loss
