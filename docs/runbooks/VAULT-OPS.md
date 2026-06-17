# Vault Operations Runbook

> **Status:** M1–M5 live as of 2026-05-31. M1/M2 (Vault bring-up + KMS
> auto-unseal + restic→R2 backup), M3 (ECS AWS IAM auth), M3.5 (root token
> revoked → operator-admin), M4 (3 app secrets Vault→SSM→ECS in staging +
> production), M5 (GitHub OIDC→Vault JWT for `linear-sync.yml`). Remaining:
> M10 rotation drill + cost audit. DR drill deferred to
> [AFF-247](https://linear.app/hapddev/issue/AFF-247); B2 secondary backup
> deferred to [AFF-246](https://linear.app/hapddev/issue/AFF-246). Milestone
> history: [`docs/plans/SECRETS-MIGRATION.md`](../plans/SECRETS-MIGRATION.md).
>
> **Backs:** [AFF-245](https://linear.app/hapddev/issue/AFF-245).
>
> **Authoritative reference for:** day-to-day Vault operations on the Hostinger
> KVM 2 VPS at `secrets-admin.afframe.com`. Anything that touches an unsealed
> Vault instance goes through one of these procedures.

## M1 as-built (2026-05-23)

| Asset                 | Identifier / location                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KMS CMK               | `ed05513d-eb4d-4ad4-b829-7afd69080b6c` (alias `alias/monorepo-vault-unseal`, eu-central-1) — `infra/cdk/lib/secrets-stack.ts`, stack `SecretsBootstrap`, AWS account `637560253662`                                                                                                                                                                                                                                    |
| IAM user for KMS      | `vault-unseal-vps` — programmatic creds in `/srv/secrets/vault/.env` (mode 0600); 90-day rotation reminder (calendar)                                                                                                                                                                                                                                                                                                  |
| Cloudflare Tunnel     | `afframe-vault` (`5cd03299-3e6f-43ad-a795-3d1f25447517`); ingress `secrets-admin.afframe.com → http://vault:8200`; tunnel token in `.env`                                                                                                                                                                                                                                                                              |
| DNS                   | CNAME `secrets-admin.afframe.com → 5cd03299-3e6f-43ad-a795-3d1f25447517.cfargotunnel.com` (proxied)                                                                                                                                                                                                                                                                                                                    |
| Cloudflare Access app | `Afframe Secrets Admin` (`e20a72eb-e8e0-493a-bc01-240a4d739432`); exact host (not wildcard); 24h session                                                                                                                                                                                                                                                                                                               |
| Access policy         | "Allow operator" → include email `developer@hapdglobal.com`; single-mailbox SPOF acknowledged                                                                                                                                                                                                                                                                                                                          |
| Access IdP            | One-time PIN only (`b5dc889e-8e8c-4f3e-94d9-efb432444dbc`); account-level. Google Workspace was scoped but not wired                                                                                                                                                                                                                                                                                                   |
| Vault `operator init` | `vault operator init -recovery-shares=5 -recovery-threshold=3` (NOT `-key-shares` — KMS auto-unseal rejects Shamir flags with `400 not applicable to seal type awskms`)                                                                                                                                                                                                                                                |
| Escrow                | 5 recovery keys in **offline escrow** (verified 2026-05-31: 3 used to regenerate root during the M3.5 cascade-recovery — proven working). Initial root token **revoked at M3.5**; daily admin is the `afframe-vault-operator-admin-token` in macOS Keychain (account `hleb`). **Recovery keys regenerate root tokens; they do NOT unseal Vault.** NOTE: recovery keys are NOT in macOS Keychain — offline escrow only. |
| Audit device          | `vault audit enable file file_path=/vault/audit/audit.log`; logrotate at `/etc/logrotate.d/vault-audit` (13 weekly, copytruncate)                                                                                                                                                                                                                                                                                      |
| Test secret           | `platform/test-secret = hello-from-m1` (verifies kv-v2 + audit chain end-to-end)                                                                                                                                                                                                                                                                                                                                       |

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

| Asset                   | Location                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backup script           | `/usr/local/sbin/vault-backup` (source: `infra/vault/vps-overlay/usr/local/sbin/vault-backup`); reads `/root/.config/restic/.env` via `set -a`                                      |
| systemd unit            | `/etc/systemd/system/vault-backup.{service,timer}`; `ProtectHome=read-only`, `RESTIC_CACHE_DIR=/var/cache/restic`, `TimeoutStartSec=1800`                                           |
| Restic repo (primary)   | `s3:https://e891323bcdc79af6e2b692027f14674c.eu.r2.cloudflarestorage.com/afframe-vault-backup` (Cloudflare R2, EU region, repo id `5b5e8232`)                                       |
| Restic repo (secondary) | DEFERRED → [AFF-246](https://linear.app/hapddev/issue/AFF-246)                                                                                                                      |
| Restic password         | VPS `/root/.config/restic/.env` (mode 0600, root) + **offline escrow**. NOT in macOS Keychain (verified 2026-05-31). The running backup timer proves the value is valid on the VPS. |
| R2 token                | VPS `/root/.config/restic/.env` (S3-compatible, scoped to bucket, TTL 2027-05-23 → rotate 90-day cadence). NOT in macOS Keychain (verified 2026-05-31).                             |
| Backup cadence          | every 6h UTC (`OnCalendar=*-*-* 00,06,12,18:00:00 UTC`); Sunday < 06:00 UTC tick adds `restic check --read-data-subset=5%`                                                          |
| Retention               | `restic forget --keep-daily 7 --keep-weekly 12 --keep-monthly 12 --prune`                                                                                                           |
| Failure signal          | sentinel file `/var/run/vault-backup.failed` (`test -e` for monitoring) + non-zero systemd exit                                                                                     |
| First snapshot          | `b1988da1` (2026-05-23 14:34:43 UTC, 14.9 KiB raw → 15.5 KiB stored)                                                                                                                |
| DR drill                | DEFERRED → [AFF-247](https://linear.app/hapddev/issue/AFF-247) — restore is unverified end-to-end                                                                                   |

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
| Staff SSO    | Cloudflare Access (one-time PIN only; Google Workspace scoped, not wired)  |
| Backup       | restic → Cloudflare R2 (primary); secondary DEFERRED (AFF-246)             |
| Sync to AWS  | systemd timer at `/usr/local/sbin/vault-to-ssm-sync` (every 5 min)         |

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
2. `restic restore latest --target /tmp/restored` (primary R2; no secondary yet — AFF-246).
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
2. Operator extends `/usr/local/sbin/vault-to-ssm-sync` to include the new `(env, name)` tuple.
3. Operator extends `infra/cdk/lib/app-stack.ts` to wire `EcsSecret.fromSsmParameter` to the new SSM path.
4. Operator updates `docs/env-vars.md` with the new entry.
5. `pnpm verify` → PR → green CI → deploy.

### Deleting a secret

Reverse of "Adding". Order matters — remove the consumer BEFORE the value,
or a running task loses a secret it still references.

1. **Remove the consumer first**: drop the `EcsSecret.fromSsmParameter`
   line in `infra/cdk/lib/app-stack.ts` (+ any code reading the env var).
   PR → deploy so no task definition references the param anymore.
2. **Stop the sync**: remove the `(env, name)` tuple from
   `/usr/local/sbin/vault-to-ssm-sync` (so it stops re-creating the SSM
   param after you delete it).
3. **Delete the SSM param**:
   `aws ssm delete-parameter --name /monorepo/${env}/${name} --region eu-central-1`
4. **Delete from Vault** (source of truth, last):
   `vault kv metadata delete platform/${env}/${name}` (full destroy incl.
   version history) — or `vault kv delete …` to soft-delete the latest
   version only.
5. Update `docs/env-vars.md` + `SECRETS.md` decision matrix.

Never delete the Vault value first — the sync would then write an empty/
absent param and a still-referencing task would fail on next rollout.

### Human operator access (scoped per-person)

Today the only human path to Vault is the full-admin `operator-admin`
token (Keychain). To give a teammate **read-only on staging** (or any
narrower scope) WITHOUT handing them admin, enable a human auth method
and bind them to an existing read policy (`read-staging-secrets.hcl` /
`read-production-secrets.hcl`).

**Option A — `userpass` (fastest, no external IdP).** Good for one or two
contractors:

```bash
# operator (operator-admin token), via the SSH tunnel:
vault auth enable userpass        # idempotent; skip if already enabled
vault write auth/userpass/users/<dev-name> \
  password=<one-time-pass-they-rotate> \
  token_policies=read-staging-secrets \
  token_ttl=1h token_max_ttl=8h
# Hand the dev the one-time password out-of-band; they rotate it:
#   vault login -method=userpass username=<dev-name>
#   vault write auth/userpass/users/<dev-name>/password password=<their-new>
```

The dev now reads ONLY `platform/staging/*` (via `read-staging-secrets`),
nothing in production, no admin. Revoke instantly:
`vault delete auth/userpass/users/<dev-name>`.

**Option B — OIDC via Google Workspace (preferred once the team grows).**
No shared passwords; access follows the Google account. Heavier setup
(register an OIDC app, map a Workspace group → policy). Wire it the same
way the GitHub JWT method was wired (see "GitHub Actions JWT auth" above),
with `oidc_discovery_url` pointing at Google and a `bound_claims` group
filter → `token_policies=read-staging-secrets`. Defer until there is a
second human who needs standing access.

**Scope cheat-sheet:**

| Give a dev…          | Bind to policy                              |
| -------------------- | ------------------------------------------- |
| staging read-only    | `read-staging-secrets`                      |
| production read-only | `read-production-secrets`                   |
| both envs read-only  | both policies (comma-separated)             |
| admin (rare)         | `operator-admin` — only for a co-maintainer |

Every human login is recorded in the Vault audit log
(`/srv/secrets/vault/audit/audit.log`) with the username/email — so who
read what is always answerable.

### Adding a Vault role for a new workload

1. Decide auth method: ECS Fargate → AWS IAM Auth; GHA → JWT.
2. Define the Vault policy: minimum read scope on `platform/data/...` paths.
3. Bind the policy to a role with the right principal (IAM role ARN for ECS, `repo:org/repo:environment:env` for GHA).
4. Token TTL = 1h default; refresh logic at workload side.

### M3 bootstrap — enable AWS IAM Auth method for ECS workloads

One-time procedure after PR-B merges and the `vault-aws-auth-verifier` IAM user has access keys.

```bash
# 1. Generate verifier access keys (operator laptop, AWS admin creds).
aws iam create-access-key --user-name vault-aws-auth-verifier
# These are REGENERABLE from the AWS IAM console at any time — no need to
# escrow long-term. The post-migration Keychain copies were removed
# 2026-05-31; regenerate on demand if the aws auth method is reactivated.
# Calendar reminder: rotate 90-day cadence.

# 2. Pull the latest infra/vault/ assets to operator laptop.
cd ~/Developer/monorepo
git checkout main && git pull

# 3. Log into Vault as root (or token with sys/auth + sys/policies/acl write).
export VAULT_ADDR=https://secrets-admin.afframe.com
vault login   # paste root token at prompt

# 4. Run the setup script — discovers ECS task role ARNs, enables aws auth,
#    writes policies, binds ecs-{staging,production} roles.
infra/vault/setup-aws-auth.sh
# Script prompts for the verifier creds from step 1 (won't echo).
```

Verify from a throwaway ECS task (inside an `aws ecs run-task` against the staging cluster, using the staging task role):

```bash
# Inside the task container — uses task-role IAM credentials automatically.
vault write auth/aws/login role=ecs-staging
# Returns an `hvs.XXX` token with policy=read-staging-secrets, ttl=1h.
vault token lookup <issued-token>
# Audit log: confirm the login event records sub=arn:aws:iam::<acct>:role/App-staging-TaskRole...
```

Rollback if the auth chain misbehaves:

```bash
vault auth disable aws    # all ecs-{staging,production} sessions invalidated
vault policy delete read-staging-secrets
vault policy delete read-production-secrets
```

Workloads fall back to AWS Secrets Manager (no change required at the ECS side until M4 refactor lands).

### M3.5 as-built (2026-05-31) — revoke initial root token

Daily Vault admin no longer uses the initial root token. It is replaced
by a scoped **`operator-admin`** token (policy
`infra/vault/policies/operator-admin.hcl`), escrowed in macOS Keychain as
`afframe-vault-operator-admin-token` (TTL 2160h / 90d).

As-built procedure (scripted; the scripts live under `~/.context/scripts/`
on the operator laptop, NOT committed):

1. Open SSH tunnel `localhost:8200 → afframe-vps:8200`.
2. `vault policy write operator-admin infra/vault/policies/operator-admin.hcl`.
3. `vault token create -policy=operator-admin -ttl=2160h -orphan` → stash in Keychain.
4. Smoke-test (`vault kv list platform/production`) BEFORE revoking root.
5. Safety check: confirm a scoped `sync-to-ssm` token exists (so revoking
   root does not freeze `vault-to-ssm-sync`).
6. `vault token revoke -accessor <root-accessor>`; verify dead with
   `vault write auth/token/lookup-accessor accessor=<root-accessor>` → 403.

**Critical lesson — mint admin/sync tokens with `-orphan`.** The first
attempt minted `operator-admin` as a CHILD of root. Vault's default
cascade-revoke killed the child when root was revoked, taking out
operator-admin (and the sync token shared the same lineage). Recovery
required `vault operator generate-root` with 3-of-5 recovery keys to mint
a temp root, then re-minting BOTH tokens with `-orphan`, updating
`/root/.config/vault-to-ssm/.env`, and revoking the temp root. Always
`-orphan` for long-lived service/admin tokens.

The `operator-admin` policy grants `list+sudo` on `auth/token/accessors`
(needed to enumerate + revoke by accessor) but deliberately NOT
`sys/rekey/*` / `sys/generate-root/*` / `sys/seal` — those require the
recovery-key ceremony above. The 5 recovery keys remain in escrow.

### GitHub Actions JWT auth (M5, 2026-05-31)

`linear-sync.yml` fetches `LINEAR_API_KEY` from Vault via GitHub OIDC.
Chain: GitHub OIDC token → Cloudflare Access (service token) → Vault JWT
auth → secret read.

Server-side config (applied via `~/.context/scripts/m5-setup-jwt-auth.sh`

- `m5-fix-audience.sh`):

```bash
vault auth enable jwt
vault write auth/jwt/config \
  oidc_discovery_url="https://token.actions.githubusercontent.com" \
  bound_issuer="https://token.actions.githubusercontent.com"

# Policy: read-only on shared GHA secrets
vault policy write gha-read-shared-tokens -   # path "platform/data/shared/*" { capabilities=["read"] }

# Role bound to repo + workflow_ref + audience. bound_claims is a MAP field, so
# it must be passed as JSON over stdin (`vault write <path> -`); the repeated
# `bound_claims=key=val` CLI shorthand fails with
# "error converting input for field 'bound_claims': expected a map, got 'string'".
vault write auth/jwt/role/gha-monorepo - <<'JSON'
{
  "role_type": "jwt",
  "user_claim": "actor",
  "bound_claims_type": "glob",
  "bound_audiences": ["https://secrets-admin.afframe.com"],
  "bound_claims": {
    "repository": "hlebtkachenko/monorepo",
    "workflow_ref": "hlebtkachenko/monorepo/.github/workflows/linear-sync.yml@*"
  },
  "token_policies": ["gha-read-shared-tokens"],
  "ttl": "15m",
  "max_ttl": "30m"
}
JSON
```

Two gotchas, both fixed:

1. **CF Access edge gate** — `secrets-admin.afframe.com` is gated by a
   Cloudflare Access application. The runner must send
   `CF-Access-Client-Id` + `CF-Access-Client-Secret` headers (a CF Access
   _service token_ named `monorepo-gha-vault`, with a `Service Auth`
   policy on the app). Without them CF returns the SSO challenge (HTTP
   404/530 to vault-action). The two values are GitHub repo secrets,
   passed via `extraHeaders` in `hashicorp/vault-action`.
2. **Audience binding** — GitHub's OIDC token carries an `aud` claim. The
   role's `bound_audiences` and the workflow's `jwtGithubAudience` must
   match exactly, else Vault returns `400 "audience claim found in JWT but
no audiences bound to the role"`. Both set to
   `https://secrets-admin.afframe.com`.

Verify a CI run succeeded end-to-end (audit log, run on operator laptop
with op-admin token):

```bash
sudo tail -200 /srv/secrets/vault/audit/audit.log | \
  jq -c 'select(.request.path=="auth/jwt/login" or (.request.path|startswith("platform/data/shared"))) | {time, path:.request.path, role:.auth.metadata.role}'
# Expect: auth/jwt/login with role=gha-monorepo, then a read on
# platform/data/shared/linear-api-key.
```

Rotate the Linear key: `vault kv put platform/shared/linear-api-key value=<new>`.
No GitHub-secret change needed.

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
- [`AWS-SETUP.md`](AWS-SETUP.md) — CDK deploy wiring chain
- [`COST-INCIDENT.md`](COST-INCIDENT.md) — cost-runaway kill switch (KMS Key is part of the registry)
