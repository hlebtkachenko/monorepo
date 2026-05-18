#!/usr/bin/env bash
#
# Apply pending DB migrations against the staging RDS instance via a
# temporary EC2 bastion + SSM Session Manager port-forward.
#
# Why this exists: RDS staging is in a private isolated subnet (no NAT,
# no permanent bastion). To apply migrations from a developer laptop the
# only path is a one-shot EC2 that the laptop reaches over SSM, with the
# EC2 reaching RDS over the VPC. This script handles the whole lifecycle:
# discovers infra from CloudFormation, mints an ephemeral SG + IAM role
# + instance profile, launches a t4g.nano, opens the SSM port-forward,
# runs `pnpm --filter @workspace/db db:migrate`, then tears down every
# resource it created.
#
# This is a stopgap. The proper fix is Day-3 of the deploy optimization
# audit: an ECS RunTask one-shot in `_deploy-aws.yml` that runs the
# migration inside the existing VPC + SG, no laptop or bastion needed.
# Track at AFF-33.
#
# Usage:
#   ./scripts/staging-bastion-migrate.sh [staging|production]
#
#   # Default: run migrations
#   ./scripts/staging-bastion-migrate.sh staging
#
#   # Ad-hoc SQL file copied into the bastion env
#   CMD='psql "$DATABASE_DIRECT_URL" -f /tmp/probe.sql' \
#     ./scripts/staging-bastion-migrate.sh staging
#
#   # Interactive shell with DATABASE_DIRECT_URL pre-set
#   CMD='bash -i' ./scripts/staging-bastion-migrate.sh staging
#
# Prereqs:
#   - AWS CLI v2 with credentials for the target account
#   - Session Manager plugin: brew install --cask session-manager-plugin
#   - pnpm installed locally
#   - Run from monorepo root
#
# Run time: ~3-4 min total (~1 min EC2 bring-up + SSM register, ~30 s
# migrations, ~1 min teardown).

set -euo pipefail

ENV_NAME="${1:-staging}"
REGION="${AWS_REGION:-eu-central-1}"
TIMESTAMP="$(date +%s)"
TAG="bastion-migrate-${ENV_NAME}-${TIMESTAMP}"

# Tracked for cleanup. Empty until each resource is created.
BASTION_SG=""
RDS_SG_RULE=""
ROLE_NAME=""
INSTANCE_ID=""
SSM_PID=""

cleanup() {
  local exit_code=$?
  echo ""
  echo "== Cleanup =="
  if [ -n "$SSM_PID" ]; then
    kill "$SSM_PID" 2>/dev/null || true
    wait "$SSM_PID" 2>/dev/null || true
    echo "ssm port-forward stopped"
  fi
  if [ -n "$INSTANCE_ID" ]; then
    aws ec2 terminate-instances --region "$REGION" --instance-ids "$INSTANCE_ID" >/dev/null 2>&1 || true
    echo "instance $INSTANCE_ID terminating"
    aws ec2 wait instance-terminated --region "$REGION" --instance-ids "$INSTANCE_ID" 2>/dev/null || true
  fi
  if [ -n "$RDS_SG_RULE" ] && [ -n "$BASTION_SG" ]; then
    aws ec2 revoke-security-group-ingress --region "$REGION" \
      --group-id "$RDS_SG_RULE" --protocol tcp --port 5432 \
      --source-group "$BASTION_SG" >/dev/null 2>&1 || true
    echo "rds sg rule revoked"
  fi
  if [ -n "$BASTION_SG" ]; then
    aws ec2 delete-security-group --region "$REGION" --group-id "$BASTION_SG" >/dev/null 2>&1 || true
    echo "bastion sg deleted"
  fi
  if [ -n "$ROLE_NAME" ]; then
    aws iam remove-role-from-instance-profile --instance-profile-name "$ROLE_NAME" --role-name "$ROLE_NAME" >/dev/null 2>&1 || true
    aws iam delete-instance-profile --instance-profile-name "$ROLE_NAME" >/dev/null 2>&1 || true
    aws iam detach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore >/dev/null 2>&1 || true
    aws iam delete-role --role-name "$ROLE_NAME" >/dev/null 2>&1 || true
    echo "iam role + profile deleted"
  fi
  echo "Done. (exit $exit_code)"
  exit $exit_code
}
trap cleanup EXIT INT TERM

