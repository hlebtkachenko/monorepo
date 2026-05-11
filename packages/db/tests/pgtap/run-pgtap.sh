#!/usr/bin/env bash
# pgTap test runner.
#
# Expects a running Postgres with migrations applied + pgTap extension
# installed. Reads connection from standard PG* env vars. Runs every
# .sql file in this directory (except this script + README) via pg_prove.
#
# Exit: 0 if all tests pass, non-zero on any failure.

set -euo pipefail

cd "$(dirname "$0")"

# Ensure pgTap is loaded into the target DB. Idempotent.
psql -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pgtap;"

# Run all rls_*.sql files in order. pg_prove handles TAP output parsing.
shopt -s nullglob
sql_files=(rls_*.sql trigger_*.sql function_*.sql)
shopt -u nullglob

if [ ${#sql_files[@]} -eq 0 ]; then
  echo "No pgTap .sql files found"
  exit 1
fi

echo "Running ${#sql_files[@]} pgTap files via pg_prove..."
exec pg_prove --verbose "${sql_files[@]}"
