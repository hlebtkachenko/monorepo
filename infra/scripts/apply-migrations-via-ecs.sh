#!/usr/bin/env bash
# shellcheck disable=SC2016
# (JMESPath backticks + nested-shell quoting are intentional; expanding them
# in this outer bash would break the inner query / in-task POSIX sh script.)
#
# apply-migrations-via-ecs.sh
#
# Apply pending `packages/db/migrations/*.sql` files to the env's RDS by
# running a one-off ECS Fargate task. Used by `.github/workflows/_deploy-aws.yml`
# in place of an operator-driven bastion `pnpm db:migrate`.
#
# Why this shape (not `pnpm db:migrate` in the deploy runner):
#
#   - RDS is in private subnets. The GitHub runner cannot reach it directly.
#   - The "Drizzle migration ECS task" is listed as deferred in
#     `docs/runbooks/AWS-DEPLOY.md`. This script is the smallest possible
#     bridge: it reuses the already-deployed Backup task definition (it has
#     the right network + `app_owner` secret wiring) and overrides the
#     command for one run. No new CDK resources, no new IAM grants.
#   - Migration SQL files are uploaded to `s3://<backup-bucket>/_migrations/`,
#     then read by the in-task script via presigned URLs (so the Backup
#     task role does NOT need `s3:GetObject` on its own bucket).
#
# Idempotent: the in-task script journals every applied file in
# `_app_migrations` and skips already-applied ones (matching the behavior
# of `packages/db/scripts/apply-migrations.ts`).
#
# Required env (passed by the workflow):
#   AWS_REGION, ENV_NAME, AWS_ACCOUNT_ID
#
# Exit codes:
#   0 — every pending migration applied (or skipped because already there)
#   1 — pre-flight error (missing stack outputs, no migration files, etc)
#   2 — ECS task failed (non-zero exit; full container log is printed)
set -euo pipefail

: "${AWS_REGION:?required}"
: "${ENV_NAME:?required}"
: "${AWS_ACCOUNT_ID:?required}"

repo_root=$(cd "$(dirname "$0")/../.." && pwd)
mig_dir="$repo_root/packages/db/migrations"

if [ ! -d "$mig_dir" ]; then
  echo "::error::Migration directory not found: $mig_dir"
  exit 1
fi

# Per-env token-env code. Mirrors the AppStack mapping in infra/cdk/lib/app-stack.ts
# (envName → AUTH_TOKEN_ENV: staging→stg, production→prd, else→dev).
case "$ENV_NAME" in
  staging)    token_env=stg ;;
  production) token_env=prd ;;
  *)          token_env=dev ;;
esac

