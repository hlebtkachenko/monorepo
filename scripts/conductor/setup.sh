#!/usr/bin/env bash
# Conductor workspace setup — Afframe monorepo.
#
# Wired via .conductor/settings.toml `scripts.setup`; runs from the workspace
# directory when Conductor creates a workspace.
#
# Goal: every parallel workspace is FULLY ISOLATED — its own $CONDUCTOR_PORT
# range and its own Postgres database on the shared dev server — and pre-seeded
# with the demo login owner@example.com / passwordpassword so you can sign in to
# any workspace without thinking. Reproducible from a clean checkout: everything
# is generated from committed templates + scripts, nothing is copied from a
# (periodically wiped) local root.
#
# Invariants:
#   - `pnpm install` is the only fatal step. Every DB / index step warns but
#     never aborts workspace creation.
#   - Cloud workspaces (no Docker) skip the whole DB block and still install +
#     index, so cloud stays usable for coding, typecheck, and git.
#
# NOTE on ports: pgBouncer's dev config (infra/compose/pgbouncer) is a static
# single-DB list, so per-workspace databases cannot route through :6432. We
# connect the app directly to Postgres :5432 (role app_user keeps FORCE RLS).
set -uo pipefail

WEB_PORT="${CONDUCTOR_PORT:-3000}"
COMPOSE="infra/compose/docker-compose.dev.yml"

# Per-workspace DB isolation runs only when the port is a clean integer (it is
# interpolated into the database name / SQL) and Docker is reachable. Compute
# the guard once and reuse it below.
DOCKER_OK=""
if [[ "$WEB_PORT" =~ ^[0-9]+$ ]] && command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  DOCKER_OK=1
fi

echo "==> pnpm install (frozen lockfile)"
pnpm install --frozen-lockfile || exit 1

if [ -n "$DOCKER_OK" ]; then
  WS_DB="ws_p${WEB_PORT}"
  DIRECT="postgres://app_owner:dev_owner@localhost:5432/${WS_DB}"
  APPURL="postgres://app_user:dev_user@localhost:5432/${WS_DB}"

  echo "==> bring up shared dev Postgres + minio (S3 document store)"
  # minio + its one-shot bucket seeder back the S3 document store locally
  # (packages/storage → documents-dev bucket); the generated .env.local points
  # DOCUMENTS_BUCKET / S3_ENDPOINT at them.
  docker compose -f "$COMPOSE" up -d postgres minio minio-createbucket \
    || echo "WARN: dev Postgres/minio did not start; run: docker compose -f $COMPOSE up -d postgres minio minio-createbucket" >&2

  echo "==> wait for Postgres health"
  for _ in $(seq 1 30); do
    docker compose -f "$COMPOSE" exec -T postgres pg_isready -U app_owner -d app_dev >/dev/null 2>&1 && break
    sleep 1
  done

  echo "==> create + bootstrap database ${WS_DB}"
  if ! docker compose -f "$COMPOSE" exec -T postgres \
        psql -tAqU app_owner -d app_dev -c "SELECT 1 FROM pg_database WHERE datname='${WS_DB}'" 2>/dev/null | grep -q 1; then
    docker compose -f "$COMPOSE" exec -T postgres \
      psql -v ON_ERROR_STOP=1 -U app_owner -d app_dev -c "CREATE DATABASE ${WS_DB} OWNER app_owner;" \
      || echo "WARN: CREATE DATABASE ${WS_DB} failed." >&2
  fi
  # Per-DB grants MUST run before migrate so migration-created tables auto-grant
  # to app_user. init.d files are idempotent (roles are cluster-global no-ops).
  docker compose -f "$COMPOSE" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U app_owner -d "${WS_DB}" < infra/compose/postgres/init.d/00-roles.sql >/dev/null 2>&1 || true
  docker compose -f "$COMPOSE" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U app_owner -d "${WS_DB}" < infra/compose/postgres/init.d/01-grants.sql >/dev/null 2>&1 \
    || echo "WARN: per-DB grants failed; app_user may lack table access." >&2

  echo "==> generate apps/web/.env.local (port ${WEB_PORT}, db ${WS_DB})"
  WEB_PORT="$WEB_PORT" DB_URL="$APPURL" DB_DIRECT_URL="$DIRECT" \
    bash scripts/generate-env.sh --force || echo "WARN: env generation failed." >&2

  echo "==> migrate ${WS_DB}"
  DATABASE_URL="$APPURL" DATABASE_DIRECT_URL="$DIRECT" \
    pnpm --filter @workspace/db db:migrate \
    || echo "WARN: db:migrate failed; run it once the DB is reachable." >&2

  echo "==> seed demo owner + acme tenant graph + 2026 period"
  if [ -f apps/web/.env.local ]; then
    # shellcheck source=/dev/null  # generated at runtime, absent at lint time
    set -a; . apps/web/.env.local; set +a
  fi
  DATABASE_URL="$APPURL" pnpm exec tsx apps/web/scripts/seed-dev-owner.ts \
    || echo "WARN: minting demo credential failed." >&2
  DATABASE_URL="$APPURL" pnpm --filter @workspace/db db:seed \
    || echo "WARN: db:seed failed." >&2
  # Open acme's first účetní období (2026) so /o/acme resolves to a bookable org.
  DATABASE_URL="$APPURL" pnpm exec tsx apps/web/scripts/seed-dev-period.ts \
    || echo "WARN: seeding acme 2026 period failed." >&2

  echo "==> generate apps/admin/.env.local (port $((WEB_PORT + 2)))"
  # Admin gates on the seeded workspace id; the fresh DB has exactly one.
  WS_ID="$(docker compose -f "$COMPOSE" exec -T postgres \
    psql -tAqU app_owner -d "$WS_DB" -c "SELECT id FROM workspace ORDER BY created_at LIMIT 1" 2>/dev/null | tr -d '[:space:]')"
  if [ -n "$WS_ID" ]; then
    DB_URL="$APPURL" ADMIN_PORT="$((WEB_PORT + 2))" WEB_PORT="$WEB_PORT" API_PORT="$((WEB_PORT + 1))" \
      WS_ALLOWLIST="$WS_ID" \
      BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-}" APP_TOKEN_SECRET="${APP_TOKEN_SECRET:-}" \
      bash scripts/generate-admin-env.sh || echo "WARN: admin env generation failed." >&2
  else
    echo "WARN: could not resolve seeded workspace id; skipping admin env." >&2
  fi
else
  echo "==> No Docker (cloud workspace?) — skipping DB setup. Coding + typecheck + git still work."
fi

echo "==> CodeGraph index (best effort)"
pnpm codegraph:ready \
  || echo "WARN: CodeGraph index unavailable; run 'pnpm codegraph:ready' manually." >&2

echo "==> Conductor setup complete."
if [ -n "$DOCKER_OK" ]; then
  echo "    Run 'web'   -> http://localhost:${WEB_PORT}       (owner@example.com / passwordpassword -> /acme)"
  echo "    Run 'admin' -> http://localhost:$((WEB_PORT + 2)) (same login, gated to the seeded workspace)"
fi
