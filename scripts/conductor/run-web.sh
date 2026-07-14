#!/usr/bin/env bash
# Conductor local web run entrypoint — Afframe monorepo.
#
# Long-lived workspaces may predate the per-workspace DB setup, and Docker may
# be stopped after setup completes. Repair missing local DB state and apply any
# pending migrations before Next.js starts so Run either works or fails with a
# focused error.
set -euo pipefail

WEB_PORT="${CONDUCTOR_PORT:-}"
COMPOSE="infra/compose/docker-compose.dev.yml"

if ! [[ "$WEB_PORT" =~ ^[0-9]+$ ]]; then
  echo "ERROR: CONDUCTOR_PORT must be an integer." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is required for the local web server. Start Docker Desktop, then press Run again." >&2
  exit 1
fi

echo "==> ensure shared dev Postgres is running"
docker compose -f "$COMPOSE" up -d postgres

POSTGRES_READY=""
for _ in $(seq 1 30); do
  if docker compose -f "$COMPOSE" exec -T postgres \
      pg_isready -U app_owner -d app_dev >/dev/null 2>&1; then
    POSTGRES_READY=1
    break
  fi
  sleep 1
done

if [ -z "$POSTGRES_READY" ]; then
  echo "ERROR: shared dev Postgres did not become ready within 30 seconds." >&2
  exit 1
fi

WS_DB="ws_p${WEB_PORT}"
WS_DIRECT_URL="postgres://app_owner:dev_owner@localhost:5432/${WS_DB}"

database_exists() {
  docker compose -f "$COMPOSE" exec -T postgres \
    psql -tAqU app_owner -d app_dev \
      -c "SELECT 1 FROM pg_database WHERE datname='${WS_DB}'" 2>/dev/null \
    | grep -qx 1
}

# Seeding implies the schema exists (the query touches migrated tables), so this
# alone gates the full setup below; migration currency is handled separately.
seed_ready() {
  docker compose -f "$COMPOSE" exec -T postgres \
    psql -tAqU app_owner -d "$WS_DB" \
      -c "SELECT CASE WHEN EXISTS (SELECT 1 FROM app_user WHERE email='owner@example.com') AND EXISTS (SELECT 1 FROM workspace) THEN 1 ELSE 0 END" 2>/dev/null \
    | grep -qx 1
}

if ! database_exists || ! seed_ready; then
  echo "==> workspace database is missing or unseeded; repairing local setup"
  bash scripts/conductor/setup.sh
fi

if ! database_exists || ! seed_ready; then
  echo "ERROR: workspace database setup is incomplete. Review setup warnings above, then run 'bash scripts/conductor/setup.sh'." >&2
  exit 1
fi

# A workspace created before a newer migration was merged has the seed markers
# but a stale schema, which seed_ready cannot detect. apply-migrations is
# idempotent (SHA-256 journal): a no-op when current, applies pending files
# otherwise. Runs against direct Postgres (app_owner) as migrations require.
echo "==> apply pending migrations (idempotent)"
DATABASE_DIRECT_URL="$WS_DIRECT_URL" pnpm --filter @workspace/db db:migrate \
  || { echo "ERROR: db:migrate failed. Review the output above, then run 'bash scripts/conductor/setup.sh'." >&2; exit 1; }

APP_URL="http://localhost:${WEB_PORT}"
(
  PARENT_PID=$$
  for _ in $(seq 1 120); do
    kill -0 "$PARENT_PID" 2>/dev/null || exit
    if curl -s -m 5 -o /dev/null "$APP_URL"; then
      [ "$(uname)" = Darwin ] && open "$APP_URL"
      break
    fi
    sleep 0.5
  done
) &

exec pnpm --filter web exec next dev --turbopack --port "$WEB_PORT"
