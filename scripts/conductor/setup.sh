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

echo "==> pnpm install (frozen lockfile)"
pnpm install --frozen-lockfile || exit 1

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  WS_DB="ws_p${WEB_PORT}"
  DIRECT="postgres://app_owner:dev_owner@localhost:5432/${WS_DB}"
  APPURL="postgres://app_user:dev_user@localhost:5432/${WS_DB}"

  echo "==> bring up shared dev Postgres"
  docker compose -f "$COMPOSE" up -d postgres \
    || echo "WARN: dev Postgres did not start; run: docker compose -f $COMPOSE up -d postgres" >&2

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

  echo "==> seed demo owner + acme tenant graph"
  if [ -f apps/web/.env.local ]; then
    # shellcheck source=/dev/null  # generated at runtime, absent at lint time
    set -a; . apps/web/.env.local; set +a
  fi
  DATABASE_URL="$APPURL" pnpm exec tsx apps/web/scripts/seed-dev-owner.ts \
    || echo "WARN: minting demo credential failed." >&2
  DATABASE_URL="$APPURL" SEED_OWNER_EMAIL=owner@example.com \
    pnpm --filter @workspace/db db:seed \
    || echo "WARN: db:seed failed." >&2
else
  echo "==> No Docker (cloud workspace?) — skipping DB setup. Coding + typecheck + git still work."
fi

echo "==> CodeGraph index (best effort)"
pnpm codegraph:ready \
  || echo "WARN: CodeGraph index unavailable; run 'pnpm codegraph:ready' manually." >&2

echo "==> Conductor setup complete."
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "    Run 'web' -> http://localhost:${WEB_PORT}  (sign in: owner@example.com / passwordpassword -> /acme)"
fi
