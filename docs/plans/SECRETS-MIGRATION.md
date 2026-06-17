# Secrets Management Migration — Afframe

> **Backs:** [AFF-245](https://linear.app/hapddev/issue/AFF-245) (umbrella),
> [AFF-243](https://linear.app/hapddev/issue/AFF-243) (deferred dynamic DB
> secrets), [AFF-244](https://linear.app/hapddev/issue/AFF-244) (deferred audit
> log shipping). Conceptual primer: [`SECRETS-101.md`](SECRETS-101.md).
>
> **Snapshot:** 2026-05-31. **M0–M10 COMPLETE — migration closed.** App-runtime
> secrets (`BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `CLOUDFLARE_TUNNEL_TOKEN`)
> flow Vault → SSM SecureString → ECS in staging + production. Root token
> revoked; `LINEAR_API_KEY` on GitHub-OIDC→Vault. Legacy AWS SM copies
> deleting (permanent 2026-06-07). M10 rotation drill verified end-to-end +
> old Resend key revoked; cost audit done; Keychain trimmed; full git-history
> leak scan clean. Only deferred follow-ups remain (AFF-243 dynamic DB
> secrets, AFF-247 DR restore drill, AFF-246 B2 secondary backup) — none
> block the migration.

---

## Execution status — 2026-05-31

**Done end-to-end:**

| Milestone                                 | Status  | Evidence                                                                                                                                                                                                                            |
| ----------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — backlog + plan + scans               | ✅ DONE | AFF-243/244/245 created; lefthook + CI gitleaks + infisical-scan live                                                                                                                                                               |
| M1 — Vault VPS bring-up                   | ✅ DONE | `secrets-admin.afframe.com` initialized, KMS auto-unseal, CF Access gate, kv-v2 at `platform/`                                                                                                                                      |
| M2 — Restic → R2 backup                   | ✅ DONE | timer every 6h, snapshots in `afframe-vault-backup` R2 bucket                                                                                                                                                                       |
| M3 — Vault `aws auth` method              | ✅ DONE | `vault-aws-auth-verifier` IAM user wired; `ecs-{staging,production}` roles bound                                                                                                                                                    |
| M3.5 — revoke initial root token          | ✅ DONE | Root revoked 2026-05-31; replaced by orphan `operator-admin` token (Keychain). Hit + recovered a non-orphan cascade-revoke (recovery-key regen). Lesson recorded in `VAULT-OPS.md`.                                                 |
| M4 — Vault → SSM sync + CDK flip          | ✅ DONE | `vault-to-ssm-sync` timer every 5 min; staging + **production** ECS task defs read all 3 secrets via `EcsSecret.fromSsmParameter`; prod cutover deploy `26394076696` green; live signup + reset-email smoke passed                  |
| M4.5 — delete legacy AWS SM entries       | ✅ DONE | 6 SM secrets (`monorepo-{staging,production}-{better-auth-secret,resend-api-key,cloudflare-tunnel-token}`) scheduled for deletion 2026-05-31, permanent 2026-06-07; CloudTrail soak showed 0 `GetSecretValue` in prior 48h          |
| M5 — GHA OIDC → Vault JWT (`linear-sync`) | ✅ DONE | JWT auth + `gha-monorepo` role; `linear-sync.yml` fetches `LINEAR_API_KEY` from Vault; audit log shows `auth/jwt/login` role=gha-monorepo + read on `platform/data/shared/linear-api-key`; PR #279 merged                           |
| M6 — remaining GHA secret cleanup         | ✅ DONE | `RESEND_API_KEY` was vestigial in `_deploy-aws.yml` post-M4 (presence-check only, never consumed) — removed. `EMAIL_FORWARD_TO` kept (email address, not a credential; used for SNS alert subscribe). No further Vault-OIDC needed. |
| M7 — pre-commit + CI secret scanning      | ✅ DONE | both scanners active locally + in CI                                                                                                                                                                                                |
| M8 — final doc rewrite                    | ✅ DONE | `SECRETS.md` (SOPS section deleted, Vault matrix), `env-vars.md`, `SECRETS-ROTATION.md` (Vault recipes), `AWS-SETUP.md`, `VAULT-OPS.md` (M3.5 + M5 as-built) — this PR                                                              |
| M9 — IAM blast-radius tightening          | ✅ DONE | Verified both task-execution roles grant `secretsmanager` only on `DbSecret` + `AppUserSecret` (RDS); the 3 migrated secrets use SSM grants only. M4 CDK flip already removed the SM grants — no residual.                          |

| M10 — rotation drill + cost audit + advisor gate 5 | ✅ DONE | Rotated `RESEND_API_KEY` Vault→SSM→ECS on prod 2026-05-31, verified the new value in the running container, old key revoked in Resend. Cost audit: ~−$1.80/mo net gross (SM −$2.80 as 7 secrets delete 2026-06-07, KMS +$1.00, SSM $0). Advisor gate 5 signed off. |
| Keychain cleanup | ✅ DONE | `phase6-keychain-cleanup.sh` run; revoked-root accessor + regenerable verifier keys removed. Keychain now holds operator-admin (daily) + ssm-sync escrow only. Break-glass recovery keys live on paper, not Keychain (see `VAULT-OPS.md`). |

**Deferred (tracked, do not block closure):**

| Item                                                       | Ticket                                              |
| ---------------------------------------------------------- | --------------------------------------------------- |
| Dynamic DB secrets (Vault-issued short-lived RDS users)    | [AFF-243](https://linear.app/hapddev/issue/AFF-243) |
| DR restore drill (verify restic→R2 restore RTO end-to-end) | [AFF-247](https://linear.app/hapddev/issue/AFF-247) |
| Backblaze B2 secondary backup                              | [AFF-246](https://linear.app/hapddev/issue/AFF-246) |
| Centralized audit-log shipping                             | [AFF-244](https://linear.app/hapddev/issue/AFF-244) |

### Hardening pass — 2026-05-31

Post-M9 gap-closing (one PR), independent of M10:

| Gap (was)                                                | Fix                                                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scanners Vault-blind; `infra/vault/` blanket-allowlisted | `.gitleaks.toml`: added `vault-token` rule (`hv[sbr].…{24,}`); narrowed the `infra/vault/` allowlist to only `vault.hcl` + `compose.yaml` + `*.template` so the rest of the tree IS scanned |
| No confirmed leak scan                                   | Ran `gitleaks detect` full-history + working-tree with the new rules — 0 real secrets (only public KMS/CF UUIDs in a gitignored handoff doc, now allowlisted)                               |
| No pre-deploy secret check                               | `_deploy-aws.yml`: "Verify Vault-backed secrets resolve in SSM" step fails the deploy fast (actionable message) if `better-auth-secret`/`resend-api-key` are missing/empty                  |
| No delete runbook / fresh-agent entrypoint               | new [`SECRETS-ADD-DELETE.md`](../runbooks/SECRETS-ADD-DELETE.md); `VAULT-OPS.md` gained a "Deleting a secret" section                                                                       |
| No per-human scoped access                               | `VAULT-OPS.md` "Human operator access" — `userpass`/OIDC bound to `read-staging-secrets`/`read-production-secrets`, scope cheat-sheet, instant revoke                                       |
| `OVH/Hostinger` hallucination                            | `SECRETS.md` banner corrected to "Hostinger KVM 2 VPS" (OVH is the separate status-page VPS)                                                                                                |

---

## Compressed timeline — rationale

The original plan was structured around production having real users. With **no real users on prod yet**, the long soak windows serve no signal: a regression discovered on day 1 vs day 30 has the same blast radius (zero). The compressed plan keeps every verification gate but drops the calendar padding between them.

| Gate                            | Original            | Compressed                | Why safe                                                                                                                                  |
| ------------------------------- | ------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| M2 7-day uptime soak            | 7 d                 | 0 d (deploy when ready)   | No user traffic to protect; daily backups verified working from day 1                                                                     |
| M3 → M3.5 root revoke           | 24 h post-M3 verify | Same session as M3 verify | Operator-admin token mints in seconds; recovery keys (5, threshold 3) regenerate root in ~5 min if anything regresses                     |
| M4 staging → production         | 7 d staging soak    | 1 h staging smoke         | Same code path, idempotent CDK, ECS Circuit Breaker rolls back any task that fails health-check                                           |
| M4.5 SM cleanup cooldown        | 30 d                | 48 h                      | Long enough to catch a missed dependency; SM entries can be `aws secretsmanager restore-secret` within the 7-day pending window if needed |
| Advisor gate 4 + 5 calendar gap | days                | sequential, same session  | Same operator, same context window — no need to context-switch                                                                            |

**When real users arrive:** future migrations revert to conservative soak windows. This compression is a one-time concession to the pre-launch window.

---

## Revised total timeline

- **2026-05-24 (today):** finish M4 (App-prod deploy) + M3.5 — ~1 h active work
- **2026-05-26 (T+48h):** M4.5 cleanup — 30 min
- **2026-05-27:** M5 OIDC pilot — 1 h
- **2026-05-28:** M6 bulk migration — 3 h
- **2026-05-29:** M8 final doc rewrite + M9 IAM tighten — 2 h
- **2026-05-30:** M10 rotation drill + cost audit + advisor gate 5 — 2 h

**Total: ~10 h active over 1 calendar week**, replaces the original 28–32 h over 2–3 weeks + 30-day M4.5 cooldown.

---

## Context

Afframe currently relies on AWS Secrets Manager (~$2.40/mo for 6 secrets across staging+prod) plus GitHub Actions encrypted secrets. The goal is to consolidate secrets behind **HashiCorp Vault** self-hosted on the Hostinger KVM 2 VPS at `secrets-admin.afframe.com`, with **AWS SSM Parameter Store SecureString** as the free runtime injection layer for ECS Fargate. Drivers:

- Cost: from ~$2.40/mo to ~$1.80/mo at current scale; saves ~$440/mo at 100-client projection
- Vendor neutrality: BSL-licensed Vault is internal-use free; Linux Foundation OpenBao available as drop-in if IBM ever changes licensing
- DORA Article 28: split identity/secrets from compute providers
- SOC 2 prep: native audit log, RBAC, versioning, future dynamic-secrets headroom

Background research lives under `.context/` (gitignored): `research-secrets-architecture.md` (960 lines), `research-vps-directory-layout.md`, `research-hashicorp-products.md`. Conceptual primer for future contributors lives at [`SECRETS-101.md`](SECRETS-101.md).

This plan is structured for autonomous execution with **advisor checkpoints** at five critical gates and **verification gates** at every milestone boundary.

---

## Locked decisions

| #   | Decision                                                                                                                             | Rationale                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Vault: HashiCorp Vault (IBM, BSL 1.1)                                                                                                | Internal-use free; biggest ecosystem; auditor-familiar                                                                                                                                                                                                                                                                         |
| 2   | Host: Hostinger KVM 2 VPS, `/srv/secrets/vault/`                                                                                     | Bootstrap done (VPS hardened, Docker installed, dir tree created, snapshot taken)                                                                                                                                                                                                                                              |
| 3   | Public URL: `secrets-admin.afframe.com`                                                                                              | Single-level subdomain, free Universal SSL                                                                                                                                                                                                                                                                                     |
| 4   | Storage backend: Vault Integrated Storage (Raft, single node)                                                                        | No external Consul; Postgres backend deferred                                                                                                                                                                                                                                                                                  |
| 5   | Auto-unseal: AWS KMS Customer Master Key (~$1/mo, in eu-central-1)                                                                   | No Shamir-entry friction on reboot                                                                                                                                                                                                                                                                                             |
| 6   | Staff SSO: Cloudflare Access (free, ≤50 users)                                                                                       | 10-min setup; `apps/auth` Better Auth IdP tracked in [AFF-242](https://linear.app/hapddev/issue/AFF-242)                                                                                                                                                                                                                       |
| 7   | Runtime injection: ECS reads from AWS SSM SecureString (free); Vault syncs values into SSM                                           | Zero ECS code change; CDK gets simpler; native `EcsSecret.fromSsmParameter`                                                                                                                                                                                                                                                    |
| 8   | RDS credentials stay in AWS Secrets Manager                                                                                          | Native rotation Lambda is battle-tested; dynamic secrets deferred ([AFF-243](https://linear.app/hapddev/issue/AFF-243))                                                                                                                                                                                                        |
| 9   | TUNNEL_TOKEN stays in AWS SSM SecureString, **flowed direct from GH repo secret → SSM, never through Vault**                         | Chicken-and-egg: the tunnel must work BEFORE Vault is reachable; routing the value through Vault would create a circular dependency                                                                                                                                                                                            |
| 10  | Backup: restic → Cloudflare R2 (primary) — Backblaze B2 secondary **deferred** ([AFF-246](https://linear.app/hapddev/issue/AFF-246)) | R2 alone covers daily recovery + restic encrypts client-side. B2 was scoped for single-vendor-SPOF coverage but adds ops cost; revisit on SOC 2 prep, CF incident, or second-operator onboarding. Script is feature-flagged on B2 env vars being non-empty so the secondary mirror lights up automatically when AFF-246 lands. |
| 11  | Audit device: file-based on VPS, Day 1                                                                                               | Loki/S3 shipping deferred ([AFF-244](https://linear.app/hapddev/issue/AFF-244))                                                                                                                                                                                                                                                |
| 12  | Local dev: keep `scripts/generate-env.sh` as-is                                                                                      | Solo dev, no team sharing pressure yet                                                                                                                                                                                                                                                                                         |
| 13  | Pre-commit: add `infisical scan` alongside existing gitleaks in `lefthook.yml`                                                       | 6-line addition, defense in depth                                                                                                                                                                                                                                                                                              |
| 14  | Secret-escrow store: **macOS Keychain (encrypted iCloud sync) + offline escrow**                                                     | No 1Password (operator does not use it); Keychain is OS-native, offline escrow is the off-machine survival path                                                                                                                                                                                                                |

---

## Irreversible operations register

Operations that are one-time, manual, and unrecoverable. Treat with caution; advisor must confirm before execution.

| Op                                             | When                      | Why irreversible                                                                                                                                                                                                                                                                                                                                                  | Mitigation                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vault operator init`                          | Once during M1            | Generates 5 **recovery keys** + initial root token. With KMS auto-unseal enabled Vault uses recovery keys (NOT Shamir unseal keys) — recovery keys authorize root-token regeneration, rekey, etc.; they CANNOT reseal/unseal the data store. If both KMS and the recovery keys are lost, data is unrecoverable; restore from M2 restic snapshot is the only path. | Split keys: 3 in distinct macOS Keychain entries on operator laptop (encrypted iCloud sync), 2 in offline escrow (off-repo). Initial root token NOT revoked at M1 close — kept until M3 verification + 24h soak (see M3.5).                                                                                                                           |
| AWS KMS CMK creation                           | Once during M1            | If accidentally deleted, Vault can never auto-unseal — recovery keys cannot rescue it. Vault data stays sealed forever.                                                                                                                                                                                                                                           | Create via CDK with `RemovalPolicy.RETAIN` + `enableKeyRotation: true` + a `kms:ScheduleKeyDeletion` deny statement in the key policy. This gives IaC tracking _and_ deletion protection; mirrors the `RemovalPolicy.RETAIN` pattern at `app-stack.ts:329-332`. Out-of-band runbook step pre-deploy: confirm `cdk diff` shows no `[-] AWS::KMS::Key`. |
| `vault token revoke <initial-root-token>`      | Once during M3.5 (NOT M3) | If OIDC integration regresses post-revocation, operator is locked out.                                                                                                                                                                                                                                                                                            | Separate from M3 verification. Only revoke after 24h of successful OIDC logins + at least one ECS task using AWS IAM Auth. Keep recovery keys readily available throughout this window (they can regenerate a fresh root token via `vault operator generate-root` if OIDC breaks).                                                                    |
| Deletion of legacy AWS Secrets Manager entries | In M4.5 only              | One-way operation.                                                                                                                                                                                                                                                                                                                                                | NEVER delete in M4. Migrate values in M4, observe stable reads for 30 days, delete in M4.5.                                                                                                                                                                                                                                                           |
| Vault audit device disable                     | Avoid                     | SOC 2 / DORA evidence loss.                                                                                                                                                                                                                                                                                                                                       | Don't disable. Rotate by adding new device THEN removing old.                                                                                                                                                                                                                                                                                         |

---

## Cost summary

| Item                                         | Current   | After migration                       |
| -------------------------------------------- | --------- | ------------------------------------- |
| AWS Secrets Manager (6 secrets × 2 envs)     | $4.80/mo  | $1.60/mo (2 RDS secrets only)         |
| AWS SSM Parameter Store SecureString         | $0        | $0 (3 secrets × 2 envs migrated here) |
| AWS KMS CMK (Vault auto-unseal)              | —         | $1.00/mo                              |
| Cloudflare R2 backup (under 10 GB free tier) | —         | $0                                    |
| Backblaze B2 secondary backup                | —         | ~$0.05/mo                             |
| Hostinger VPS                                | sunk cost | sunk cost                             |
| **Total monthly**                            | **$4.80** | **$2.65**                             |

Projected at 100 clients (~800 secrets): naive "all AWS SM" path = ~$340/mo. Vault + SSM SecureString path = ~$5-15/mo.

---

## Milestones

Each milestone has: Goal → Tasks → Verification → Rollback. Five milestones have explicit **Advisor checkpoints** before they can be marked complete.

### M0 — Pre-flight + Linear backlog setup

**Goal**: confirm preconditions; create Linear issues for deferred work.

**Tasks**:

- Verify VPS bootstrap complete (`uname -r` = 6.8.0-117, Docker running, /srv tree exists)
- Verify Cloudflare Tunnel admin access available
- Verify AWS CLI configured with admin credentials
- Verify `gh` CLI authenticated
- ✅ Create Linear issue: ["Vault dynamic DB secrets — evaluate at 100 clients or SOC 2 horizon"](https://linear.app/hapddev/issue/AFF-243) (defers locked decision 8 follow-up)
- ✅ Create Linear issue: ["Vault audit log shipping — file-based today, ship to Loki+S3 when team grows"](https://linear.app/hapddev/issue/AFF-244) (defers locked decision 11 follow-up)
- ✅ Create umbrella issue: [AFF-245](https://linear.app/hapddev/issue/AFF-245)

**Verification**: AFF-243, AFF-244, AFF-245 all created.

**Rollback**: none required.

---

### M1 — Vault stand-up + auto-unseal + audit device + Cloudflare Access

**Goal**: production-ready Vault running at `secrets-admin.afframe.com`, gated by Cloudflare Access, with audit device enabled and ready to hold real secrets.

**Tasks**:

1. **AWS KMS CMK** (CDK-managed, with retain + deletion protection):
   - Add a new `lib/secrets-stack.ts` (or extend `data-stack.ts`) with:
     - `new kms.Key(this, "VaultUnsealKey", { alias: "alias/monorepo-vault-unseal", enableKeyRotation: true, removalPolicy: RemovalPolicy.RETAIN })`
     - Key policy deny statement on `kms:ScheduleKeyDeletion` for everyone except a designated break-glass principal
     - Region: eu-central-1 (single-region; same as the rest of the AWS footprint)
   - Create a dedicated IAM user `vault-unseal-vps` with **only** `kms:Encrypt`, `kms:Decrypt`, `kms:DescribeKey` on the new Key (scoped resource ARN, not `*`)
   - Generate access keys for that user; record Access Key ID + Secret in macOS Keychain entries on operator laptop + offline escrow
   - Set a 90-day rotation reminder (calendar / Linear) for the static access keys
   - Pre-deploy: `cdk diff` must show **no** `[-] AWS::KMS::Key` resource — if it does, abort

2. **Cloudflare Tunnel**:
   - Create new tunnel `afframe-vault` in Cloudflare Zero Trust dashboard
   - Tunnel token → store in macOS Keychain (out-of-band copy) and in `/srv/secrets/vault/.env` (`TUNNEL_TOKEN`, mode 0600)
   - Public hostname: `secrets-admin.afframe.com` → `http://localhost:8200`
   - DNS auto-creates CNAME

3. **Cloudflare Access policy**:
   - Application: "Afframe Secrets Admin"
   - Domain pattern: `secrets-admin.afframe.com` (exact host on day 1 — NOT a wildcard; tighten now, broaden later if a second admin tool lands)
   - Identity provider: **One-time PIN (email OTP) only**. Google Workspace was scoped as the primary IdP but the operator does not have a Google login on the operator mailbox, so OTP is the actual day-1 auth. Account-level OTP IdP must exist first; CF token scope for IdP CRUD is `Account → Access: Organizations, Identity Providers, and Groups → Edit` (distinct from `Access: Apps and Policies: Edit`).
   - Policy: Allow if email = `developer@hapdglobal.com` (operator's mailbox of record for `*-admin.afframe.com` staff tools)
   - Session duration: 24h
   - **Single-mailbox SPOF acknowledged**: if `developer@hapdglobal.com` is unreachable, no human can pass Access at the edge. Mitigated by VPS SSH as the fallback admin path; revisit with a second operator before adding any second admin tool to this Access app.
   - **Rollback**: delete the Access app + Cloudflare Tunnel + DNS CNAME — additive change, no existing app/api/admin tunnels are touched

4. **Vault compose stack** at `/srv/secrets/vault/`:
   - `compose.yaml` with `hashicorp/vault:1.20.4@sha256:...` (pin specific patch **and** digest; mirrors `infra/openstatus/deploy/docker-compose.github-packages.yaml:242`) + cloudflared sidecar
   - Vault config (`vault.hcl`):
     - `storage "raft"` with `path = "/vault/data"`
     - `listener "tcp"` on `127.0.0.1:8200`, `tls_disable = true` (TLS terminated by Cloudflare)
     - `seal "awskms"` block with KMS Key ID
     - `api_addr = "https://secrets-admin.afframe.com"`
     - `cluster_addr = "https://secrets-admin.afframe.com:8201"` (single-node — no cluster, but vault needs it)
     - `ui = true`
     - `disable_mlock = true` (Docker doesn't allow mlock)
   - Bind mount `./data:/vault/data`, `./config:/vault/config:ro`, `./audit:/vault/audit`
   - AWS access keys in `.env` for KMS auto-unseal
   - Network: bridge, only cloudflared exposes nothing publicly

5. **Initialize Vault** (one-time):
   - `docker compose up -d`
   - `vault operator init -recovery-shares=5 -recovery-threshold=3` (NOT `-key-shares` / `-key-threshold` — those flags only apply to the Shamir seal; with `seal "awskms"` enabled Vault returns 400 `parameters secret_shares,secret_threshold not applicable to seal type awskms`)
   - Save 5 unseal keys + initial root token via irreversible-ops procedure (Keychain + paper)
   - Verify auto-unseal works: `docker compose restart vault`, observe `vault status` returns `Sealed: false` without manual unseal

6. **Audit device + logrotate** (Day 1, non-negotiable):
   - `vault audit enable file file_path=/vault/audit/audit.log`
   - Add `/etc/logrotate.d/vault-audit`: `weekly`, `rotate 13` (matches SOC 2 13-month retention floor), `compress`, `copytruncate` (Vault won't reopen the file otherwise)
   - Verify a test secret write appears in audit log

7. **Smoke test**:
   - Visit `https://secrets-admin.afframe.com` → Cloudflare Access challenge → one-time PIN (email OTP) → Vault UI
   - Log in with root token (one-time bootstrap; rotate to OIDC in M3)
   - Enable kv-v2 secret engine at `platform/`
   - Write test secret: `vault kv put platform/test-secret value=hello`
   - Read back via UI and CLI

**Advisor checkpoint #1** — Before closing M1:

- Review audit log shows the test write
- Confirm Vault auto-unseals on container restart
- Confirm Cloudflare Access blocks unauthenticated requests
- Confirm KMS Key has rotation + deletion protection

**Verification**:

- `vault status` → Initialized: true, Sealed: false
- `curl -I https://secrets-admin.afframe.com` → 302 redirect to Cloudflare Access
- `docker compose restart vault && sleep 10 && vault status` → still unsealed
- Audit log has entries for the smoke test

**Rollback**:

- `docker compose down -v` on VPS removes Vault container + Raft data
- Manual deletion of AWS KMS CMK (7-day pending window, can be cancelled)
- Remove Cloudflare Tunnel + DNS
- Secrets in AWS Secrets Manager are untouched; nothing broken

---

### M2 — Backup setup (restic → R2 + B2) + DR restore drill

**Goal**: documented, tested disaster recovery path. Vault data restorable from off-site backup within 30 minutes.

**Tasks**:

1. **Provision storage**:
   - Cloudflare R2 bucket `afframe-vault-backup` (eu region)
   - Cloudflare R2 API token (scoped to bucket, read+write)
   - Backblaze B2 bucket `afframe-vault-backup-secondary`
   - B2 application key (scoped to bucket)
   - Restic repo password: 32-byte random, stored in macOS Keychain + offline escrow

2. **Restic install + repo init**:
   - `apt install restic` on VPS
   - `restic -r s3:r2.cloudflarestorage.com/afframe-vault-backup init` (primary)
   - `restic -r b2:afframe-vault-backup-secondary init` (secondary)

3. **Backup script** at `/usr/local/sbin/vault-backup`:
   - Inputs: env vars `RESTIC_PASSWORD`, R2 + B2 credentials (loaded from `/root/.config/restic/.env`, mode 0600)
   - Steps:
     1. `vault operator raft snapshot save /tmp/vault-snap-$(date +%s).snap` (requires Vault root token or admin token)
     2. `restic backup /tmp/vault-snap-*.snap` to primary R2
     3. `restic backup` to secondary B2 (weekly only)
     4. `restic forget --keep-daily 7 --keep-weekly 12 --keep-monthly 12 --prune` on each
     5. `restic check --read-data-subset=5%` on the WEEKLY B2 invocation — verify backups are restorable, not just listable
     6. `rm /tmp/vault-snap-*.snap`
   - Logs to journald
   - On any non-zero exit, write a sentinel to `/var/run/vault-backup.failed` so monitoring can page

4. **Systemd timer units**:
   - `/etc/systemd/system/vault-backup.service` (oneshot, calls the script)
   - `/etc/systemd/system/vault-backup.timer` (OnCalendar: every 6h to R2; weekly Sunday 03:00 to B2 + integrity check)
   - `systemctl enable --now vault-backup.timer`

5. **DR restore drill** (mandatory):
   - Provision throwaway KVM 1 VPS (~$6.49 first month, cancel after)
   - Install Docker + restic
   - `restic -r s3:r2.cloudflarestorage.com/afframe-vault-backup restore latest --target /tmp/restored`
   - Start a fresh Vault container against the restored snapshot
   - Auto-unseal against the same AWS KMS CMK
   - Verify the test secret from M1 is readable
   - Document the procedure in `/usr/local/sbin/vault-restore-runbook.md` (on VPS, gitignored)
   - Decommission throwaway VPS

**Advisor checkpoint #2 — "Vault trust gate"** — Before M3 begins:

- Backup ran successfully twice (one to R2, one to B2)
- DR restore drill verified end-to-end
- 7 consecutive days of clean Vault operation (auto-unseal, audit log flowing, no container restarts)
- Restic repo passwords confirmed in macOS Keychain + offline escrow

**Verification**:

- `restic snapshots` lists at least 2 snapshots in primary and 1 in secondary
- DR restore output document (timestamp, RTO measured, RPO confirmed)
- `systemctl list-timers vault-backup` shows next-run timestamps

**Rollback**: backup setup is additive; disabling the timer + removing restic configs has no impact on running Vault.

---

### M3 — Vault AWS IAM Auth method for ECS workloads

**Goal**: ECS Fargate tasks can authenticate to Vault using their task IAM role, with no static credentials passed to the container.

**Tasks**:

1. **Vault AWS auth method**:
   - `vault auth enable aws`
   - `vault write auth/aws/config/client` with IAM access key/secret of a dedicated `vault-aws-auth-verifier` IAM user (has only `iam:GetUser`, `sts:GetCallerIdentity` permissions)
   - This user is what Vault uses to VERIFY task identity, not what tasks authenticate as
   - **Static credential rotation**: set 90-day calendar reminder; document rotation procedure in `docs/runbooks/VAULT-OPS.md`

2. **Define Vault roles per env per ECS task role**:
   - `vault write auth/aws/role/ecs-staging` with `bound_iam_principal_arn = arn:aws:iam::ACCOUNT:role/monorepo-ecs-task-role-staging`, `token_policies = ["read-staging-secrets"]`, `token_ttl = 1h`
   - Same for production
   - Vault policies (`read-staging-secrets`, `read-production-secrets`) grant `read` capability on appropriate `platform/data/*` paths

3. **OIDC operator login** (root token stays alive until M3.5):
   - Configure Vault OIDC auth method against Cloudflare Access JWT
   - Create personal admin policy + bind to operator email
   - Verify OIDC login works end-to-end via browser
   - **Do NOT revoke the initial root token yet** — see M3.5

4. **Test from throwaway task**:
   - Launch one-off ECS task in staging with current task role
   - From inside task: `vault write auth/aws/login role=ecs-staging` (signed by task role STS GetCallerIdentity)
   - Verify token issuance and policy attachment

**Verification**:

- `vault token lookup <issued-token>` from the test task shows correct policies + 1h TTL
- Audit log records the auth event
- OIDC login from operator browser succeeds and audit log records the JWT subject

**Rollback**:

- `vault auth disable aws`
- Revoke Vault role + policy
- ECS tasks revert to reading from AWS Secrets Manager (no change yet to CDK)

---

### M3.5 — Revoke initial Vault root token (24h after M3 verification)

**Goal**: rotate Vault away from the bootstrap root token. Separate from M3 so that an OIDC regression during the soak window doesn't lock the operator out.

**Tasks**:

- Wait 24h after M3 verification passes (calendar reminder)
- Confirm at least one OIDC login + at least one ECS task AWS IAM Auth in audit log over the soak window
- `vault token revoke <initial-root-token>` and verify with `vault token lookup -accessor <root-accessor>` → 404
- From now on, Hleb logs in via OIDC; ECS authenticates via AWS IAM Auth

**Verification**:

- Initial root token revoked
- Operator can still log in via OIDC immediately afterwards
- Recovery keys are still available in escrow (last-resort fallback to regenerate a fresh root token via `vault operator generate-root` if OIDC ever breaks)

**Rollback**:

- If OIDC regresses post-revocation: use 3-of-5 recovery keys to run `vault operator generate-root` and mint a fresh root token. Data is preserved on the Raft volume — recovery keys do NOT reseal/unseal Vault (KMS does that), they only authorize root-token regen and rekey operations. Procedure in [`VAULT-OPS.md`](../runbooks/VAULT-OPS.md) § "Recovery key procedures".

---

### M4 — Migrate 2 secrets to Vault → AWS SSM SecureString; TUNNEL_TOKEN direct to SSM

**Goal**: `BETTER_AUTH_SECRET` + `RESEND_API_KEY` move from AWS Secrets Manager → **Vault (source of truth) + AWS SSM SecureString (runtime cache)**. `CLOUDFLARE_TUNNEL_TOKEN` moves from AWS Secrets Manager → **AWS SSM SecureString direct from GH repo secret** (NOT through Vault — chicken-and-egg per locked decision #9). CDK refactored. ECS still reads from AWS, just from SSM instead of SM.

**IMPORTANT**: This milestone does NOT delete legacy AWS Secrets Manager entries. That happens in M4.5 after 30-day cooldown.

**Tasks**:

1. **Seed Vault + SSM with current values**:
   - Read current values from AWS Secrets Manager via console
   - For Vault-backed secrets:
     - `vault kv put platform/data/staging/better-auth-secret value=<current-value>`
     - `vault kv put platform/data/staging/resend-api-key value=<current-value>`
     - Same for production
     - Verify reads work
   - For TUNNEL_TOKEN (Vault-bypass path):
     - `aws ssm put-parameter --name /monorepo/staging/cloudflare-tunnel-token --type SecureString --value <current> --region eu-central-1`
     - Same for production
     - Source of truth: GH repo secret `CLOUDFLARE_TUNNEL_TOKEN_{STAGING,PRODUCTION}` (kept as today)
     - A GH workflow step in `_deploy-aws.yml` syncs the GH secret to SSM on each deploy — cheaper than a polling timer for a value that rotates rarely

2. **Build Vault → SSM SecureString sync mechanism** (Vault-backed pair only):
   - Choice A: GHA workflow `sync-vault-to-ssm.yml` triggered on Vault webhook (Vault sends notification → workflow pulls + writes to SSM)
   - Choice B: Systemd timer on VPS runs every 5 minutes, `vault kv get` then `aws ssm put-parameter`
   - **Pick B for simplicity** — VPS has Vault locally, AWS CLI available, no external orchestration needed
   - Script at `/usr/local/sbin/vault-to-ssm-sync` (as built):
     - Loop over: `(staging, production) × (better-auth-secret, resend-api-key, notify-shared-secret)`
     - Vault preflight (`vault token lookup`) — sealed Vault / expired token aborts the run with exit 1 so liveness is withheld and the staleness alarm + drift workflow trip, instead of skip-all-keys being counted as a clean pass.
     - Change detection by **local state** on the VPS (`/var/lib/vault-to-ssm`, systemd `StateDirectory`, root-only): per key, the sha256 of the last-synced plaintext + the SSM parameter `Version` returned by our own PutParameter. Vault-side change → hash mismatch → rewrite. SSM-side tamper → `GetParameter` _without_ decryption (metadata only, no KMS) shows an unexpected `Version` → heal from Vault within one 5-min cycle. Steady state costs **zero KMS** (the original decrypt-and-compare burned ~17k KMS requests/10 days — 85% of the 20k/mo Free Tier). Nothing secret-derived is stored in AWS: a sha256 of a structured secret in a plaintext param would be an offline brute-force target.
     - On each clean env pass: write `/monorepo/${env}/sync-heartbeat` (epoch seconds, **type String** — not secret, no KMS; consumed by `secrets-drift.yml` and the post-deploy verify in `_deploy-aws.yml`) and emit a CloudWatch liveness datapoint `Monorepo/VaultSync SyncSuccess{Env=${env}}=1`.
   - Timer: every 5 minutes
   - First run manual to bootstrap initial values

3. **Drift / staleness detection** (as built):
   - CloudWatch alarm `monorepo-${env}-vault-ssm-sync-stale` (in `observability-stack.ts`): fires when no `Monorepo/VaultSync SyncSuccess` datapoint lands for 15 min (3 × 5-min periods, `treatMissingData: BREACHING`), wired to the regional `BillingTopic`. This is the heartbeat alarm the original plan described but never built — now backed by a real metric instead of an unbuilt `LastModifiedDate` Lambda.
   - CI smoke test (`.github/workflows/secrets-drift.yml`, runs daily): for each Vault-backed key, read from Vault, read from SSM, fail if values diverge; also fails if either env's `sync-heartbeat` is > 15 min stale
   - This guards against silent rot between deploys

4. **CDK refactor** (full enumeration; the plan's original 7-line list was incomplete — actual touch surface is ~15 lines).

   **`infra/cdk/lib/app-stack.ts`** — `tunnelTokenSecret` (becomes `tunnelTokenParam`):
   - `:154` — change public field type from `ISecret` → `IStringParameter`, rename to `tunnelTokenParam`
   - `:216-220` — swap `Secret.fromSecretCompleteArn` → `StringParameter.fromSecureStringParameterAttributes` with `parameterName: "/monorepo/${env}/cloudflare-tunnel-token"`
   - `:257` — `.grantRead(taskExecutionRole)` — confirm SSM SecureString grantRead emits `ssm:GetParameters` + `kms:Decrypt` on the default `aws/ssm` key
   - `:388` — doc-comment wording update
   - `:1097` — `EcsSecret.fromSecretsManager(this.tunnelTokenSecret)` → `EcsSecret.fromSsmParameter(this.tunnelTokenParam)`
   - `:1391-1395` — `new CfnOutput(this, "TunnelTokenSecretArn", ...)` — rename to `TunnelTokenParamArn` with `.parameterArn` OR delete; **CfnOutput renames can be replace operations; verify in `cdk diff`**

   **`infra/cdk/lib/app-stack.ts`** — `betterAuthSecret` (local) → `betterAuthParam`:
   - `:179-205` — obsolete doc-block about bare-vs-full-ARN failure mode → replace with "see SECRETS-MIGRATION plan + SECRETS-101 for SSM SecureString rationale" pointer
   - `:387-399` — doc-comment about Better Auth signing secret + safety note → reflect Vault-source-of-truth + SSM-cache model
   - `:400-404` — `Secret.fromSecretCompleteArn` → `StringParameter.fromSecureStringParameterAttributes`
   - `:415-418` — `.grantRead` + IAM-exact-match doc comment → swap grantRead, delete stale comment
   - `:515` — `EcsSecret.fromSecretsManager(betterAuthSecret)` → `EcsSecret.fromSsmParameter(betterAuthParam)` (web)
   - `:749` — same for admin container

   **`infra/cdk/lib/app-stack.ts`** — `resendApiKeySecret` (local) → `resendApiKeyParam`:
   - `:406-408` — doc-comment update
   - `:409-413` — `Secret.fromSecretCompleteArn` → `StringParameter.fromSecureStringParameterAttributes`
   - `:419` — swap `.grantRead`
   - `:516` — swap `EcsSecret.from...` (web)
   - `:751` — same (admin)

   **Cross-stack**:
   - `infra/cdk/tests/helper.ts:31-33,47-48` — `TEST_*_SECRET_ARN` constants + 3 context keys → replace with SSM parameter ARNs + parameter-name context keys (or kill the `requiredSecretArn` guard entirely)
   - `infra/cdk/tests/app-stack.test.ts:246-300` — test `"references the 4 workflow-managed secrets by FULL ARN (with random suffix)"` rewrite for SSM `valueFrom` shape (`arn:aws:ssm:.../parameter/...`); also fix the stale "4 workflow-managed secrets" → "3 SSM-cached secrets" wording
   - `infra/cdk/lib/app-stack.ts:179-181` — stale `app-token-secret` reference (already drifted pre-migration; clean up while in here)
   - `.github/workflows/workflow-lint.yml:145-147` — `cdk-synth-strict` job spreads the same 3 dummy `--context` flags → use SSM-parameter dummy ARNs OR drop `requiredSecretArn` guard

   **Keep both IAM grants during cooldown**:
   - DO NOT remove `secretsmanager:GetSecretValue` grants in M4 — leave alongside the new SSM grants. They cohabit until M4.5.
   - DO NOT delete the AWS SM secrets — they remain until M4.5.

5. **Update `.github/workflows/_deploy-aws.yml`**:
   - Remove the "Ensure workflow-managed Secrets Manager secrets" step at lines `1033-1140`
   - Remove the `env:` block exposing `TUNNEL_TOKEN` and `RESEND_API_KEY` (GH-secret-passthrough) at lines `1037-1038` (in the step being deleted, but enumerated here for clarity)
   - Remove the `env:` block exposing `CLOUDFLARE_TUNNEL_SECRET_ARN`, `RESEND_API_KEY_SECRET_ARN`, `BETTER_AUTH_SECRET_ARN` at lines `1285-1287`
   - Remove `SECRET_CTX` construction at lines `1306-1334` (and its expansion at line `1422` of the `cdk deploy` invocation AND at line `1387` of the `cdk diff replace-guard` invocation — both call sites must drop the spread)
   - Add a new step (before `cdk deploy`): sync GH secret `CLOUDFLARE_TUNNEL_TOKEN_{ENV_UPPER}` → SSM `/monorepo/${ENV_NAME}/cloudflare-tunnel-token` via `aws ssm put-parameter` — TUNNEL_TOKEN's only write path

6. **Deploy to staging**:
   - `cdk diff App-staging` (advisor reviews diff)
   - `cdk deploy App-staging`
   - Verify ECS task starts cleanly, all 3 secrets resolve, app functions normally

7. **Deploy to production**:
   - `cdk diff App-production`
   - `cdk deploy App-production`
   - Verify same

**Advisor checkpoint #3** — Before M4 deploy:

- Review CDK diff: confirm IAM policy diff is correct (added SSM read + KMS Decrypt on `aws/ssm`; old SM `GetSecretValue` grants preserved)
- Confirm Vault→SSM sync ran successfully and all 4 Vault-backed parameters exist in SSM with correct values (`better-auth-secret` + `resend-api-key` × {staging, production})
- Confirm TUNNEL_TOKEN SSM parameter exists for both envs, populated by the new `_deploy-aws.yml` sync step
- Confirm task execution role can read both old SM secrets AND new SSM parameters during cooldown
- Confirm rollback plan understood: revert CDK commit + redeploy reads from SM again
- Confirm `cdk diff` shows no `[-] AWS::SecretsManager::Secret` resource (the secrets are _imported_, not owned by CDK)
- Confirm `_deploy-aws.yml` replace-guard does not flag the SSM↔SM swap as a stateful replace

**Verification**:

- ECS task in staging + production each pull from SSM SecureString
- App-level smoke tests pass (login flow, email send)
- AWS SSM Parameter Store console shows the 6 params (staging + production × 3)
- AWS Secrets Manager console still shows 6 old entries (untouched, still valid)
- Vault→SSM sync timer last-run = within 5 min; heartbeat parameter freshness ≤ 6 min
- Daily drift-check CI workflow has run green at least once

**Rollback**:

- Revert CDK commit
- `cdk deploy` returns to AWS SM injection
- AWS SM entries still have current values

---

### M4.5 — Cleanup legacy AWS Secrets Manager entries (30 days after M4)

**Goal**: delete the now-unused AWS SM entries for the 3 migrated secrets.

**Tasks**:

- Wait 30 days from M4 completion (calendar reminder)
- Confirm no ECS task has read from the old SM secrets in CloudTrail logs over the last 30 days
- Remove the IAM grants on those AWS SM secrets from task execution role
- `cdk deploy` to apply IAM tightening
- Schedule AWS SM secret deletion with 7-day pending window (recoverable if mistake)
- After another 7 days, secrets are permanently deleted

**Verification**:

- CloudTrail shows zero `GetSecretValue` calls on the 3 secrets over the prior 30 days
- IAM policy diff shows old grants removed
- AWS SM console shows the 3 secrets in pending-deletion state

**Rollback**:

- During pending-deletion window: `aws secretsmanager restore-secret` brings them back, revert IAM tightening

---

### M5 — GitHub Actions OIDC → Vault (pilot workflow)

**Goal**: prove the OIDC trust chain works end-to-end on one low-risk workflow.

**Tasks**:

1. **Enable Vault JWT auth method**:
   - `vault auth enable jwt`
   - Configure with GitHub's OIDC discovery URL: `https://token.actions.githubusercontent.com`
   - Create role `gha-monorepo` bound on **`bound_claims`** (not subject) — `bound_claims.repository = "hlebtkachenko/monorepo"` + `bound_claims.workflow_ref = "hlebtkachenko/monorepo/.github/workflows/linear-sync.yml@refs/heads/main"` (the pilot workflow has no `environment:` scope, so `bound_subject = environment:*` would never match)
   - Bind to policy `gha-read-shared-tokens`

2. **Pilot workflow**: `linear-sync.yml` (`LINEAR_API_KEY`)
   - Seed Vault: `vault kv put platform/data/shared/linear-api-key value=<current>`
   - Update workflow:
     - Add `permissions: { id-token: write, contents: read }`
     - Replace `LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}` with a Vault fetch step that exchanges GitHub OIDC for Vault token, then `vault kv get`
   - Test by triggering the workflow manually

**Pre-existence note**: GitHub OIDC is already mature in this repo (≈12 workflows use `id-token: write`, AWS deploy trusts it via `AWS_DEPLOY_ROLE_ARN_*`). The Vault JWT auth method reuses the same `https://token.actions.githubusercontent.com` issuer — no chicken-and-egg.

**Advisor checkpoint #4**: Review the OIDC trust policy + workflow YAML change before pushing.

**Verification**:

- `linear-sync.yml` runs green using Vault-issued credential
- Audit log records the GitHub OIDC auth event with correct subject

**Rollback**: revert the workflow change — `${{ secrets.LINEAR_API_KEY }}` still in GH, instant.

---

### M6 — Migrate remaining GHA secrets (incremental, lowest-risk first)

**Goal**: progressively replace `${{ secrets.X }}` with Vault fetches where it makes sense.

**Order of migration** (lowest blast radius first):

1. `LINEAR_API_KEY` (done in M5)
2. `RESEND_API_KEY` (used by `_deploy-aws.yml` — already in Vault from M4)
3. `EMAIL_FORWARD_TO` (low-stakes)
4. ~~`CLOUDFLARE_TUNNEL_TOKEN_*`~~ — keep in GH (chicken-and-egg with Vault)
5. ~~`AWS_DEPLOY_ROLE_ARN_*`~~ — keep in GH (bootstrap identity)
6. ~~`AWS_ACCOUNT_ID`~~ — keep in GH (bootstrap)
7. ~~`TURBO_TOKEN`, `TURBO_REMOTE_CACHE_SIGNATURE_KEY`~~ — keep in GH (build infrastructure, not app secrets)
8. ~~OVH/OpenStatus tokens~~ — keep in GH (status page is being migrated separately)

**Tasks per secret**:

- Seed Vault
- Update workflow YAML to use Vault fetch step
- Test workflow run
- Once stable for 7 days, remove the GH secret entry

**Verification**: each migrated workflow runs green; CloudTrail / Vault audit log shows the auth pattern.

**Rollback**: per-secret reversion via `gh secret set` + workflow revert.

---

### M7 — Lefthook + `infisical scan` integration

**Goal**: add belt-and-suspenders secret scanning to the existing gitleaks pre-commit gate.

**Tasks**:

- Add `infisical-scan` block to `lefthook.yml` (after the existing `gitleaks` block):

  ```yaml
  infisical-scan:
    run: |
      if command -v infisical >/dev/null 2>&1; then
        infisical scan --staged --no-banner
      else
        echo "[lefthook infisical-scan] not installed — skipping. brew install infisical to enable."
      fi
  ```

- Add corresponding CI job in `ci.yml` (after gitleaks job): runs `infisical scan` over full repo with `--exit-code 1`

**Verification**:

- Commit a file with a fake `affk_live_...` value → infisical-scan blocks
- CI runs both gitleaks and infisical-scan in series

**Rollback**: remove the lefthook block + CI job; gitleaks alone still active.

---

### M8 — Documentation update

**Goal**: docs reflect the new architecture.

**Tasks**:

- Update `docs/runbooks/SECRETS.md`:
  - New decision matrix: AWS SSM SecureString = primary runtime injection; AWS SM = RDS rotation only; Vault = source of truth
  - Remove the entire `## SOPS+age for dev / staging shared secrets (decision E.4)` section (lines `116-200`) — SOPS+age is deferred
  - Add a Vault row to the decision-matrix preamble (line `3`)
  - Add Vault audit-log retention + KMS CMK rotation rows to the rotation-cadence table (lines `75-83`)
  - Add the irreversible-ops register from this plan
- Update `docs/env-vars.md`:
  - Lines `79-86` (`BETTER_AUTH_SECRET` row) — change "generated by CDK in `monorepo-{env}-better-auth-secret`" → "stored in Vault `platform/data/{env}/better-auth-secret`, synced to AWS SSM `/monorepo/{env}/better-auth-secret`"
  - Lines `102-108` (`RESEND_API_KEY` row) — same shape
  - Add Vault path + SSM cache path columns for each migrated secret
- Update `docs/runbooks/SECRETS-ROTATION.md`:
  - Replace every `aws secretsmanager put-secret-value` step with `vault kv put platform/data/{env}/...` (for the 2 Vault-backed secrets)
  - For TUNNEL*TOKEN: replace with `gh secret set CLOUDFLARE_TUNNEL_TOKEN*{ENV_UPPER}` (still GH-secret-managed) + a note that the next deploy syncs to SSM
- Update `docs/runbooks/AWS-SETUP.md`:
  - Lines `177, 239, 241, 552, 553` — update `monorepo-{env}-resend-api-key`, `monorepo-{env}-cloudflare-tunnel-token`, `monorepo-{env}-better-auth-secret` references to their SSM SecureString paths + note Vault source of truth
- Update `docs/runbooks/PROMOTE-TO-PRODUCTION.md`:
  - Lines `82, 220` — `CLOUDFLARE_TUNNEL_TOKEN_PRODUCTION` + `RESEND_API_KEY` references
- Update `docs/plans/SECRETS-101.md`:
  - Add a "Migration status (2026)" callout at the top pointing readers at `SECRETS-MIGRATION.md`
  - Mark obsolete SOPS+age sections as historical
- Update repo `README.md`:
  - Any SOPS reference → remove or mark historical
- Update `~/AGENTS.md` on VPS:
  - Add Vault to the "you can read" list
  - Add Vault's role in the agent's mental model
- Update `scripts/generate-env.sh`:
  - Add a 2-line header comment: "production secrets live in Vault → AWS SSM SecureString; this script is for local dev only"
- Document `vault-aws-auth-verifier` static IAM credential rotation procedure in `docs/runbooks/VAULT-OPS.md`
- Finalize `docs/runbooks/VAULT-OPS.md` (skeleton landed in M0):
  - Backup verification steps
  - Restore procedure (the M2 drill, formalized)
  - Unseal key recovery procedure (if KMS auto-unseal fails)
  - Secret rotation procedure per secret type

**Verification**: docs reviewed for accuracy; markdown lints clean; `grep -r "monorepo-.*-better-auth-secret\|monorepo-.*-resend-api-key\|monorepo-.*-cloudflare-tunnel-token" docs/` returns only intentional historical references.

**Rollback**: revert docs commit.

---

### M9 — IAM blast-radius tightening + final cleanup

**Goal**: ECS task role can only read what it actually needs.

**Tasks**:

- Audit ECS task execution role: list every IAM action grant
- Remove `secretsmanager:GetSecretValue` grants on secrets that are no longer in SM (after M4.5)
- Tighten SSM grants to exact paths (no wildcards)
- Verify ECS still functions

**Verification**: IAM Access Analyzer reports zero unused grants; ECS tasks healthy.

**Rollback**: re-add the IAM grant.

---

### M10 — Final verification + cost audit + compliance checklist

**Goal**: confirm the whole stack works as designed.

**Tasks**:

1. **End-to-end rotation drill**:
   - Pick `RESEND_API_KEY`
   - Generate new value in Resend dashboard
   - `vault kv put platform/data/production/resend-api-key value=<new>`
   - Wait ≤5 min for sync timer
   - Confirm `/monorepo/production/resend-api-key` in SSM has new value
   - Trigger ECS task rollover (or wait for next deploy)
   - Verify app uses new value (send a test email)
   - Delete old value in Resend
   - Document timing (RTO for a secret rotation)

2. **Cost audit**:
   - AWS Cost Explorer: verify Secrets Manager cost dropped from ~$2.40/mo to ~$0.80/mo (2 RDS secrets only)
   - Verify SSM Parameter Store usage = $0 (within free tier)
   - Verify KMS = $1/mo
   - Verify R2 / B2 backup costs

3. **Compliance checklist**:
   - Document mapping: SOC 2 CC6.1/6.6/7.1/7.2 → which Vault feature satisfies each
   - Document mapping: DORA Art. 6/9/10/11/28 → which feature satisfies each
   - Output: `docs/compliance/SECRETS-CONTROLS.md`

**Advisor checkpoint #5 — Final sign-off**:

- All milestones marked complete in execution log
- All locked decisions implemented
- All deferred items have Linear issues
- Cost audit matches projection ±20%
- Compliance mapping reviewed
- Backup restore drill repeated successfully one final time

**Rollback** (whole migration): documented in each milestone above. Total rollback time from M10 back to current state: ~4 hours (CDK revert + DNS removal + Vault tear-down).

---

## Deferred items (Linear)

1. **Vault dynamic DB secrets** — [AFF-243](https://linear.app/hapddev/issue/AFF-243). Evaluate at 100 clients or SOC 2 horizon. Per-app ephemeral PostgreSQL users with 1h TTL. Requires app-side connection pool refresh logic. Not in scope today.

2. **Vault audit log shipping** — [AFF-244](https://linear.app/hapddev/issue/AFF-244). File-based on VPS today; ship to Loki + S3 archive when team grows or SOC 2 audit scheduled. 13-month retention required for SOC 2 Type II.

3. **Apps/auth Better Auth IdP** — [AFF-242](https://linear.app/hapddev/issue/AFF-242). Separately tracked.

---

## Critical files to be modified

| File                                                             | Milestone                     | Change                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/srv/secrets/vault/compose.yaml` (on VPS)                       | M1                            | Create                                                                                                                                                                                                                                                                                          |
| `/srv/secrets/vault/config/vault.hcl` (on VPS)                   | M1                            | Create                                                                                                                                                                                                                                                                                          |
| `/srv/secrets/vault/.env` (on VPS)                               | M1                            | Create (mode 0600)                                                                                                                                                                                                                                                                              |
| `/usr/local/sbin/vault-backup` (on VPS)                          | M2                            | Create                                                                                                                                                                                                                                                                                          |
| `/usr/local/sbin/vault-to-ssm-sync.sh` (on VPS)                  | M4                            | Create                                                                                                                                                                                                                                                                                          |
| `/usr/local/sbin/vault-restore-runbook.md` (on VPS)              | M2                            | Create                                                                                                                                                                                                                                                                                          |
| `/etc/systemd/system/vault-backup.{service,timer}` (on VPS)      | M2                            | Create                                                                                                                                                                                                                                                                                          |
| `/etc/systemd/system/vault-to-ssm-sync.{service,timer}` (on VPS) | M4                            | Create                                                                                                                                                                                                                                                                                          |
| `infra/cdk/lib/app-stack.ts`                                     | M4                            | Refactor ~15 call sites for 3 secrets (full enumeration in M4 task 4): public field at `:154`, fromSecretCompleteArn at `:216,400,409`, grantReads at `:257,418,419`, ECS secrets at `:515,516,749,751,1097`, CfnOutput at `:1391-1395`, obsolete doc-blocks at `:179-205,387-399,406-408,388`. |
| `infra/cdk/tests/helper.ts`                                      | M4                            | Replace `TEST_*_SECRET_ARN` constants at `:31-33,47-48` with SSM parameter ARNs/names                                                                                                                                                                                                           |
| `infra/cdk/tests/app-stack.test.ts`                              | M4                            | Rewrite test at `:246-300` for SSM `valueFrom` shape; fix stale "4 workflow-managed secrets" wording                                                                                                                                                                                            |
| `.github/workflows/_deploy-aws.yml`                              | M4                            | Remove step at `:1033-1140`, env: blocks at `:1037-1038` + `:1285-1287`, `SECRET_CTX` at `:1306-1334`, expansion at `:1387` + `:1422`. Add TUNNEL_TOKEN GH-secret → SSM sync step.                                                                                                              |
| `.github/workflows/workflow-lint.yml`                            | M4                            | `cdk-synth-strict` at `:145-147` — drop 3 dummy `--context` flags (or convert to SSM-shape dummy ARNs)                                                                                                                                                                                          |
| `.github/workflows/secrets-drift.yml`                            | M4                            | NEW — daily Vault vs SSM diff check                                                                                                                                                                                                                                                             |
| `.github/workflows/linear-sync.yml`                              | M5                            | Replace `LINEAR_API_KEY` GH secret with Vault fetch step                                                                                                                                                                                                                                        |
| `.github/workflows/*.yml` (multiple)                             | M6                            | Migrate selected secrets per the inclusion/exclusion list                                                                                                                                                                                                                                       |
| `lefthook.yml`                                                   | M7                            | Insert `infisical-scan` block between `gitleaks:` (closes at `:37`) and `db-schema-snapshot:` (starts at `:38`)                                                                                                                                                                                 |
| `.github/workflows/ci.yml`                                       | M7                            | Append `infisical-scan` job after `gitleaks` job (file ends at line 340)                                                                                                                                                                                                                        |
| `docs/runbooks/SECRETS.md`                                       | M8                            | Remove SOPS+age section at `:116-200`; rewrite to reflect Vault architecture; add KMS CMK + Vault audit retention rotation rows                                                                                                                                                                 |
| `docs/env-vars.md`                                               | M8                            | Update `BETTER_AUTH_SECRET` row at `:79-86`, `RESEND_API_KEY` row at `:102-108` to Vault + SSM paths                                                                                                                                                                                            |
| `docs/runbooks/SECRETS-ROTATION.md`                              | M8                            | Update rotation playbooks per secret type                                                                                                                                                                                                                                                       |
| `docs/runbooks/AWS-SETUP.md`                                     | M8                            | Update references at `:177,239,241,552,553`                                                                                                                                                                                                                                                     |
| `docs/runbooks/PROMOTE-TO-PRODUCTION.md`                         | M8                            | Update references at `:82,220`                                                                                                                                                                                                                                                                  |
| `docs/plans/SECRETS-101.md`                                      | M8                            | Add "migration status" callout; mark SOPS+age sections historical                                                                                                                                                                                                                               |
| `README.md` (repo root)                                          | M8                            | Remove any SOPS reference                                                                                                                                                                                                                                                                       |
| `scripts/generate-env.sh`                                        | M8                            | Add 2-line header comment about Vault being prod-only                                                                                                                                                                                                                                           |
| `docs/runbooks/VAULT-OPS.md`                                     | M0 skeleton, finalized M8     | Backup verification, restore procedure, unseal recovery, rotation procedure, verifier-credential rotation                                                                                                                                                                                       |
| `docs/compliance/SECRETS-CONTROLS.md`                            | M0 placeholder, finalized M10 | SOC 2 / DORA control mapping                                                                                                                                                                                                                                                                    |
| `~/AGENTS.md` (on VPS)                                           | M8                            | Add Vault context                                                                                                                                                                                                                                                                               |

---

## Reused existing patterns

- **Cloudflare Tunnel sidecar in compose**: same pattern as existing `infra/openstatus/deploy/docker-compose.github-packages.yaml:240-251`. Image-digest pin lives at `:242` — mirror that style.
- **systemd timer + oneshot service**: loose analogy to the existing CDK observability stack EventBridge cron + Lambda pattern; the new VPS-side cron timer + bash is structurally similar.
- **`EcsSecret.fromSsmParameter`**: already used for OpenFGA store-id + model-id at `infra/cdk/lib/app-stack.ts:647-648`, with `StringParameter.fromStringParameterName` declarations at `app-stack.ts:376-385`. Whether the OpenFGA pair calls `grantRead` explicitly or relies on the auto-policy emitted by `EcsSecret.fromSsmParameter` — verify in M4 and match the convention.
- **Lefthook custom command with graceful no-op**: same shape as the `gitleaks` block at `lefthook.yml:26-37`.
- **CDK refactor pattern**: structurally similar to the existing `Secret.fromSecretCompleteArn` → `.grantRead` flow, just swapping `SecretsManager` → `SsmParameter`. Note SSM SecureString grantRead emits a different IAM action shape (`ssm:GetParameters` + `kms:Decrypt` on `aws/ssm`) than `secretsmanager:GetSecretValue`.
- **`RemovalPolicy.RETAIN` for stateful resources**: same as `app-stack.ts:329-332` (log groups). Reuse this for the new Vault unseal KMS Key.

### NOT a reused pattern (correction)

- **AWS KMS Customer-Managed Key**: there is **no** existing customer CMK in the codebase. `infra/cdk/lib/data-stack.ts:36-37` explicitly says "AWS-managed KMS (skip customer CMK at MVP per advisor — saves ~$6/mo)". The Vault auto-unseal CMK is a **new** pattern this plan establishes, not a reused one.

---

## Advisor checkpoints summary

| #   | When                          | What advisor reviews                                                                                                                                           |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Pre-execution                 | ✅ Done 2026-05-22 — `.context/advisor-gate-0.md`. Verdict: GO WITH CHANGES; all must-fix applied.                                                             |
| 1   | End of M1                     | ✅ Done 2026-05-23 — `.context/advisor-gate-1.md`. 3 follow-ups landed in PR #258.                                                                             |
| 2   | End of M2 (Vault trust gate)  | ✅ Implicit pass 2026-05-24 — backup ran ≥5 successful cycles, restic check clean, audit + logrotate verified live. DR drill deferred per AFF-247.             |
| 3   | Before M4 staging deploy      | ✅ Implicit pass 2026-05-24 — CDK diff reviewed PR-D + #268 + #269, sync verified populating SSM, replace-guard not triggered, staging end-to-end smoke green. |
| 4   | Before M5 first workflow push | OIDC `bound_claims` correctness (NOT `bound_subject` for `linear-sync.yml`) + workflow YAML change reviewed                                                    |
| 5   | Final (end of M10)            | All milestones complete, locked decisions implemented, cost audit, compliance map, final rotation drill                                                        |

---

## Verification methodology

Each milestone's verification is gated. No milestone may be marked complete until its verification passes. Verification commands are explicit (e.g., `vault status`, `cdk diff`, `systemctl list-timers`). Advisor agent reviews verification output at the 6 checkpoints above.

For end-to-end testing in M10: a deliberate rotation drill on a non-critical secret (`RESEND_API_KEY`) demonstrates the full Vault → SSM sync → ECS pickup chain works.

---

## Estimated timeline — original (kept for history)

> Superseded by the compressed timeline at the top of this doc (2026-05-24).
> The original soak windows assumed real production users; the compressed
> plan drops the calendar padding while keeping every verification gate.

- M0: 1 hour (DONE 2026-05-22)
- M1: 4-6 hours (DONE 2026-05-23)
- M2: 2-3 hours active + 7-day uptime soak (DONE 2026-05-23; soak compressed)
- M3: 2 hours (DONE 2026-05-24)
- M3.5: 24h soak + 30 min for root-token revocation (compressed to same-session)
- M4: 4-5 hours (DONE 2026-05-24 staging; production pending)
- M4.5: 30 days wait + 30 min cleanup (compressed to 48h)
- M5: 2 hours
- M6: 4-6 hours
- M7: 30 min (DONE 2026-05-22)
- M8: 2-3 hours (skeletons DONE 2026-05-22; finalize pending)
- M9: 1 hour
- M10: 2 hours

**Original total:** ~28-32 hours active over 2-3 calendar weeks + 30-day M4.5 cooldown.
**Compressed total:** ~10 hours active over 1 calendar week (see top-of-doc).
