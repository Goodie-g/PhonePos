#!/bin/sh
# Production entrypoint (used by Dockerfile CMD).
set -e

# Migrations must not run through a transaction-pooling proxy (Neon's pgbouncer
# "pooler" host) because `prisma migrate deploy` uses a session-level advisory
# lock, which the pooler cannot hold. Neon's direct host is the same hostname
# with "-pooler" removed — derive it automatically unless MIGRATION_URL is set.
MIGRATION_URL="${MIGRATION_URL:-$(printf '%s' "$DATABASE_URL" | sed 's/-pooler\././')}"

# One retry: cold Postgres instances occasionally refuse the first lock attempt.
# Prisma reads the URL from DATABASE_URL (migrate deploy has no --url flag).
DATABASE_URL="$MIGRATION_URL" npx prisma migrate deploy \
  || { echo "migrate deploy failed once — retrying in 5s"; sleep 5; DATABASE_URL="$MIGRATION_URL" npx prisma migrate deploy; }

exec node src/index.js
