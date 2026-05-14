#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# restore-drill.sh -- prove the backups actually restore.
#
# Flow:
#   1) Download the latest database.dump.zst (and globals.sql.zst) from S3.
#   2) Decompress with zstd.
#   3) Boot a scratch PG18 container on a random host port.
#   4) Restore globals (best-effort) + the Fc dump into the scratch DB.
#   5) Assert that every org-scoped table has > 0 rows. Exit 1 on mismatch.
#
# Used in two contexts:
#   a) Manually by an operator (or CI scheduled task) to verify backups.
#   b) Daily/monthly via the BackupStack scheduled task workflow.
#
# Env:
#   APP_S3_BUCKET         REQUIRED unless --dump=<path> is given
#   APP_S3_PREFIX         REQUIRED unless --dump=<path>; the date prefix to restore from
#   APP_S3_REGION         AWS region (default \$AWS_REGION)
#   SCRATCH_IMAGE         docker image (default postgres:18-alpine)
#   SCRATCH_DB_NAME       db name created in scratch (default monorepo)
#   SCRATCH_PORT          host port to bind (default 55432)
#   EXPECT_EMPTY_TABLES   space-separated list to allow zero rows for. ONLY
#                         honored when RESTORE_DRILL_MODE=bootstrap is also
#                         set — otherwise a misconfigured env var could mask
#                         a corrupted backup in production. The monthly
#                         workflow does NOT set bootstrap mode.
#   RESTORE_DRILL_MODE    "bootstrap" enables the EXPECT_EMPTY_TABLES allow
#                         list above. Default (unset) = strict mode.
#
# Returns 0 only if every required org-scoped table has rows. Otherwise 1.

usage() {
  cat <<EOF
Usage: $(basename "$0") [--dump=path/to/database.dump]

Description:
  End-to-end restore drill. Pulls the latest backup from S3 (unless --dump
  is provided), restores it into a throw-away PG18 testcontainer, and asserts
  row counts on every tenant-scoped table.

Options:
  --dump=PATH       Skip the S3 download and restore PATH directly. The path
                    may be a .dump (raw) or .dump.zst (zstd-compressed).
  -h, --help        Show this help and exit.

Required env (unless --dump):
  APP_S3_BUCKET, APP_S3_PREFIX
EOF
}

info() { printf '\033[1;34minfo\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31merr\033[0m  %s\n' "$*" >&2; exit 1; }

# Org-scoped tables: every row carries organization_id. A non-empty backup
# MUST seed each of these. Kept in sync with pg-dump-nightly.sh.
ORG_SCOPED_TABLES=(
  audit_event
  auth_invite
  impersonation
  organization
  organization_membership
  resource_grant
  tool_call_log
)

CONTAINER=""

