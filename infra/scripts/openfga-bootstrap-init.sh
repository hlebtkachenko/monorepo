#!/usr/bin/env bash
#
# openfga-bootstrap-init.sh
#
# Init-container entrypoint for the App TaskDef's `openfga-bootstrap`
# sidecar. Runs once per task cold-start, AFTER db-migrate +
# openfga-migrate (their DependsOn SUCCESS chain). See Dockerfile.openfga-bootstrap.
#
#   1. Boot the OpenFGA server in the background, pointed at the same RDS
#      the runtime openfga sidecar uses (same connection string shape).
#   2. Poll /healthz until 200 (max ~30s).
#   3. Run `node bootstrap.mjs` — creates/reuses the store, writes the
#      authorization model, and PutParameter's /monorepo/${env}/openfga/
#      {store-id,model-id} via the task role.
#   4. Stop the OpenFGA subprocess + exit 0.
#
# Idempotent end-to-end. Required env (injected by AppStack):
#   MONOREPO_ENV
#   DB_HOST, DB_PORT, DB_NAME
#   DB_ADMIN_USER, DB_ADMIN_PASSWORD     (app_owner, from databaseSecret)
#   AWS_REGION
#
# Exit codes:
#   0 — store + model written to SSM
#   1 — any subprocess failure

set -euo pipefail

: "${MONOREPO_ENV:?required}"
: "${DB_HOST:?required}"
: "${DB_PORT:?required}"
: "${DB_NAME:?required}"
: "${DB_ADMIN_USER:?required}"
: "${DB_ADMIN_PASSWORD:?required}"
: "${AWS_REGION:?required}"

OPENFGA_PORT=8080
OPENFGA_GRPC_PORT=8081
OPENFGA_URL="http://127.0.0.1:${OPENFGA_PORT}"

echo "bootstrap: env=${MONOREPO_ENV} db=${DB_HOST}:${DB_PORT}/${DB_NAME}"

# OPENFGA_DATASTORE_URI mirrors what app-stack.ts wires for the runtime
# openfga sidecar (postgres + openfga schema + sslmode=require). Embedding
# the credentials in the URI is the only path the openfga binary supports
# for postgres; the env vars OPENFGA_DATASTORE_USERNAME/PASSWORD are
# specific to the `openfga migrate` subcommand, not `openfga run`.
DB_PASSWORD_ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.env.DB_ADMIN_PASSWORD))')
export OPENFGA_DATASTORE_ENGINE=postgres
export OPENFGA_DATASTORE_URI="postgres://${DB_ADMIN_USER}:${DB_PASSWORD_ENC}@${DB_HOST}:${DB_PORT}/${DB_NAME}?search_path=openfga&sslmode=require"
export OPENFGA_HTTP_ADDR="127.0.0.1:${OPENFGA_PORT}"
export OPENFGA_GRPC_ADDR="127.0.0.1:${OPENFGA_GRPC_PORT}"
export OPENFGA_PLAYGROUND_ENABLED=false
export OPENFGA_LOG_FORMAT=json

# Boot the server in the background; capture its PID so we can stop it
# cleanly after the bootstrap exits.
echo "bootstrap: launching openfga server (background) → ${OPENFGA_URL}"
openfga run >&2 &
OPENFGA_PID=$!

cleanup() {
  if kill -0 "$OPENFGA_PID" 2>/dev/null; then
    echo "bootstrap: stopping openfga (pid=${OPENFGA_PID})"
    kill "$OPENFGA_PID" 2>/dev/null || true
    wait "$OPENFGA_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Poll /healthz. OpenFGA boots in ~1-3s; allow up to 30s before failing
# loud so a stuck DB connect (e.g. cold pgbouncer-less direct RDS) doesn't
# leave the init container hanging until ECS startTimeout.
echo "bootstrap: waiting for /healthz"
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null --max-time 2 "${OPENFGA_URL}/healthz"; then
    echo "bootstrap: openfga healthy (after ${i}s)"
    break
  fi
  if ! kill -0 "$OPENFGA_PID" 2>/dev/null; then
    echo "bootstrap: ERROR — openfga subprocess died before becoming healthy" >&2
    exit 1
  fi
  if [ "$i" -eq 30 ]; then
    echo "bootstrap: ERROR — openfga /healthz timed out after 30s" >&2
    exit 1
  fi
  sleep 1
done

# Run the bootstrap script. AWS_REGION is set above; the script's SSM
# write path triggers on its presence. MONOREPO_ENV is read as a fallback
# when --env is absent — we keep --env explicit for log clarity.
echo "bootstrap: running node bootstrap.mjs --env ${MONOREPO_ENV}"
cd /app/openfga
OPENFGA_API_URL="${OPENFGA_URL}" node bootstrap.mjs --env "${MONOREPO_ENV}"

echo "bootstrap: done"
