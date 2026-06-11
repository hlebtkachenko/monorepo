#!/usr/bin/env bash
# Stop the dev next server + the local Postgres container.
# Tear-down counterpart to generate-env.sh + the docker-run snippet in
# docs/runbooks/LOCAL-DEV.md.
set -euo pipefail

# Kill anything listening on :3000 (Next dev default) or :3030 (the
# conventional second-instance dev port). Use -t to print just PIDs.
for PORT in 3000 3030; do
  PIDS=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "kill next dev on :$PORT (pid: $PIDS)"
    # shellcheck disable=SC2086
    kill $PIDS || true
  else
    echo "no process on :$PORT"
  fi
done

# Stop the dev Postgres container if running.
if docker ps --format '{{.Names}}' | grep -q '^app-dev-pg$'; then
  echo "stop docker app-dev-pg"
  docker stop app-dev-pg >/dev/null
else
  echo "no docker app-dev-pg"
fi

echo "down."