# shellcheck disable=SC2329  # invoked via `trap`
cleanup() {
  if [ -n "$CONTAINER" ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
}

main() {
  local dump_override=""
  while [ $# -gt 0 ]; do
    case "$1" in
      -h|--help) usage; exit 0;;
      --dump=*)  dump_override="${1#--dump=}"; shift;;
      *) err "unknown arg: $1";;
    esac
  done

  trap cleanup EXIT
  command -v docker >/dev/null 2>&1 || err "docker not found on PATH"
  command -v zstd   >/dev/null 2>&1 || err "zstd not found on PATH"

  local image="${SCRATCH_IMAGE:-postgres:18-alpine}"
  local db_name="${SCRATCH_DB_NAME:-monorepo}"
  local host_port="${SCRATCH_PORT:-55432}"
  local password="restore_drill"

  local workdir
  workdir=$(mktemp -d)
  trap 'rm -rf "$workdir"; cleanup' EXIT

  local dump_path=""
  local globals_path=""

  if [ -n "$dump_override" ]; then
    if [ ! -f "$dump_override" ]; then
      err "--dump path does not exist: $dump_override"
    fi
    case "$dump_override" in
      *.zst)
        info "decompressing local dump $dump_override"
        zstd -d -q -o "$workdir/database.dump" "$dump_override"
        dump_path="$workdir/database.dump"
        ;;
      *)
        dump_path="$dump_override"
        ;;
    esac
  else
    [ -n "${APP_S3_BUCKET:-}" ] || err "APP_S3_BUCKET required (or pass --dump)"
    [ -n "${APP_S3_PREFIX:-}" ] || err "APP_S3_PREFIX required (or pass --dump)"
    local region="${APP_S3_REGION:-${AWS_REGION:-eu-central-1}}"

    info "downloading database.dump.zst"
    aws s3 cp "s3://${APP_S3_BUCKET}/${APP_S3_PREFIX}/database.dump.zst" \
      "$workdir/database.dump.zst" \
      --region "$region" \
      --only-show-errors
    zstd -d -q -o "$workdir/database.dump" "$workdir/database.dump.zst"
    dump_path="$workdir/database.dump"

    if aws s3 cp "s3://${APP_S3_BUCKET}/${APP_S3_PREFIX}/globals.sql.zst" \
        "$workdir/globals.sql.zst" \
        --region "$region" \
        --only-show-errors 2>/dev/null; then
      zstd -d -q -o "$workdir/globals.sql" "$workdir/globals.sql.zst"
      globals_path="$workdir/globals.sql"
    else
      warn "globals.sql.zst absent or unreadable; restoring without it"
    fi
  fi

  info "booting scratch postgres ($image) on host port $host_port"
  CONTAINER=$(docker run -d --rm \
    -e POSTGRES_PASSWORD="$password" \
    -e POSTGRES_DB="$db_name" \
    -p "${host_port}:5432" \
    "$image")

  # Wait for pg_isready inside the container. Caps at ~60 s.
  local i=0
  until docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -gt 30 ]; then
      err "scratch postgres did not become ready within 60 s"
    fi
    sleep 2
  done
  info "scratch ready"

  export PGPASSWORD="$password"
  local url="postgresql://postgres@127.0.0.1:${host_port}/${db_name}"

  if [ -n "$globals_path" ]; then
    info "applying globals (best-effort)"
    psql "$url" -v ON_ERROR_STOP=0 -f "$globals_path" >/dev/null || \
      warn "some globals failed to apply (expected for managed-role names)"
  fi

  info "pg_restore -> $db_name"
  pg_restore --no-owner --no-privileges --clean --if-exists \
    --dbname="$url" \
    --exit-on-error \
    "$dump_path"

  # Empty-table allowance is only honored when RESTORE_DRILL_MODE=bootstrap
  # is explicitly set. In strict mode (the default + what CI uses) an empty
  # org-scoped table FAILS the drill, even if EXPECT_EMPTY_TABLES lists it.
  local strict_mode=1
  local empty_allow=""
  if [ "${RESTORE_DRILL_MODE:-strict}" = "bootstrap" ]; then
    strict_mode=0
    empty_allow="${EXPECT_EMPTY_TABLES:-}"
    warn "RESTORE_DRILL_MODE=bootstrap — EXPECT_EMPTY_TABLES allow list is in effect: ${empty_allow}"
  fi

  for table in "${ORG_SCOPED_TABLES[@]}"; do
    local count
    count=$(psql "$url" -At -v ON_ERROR_STOP=1 \
      -c "SELECT COUNT(*) FROM ${table}")
    if [ "$count" = "0" ]; then
      if [ "$strict_mode" -eq 0 ] && [[ " $empty_allow " == *" $table "* ]]; then
        warn "$table is empty (allowed via bootstrap-mode allow list)"
        continue
      fi
      err "row count assertion FAILED for $table (got 0)"
    fi
    info "$table OK ($count rows)"
  done

  info "restore drill OK"
  exit 0
}

main "$@"
