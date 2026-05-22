# Vault Operations Runbook

> **Status:** skeleton — populated as milestones M1–M10 of [`docs/plans/SECRETS-MIGRATION.md`](../plans/SECRETS-MIGRATION.md) ship.
>
> **Backs:** [AFF-245](https://linear.app/hapddev/issue/AFF-245).
>
> **Authoritative reference for:** day-to-day Vault operations on the Hostinger
> KVM 2 VPS at `secrets-admin.afframe.com`. Anything that touches an unsealed
> Vault instance goes through one of these procedures.

## At a glance

| What         | Where                                                                      |
| ------------ | -------------------------------------------------------------------------- |
| Vault binary | Docker container, `hashicorp/vault:1.20.x`                                 |
| Storage      | Integrated Storage (Raft) at `/srv/secrets/vault/data`                     |
| Auto-unseal  | AWS KMS CMK `alias/monorepo-vault-unseal` (eu-central-1)                   |
| Audit device | File: `/srv/secrets/vault/audit/audit.log`                                 |
| Public URL   | `https://secrets-admin.afframe.com` (Cloudflare Tunnel → `127.0.0.1:8200`) |
| Staff SSO    | Cloudflare Access (Google Workspace + email OTP fallback)                  |
| Backup       | restic → Cloudflare R2 (primary) + Backblaze B2 (secondary)                |
| Sync to AWS  | systemd timer at `/usr/local/sbin/vault-to-ssm-sync.sh` (every 5 min)      |

## Status check

```bash
# From operator laptop (after `vault login` via OIDC):
vault status
vault audit list
vault secrets list
vault auth list

# From VPS:
systemctl status vault-backup.timer
systemctl status vault-to-ssm-sync.timer
docker compose -f /srv/secrets/vault/compose.yaml ps
```

Healthy state:

- `vault status` → `Initialized: true`, `Sealed: false`, no `HA Mode` (single node)
- `vault audit list` → at least one file device at `/vault/audit/audit.log`
- Both timers report a future `NEXT` run within the configured cadence

## Procedures

### Read a secret (operator)

```bash
vault login -method=oidc                                  # opens browser → Google
vault kv get platform/data/${env}/${name}                 # full record
vault kv get -field=value platform/data/${env}/${name}    # raw value only
```

### Write/rotate a secret

```bash
# 1. Generate the new value (provider-specific dashboard or `openssl rand`).
# 2. Write to Vault — this creates a new KV-v2 version:
vault kv put platform/data/${env}/${name} value=<new-value>

# 3. Wait ≤5 min for the Vault→SSM sync timer.
# 4. Verify the SSM parameter picked up the new value:
aws ssm get-parameter --name /monorepo/${env}/${name} --with-decryption --region eu-central-1

# 5. Trigger ECS task rollover (or wait for next deploy):
aws ecs update-service --cluster monorepo-${env} \
    --service ${service} --force-new-deployment --region eu-central-1
```

Rotation procedures per secret type live in [`SECRETS-ROTATION.md`](SECRETS-ROTATION.md).

### Backup verification

```bash
# On VPS, run the backup script ad-hoc:
sudo systemctl start vault-backup.service

# Confirm a snapshot landed in the primary repo:
sudo /usr/local/sbin/restic-env.sh restic snapshots --tag vault | tail

# Confirm timer is enabled and queued:
systemctl list-timers vault-backup
```

Full DR restore drill: [`DR-DRILL.md`](DR-DRILL.md).

### Restore procedure (paste this when prod Vault is gone)

> Status: stub. Populated when M2 DR restore drill executes — the drill output
> document on the throwaway VPS becomes the authoritative restore runbook here.

Outline:

1. Provision a fresh KVM with Docker + restic.
2. `restic restore latest --target /tmp/restored` (primary R2; fall back to B2 if R2 unavailable).
3. Bring up the Vault compose stack pointing `storage.raft.path` at the restored Raft tree.
4. Verify auto-unseal succeeds against the same AWS KMS CMK.
5. Repoint Cloudflare Tunnel to the new VPS (or rotate the tunnel token if migrating long-term).
6. Resume Vault→SSM sync timer.

### Unseal key recovery (KMS auto-unseal failure)

> Status: stub. Populated after M1 closes.

If AWS KMS auto-unseal stops working (e.g., KMS Key was disabled or IAM
credentials revoked):

1. Reach out via the safe-deposit paper escrow + macOS Keychain for the Shamir
   unseal keys.
2. `vault operator unseal` 3 times (threshold = 3 of 5).
3. Once unsealed, repair the KMS path (re-enable Key, fix IAM) and restart Vault
   to re-arm auto-unseal.

### Audit device rotation

Never disable the existing audit device — SOC 2 / DORA evidence loss. Instead:

```bash
# Add a new device (e.g., remote syslog):
vault audit enable -path=file2 file file_path=/vault/audit/audit-v2.log

# Verify writes hit BOTH devices:
vault kv put platform/test-rotation value=ok
tail /vault/audit/audit.log
tail /vault/audit/audit-v2.log

# Once confirmed, retire the old one:
vault audit disable file
```

### Adding a new secret

1. Operator writes to Vault: `vault kv put platform/data/${env}/${name} value=<v>`
2. Operator extends `/usr/local/sbin/vault-to-ssm-sync.sh` to include the new `(env, name)` tuple.
3. Operator extends `infra/cdk/lib/app-stack.ts` to wire `EcsSecret.fromSsmParameter` to the new SSM path.
4. Operator updates `docs/env-vars.md` with the new entry.
5. `pnpm verify` → PR → green CI → deploy.

### Adding a Vault role for a new workload

1. Decide auth method: ECS Fargate → AWS IAM Auth; GHA → JWT.
2. Define the Vault policy: minimum read scope on `platform/data/...` paths.
3. Bind the policy to a role with the right principal (IAM role ARN for ECS, `repo:org/repo:environment:env` for GHA).
4. Token TTL = 1h default; refresh logic at workload side.

## Irreversible operations register

See [`docs/plans/SECRETS-MIGRATION.md`](../plans/SECRETS-MIGRATION.md#irreversible-operations-register).
Operations listed there are NEVER executed without:

- Advisor confirmation;
- Two-person check (advisor + operator) on the irreversible action;
- Documented rollback path (where one exists).

## Common alarms + responses

| Alarm                                       | Likely cause                  | First response                                                                                                           |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `vault status` returns `connection refused` | Container down                | `docker compose -f /srv/secrets/vault/compose.yaml up -d`; check `journalctl -u docker`                                  |
| `vault status` returns `sealed: true`       | KMS auto-unseal failed        | Check AWS KMS Key status + IAM creds; if blocked, fall back to Shamir unseal                                             |
| SSM parameter has stale value               | Sync timer failed             | `systemctl status vault-to-ssm-sync.timer`, inspect `journalctl -u vault-to-ssm-sync`                                    |
| Backup timer last-run > 12h                 | Restic auth / network failure | `systemctl status vault-backup`; `journalctl -u vault-backup`; verify R2 / B2 credentials in `/root/.config/restic/.env` |
| Audit log empty after a known write         | Audit device misconfigured    | `vault audit list`; re-enable with `vault audit enable file file_path=...`                                               |
| Cloudflare Access 403 for known operator    | Policy / IdP regression       | Cloudflare Zero Trust dashboard → Access → "Afframe Staff Tools"                                                         |

## Related runbooks

- [`SECRETS.md`](SECRETS.md) — secrets convention (post-migration form)
- [`SECRETS-ROTATION.md`](SECRETS-ROTATION.md) — rotation playbooks per secret type
- [`DR-DRILL.md`](DR-DRILL.md) — disaster recovery drill (Vault restore)
- [`AWS-DEPLOY.md`](AWS-DEPLOY.md) — CDK deploy wiring chain
- [`COST-INCIDENT-RESPONSE.md`](COST-INCIDENT-RESPONSE.md) — cost-runaway kill switch (KMS Key is part of the registry)
