#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# wal-archive.sh -- Postgres archive_command shim.
#
# Postgres invokes this as `archive_command = 'wal-archive.sh %p %f'` where
#   %p = absolute path to the WAL segment (the file to ship)
#   %f = file name only (used as the S3 key suffix)
#
# Exit 0  -> Postgres considers the WAL safely archived and may recycle.
# Exit !0 -> Postgres retries indefinitely; we MUST NOT lie about success.
#
# When APP_S3_BUCKET is unset we no-op (exit 0) so dev/staging clusters can
# run without WAL shipping configured. RDS does its own WAL archiving for
# PITR; this script exists for the local compose path + the operator-driven
# self-managed replicas, not for the managed RDS instance.

usage() {
  cat <<EOF
Usage: $(basename "$0") <wal-path> <wal-filename>

Required env:
  APP_S3_BUCKET     target bucket (no-op if unset, exits 0)
Optional env:
  APP_S3_PREFIX     key prefix (default wal/)
  APP_S3_REGION     aws region (default \$AWS_REGION)

Options:
  -h, --help        Show this help and exit.
EOF
}

info() { printf '\033[1;34minfo\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31merr\033[0m  %s\n' "$*" >&2; exit 1; }

main() {
  if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    usage; exit 0
  fi

  local wal_path="${1:-}"
  local wal_file="${2:-}"

  [ -n "$wal_path" ] || err "wal path argument missing (Postgres %p)"
  [ -n "$wal_file" ] || err "wal file name argument missing (Postgres %f)"
  [ -r "$wal_path" ] || err "wal path is not readable: $wal_path"

  if [ -z "${APP_S3_BUCKET:-}" ]; then
    warn "APP_S3_BUCKET unset, treating as archive=off (no-op)"
    exit 0
  fi

  local region="${APP_S3_REGION:-${AWS_REGION:-eu-central-1}}"
  local prefix="${APP_S3_PREFIX:-wal/}"
  local key="${prefix%/}/${wal_file}"

  # --no-progress + --only-show-errors keeps Postgres logs clean; failure
  # bubbles up via aws CLI exit code so Postgres retries.
  aws s3 cp "$wal_path" "s3://${APP_S3_BUCKET}/${key}" \
    --region "$region" \
    --only-show-errors

  info "archived $wal_file"
}

main "$@"
