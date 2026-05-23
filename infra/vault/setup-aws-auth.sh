#!/usr/bin/env bash
# Bootstrap the Vault AWS IAM Auth method for ECS workloads (AFF-245 M3).
#
# Run ONCE after PR-B merges and the `vault-aws-auth-verifier` IAM user
# has access keys (from SecretsBootstrap CDK stack).
#
# Pre-requisites:
#   1. SecretsBootstrap stack deployed (PR creating vault-aws-auth-verifier merged).
#   2. Operator ran `aws iam create-access-key --user-name vault-aws-auth-verifier`
#      and escrowed the output (macOS Keychain + paper).
#   3. App-staging + App-production stacks deployed (ECS task roles exist).
#   4. Operator logged into Vault (`vault login`) with a token that has
#      `sys/auth` + `sys/policies/acl` write capability (root token at M3,
#      operator-scoped admin token post-M3.5).
#
# This script is IDEMPOTENT — re-running it after a partial failure is safe.
# Tracks: AFF-245 M3. Plan: docs/plans/SECRETS-MIGRATION.md § M3.

set -euo pipefail

if [[ -z "${VAULT_ADDR:-}" ]]; then
  echo "[setup-aws-auth] VAULT_ADDR is unset. Export it first:"
  echo "    export VAULT_ADDR=https://secrets-admin.afframe.com"
  exit 1
fi

if ! vault token lookup >/dev/null 2>&1; then
  echo "[setup-aws-auth] not logged into Vault. Run \`vault login\` first."
  exit 1
fi

# --- discover ECS task role ARNs from AWS --------------------------------

echo "[setup-aws-auth] discovering ECS task role ARNs from AWS"

STAGING_TASK_ROLE=$(aws iam list-roles \
  --query "Roles[?starts_with(RoleName, 'App-staging-TaskRole')].Arn | [0]" \
  --output text)
PRODUCTION_TASK_ROLE=$(aws iam list-roles \
  --query "Roles[?starts_with(RoleName, 'App-production-TaskRole')].Arn | [0]" \
  --output text)

if [[ "$STAGING_TASK_ROLE" == "None" || -z "$STAGING_TASK_ROLE" ]]; then
  echo "[setup-aws-auth] could not find App-staging-TaskRole* — is App-staging deployed?" >&2
  exit 1
fi
if [[ "$PRODUCTION_TASK_ROLE" == "None" || -z "$PRODUCTION_TASK_ROLE" ]]; then
  echo "[setup-aws-auth] could not find App-production-TaskRole* — is App-production deployed?" >&2
  exit 1
fi

echo "  staging:    $STAGING_TASK_ROLE"
echo "  production: $PRODUCTION_TASK_ROLE"

# --- enable aws auth method (idempotent) ---------------------------------

if vault auth list -format=json | jq -e '."aws/"' >/dev/null; then
  echo "[setup-aws-auth] aws auth method already enabled"
else
  echo "[setup-aws-auth] enabling aws auth method"
  vault auth enable aws
fi

# --- configure aws auth client (the verifier user creds) -----------------

echo "[setup-aws-auth] paste vault-aws-auth-verifier credentials"
echo "  (from \`aws iam create-access-key --user-name vault-aws-auth-verifier\`,"
echo "   or your macOS Keychain entries afframe-vault-aws-auth-verifier-{access-key-id,secret-access-key})"
read -srp "  Access Key ID: " VERIFIER_AK
echo
read -srp "  Secret Access Key: " VERIFIER_SK
echo

if [[ -z "$VERIFIER_AK" || -z "$VERIFIER_SK" ]]; then
  echo "[setup-aws-auth] empty credentials; aborting" >&2
  exit 1
fi

vault write -force auth/aws/config/client \
  access_key="$VERIFIER_AK" \
  secret_key="$VERIFIER_SK"

# --- write policies (idempotent) -----------------------------------------

POLICY_DIR="$(dirname "$0")/policies"

echo "[setup-aws-auth] writing policy read-staging-secrets"
vault policy write read-staging-secrets "$POLICY_DIR/read-staging-secrets.hcl"

echo "[setup-aws-auth] writing policy read-production-secrets"
vault policy write read-production-secrets "$POLICY_DIR/read-production-secrets.hcl"

# --- bind roles ----------------------------------------------------------

# `auth_type=iam` (not `ec2`) — ECS Fargate tasks expose their identity via
# task role STS GetCallerIdentity, not instance metadata.
# ttl=1h means a fresh login is required every hour; max_ttl=24h caps total
# session length. Sufficient for long-running tasks that refresh on retry.

echo "[setup-aws-auth] binding role ecs-staging"
vault write auth/aws/role/ecs-staging \
  auth_type=iam \
  bound_iam_principal_arn="$STAGING_TASK_ROLE" \
  policies=read-staging-secrets \
  ttl=1h \
  max_ttl=24h \
  resolve_aws_unique_ids=true

echo "[setup-aws-auth] binding role ecs-production"
vault write auth/aws/role/ecs-production \
  auth_type=iam \
  bound_iam_principal_arn="$PRODUCTION_TASK_ROLE" \
  policies=read-production-secrets \
  ttl=1h \
  max_ttl=24h \
  resolve_aws_unique_ids=true

# --- verify --------------------------------------------------------------

echo "[setup-aws-auth] verifying — vault list auth/aws/roles"
vault list auth/aws/roles

echo
echo "[setup-aws-auth] DONE. Next steps:"
echo "  1. From inside a staging ECS task, run:"
echo "       vault write auth/aws/login role=ecs-staging \\"
echo "         iam_http_request_method=POST \\"
echo "         iam_request_url=<base64(https://sts.amazonaws.com/)> \\"
echo "         iam_request_body=<base64(Action=GetCallerIdentity&Version=2011-06-15)> \\"
echo "         iam_request_headers=<base64(signed-headers-json)>"
echo "  2. Verify the issued token has policy read-staging-secrets and TTL 1h."
echo "  3. Repeat from production task with role=ecs-production."
echo "  4. After 24h soak with no auth regressions, proceed to M3.5"
echo "     (revoke initial root token via vault token revoke <token>)."