# Backup stack outputs give us the bucket + task-def we need.
bucket=$(aws cloudformation describe-stacks \
  --stack-name "Backup-${ENV_NAME}" \
  --region "$AWS_REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`BackupBucketName`].OutputValue' \
  --output text)
taskdef=$(aws cloudformation describe-stacks \
  --stack-name "Backup-${ENV_NAME}" \
  --region "$AWS_REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`BackupTaskDefinitionArn`].OutputValue' \
  --output text)
cluster=$(aws cloudformation describe-stacks \
  --stack-name "Backup-${ENV_NAME}" \
  --region "$AWS_REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`BackupClusterName`].OutputValue' \
  --output text)

if [ -z "$bucket" ] || [ -z "$taskdef" ] || [ -z "$cluster" ]; then
  echo "::error::Backup-${ENV_NAME} stack outputs missing: bucket=$bucket taskdef=$taskdef cluster=$cluster"
  exit 1
fi
echo "Backup bucket : $bucket"
echo "Task def      : $(basename "$taskdef")"
echo "Cluster       : $cluster"
echo "Token env     : $token_env"

# AppSecurityGroup + public subnets in the App-${ENV_NAME} VPC (Backup task
# uses the same SG so RDS allows it to reach :5432).
app_sg=$(aws cloudformation describe-stack-resources \
  --stack-name "Network-${ENV_NAME}" \
  --region "$AWS_REGION" \
  --query "StackResources[?LogicalResourceId=='AppSecurityGroupBF95EC4A' || LogicalResourceId=='AppSg898BCA4E'].PhysicalResourceId | [0]" \
  --output text)
if [ -z "$app_sg" ] || [ "$app_sg" = "None" ]; then
  # Generic fallback: starts_with on the construct id.
  app_sg=$(aws cloudformation describe-stack-resources \
    --stack-name "Network-${ENV_NAME}" \
    --region "$AWS_REGION" \
    --query "StackResources[?ResourceType=='AWS::EC2::SecurityGroup' && starts_with(LogicalResourceId, 'AppSg')].PhysicalResourceId | [0]" \
    --output text)
fi
public_subnets=$(aws cloudformation describe-stack-resources \
  --stack-name "Network-${ENV_NAME}" \
  --region "$AWS_REGION" \
  --query "StackResources[?ResourceType=='AWS::EC2::Subnet' && contains(LogicalResourceId, 'Public')].PhysicalResourceId" \
  --output text | tr '\t' ',' )
if [ -z "$app_sg" ] || [ -z "$public_subnets" ]; then
  echo "::error::Could not resolve AppSecurityGroup or public subnets from Network-${ENV_NAME}"
  exit 1
fi
echo "App SG        : $app_sg"
echo "Subnets       : $public_subnets"

# Build the per-migration env vars + checksums.
files=()
while IFS= read -r f; do files+=("$f"); done < <(find "$mig_dir" -maxdepth 1 -name '*.sql' | sort)
if [ "${#files[@]}" -eq 0 ]; then
  echo "No migrations to apply."
  exit 0
fi
echo "Pending file count: ${#files[@]}"

# Upload to s3://bucket/_migrations/<sha-prefix>/<filename>.sql so concurrent
# runs cannot collide. Presigned URLs short-circuit IAM on the consumer side.
run_id=$(date -u +%Y%m%dT%H%M%SZ)-$$
s3_prefix="_migrations/${run_id}"
env_json_entries=()
declare -i idx=0
for f in "${files[@]}"; do
  name=$(basename "$f")
  sum=$(sha256sum "$f" | awk '{print $1}')
  s3_key="${s3_prefix}/${name}"
  aws s3 cp "$f" "s3://${bucket}/${s3_key}" --region "$AWS_REGION" --only-show-errors
  url=$(aws s3 presign "s3://${bucket}/${s3_key}" --expires-in 3600 --region "$AWS_REGION")
  env_json_entries+=("{\"name\": \"URL_${idx}\", \"value\": $(jq -Rn --arg v "$url" '$v')}")
  env_json_entries+=("{\"name\": \"SUM_${idx}\", \"value\": \"${sum}\"}")
  env_json_entries+=("{\"name\": \"NAME_${idx}\", \"value\": \"${name}\"}")
  idx=$((idx + 1))
done
env_json_entries+=("{\"name\": \"AUTH_TOKEN_ENV\", \"value\": \"${token_env}\"}")
env_json_entries+=("{\"name\": \"MIG_COUNT\", \"value\": \"${#files[@]}\"}")

# The in-task script. POSIX sh — the Backup image is alpine + busybox.
# Uses /dev/shm because the readonlyRootFilesystem + ephemeral /tmp volume
# combo on the Backup task leaves /tmp owned by root:root (the task runs
# as UID 65532).
in_task_script='set -eu
PGURL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"
WORK=/dev/shm/migrate
mkdir -p "$WORK"
psql "$PGURL" -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS _app_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now(), checksum text NOT NULL)"

apply_one() {
  i=$1
  eval name=\$NAME_$i
  eval url=\$URL_$i
  eval sum=\$SUM_$i
  applied=$(psql "$PGURL" -tAc "SELECT 1 FROM _app_migrations WHERE filename = '"'"'"$name"'"'"'" || true)
  if [ "$applied" = "1" ]; then
    echo "[skipped] $name"
    return 0
  fi
  echo "[applying] $name ($sum)"
  fname="$WORK/m.sql"
  wget -qO "$fname" "$url"
  actual=$(sha256sum "$fname" | awk '"'"'{print $1}'"'"')
  if [ "$actual" != "$sum" ]; then
    echo "[mismatch] $name: expected $sum got $actual"
    exit 1
  fi
  psql "$PGURL" -v ON_ERROR_STOP=1 <<SQL
SET app.auth_token_env = '"'"'$AUTH_TOKEN_ENV'"'"';
\i $fname
INSERT INTO _app_migrations (filename, checksum) VALUES ('"'"'$name'"'"', '"'"'$sum'"'"');
SQL
  echo "[applied] $name"
}

i=0
while [ "$i" -lt "$MIG_COUNT" ]; do
  apply_one "$i"
  i=$((i + 1))
done
echo "ALL MIGRATIONS DONE"'

env_json="[$(IFS=,; echo "${env_json_entries[*]}")]"
overrides=$(jq -n --arg cmd "$in_task_script" --argjson env "$env_json" '{
  containerOverrides: [{
    name: "backup",
    command: [$cmd],
    environment: $env
  }]
}')
echo "$overrides" > /tmp/_apply-migrations-overrides.json

# 8192-byte cap on container overrides. Each entry is small (~100 chars for
# name+sum, ~500 for presigned URL); a sane upper bound is ~30 migrations.
size=$(wc -c < /tmp/_apply-migrations-overrides.json)
echo "Override JSON size: ${size} bytes (AWS limit: 8192)"
if [ "$size" -gt 8192 ]; then
  echo "::error::Override JSON exceeds 8 KiB. Reduce migration count per run or switch to a dedicated migration TaskDef."
  exit 1
fi

task_arn=$(aws ecs run-task \
  --cluster "$cluster" \
  --task-definition "$taskdef" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${public_subnets}],securityGroups=[${app_sg}],assignPublicIp=ENABLED}" \
  --overrides file:///tmp/_apply-migrations-overrides.json \
  --region "$AWS_REGION" \
  --query 'tasks[0].taskArn' \
  --output text)
task_id=${task_arn##*/}
echo "Task: $task_id"

# Wait for STOPPED with a 10-minute ceiling.
start=$(date +%s)
while :; do
  status=$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_id" --region "$AWS_REGION" --query 'tasks[0].lastStatus' --output text)
  echo "  status: $status"
  [ "$status" = "STOPPED" ] && break
  now=$(date +%s)
  if [ $((now - start)) -gt 600 ]; then
    echo "::error::Migration task did not reach STOPPED within 10 min"
    exit 2
  fi
  sleep 5
done

# CloudWatch ingestion lag.
sleep 8

echo "=== Container log ==="
aws logs filter-log-events \
  --log-group-name "/ecs/monorepo-${ENV_NAME}/backup" \
  --region "$AWS_REGION" \
  --start-time "$((start * 1000 - 60000))" \
  --query 'events[*].message' \
  --output text 2>&1 | tr '\t' '\n'

exit_code=$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_id" --region "$AWS_REGION" --query 'tasks[0].containers[0].exitCode' --output text)
if [ "$exit_code" != "0" ]; then
  reason=$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_id" --region "$AWS_REGION" --query 'tasks[0].stoppedReason' --output text)
  echo "::error::Migration task exited with code $exit_code (reason: $reason)"
  exit 2
fi

# Cleanup uploaded SQL files. Bucket has lifecycle expiry but explicit
# removal keeps the prefix tidy.
aws s3 rm "s3://${bucket}/${s3_prefix}/" --recursive --region "$AWS_REGION" --only-show-errors || true

echo "Migrations applied successfully."
