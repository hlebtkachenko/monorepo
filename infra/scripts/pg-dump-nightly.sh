#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# pg-dump-nightly.sh -- nightly Postgres backup: globals + full DB + per-org NDJSON.
#
# Produces three artifacts and uploads each to S3 (versioned bucket):
#   1) globals.sql.zst      -- pg_dumpall --globals-only (roles, tablespaces)
#   2) database.dump.zst    -- pg_dump -Fc of the application database
#   3) org-<uuid>.ndjson.zst (per organization, one per org-scoped table)
#
# Env:
#   DATABASE_DIRECT_URL   postgres://user:pass@host:port/db (REQUIRED)
#   APP_S3_BUCKET         destination bucket (REQUIRED to upload; otherwise stdout)
#   APP_S3_PREFIX         key prefix, default "backups/<utc-date>"
#   APP_S3_REGION         AWS region for s3 cp, default $AWS_REGION
#   ORG_IDS               space-separated org UUIDs; default = SELECT from DB
#
# Style: matches scripts/_TEMPLATE.sh (set -euo pipefail, info/warn/err).

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Description:
  Nightly Postgres backup. Dumps globals, full database (-Fc), and per-org
  NDJSON of tenant-scoped tables; compresses with zstd; uploads to S3 when
  APP_S3_BUCKET is set.

Required env:
  DATABASE_DIRECT_URL    postgres://...    direct (NOT pgBouncer) DB URL
Optional env:
  APP_S3_BUCKET          s3 bucket name (skip upload if unset)
  APP_S3_PREFIX          key prefix (default backups/YYYY-MM-DD)
  APP_S3_REGION          aws region (default \$AWS_REGION)
  ORG_IDS                space-separated org UUIDs (default: all rows in organization)

Options:
  -h, --help    Show this help and exit.
EOF
}

info() { printf '\033[1;34minfo\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31merr\033[0m  %s\n' "$*" >&2; exit 1; }

UUID_RE='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

# Tables that carry organization_id and should be dumped per org for fast
# operator-level restore + tenant-export workflows. Kept in sync with the
# restore-drill assertions.
ORG_SCOPED_TABLES=(
  audit_event
  auth_invite
  impersonation
  organization
  organization_membership
  resource_grant
  tool_call_log
)

upload() {
  local src="$1" key="$2"
  if [ -z "${APP_S3_BUCKET:-}" ]; then
    warn "APP_S3_BUCKET not set, skipping upload of $key"
    return 0
  fi
  local region="${APP_S3_REGION:-${AWS_REGION:-eu-central-1}}"
  aws s3 cp "$src" "s3://${APP_S3_BUCKET}/${key}" \
    --region "$region" \
    --only-show-errors
  info "uploaded s3://${APP_S3_BUCKET}/${key}"
}

main() {
  while [ $# -gt 0 ]; do
    case "$1" in
      -h|--help) usage; exit 0;;
      *) err "unknown arg: $1";;
    esac
  done

  [ -n "${DATABASE_DIRECT_URL:-}" ] || err "DATABASE_DIRECT_URL is required"

  local date_utc
  date_utc=$(date -u +%Y-%m-%d)
  local prefix="${APP_S3_PREFIX:-backups/${date_utc}}"

  local workdir
  workdir=$(mktemp -d)
  trap 'rm -rf "$workdir"' EXIT

  info "pg_dumpall --globals-only"
  pg_dumpall --globals-only --dbname="$DATABASE_DIRECT_URL" \
    | zstd -q -19 -o "$workdir/globals.sql.zst"
  upload "$workdir/globals.sql.zst" "${prefix}/globals.sql.zst"

  info "pg_dump -Fc full database"
  pg_dump -Fc --dbname="$DATABASE_DIRECT_URL" -f "$workdir/database.dump"
  zstd -q -19 --rm "$workdir/database.dump" -o "$workdir/database.dump.zst"
  upload "$workdir/database.dump.zst" "${prefix}/database.dump.zst"

  # Per-org NDJSON. ORG_IDS env wins over auto-discovery.
  local org_ids="${ORG_IDS:-}"
  if [ -z "$org_ids" ]; then
    info "discovering organization ids from DB"
    org_ids=$(psql "$DATABASE_DIRECT_URL" -At \
      -c "SELECT id FROM organization ORDER BY id" \
      || err "failed to enumerate organizations")
  fi

  for org_id in $org_ids; do
    if [[ ! "$org_id" =~ $UUID_RE ]]; then
      warn "skipping non-UUID org id: $org_id"
      continue
    fi
    info "dumping org $org_id"
    local org_file="$workdir/org-${org_id}.ndjson"
    : > "$org_file"
    for table in "${ORG_SCOPED_TABLES[@]}"; do
      psql "$DATABASE_DIRECT_URL" -At \
        -v ON_ERROR_STOP=1 \
        -c "COPY (SELECT row_to_json(t) FROM ${table} t WHERE organization_id = '${org_id}'::uuid) TO STDOUT" \
        | awk -v tbl="$table" '{print "{\"_table\":\"" tbl "\",\"row\":" $0 "}"}' \
        >> "$org_file"
    done
    zstd -q -19 --rm "$org_file" -o "$org_file.zst"
    upload "$org_file.zst" "${prefix}/org-${org_id}.ndjson.zst"
  done

  info "ok"
}

main "$@"
