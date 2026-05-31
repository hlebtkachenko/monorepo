# Vault policy: read-only access to platform/data/production/* + the matching
# metadata path (KV v2 splits read into data/ + metadata/).
#
# Bound to Vault role `ecs-production` (created by infra/vault/setup-aws-auth.sh),
# which authenticates the production ECS task role via AWS IAM Auth method.
#
# Tracks: AFF-245 M3. Plan: docs/plans/SECRETS-MIGRATION.md § M3.

path "platform/data/production/*" {
  capabilities = ["read"]
}

path "platform/metadata/production/*" {
  capabilities = ["read", "list"]
}
