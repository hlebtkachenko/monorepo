# Vault policy: read-only access to platform/data/staging/* + the matching
# metadata path (KV v2 splits read into data/ + metadata/).
#
# Bound to Vault role `ecs-staging` (created by infra/vault/setup-aws-auth.sh),
# which authenticates the staging ECS task role via AWS IAM Auth method.
#
# Tracks: AFF-245 M3. Plan: docs/plans/SECRETS-MIGRATION.md § M3.

path "platform/data/staging/*" {
  capabilities = ["read"]
}

path "platform/metadata/staging/*" {
  capabilities = ["read", "list"]
}
