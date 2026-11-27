#!/bin/sh
# Production entrypoint (used by Dockerfile CMD).
set -e

# Migrations must not run through a transaction-pooling proxy (Neon's pgbouncer
# "pooler" host) because `prisma migrate deploy` uses a session-level advisory
# lock, which the pooler cannot hold. Neon's direct host is the same hostname
# with "-pooler" removed — derive it automatically unless MIGRATION_URL is set.
MIGRATION_URL="${MIGRATION_URL:-$(printf '%s' "$DATABASE_URL" | sed 's/-pooler\././')}"

# One retry: cold Postgres instances occasionally refuse the first lock attempt.
npx prisma migrate deploy --url "$MIGRATION_URL" \
  || { echo "migrate deploy failed once — retrying in 5s"; sleep 5; npx prisma migrate deploy --url "$MIGRATION_URL"; }

exec node src/index.js
