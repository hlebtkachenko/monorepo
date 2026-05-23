# infra/vault — Vault VPS bring-up assets

Files in this directory are deployed by hand to the Hostinger KVM 2 VPS at
`secrets-admin.afframe.com` during milestones M1–M2 of the secrets-management
migration. Plan: [`docs/plans/SECRETS-MIGRATION.md`](../../docs/plans/SECRETS-MIGRATION.md).
Linear: [AFF-245](https://linear.app/hapddev/issue/AFF-245).

## File → VPS path mapping

| Repo path               | VPS path                              | Notes                                                   |
| ----------------------- | ------------------------------------- | ------------------------------------------------------- |
| `compose.yaml`          | `/srv/secrets/vault/compose.yaml`     | Image tags pinned + digest-locked                       |
| `vault.hcl`             | `/srv/secrets/vault/config/vault.hcl` | Mounted read-only into the container                    |
| `env.template`          | `/srv/secrets/vault/.env`             | Copy + fill + `chmod 0600`. NEVER commit filled-in copy |
| `logrotate.vault-audit` | `/etc/logrotate.d/vault-audit`        | 13 weekly rotations, copytruncate                       |

Backup script, systemd timer, and `vault-to-ssm-sync.sh` ship in a later PR
(M2 / M4).

## Deploy procedure

Pre-requisite: SecretsBootstrap CDK stack already deployed (M1 step 1).
AWS access key for `vault-unseal-vps` already created via
`aws iam create-access-key` and escrowed.

```
# 1. From the repo root, copy assets to VPS. Adjust the SSH host as needed.
VAULT_HOST=vault.hostinger.afframe.com   # placeholder — use the real VPS host
rsync -av --rsync-path="sudo rsync" infra/vault/compose.yaml "root@${VAULT_HOST}:/srv/secrets/vault/compose.yaml"
rsync -av --rsync-path="sudo rsync" infra/vault/vault.hcl    "root@${VAULT_HOST}:/srv/secrets/vault/config/vault.hcl"
rsync -av --rsync-path="sudo rsync" infra/vault/env.template "root@${VAULT_HOST}:/srv/secrets/vault/.env"
rsync -av --rsync-path="sudo rsync" infra/vault/logrotate.vault-audit "root@${VAULT_HOST}:/etc/logrotate.d/vault-audit"

# 2. SSH in and fill the env file.
ssh root@${VAULT_HOST}
cd /srv/secrets/vault
nano .env   # paste the 3 values; save
chmod 0600 .env
chown root:root .env

# 3. Sanity-check the dir tree.
mkdir -p data audit
chown 100:1000 data audit          # Vault container UID:GID
chmod 700 data audit

# 4. Verify logrotate config parses.
logrotate -d /etc/logrotate.d/vault-audit   # dry-run; should print "rotating pattern: ..."

# 5. Start the stack.
docker compose up -d
docker compose logs vault | tail -20

# 6. Initialize Vault (ONE-TIME, IRREVERSIBLE — captures unseal keys + root token).
docker compose exec vault vault operator init -key-shares=5 -key-threshold=3
#    Capture the 5 unseal keys + initial root token from stdout. Store in
#    macOS Keychain (3) + paper at safe-deposit (2) per the irreversible-ops
#    register. NEVER paste them into Slack / Linear / a chat with an LLM.

# 7. Verify auto-unseal works.
docker compose restart vault
sleep 10
docker compose exec vault vault status   # Initialized: true, Sealed: false

# 8. Enable the audit device (mandatory day 1).
docker compose exec vault vault login <initial-root-token>
docker compose exec vault vault audit enable file file_path=/vault/audit/audit.log

# 9. Smoke test through the public URL.
#    Browser: https://secrets-admin.afframe.com → Cloudflare Access challenge
#    → Google login → Vault UI. Sign in with the root token (interim).
```

Tunnel + Access policy creation (steps 0a + 0b in chronological order) live
in `docs/runbooks/VAULT-OPS.md` once a Cloudflare API token is available;
they precede the file copy. The Cloudflare side is the only manual-dashboard
remnant after this PR.

## Image pin update procedure

Both images are pinned by tag AND sha256 digest (advisor Gate 0 should-fix
#9). Bump procedure:

```
# Pick the new tag (Vault: https://hub.docker.com/r/hashicorp/vault/tags ;
# cloudflared: https://hub.docker.com/r/cloudflare/cloudflared/tags).
docker pull hashicorp/vault:<new-tag>
docker images --digests hashicorp/vault:<new-tag>
# Copy the sha256:... digest into compose.yaml. Same procedure for cloudflared.
# PR; CI runs YAML lint; deploy by re-rsync.
```

## What this PR does NOT include

- The Cloudflare Tunnel + Access policy (manual until I have a CF API token)
- The restic backup script + systemd units (PR M1 step 5 / M2)
- The Vault → SSM SecureString sync script (PR M4)
- The actual values inside `.env` (operator pastes after deploy)

See the umbrella tracker [AFF-245](https://linear.app/hapddev/issue/AFF-245).
