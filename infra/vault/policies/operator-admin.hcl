# operator-admin — daily admin policy that replaces the initial root token
# at M3.5. Designed for Hleb's single-operator ops on the Hostinger VPS.
#
# Capabilities granted:
#   - Full CRUD on platform/* (the kv-v2 mount where app secrets live)
#   - Create + revoke non-root tokens (issue per-CI / per-script tokens)
#   - Manage policies (write new policies as the platform evolves)
#   - Enable + configure auth methods (jwt, aws, oidc, etc.)
#   - Read audit + system status (visibility into who did what)
#
# Capabilities NOT granted (deliberately — these require recovery keys):
#   - sys/rekey/* (rotate recovery keys)
#   - sys/generate-root/* (mint new root token)
#   - sys/seal, sys/step-down (seal Vault)
#   - sys/raft/snapshot-force (force snapshot restore)
#   - sys/storage/raft/remove-peer
#
# If any of those is needed: use 3-of-5 recovery keys to mint a fresh
# root token via `vault operator generate-root`. Procedure in VAULT-OPS.md.

# kv-v2 mount: platform/*  (both data + metadata paths for full CRUD)
path "platform/data/*" {
  capabilities = ["create", "read", "update", "delete", "patch", "list"]
}
path "platform/metadata/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "platform/delete/*" {
  capabilities = ["update"]
}
path "platform/undelete/*" {
  capabilities = ["update"]
}
path "platform/destroy/*" {
  capabilities = ["update"]
}

# Token management — issue + revoke non-root tokens
path "auth/token/create" {
  capabilities = ["create", "update"]
}
path "auth/token/lookup-self" {
  capabilities = ["read"]
}
path "auth/token/lookup" {
  capabilities = ["update"]
}
path "auth/token/lookup-accessor" {
  capabilities = ["update"]
}
path "auth/token/revoke" {
  capabilities = ["update"]
}
path "auth/token/revoke-accessor" {
  capabilities = ["update"]
}
path "auth/token/renew" {
  capabilities = ["update"]
}
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Listing live token accessors requires `sudo` per Vault docs — the
# operator needs this to enumerate + find a revoke target (e.g. revoke
# the initial root token by accessor at M3.5).
path "auth/token/accessors" {
  capabilities = ["list", "sudo"]
}

# Policy management
path "sys/policies/acl" {
  capabilities = ["list"]
}
path "sys/policies/acl/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Auth method management (enable + configure aws, jwt, oidc, ...)
path "sys/auth" {
  capabilities = ["read", "list"]
}
path "sys/auth/*" {
  capabilities = ["create", "read", "update", "delete", "sudo"]
}

# Allow tuning + reading the configuration of existing auth backends
path "auth/aws/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "auth/jwt/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "auth/oidc/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Secret-engine management (mount new mounts, tune, list)
path "sys/mounts" {
  capabilities = ["read", "list"]
}
path "sys/mounts/*" {
  capabilities = ["create", "read", "update", "delete", "sudo"]
}

# Audit + monitoring visibility (read-only — never disable audit)
path "sys/audit" {
  capabilities = ["read", "list"]
}
path "sys/audit-hash/*" {
  capabilities = ["update"]
}
path "sys/health" {
  capabilities = ["read"]
}
path "sys/leader" {
  capabilities = ["read"]
}
path "sys/seal-status" {
  capabilities = ["read"]
}
path "sys/license/status" {
  capabilities = ["read"]
}

# Capabilities introspection (the operator should be able to ask "what can I do?")
path "sys/capabilities-self" {
  capabilities = ["update"]
}
path "sys/internal/ui/mounts" {
  capabilities = ["read", "list"]
}
path "sys/internal/ui/mounts/*" {
  capabilities = ["read"]
}