echo "== 1. Discover infrastructure (env=$ENV_NAME, region=$REGION) =="

# CDK output keys interleave a per-resource hash between words, so the
# Postgres endpoint key looks like
# ExportsOutputFnGetAttPostgres9DC8BB04EndpointAddress36F9722A — the
# substring "PostgresEndpointAddress" never appears. Match on the
# unambiguous tail "EndpointAddress" instead; the only sibling key with
# "Endpoint" in it is "EndpointPort", which this filter excludes.
RDS_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "Data-${ENV_NAME}" --region "$REGION" \
  --query "Stacks[0].Outputs[?contains(OutputKey,'EndpointAddress')].OutputValue | [0]" \
  --output text)
[ -n "$RDS_ENDPOINT" ] && [ "$RDS_ENDPOINT" != "None" ] || { echo "ERR: RDS endpoint not found in Data-${ENV_NAME} outputs"; exit 1; }
echo "  rds endpoint  : $RDS_ENDPOINT"

DB_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name "Data-${ENV_NAME}" --region "$REGION" \
  --query "Stacks[0].Outputs[?contains(OutputKey,'DbSecret')].OutputValue | [0]" \
  --output text)
[ -n "$DB_SECRET_ARN" ] && [ "$DB_SECRET_ARN" != "None" ] || { echo "ERR: DbSecret not found in Data-${ENV_NAME} outputs"; exit 1; }
echo "  db secret arn : ${DB_SECRET_ARN:0:60}..."

DB_INSTANCE_ID=$(aws rds describe-db-instances --region "$REGION" \
  --query "DBInstances[?Endpoint.Address=='$RDS_ENDPOINT'].DBInstanceIdentifier | [0]" \
  --output text)
RDS_VPC=$(aws rds describe-db-instances --region "$REGION" \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --query "DBInstances[0].DBSubnetGroup.VpcId" --output text)
RDS_SG_RULE=$(aws rds describe-db-instances --region "$REGION" \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --query "DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId" --output text)
echo "  vpc           : $RDS_VPC"
echo "  rds sg        : $RDS_SG_RULE"

PUBLIC_SUBNET=$(aws ec2 describe-subnets --region "$REGION" \
  --filters "Name=vpc-id,Values=$RDS_VPC" "Name=map-public-ip-on-launch,Values=true" \
  --query "Subnets[0].SubnetId" --output text)
[ -n "$PUBLIC_SUBNET" ] && [ "$PUBLIC_SUBNET" != "None" ] || { echo "ERR: no public subnet in vpc $RDS_VPC"; exit 1; }
echo "  public subnet : $PUBLIC_SUBNET"

AMI_ID=$(aws ssm get-parameter --region "$REGION" \
  --name "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64" \
  --query "Parameter.Value" --output text)
echo "  ami           : $AMI_ID (al2023 arm64)"

echo "== 2. Read DB credentials from Secrets Manager =="
SECRET_JSON=$(aws secretsmanager get-secret-value --region "$REGION" \
  --secret-id "$DB_SECRET_ARN" --query "SecretString" --output text)
DB_USER=$(echo "$SECRET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['username'])")
DB_PASS=$(echo "$SECRET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['password'])")
unset SECRET_JSON
echo "  db user       : $DB_USER"
echo "  db password   : (in memory only, never logged)"

echo "== 3. Create ephemeral IAM role + instance profile =="
ROLE_NAME="$TAG"
aws iam create-role --role-name "$ROLE_NAME" \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  >/dev/null
aws iam attach-role-policy --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam create-instance-profile --instance-profile-name "$ROLE_NAME" >/dev/null
aws iam add-role-to-instance-profile --instance-profile-name "$ROLE_NAME" --role-name "$ROLE_NAME"
echo "  role          : $ROLE_NAME"
echo "  waiting 12s for IAM eventual consistency..."
sleep 12

