#!/usr/bin/env bash
# Conductor workspace archive — Afframe monorepo.
#
# Wired via .conductor/settings.toml `scripts.archive`; runs from the workspace
# directory before Conductor archives it. Drops this workspace's isolated
# database so dead per-workspace databases do not accumulate on the shared dev
# server. Best-effort: never blocks archiving.
set -uo pipefail

COMPOSE="infra/compose/docker-compose.dev.yml"

# Prefer the port-derived convention; fall back to the name baked into the
# generated env file (CONDUCTOR_PORT may not be exported to archive scripts).
WS_DB="ws_p${CONDUCTOR_PORT:-}"
if [ "$WS_DB" = "ws_p" ] && [ -f apps/web/.env.local ]; then
  WS_DB="$(grep -oE 'DATABASE_DIRECT_URL=[^[:space:]]+' apps/web/.env.local | sed -E 's#.*/##')"
fi

# Allowlist the isolated-workspace naming convention before an irreversible DROP.
# This refuses the base app_dev database, an empty/garbage grep result, and any
# injected name in one check (allowlist > denylist).
if ! [[ "$WS_DB" =~ ^ws_p[0-9]+$ ]]; then
  echo "No isolated workspace database to drop (name: '${WS_DB:-}')."
  exit 0
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "==> dropping database ${WS_DB}"
  docker compose -f "$COMPOSE" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U app_owner -d app_dev \
    -c "DROP DATABASE IF EXISTS ${WS_DB} WITH (FORCE);" \
    || echo "WARN: could not drop ${WS_DB}; drop it manually if needed." >&2
fi
