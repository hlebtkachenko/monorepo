#!/usr/bin/env bash
#
# Fast ad-hoc SQL against a deployed env's Postgres — in-VPC via ECS Exec, ~2s.
# The proper alternative to the EC2 bastion (scripts/staging-bastion-migrate.sh)
# for READS and quick ops: no EC2, no SSM port-forward, no laptop->RDS tunnel.
#
# How it works: `aws ecs execute-command` runs a one-shot node script INSIDE the
# already-running `api` container (which ships the `postgres` driver and the DB
# connection parts as env vars). The script composes the connection from those
# parts (DATABASE_URL itself is entrypoint-composed and absent from an exec
# shell), runs your SQL, and prints JSON. The password is read from the
# container env and never printed or transited through your laptop.
#
# Connects on the DIRECT RDS endpoint (not pgbouncer) with prepared statements
# off, so multi-statement / DDL / SET ROLE all behave.
#
# RLS: the api role (app_user) is a member of app_admin, so to read RLS-forced
# tables prefix your SQL with `SET ROLE app_admin;` (see 0002_auth.sql).
#
# Prereqs: AWS creds for the account, the session-manager-plugin, a RUNNING task
# in the target cluster. Read-only by policy here, but it runs whatever SQL you
# pass — treat it like a prod psql prompt.
#
# Usage:
#   ./scripts/db-query.sh production "SELECT email, role FROM app_user ORDER BY created_at"
#   ./scripts/db-query.sh staging    "SET ROLE app_admin; SELECT * FROM admin_workspace_allowlist"
#
set -euo pipefail

ENV_NAME="${1:?usage: db-query.sh <staging|production> \"<SQL>\"}"
SQL="${2:?usage: db-query.sh <staging|production> \"<SQL>\"}"
REGION="${AWS_REGION:-eu-central-1}"
CONTAINER="${DB_QUERY_CONTAINER:-api}"
CLUSTER="monorepo-${ENV_NAME}"

TASK=$(aws ecs list-tasks --cluster "$CLUSTER" --region "$REGION" \
  --desired-status RUNNING --query "taskArns[0]" --output text 2>/dev/null | awk -F/ '{print $NF}')
[ -n "$TASK" ] && [ "$TASK" != "None" ] || {
  echo "ERR: no RUNNING task in cluster $CLUSTER (env parked? cold-paused?)." >&2
  exit 1
}

# SQL is base64'd so any quoting/newlines survive the shell -> node hop intact.
SQL_B64=$(printf '%s' "$SQL" | base64 | tr -d '\n')

# In-container node program. Single-quoted so bash leaves the JS `${...}` and
# backticks alone; only $SQL_B64 is spliced in.
JS='const u=process.env;'\
'const url=`postgres://${u.DB_USER}:${encodeURIComponent(u.DB_PASSWORD)}@${u.DB_DIRECT_HOST||u.DB_HOST}:${u.DB_DIRECT_PORT||u.DB_PORT}/${u.DB_NAME}`;'\
'const sql=Buffer.from("'"$SQL_B64"'","base64").toString("utf8");'\
'const s=require("postgres")(url,{ssl:"require",prepare:false,max:1});'\
's.unsafe(sql).then(r=>{console.log(JSON.stringify(r,null,2));return s.end({timeout:5})}).then(()=>process.exit(0)).catch(e=>{console.error("ERR:",e.message);process.exit(1)});'
JS_B64=$(printf '%s' "$JS" | base64 | tr -d '\n')

exec aws ecs execute-command --region "$REGION" --cluster "$CLUSTER" --task "$TASK" \
  --container "$CONTAINER" --interactive \
  --command "sh -c 'echo $JS_B64 | base64 -d | node'"
