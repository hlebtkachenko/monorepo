#!/usr/bin/env bash
# Generate a normalized schema snapshot for drift detection.
#
# Reads from PG* env vars (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
# Pipes pg_dump --schema-only through normalization filters that strip
# environment-dependent noise (timestamps, comments, version banners).
#
# Output: SQL text on stdout suitable for byte-equality comparison across
# runs.
#
# Local usage:
#   PGHOST=127.0.0.1 PGUSER=app_owner PGPASSWORD=dev_owner \
#   PGDATABASE=app_dev scripts/db-schema-snapshot.sh \
#     > packages/db/migrations/.schema-snapshot.sql
#
# pnpm wrapper: pnpm --filter @workspace/db db:schema-snapshot

set -euo pipefail

pg_dump \
  --schema-only \
  --no-owner \
  --no-privileges \
  --no-comments \
  --no-publications \
  --no-subscriptions \
  --no-security-labels \
  --no-tablespaces \
  --schema=public \
  --exclude-schema=pgboss \
  --exclude-table=_app_migrations \
  | grep -v '^-- Dumped from' \
  | grep -v '^-- Dumped by' \
  | grep -v '^-- PostgreSQL database dump' \
  | grep -v '^-- Started on' \
  | grep -v '^-- Completed on' \
  | grep -v '^\\restrict ' \
  | grep -v '^\\unrestrict ' \
  | sed -E '/^$/N;/^\n$/D'
