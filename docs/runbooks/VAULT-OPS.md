# Vault Operations Runbook

> **Status:** M1 + M2 functional pass 2026-05-23 (M2 backup chain live; 7-day uptime soak underway; DR drill deferred to [AFF-247](https://linear.app/hapddev/issue/AFF-247); B2 secondary deferred to [AFF-246](https://linear.app/hapddev/issue/AFF-246)). Sections grow as M3–M10 of [`docs/plans/SECRETS-MIGRATION.md`](../plans/SECRETS-MIGRATION.md) ship.
>
> **Backs:** [AFF-245](https://linear.app/hapddev/issue/AFF-245).
>
> **Authoritative reference for:** day-to-day Vault operations on the Hostinger
> KVM 2 VPS at `secrets-admin.afframe.com`. Anything that touches an unsealed
> Vault instance goes through one of these procedures.

## M1 as-built (2026-05-23)

| Asset                 | Identifier / location                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KMS CMK               | `ed05513d-eb4d-4ad4-b829-7afd69080b6c` (alias `alias/monorepo-vault-unseal`, eu-central-1) — `infra/cdk/lib/secrets-stack.ts`, stack `SecretsBootstrap`, AWS account `637560253662`           |
| IAM user for KMS      | `vault-unseal-vps` — programmatic creds in `/srv/secrets/vault/.env` (mode 0600); 90-day rotation reminder (calendar)                                                                         |
| Cloudflare Tunnel     | `afframe-vault` (`5cd03299-3e6f-43ad-a795-3d1f25447517`); ingress `secrets-admin.afframe.com → http://vault:8200`; tunnel token in `.env`                                                     |
| DNS                   | CNAME `secrets-admin.afframe.com → 5cd03299-3e6f-43ad-a795-3d1f25447517.cfargotunnel.com` (proxied)                                                                                           |
| Cloudflare Access app | `Afframe Secrets Admin` (`e20a72eb-e8e0-493a-bc01-240a4d739432`); exact host (not wildcard); 24h session                                                                                      |
| Access policy         | "Allow operator" → include email `developer@hapdglobal.com`; single-mailbox SPOF acknowledged                                                                                                 |
| Access IdP            | One-time PIN only (`b5dc889e-8e8c-4f3e-94d9-efb432444dbc`); account-level. Google Workspace was scoped but not wired                                                                          |
| Vault `operator init` | `vault operator init -recovery-shares=5 -recovery-threshold=3` (NOT `-key-shares` — KMS auto-unseal rejects Shamir flags with `400 not applicable to seal type awskms`)                       |
| Escrow                | 5 recovery keys + initial root token in macOS Keychain (per-item entries) + paper-at-safe-deposit pending operator visit. **Recovery keys regenerate root tokens; they do NOT unseal Vault.** |
| Audit device          | `vault audit enable file file_path=/vault/audit/audit.log`; logrotate at `/etc/logrotate.d/vault-audit` (13 weekly, copytruncate)                                                             |
| Test secret           | `platform/test-secret = hello-from-m1` (verifies kv-v2 + audit chain end-to-end)                                                                                                              |

### 30-second smoke procedure

```bash
# Edge gate
curl -I https://secrets-admin.afframe.com   # expect 302 to hapd.cloudflareaccess.com

# Container + seal state
ssh -t afframe-vps 'sudo docker compose -f /srv/secrets/vault/compose.yaml ps'
ssh -t afframe-vps 'sudo docker compose -f /srv/secrets/vault/compose.yaml exec vault vault status'
# expect: vault Up healthy, cloudflared Up; status Initialized: true, Sealed: false, Seal Type awskms

# Audit log freshness
ssh -t afframe-vps 'sudo tail -1 /srv/secrets/vault/audit/audit.log | jq .time'
# expect: ISO timestamp within last few minutes (or update interval)

# Storage on durable disk + correct ownership
ssh afframe-vps 'df -h /srv/secrets/vault/audit && stat -c "%U:%G %a" /srv/secrets/vault/audit'
# expect: not tmpfs; ownership UID 100 / GID 1000; mode 700
```

## M2 as-built (2026-05-23 functional pass)

| Asset                   | Location                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backup script           | `/usr/local/sbin/vault-backup` (source: `infra/vault/vps-overlay/usr/local/sbin/vault-backup`); reads `/root/.config/restic/.env` via `set -a`                         |
| systemd unit            | `/etc/systemd/system/vault-backup.{service,timer}`; `ProtectHome=read-only`, `RESTIC_CACHE_DIR=/var/cache/restic`, `TimeoutStartSec=1800`                              |
| Restic repo (primary)   | `s3:https://e891323bcdc79af6e2b692027f14674c.eu.r2.cloudflarestorage.com/afframe-vault-backup` (Cloudflare R2, EU region, repo id `5b5e8232`)                          |
| Restic repo (secondary) | DEFERRED → [AFF-246](https://linear.app/hapddev/issue/AFF-246)                                                                                                         |
| Restic password         | macOS Keychain item `afframe-vault-restic-password` + paper-at-safe-deposit                                                                                            |
| R2 token                | macOS Keychain items `afframe-vault-r2-access-key-id` + `afframe-vault-r2-secret-access-key` (S3-compatible, scoped to bucket, TTL 2027-05-23 → rotate 90-day cadence) |
| Backup cadence          | every 6h UTC (`OnCalendar=*-*-* 00,06,12,18:00:00 UTC`); Sunday < 06:00 UTC tick adds `restic check --read-data-subset=5%`                                             |
| Retention               | `restic forget --keep-daily 7 --keep-weekly 12 --keep-monthly 12 --prune`                                                                                              |
| Failure signal          | sentinel file `/var/run/vault-backup.failed` (`test -e` for monitoring) + non-zero systemd exit                                                                        |
| First snapshot          | `b1988da1` (2026-05-23 14:34:43 UTC, 14.9 KiB raw → 15.5 KiB stored)                                                                                                   |
| DR drill                | DEFERRED → [AFF-247](https://linear.app/hapddev/issue/AFF-247) — restore is unverified end-to-end                                                                      |

### M2 30-second smoke

```bash
# Timer queued, last run successful
ssh -t afframe-vps 'sudo systemctl list-timers vault-backup.timer --no-pager'
ssh -t afframe-vps 'sudo systemctl status vault-backup.service --no-pager | head -20'

# Snapshots present
ssh -t afframe-vps 'sudo bash -c "set -a; . /root/.config/restic/.env; set +a; restic -r \"\$RESTIC_REPOSITORY_PRIMARY\" snapshots"'

# Sentinel absent (no recent failures)
ssh -t afframe-vps 'test -e /var/run/vault-backup.failed && echo FAILED || echo clean'

# Last journalctl line ends with DONE OK
ssh -t afframe-vps 'sudo journalctl -u vault-backup --no-pager -n 5'
```

### Ad-hoc manual backup

```bash
ssh -t afframe-vps 'sudo systemctl start vault-backup.service'
# Inspect:
ssh -t afframe-vps 'sudo journalctl -u vault-backup --no-pager -n 30'
```

### Disable the timer (emergency)

```bash
ssh -t afframe-vps 'sudo systemctl disable --now vault-backup.timer'
```

After re-enabling, the missed runs catch up (`Persistent=true`).

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

### Recovery key procedures (KMS auto-unseal failure or lost root token)

**Important:** With `seal "awskms"` enabled, the 5 keys generated by
`vault operator init -recovery-shares=5 -recovery-threshold=3` are **recovery
keys**, not Shamir unseal keys. They CANNOT reseal/unseal the data store —
KMS does that. They CAN authorize root-token regen + rekey operations.

**If KMS auto-unseal fails** (KMS Key disabled, IAM creds revoked, region
outage):

1. Vault stays sealed; no manual unseal is possible with recovery keys.
2. Restore KMS path: re-enable the Key in AWS console (it's `RemovalPolicy.RETAIN`
   - has `kms:ScheduleKeyDeletion` deny, so deletion is blocked by policy) OR
     rotate the IAM access keys for `vault-unseal-vps` and update
     `/srv/secrets/vault/.env`.
3. `sudo docker compose -f /srv/secrets/vault/compose.yaml restart vault` →
   `vault status` should report `Sealed: false` within ~30s.
4. If the CMK is permanently gone (catastrophic — should never happen with the
   deletion-deny policy), Vault data is unrecoverable. Restore from the latest
   M2 restic snapshot: see "Restore procedure" above.

**If root token is lost or revoked and OIDC is broken** (e.g., post-M3.5 OIDC
regression):

```bash
# 1. Start the root-token regeneration ceremony.
sudo docker compose -f /srv/secrets/vault/compose.yaml exec vault \
  vault operator generate-root -init
# Captures `nonce` + `otp`. Save the OTP — needed to decode the new token.

# 2. Provide 3 of the 5 recovery keys (one at a time, prompts).
sudo docker compose -f /srv/secrets/vault/compose.yaml exec -it vault \
  vault operator generate-root -nonce=<nonce>
# (Repeat 3 times with 3 different recovery keys.)

# 3. The third invocation prints an encoded root token.
# 4. Decode with the OTP from step 1:
sudo docker compose -f /srv/secrets/vault/compose.yaml exec vault \
  vault operator generate-root -decode=<encoded> -otp=<otp>
# → fresh `hvs.XXXX` root token. Use immediately to fix OIDC, then revoke.
```

The full ceremony is in the Vault docs:
https://developer.hashicorp.com/vault/docs/commands/operator/generate-root

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
