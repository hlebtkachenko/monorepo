#!/usr/bin/env bash
#
# apply-migrations-init.sh
#
# First-deploy bootstrap + every-deploy idempotent migrate runner. Lives
# inside the `db-migrate` init container of App-<env> (see app-stack.ts).
# Runs BEFORE essential app containers so that:
#
#   1. `packages/db/migrations/*.sql` is journaled and applied — this is
#      what creates the `app_user` role (0002_auth.sql) + all app tables.
#   2. The `app_user` role's RDS password is set to match `appUserSecret`
#      (per runbook docs/runbooks/AWS-DEPLOY.md). Without this sync the
#      web/admin/api containers can't authenticate via pgbouncer.
#   3. The `openfga` schema is created — the sibling openfga-migrate
#      container's `openfga migrate` command will create its goose tables
#      inside this schema. OpenFGA does NOT create the schema itself, it
#      errors with `no schema has been selected to create in` if missing.
#
# Idempotent end-to-end:
#   - Migrations journal `_app_migrations` skips already-applied files.
#   - `ALTER ROLE … PASSWORD` is unconditional (same value = no-op).
#   - `CREATE SCHEMA IF NOT EXISTS` no-op when present.
#
# Required env (injected by AppStack):
#   DB_HOST, DB_PORT, DB_NAME
#   DB_ADMIN_USER, DB_ADMIN_PASSWORD            (app_owner, from databaseSecret)
#   APP_USER_PASSWORD                           (from appUserSecret 'password')
#
# Exit codes:
#   0 — every migration applied + password synced + openfga schema created
#   1 — any psql failure

set -euo pipefail

: "${DB_HOST:?required}"
: "${DB_PORT:?required}"
: "${DB_NAME:?required}"
: "${DB_ADMIN_USER:?required}"
: "${DB_ADMIN_PASSWORD:?required}"
: "${APP_USER_PASSWORD:?required}"

export PGPASSWORD="$DB_ADMIN_PASSWORD"
PSQL_BASE=(psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_ADMIN_USER" --dbname="$DB_NAME" --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --set=sslmode=require)
PSQL_VERBOSE=(psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_ADMIN_USER" --dbname="$DB_NAME" --no-psqlrc --set=ON_ERROR_STOP=1 --set=sslmode=require)

echo "init: connecting to ${DB_HOST}:${DB_PORT}/${DB_NAME} as ${DB_ADMIN_USER}"
"${PSQL_BASE[@]}" -c "SELECT 1" >/dev/null
echo "init: connected."

# 1. Apply pending SQL migrations from /migrations/.
"${PSQL_BASE[@]}" -c "CREATE TABLE IF NOT EXISTS _app_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"

applied=0
skipped=0
for f in $(find /migrations -maxdepth 1 -name '*.sql' 2>/dev/null | sort); do
  name=$(basename "$f")
  already=$("${PSQL_BASE[@]}" -c "SELECT 1 FROM _app_migrations WHERE filename = '${name}'" || echo "")
  if [ "$already" = "1" ]; then
    skipped=$((skipped + 1))
    continue
  fi
  echo "init: applying $name"
  "${PSQL_VERBOSE[@]}" -f "$f"
  "${PSQL_BASE[@]}" -c "INSERT INTO _app_migrations (filename) VALUES ('${name}')"
  applied=$((applied + 1))
done
echo "init: migrations applied=${applied} skipped=${skipped}"

# 2. Sync app_user role password to appUserSecret (runbook step).
#    app_user role itself is created by migration 0002_auth.sql; if that
#    migration was just applied, app_user exists with a random/NULL
#    password and CDK secret is the source of truth. Quote-escape the
#    password by doubling any single-quote inside it before interpolating.
escaped_pw=${APP_USER_PASSWORD//\'/\'\'}
"${PSQL_BASE[@]}" -c "ALTER ROLE app_user PASSWORD '${escaped_pw}'"
echo "init: app_user role password synced from appUserSecret."

# 3. CREATE SCHEMA openfga so the sibling openfga-migrate container can
#    apply its goose migrations into it. OpenFGA does NOT create the
#    schema on its own (verified prod run 26215639810 — openfga-migrate
#    errored with 'no schema has been selected to create in').
"${PSQL_BASE[@]}" -c "CREATE SCHEMA IF NOT EXISTS openfga AUTHORIZATION ${DB_ADMIN_USER}"
echo "init: openfga schema present (owner=${DB_ADMIN_USER})."

echo "init: done."
