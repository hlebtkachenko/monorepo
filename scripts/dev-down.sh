#!/usr/bin/env bash
# Stop the dev next server + the local Postgres container.
# Tear-down counterpart to generate-env.sh + the docker-run snippet in
# docs/runbooks/LOCAL-DEV.md.
set -euo pipefail

# Kill anything listening on :3000 (Next dev). Use -t to print just PIDs.
if PIDS=$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null); then
  if [ -n "$PIDS" ]; then
    echo "kill next dev (pid: $PIDS)"
    # shellcheck disable=SC2086
    kill $PIDS || true
  else
    echo "no process on :3000"
  fi
else
  echo "no process on :3000"
fi

# Stop the dev Postgres container if running.
if docker ps --format '{{.Names}}' | grep -q '^app-dev-pg$'; then
  echo "stop docker app-dev-pg"
  docker stop app-dev-pg >/dev/null
else
  echo "no docker app-dev-pg"
fi

echo "down."