echo "== 4. Create ephemeral bastion SG + open RDS access =="
BASTION_SG=$(aws ec2 create-security-group --region "$REGION" \
  --group-name "$TAG" \
  --description "Temp bastion for $ENV_NAME RDS migration" \
  --vpc-id "$RDS_VPC" --query "GroupId" --output text)
echo "  bastion sg    : $BASTION_SG"

aws ec2 authorize-security-group-ingress --region "$REGION" \
  --group-id "$RDS_SG_RULE" --protocol tcp --port 5432 \
  --source-group "$BASTION_SG" >/dev/null
echo "  rds sg now accepts 5432 from bastion sg"

echo "== 5. Launch t4g.nano bastion =="
INSTANCE_ID=$(aws ec2 run-instances --region "$REGION" \
  --image-id "$AMI_ID" --instance-type t4g.nano \
  --subnet-id "$PUBLIC_SUBNET" \
  --security-group-ids "$BASTION_SG" \
  --associate-public-ip-address \
  --iam-instance-profile Name="$ROLE_NAME" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$TAG}]" \
  --metadata-options "HttpTokens=required,HttpEndpoint=enabled" \
  --query "Instances[0].InstanceId" --output text)
echo "  instance      : $INSTANCE_ID"

echo "== 6. Wait for SSM registration (up to 3 min) =="
for i in $(seq 1 36); do
  status=$(aws ssm describe-instance-information --region "$REGION" \
    --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
    --query "InstanceInformationList[0].PingStatus" --output text 2>/dev/null || echo "Pending")
  if [ "$status" = "Online" ]; then
    echo "  ssm online"
    break
  fi
  printf "  %02d/36 ssm=%s\r" "$i" "$status"
  sleep 5
done
[ "$status" = "Online" ] || { echo "ERR: SSM never came online"; exit 1; }

echo "== 7. Open SSM port-forward (background) =="
aws ssm start-session --region "$REGION" \
  --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$RDS_ENDPOINT,portNumber=5432,localPortNumber=5432" \
  >/tmp/ssm-tunnel.log 2>&1 &
SSM_PID=$!
echo "  ssm pid       : $SSM_PID"
echo "  waiting 8s for tunnel to stabilize..."
sleep 8

# Sanity probe: is the tunnel up? nc -z fails on macOS; use timeout + bash /dev/tcp.
if ! timeout 3 bash -c "cat </dev/tcp/127.0.0.1/5432" >/dev/null 2>&1; then
  echo "  WARN: 127.0.0.1:5432 not reachable yet; tail of ssm log:"
  tail -10 /tmp/ssm-tunnel.log
fi

DEFAULT_CMD='pnpm --filter @workspace/db db:migrate'
CMD="${CMD:-$DEFAULT_CMD}"

echo "== 8. Run command =="
echo "  cmd: $CMD"
export DATABASE_DIRECT_URL="postgres://${DB_USER}:${DB_PASS}@127.0.0.1:5432/monorepo?sslmode=require"
unset DB_PASS

# eval is intentional: the script is operator-driven and the operator owns
# the CMD value. set -euo pipefail (line 32) propagates failures; DB_PASS is
# already unset so it cannot be re-expanded by the eval'd command.
eval "$CMD"

if [ "$CMD" = "$DEFAULT_CMD" ]; then
  echo ""
  echo "== 9. Verify (count rows in api_key) =="
  PGPASSWORD_REDACTED='[redacted]' \
    psql "$DATABASE_DIRECT_URL" -c "SELECT COUNT(*) AS api_key_rows FROM api_key;" 2>&1 \
    | grep -v "password" || echo "  (psql probe skipped or table missing)"
fi

echo ""
echo "Done. Cleanup will run on exit."
unset DATABASE_DIRECT_URL
