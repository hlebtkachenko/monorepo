# Vault config — lives at /srv/secrets/vault/config/vault.hcl on the Hostinger
# VPS, mounted into the Vault container at /vault/config/vault.hcl:ro.
#
# Tracks: AFF-245 M1 step 4. Plan: docs/plans/SECRETS-MIGRATION.md § M1 task 4.
# Runbook: docs/runbooks/VAULT-OPS.md.

# ---- Storage --------------------------------------------------------------

# Integrated Storage (Raft), single node. No external Consul. The plan defers
# multi-node HA + Postgres backend until 100-client horizon (AFF-245 M-future).
storage "raft" {
  path    = "/vault/data"
  node_id = "afframe-vault-1"
}

# ---- Listener -------------------------------------------------------------

# Bind to all interfaces inside the container so the cloudflared sidecar
# can reach `vault:8200` over the shared Docker network. The host-side port
# mapping in compose.yaml restricts external access to 127.0.0.1, so the only
# public path is via Cloudflare Tunnel → Cloudflare Access → Google OIDC.
#
# TLS is terminated by Cloudflare. End-to-end is plaintext only inside the
# tunnel + Docker network.
listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_disable   = true
}

# ---- Auto-unseal via AWS KMS ---------------------------------------------

# The CMK lives in eu-central-1; managed by infra/cdk/lib/secrets-stack.ts
# (stack `SecretsBootstrap`). The IAM user `vault-unseal-vps` provides the
# access key + secret via env vars in the container (loaded from ./.env).
#
# Annual rotation is enabled on the CMK; key deletion is denied by resource
# policy. If this key ever becomes unreachable, fall back to Shamir unseal
# with the 3-of-5 escrowed unseal keys (Keychain + offline escrow).
seal "awskms" {
  region     = "eu-central-1"
  kms_key_id = "ed05513d-eb4d-4ad4-b829-7afd69080b6c"
}

# ---- Cluster (single-node placeholder) -----------------------------------

api_addr     = "https://secrets-admin.afframe.com"
cluster_addr = "https://secrets-admin.afframe.com:8201"

# ---- Misc ----------------------------------------------------------------

ui            = true
disable_mlock = true   # Docker doesn't allow mlock; IPC_LOCK cap is set anyway

# Telemetry stays OFF until a Prometheus endpoint is provisioned (deferred).
# telemetry { ... }
