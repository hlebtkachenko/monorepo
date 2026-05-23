# infra/vault — Vault VPS bring-up assets

Files in this directory are deployed by hand to the Hostinger KVM 2 VPS at
`secrets-admin.afframe.com` during milestones M1–M2 of the secrets-management
migration. Plan: [`docs/plans/SECRETS-MIGRATION.md`](../../docs/plans/SECRETS-MIGRATION.md).
Linear: [AFF-245](https://linear.app/hapddev/issue/AFF-245).

## File → VPS path mapping

| Repo path                                             | VPS path                                   | Notes                                                                |
| ----------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| `compose.yaml`                                        | `/srv/secrets/vault/compose.yaml`          | Image tags pinned + digest-locked                                    |
| `vault.hcl`                                           | `/srv/secrets/vault/config/vault.hcl`      | Mounted read-only into the container                                 |
| `env.template`                                        | `/srv/secrets/vault/.env`                  | Copy + fill + `chmod 0600`. NEVER commit filled-in copy              |
| `logrotate.vault-audit`                               | `/etc/logrotate.d/vault-audit`             | 13 weekly rotations, copytruncate                                    |
| `vps-overlay/usr/local/sbin/vault-backup`             | `/usr/local/sbin/vault-backup`             | Backup script. Mode 0755, root:root. **M2**                          |
| `vps-overlay/etc/systemd/system/vault-backup.service` | `/etc/systemd/system/vault-backup.service` | Oneshot. **M2**                                                      |
| `vps-overlay/etc/systemd/system/vault-backup.timer`   | `/etc/systemd/system/vault-backup.timer`   | Fires every 6h; Sunday tick runs B2 mirror + integrity check. **M2** |
| `vps-overlay/root/.config/restic/env.template`        | `/root/.config/restic/.env`                | Restic + R2 + B2 + Vault credentials. Mode 0600, root:root. **M2**   |

`vault-to-ssm-sync.sh` ships in PR M4.

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

## M2 — restic backup deploy procedure

Pre-requisites:

- M1 closed: Vault running, sealed false, `vault status` healthy.
- Cloudflare R2 bucket `afframe-vault-backup` (EU region) created + R2 API
  token scoped read/write to that bucket only.
- Restic repo password generated (`openssl rand -base64 32`), escrowed to
  macOS Keychain entry `afframe-vault-restic-password` + paper-at-safe-deposit.
- **B2 secondary mirror is deferred per [AFF-246](https://linear.app/hapddev/issue/AFF-246)**;
  ship the R2-only config. The script auto-detects the missing B2 env vars
  and skips the weekly mirror cleanly — re-enable later by populating
  `B2_*` + `RESTIC_REPOSITORY_SECONDARY` in `.env`.

```bash
# 1. Stage assets to operator home on VPS.
ssh afframe-vps 'mkdir -p ~/vault-stage/{sbin,systemd,restic}'
rsync -av infra/vault/vps-overlay/usr/local/sbin/vault-backup                       afframe-vps:~/vault-stage/sbin/
rsync -av infra/vault/vps-overlay/etc/systemd/system/vault-backup.service          afframe-vps:~/vault-stage/systemd/
rsync -av infra/vault/vps-overlay/etc/systemd/system/vault-backup.timer            afframe-vps:~/vault-stage/systemd/
rsync -av infra/vault/vps-overlay/root/.config/restic/env.template                 afframe-vps:~/vault-stage/restic/

# 2. Install + permission with sudo.
ssh -t afframe-vps '
  set -e
  sudo install -m 0755 -o root -g root ~/vault-stage/sbin/vault-backup /usr/local/sbin/vault-backup
  sudo install -m 0644 -o root -g root ~/vault-stage/systemd/vault-backup.service /etc/systemd/system/vault-backup.service
  sudo install -m 0644 -o root -g root ~/vault-stage/systemd/vault-backup.timer   /etc/systemd/system/vault-backup.timer
  sudo mkdir -p /root/.config/restic
  sudo install -m 0600 -o root -g root ~/vault-stage/restic/env.template          /root/.config/restic/.env
  rm -rf ~/vault-stage
'

# 3. Install restic.
ssh -t afframe-vps 'sudo apt update && sudo apt install -y restic'

# 4. Fill /root/.config/restic/.env (5 secrets: RESTIC_PASSWORD, AWS_ACCESS_KEY_ID,
#    AWS_SECRET_ACCESS_KEY, B2_ACCOUNT_ID, B2_ACCOUNT_KEY, VAULT_TOKEN).
ssh -t afframe-vps 'sudo nano /root/.config/restic/.env'

# 5. Initialize restic repo (ONE-TIME).
ssh -t afframe-vps '
  set -e
  set -a; source /root/.config/restic/.env; set +a
  sudo -E restic -r "$RESTIC_REPOSITORY_PRIMARY" init
  # When AFF-246 lands and B2 is added to .env, also run:
  # sudo -E restic -r "$RESTIC_REPOSITORY_SECONDARY" init
'

# 6. First run manually to confirm everything wires.
ssh -t afframe-vps 'sudo systemctl start vault-backup.service && sudo journalctl -u vault-backup --no-pager -n 30'

# 7. Enable the timer.
ssh -t afframe-vps '
  sudo systemctl daemon-reload
  sudo systemctl enable --now vault-backup.timer
  sudo systemctl list-timers vault-backup.timer
'

# 8. Verify a snapshot landed on R2.
ssh -t afframe-vps '
  set -e
  set -a; source /root/.config/restic/.env; set +a
  sudo -E restic -r "$RESTIC_REPOSITORY_PRIMARY" snapshots --tag vault | tail -10
'
```

## DR drill procedure (M2 advisor checkpoint #2)

Provision a throwaway KVM 1 ($6.49 first month, cancel after). Verify the
restic snapshot is restorable AND the restored Vault auto-unseals against
the same KMS CMK. Document RTO + RPO measured during the drill. Decommission
the throwaway VPS. Procedure outline in
[`docs/runbooks/VAULT-OPS.md`](../../docs/runbooks/VAULT-OPS.md) §
"Restore procedure".

## What this PR does NOT include

- The actual values inside `/srv/secrets/vault/.env` or `/root/.config/restic/.env` (operator pastes after deploy)
- The Vault → SSM SecureString sync script (PR M4)
- Live R2 / B2 buckets (operator provisions out-of-band; bucket names + token shapes are in `env.template`)

See the umbrella tracker [AFF-245](https://linear.app/hapddev/issue/AFF-245).
