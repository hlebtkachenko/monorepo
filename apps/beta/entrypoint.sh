#!/bin/sh
# Container entrypoint for the beta portal image.
#
# Contract, stated at the task-definition call site
# (infra/cdk/lib/beta-app-stack.ts:270-279): `/app/entrypoint.sh` must
#   (1) apply the Drizzle migrations against $DATABASE_URL, then
#   (2) `HOSTNAME=0.0.0.0 exec node apps/beta/server.js`.
#
# Why migrations run here at all: beta's RDS sits in PRIVATE_ISOLATED subnets
# behind a VPC with zero NAT gateways, so a GitHub runner cannot reach it, and
# production's one-off-ECS-task bridge piggybacks a Backup stack this
# environment does not have (plan Part 2 §3). desiredCount is 1, so no two
# migration runs can race; the runner also takes a Postgres advisory lock to
# cover the brief old-task/new-task overlap of a rolling deploy.
#
# `set -e` is the whole failure model: a failed migration exits non-zero, the
# container never starts serving, ECS crash-loops the task, and the deploy
# workflow's /healthz smoke step fails the deploy. No half-migrated database
# ever answers a request.
set -eu

echo "[entrypoint] applying migrations"
node /app/migrate/migrate.mjs

echo "[entrypoint] starting beta"
# HOSTNAME must be forced: the Fargate runtime overrides the image's ENV with
# the container hostname (ip-10-x-x-x) and the Next.js standalone server would
# then bind only that interface, leaving the cloudflared sidecar's
# localhost:$PORT connection refused.
HOSTNAME=0.0.0.0 exec node apps/beta/server.js
