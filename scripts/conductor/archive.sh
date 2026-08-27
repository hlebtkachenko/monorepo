#!/usr/bin/env bash
# Conductor workspace archive — Afframe monorepo.
#
# Wired via .conductor/settings.toml `scripts.archive`; runs from the workspace
# directory before Conductor archives it. Drops this workspace's isolated
# database and stops its CodeGraph daemon, so neither dead per-workspace
# databases nor stranded watcher processes accumulate. Best-effort: never blocks
# archiving.
set -uo pipefail

COMPOSE="infra/compose/docker-compose.dev.yml"

# `pnpm codegraph:ready` leaves a detached `codegraph.js serve` daemon holding
# the SQLite index and fsevents watchers. Conductor removes the worktree without
# signalling it, so the process survives with its cwd on an unlinked inode and
# stays resident (~60-100 MB each) until reboot. Stop ours while the path still
# resolves.
#
# Two shapes have to match: the daemon may carry `--path <workspace>`, or it may
# be spawned with no flag at all from the workspace's own node_modules binary.
# Anchor both so sibling workspaces are never hit — an unanchored `--path`
# substring would make `kelowna` match `kelowna-v1`.
WS_PATH="${CONDUCTOR_WORKSPACE_PATH:-$PWD}"
for pid in $(pgrep -f 'codegraph\.js serve' 2>/dev/null); do
  cmd="$(ps -o command= -p "$pid" 2>/dev/null)" || continue
  case "$cmd" in
    *"--path $WS_PATH"|*"--path $WS_PATH "*|*"$WS_PATH/node_modules/"*)
      echo "==> stopping CodeGraph daemon (pid $pid)"
      kill "$pid" 2>/dev/null || true
      ;;
  esac
done

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
