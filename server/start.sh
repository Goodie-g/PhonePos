#!/bin/sh
# Production entrypoint (used by Dockerfile CMD).
set -e

# Neon's "pooler" host runs PgBouncer in transaction mode, which cannot provide
# the session affinity Prisma's interactive transactions require (every write in
# this app runs in one) — writes fail with "Transaction not found". Derive the
# direct host (same hostname with "-pooler" removed) for BOTH the app and
# migrations, unless MIGRATION_URL/APP_DATABASE_URL say otherwise.
DIRECT_URL="$(printf '%s' "$DATABASE_URL" | sed 's/-pooler\././')"
MIGRATION_URL="${MIGRATION_URL:-$DIRECT_URL}"
export DATABASE_URL="${APP_DATABASE_URL:-$DIRECT_URL}"

# One retry: cold Postgres instances occasionally refuse the first lock attempt.
# Prisma reads the URL from DATABASE_URL (migrate deploy has no --url flag).
DATABASE_URL="$MIGRATION_URL" npx prisma migrate deploy \
  || { echo "migrate deploy failed once — retrying in 5s"; sleep 5; DATABASE_URL="$MIGRATION_URL" npx prisma migrate deploy; }

exec node src/index.js
