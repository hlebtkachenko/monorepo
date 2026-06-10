# ICT Asset Inventory

> Maintained per DORA Article 8 ICT asset register requirement.
> Per-host URL inventory (web/api/admin/status/monitoring/cache + email): [`docs/DOMAINS-AND-EMAIL.md`](DOMAINS-AND-EMAIL.md).

Source of truth for material ICT assets. Updated when an asset is added, retired, or changes data classification. AWS is connected; as the AWS Config aggregator is wired up it becomes the machine-readable source of truth and this file the human-readable index — both must agree on every asset.

Audit trail of changes: git history of this file.

## Legend

- **Type**: cloud account / compute / data store / network / identity / SaaS.
- **Criticality**: Critical, High, Medium, Low (impact on customers and money on outage).
- **Data class**: None, Internal, Customer, Customer + Financial, Audit, Telemetry.
- **DR tier**: Tier 1 (RTO 4h, RPO 15m) / Tier 2 (RTO 24h, RPO 4h) / Tier 3 (best-effort).
- **Status**: Planned, Active, Retired.

## 1. Cloud accounts

| Asset ID    | Name                                                     | Type          | Owner | Criticality | Data class           | DR tier | Vendor | Status |
| ----------- | -------------------------------------------------------- | ------------- | ----- | ----------- | -------------------- | ------- | ------ | ------ |
| AWS-ACC-001 | AWS account (single; prod + staging share, per ADR-0007) | cloud account | Hleb  | Critical    | Customer + Financial | Tier 1  | AWS    | Active |

## 2. Compute services

| Asset ID           | Name                                                           | Type                  | Owner | Criticality | Data class           | DR tier | Vendor    | Status | Justification                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------- | --------------------- | ----- | ----------- | -------------------- | ------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ECS-WEB-PRD        | web (production)                                               | ECS Fargate service   | Hleb  | Critical    | Customer             | Tier 1  | AWS       | Active |                                                                                                                                                                                            |
| ECS-WEB-STG        | web (staging)                                                  | ECS Fargate service   | Hleb  | Medium      | Internal             | Tier 3  | AWS       | Active |                                                                                                                                                                                            |
| ECS-API-PRD        | api (production)                                               | ECS Fargate container | Hleb  | Critical    | Customer + Financial | Tier 1  | AWS       | Active |                                                                                                                                                                                            |
| ECS-API-STG        | api (staging)                                                  | ECS Fargate container | Hleb  | Medium      | Internal             | Tier 3  | AWS       | Active |                                                                                                                                                                                            |
| ECS-ADMIN-PRD      | admin (production)                                             | ECS Fargate container | Hleb  | High        | Internal             | Tier 1  | AWS       | Active |                                                                                                                                                                                            |
| ECS-ADMIN-STG      | admin (staging)                                                | ECS Fargate container | Hleb  | Medium      | Internal             | Tier 3  | AWS       | Active |                                                                                                                                                                                            |
| LAMBDA-KILLSWITCH  | cost kill-switch (SecurityStack)                               | Lambda                | Hleb  | High        | Internal             | Tier 2  | AWS       | Active |                                                                                                                                                                                            |
| LAMBDA-RDSWATCH    | RDS auto-restart watcher (SecurityStack)                       | Lambda                | Hleb  | Medium      | Internal             | Tier 3  | AWS       | Active |                                                                                                                                                                                            |
| ECS-PGBOUNCER-SC   | pgBouncer sidecar (api task)                                   | ECS Fargate container | Hleb  | High        | Customer + Financial | Tier 1  | AWS       | Active | Connection pool reducer for Postgres: prevents per-request fd exhaustion under burst auth load; without it the api task exhausts RDS max_connections and hard-fails.                       |
| ECS-CERBOS-SC      | Cerbos PDP sidecar (api task, L3 authz)                        | ECS Fargate container | Hleb  | High        | Internal             | Tier 1  | AWS       | Active | Policy Decision Point for attribute-based access control (L3 authz): every api authorization check routes through it and fails closed if it is unavailable.                                |
| ECS-OPENFGA-SC     | OpenFGA sidecar (api task, L2 authz)                           | ECS Fargate container | Hleb  | High        | Customer             | Tier 1  | AWS       | Active | ReBAC graph store for relationship-based authorization (L2 authz): workspace and organization membership checks depend on it and are denied on absence.                                    |
| ECS-CLOUDFLARED-SC | cloudflared sidecar (Cloudflare Tunnel)                        | ECS Fargate container | Hleb  | Critical    | None                 | Tier 1  | AWS       | Active | Tunnel broker that exposes the private Fargate task to Cloudflare's edge: all inbound HTTPS traffic is routed through it and the service is unreachable without it.                        |
| ECS-BACKUP-TASK    | nightly backup scheduled task                                  | ECS Fargate           | Hleb  | High        | Customer + Financial | Tier 1  | AWS       | Active |                                                                                                                                                                                            |
| OVH-VPS-001        | OVH VPS (Windows Server 2025, WSL2 Docker)                     | compute / VPS         | Hleb  | Medium      | Internal             | Tier 3  | OVH       | Active |                                                                                                                                                                                            |
| HOSTINGER-VPS-001  | Hostinger KVM 2 VPS (`secrets-admin.afframe.com`, hosts Vault) | compute / VPS         | Hleb  | Critical    | Customer + Financial | Tier 1  | Hostinger | Active | Source of truth for all app-runtime secrets (HashiCorp Vault KV-v2); mirrored to AWS SSM SecureString every 5 min by a systemd timer. See `runbooks/SECRETS.md` + `runbooks/VAULT-OPS.md`. |

## 3. Data stores

| Asset ID           | Name                                        | Type                                             | Owner | Criticality | Data class           | DR tier | Vendor                                  | Status  |
| ------------------ | ------------------------------------------- | ------------------------------------------------ | ----- | ----------- | -------------------- | ------- | --------------------------------------- | ------- |
| RDS-PRD-OLTP       | primary OLTP                                | RDS Postgres single-AZ                           | Hleb  | Critical    | Customer + Financial | Tier 1  | AWS                                     | Active  |
| RDS-STG-OLTP       | staging OLTP                                | RDS Postgres single-AZ                           | Hleb  | Medium      | Internal             | Tier 3  | AWS                                     | Active  |
| S3-AUDIT           | audit log archive                           | S3 (Object Lock planned, not yet enabled)        | Hleb  | Critical    | Audit                | Tier 1  | AWS                                     | Planned |
| S3-CT-AUDIT        | CloudTrail management-events archive        | S3                                               | Hleb  | High        | Audit                | Tier 2  | AWS                                     | Active  |
| S3-ASSETS-PRD      | static assets (production)                  | S3                                               | Hleb  | High        | None                 | Tier 2  | AWS                                     | Active  |
| SECRETS-PRD        | runtime secrets                             | Vault (self-hosted VPS) → AWS SSM SecureString   | Hleb  | Critical    | Customer + Financial | Tier 1  | Hostinger (Vault SoT) + AWS (SSM cache) | Active  |
| CT-MGMT            | CloudTrail management-events trail          | CloudTrail                                       | Hleb  | High        | Audit                | Tier 2  | AWS                                     | Active  |
| BUDGETS-COST       | 5 AWS Budgets (cost-runaway protection)     | AWS Budgets                                      | Hleb  | High        | Internal             | Tier 2  | AWS                                     | Active  |
| SSM-OPENFGA-IDS    | OpenFGA store-id + model-id (L2 authz)      | SSM Parameter Store                              | Hleb  | High        | Internal             | Tier 1  | AWS                                     | Active  |
| S3-BACKUPS         | encrypted nightly backups (BackupStack)     | S3 (versioned, IA/Glacier/DeepArchive lifecycle) | Hleb  | Critical    | Customer + Financial | Tier 1  | AWS                                     | Active  |
| RDS-OPENFGA-SCHEMA | openfga schema in primary RDS (ReBAC graph) | RDS Postgres schema                              | Hleb  | High        | Customer             | Tier 1  | AWS                                     | Active  |

## 4. Networking

| Asset ID | Name           | Type | Owner | Criticality | Data class | DR tier | Vendor | Status |
| -------- | -------------- | ---- | ----- | ----------- | ---------- | ------- | ------ | ------ |
| VPC-PRD  | production VPC | VPC  | Hleb  | Critical    | n/a        | Tier 1  | AWS    | Active |
| VPC-STG  | staging VPC    | VPC  | Hleb  | Medium      | n/a        | Tier 3  | AWS    | Active |

_No ALB / WAFv2 / Transit Gateway: ingress is Cloudflare Tunnel via the cloudflared sidecar (see ECS-CLOUDFLARED-SC); single VPC per env, no cross-account networking._

## 5. Identity

| Asset ID      | Name                                          | Type              | Owner | Criticality | Data class | DR tier | Vendor | Status |
| ------------- | --------------------------------------------- | ----------------- | ----- | ----------- | ---------- | ------- | ------ | ------ |
| IAM-USERS-001 | direct IAM users (operators + workload roles) | identity provider | Hleb  | High        | Internal   | Tier 1  | AWS    | Active |
| GHOID-PRD     | GitHub OIDC provider (prod)                   | OIDC provider     | Hleb  | High        | Internal   | Tier 2  | AWS    | Active |
| GHOID-STG     | GitHub OIDC provider (staging)                | OIDC provider     | Hleb  | Medium      | Internal   | Tier 3  | AWS    | Active |

## 6. Third-party SaaS

| Asset ID           | Name                                                                                           | Type                            | Owner   | Criticality | Data class | DR tier | Vendor                           | Status                               |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------- | ------- | ----------- | ---------- | ------- | -------------------------------- | ------------------------------------ |
| GH-REPO-001        | hlebtkachenko/monorepo                                                                         | source repo                     | Hleb    | High        | Code       | Tier 2  | GitHub                           | Active                               |
| GH-ACT-001         | GitHub Actions runners                                                                         | CI compute                      | Hleb    | High        | Code       | Tier 2  | GitHub                           | Active                               |
| GHCR-001           | GHCR container registry                                                                        | container registry              | Hleb    | High        | Code       | Tier 2  | GitHub                           | Active                               |
| SENTRY-001         | error monitoring (SDK wired; SENTRY_DSN not injected)                                          | SaaS                            | Hleb    | Medium      | Telemetry  | Tier 3  | Sentry                           | Planned                              |
| HONEY-001          | observability (otel-collector UNWIRED in CDK)                                                  | SaaS                            | Hleb    | High        | Telemetry  | Tier 2  | Honeycomb                        | Planned                              |
| SIGSTORE-001       | Sigstore Rekor + Fulcio                                                                        | public log + CA                 | Hleb    | High        | Code       | Tier 2  | Sigstore                         | Active                               |
| BREAKGLASS-001     | break-glass vault                                                                              | physical (offline dual custody) | Hleb    | Critical    | Internal   | Tier 1  | self-custody (location withheld) | Active                               |
| INCIDENT-MGR-001   | on-call paging                                                                                 | AWS Incident Manager + SNS      | Hleb    | High        | Internal   | Tier 2  | AWS                              | Planned                              |
| NTFY-001           | push notification fan-out                                                                      | self-host or public ntfy.sh     | Hleb    | Medium      | Internal   | Tier 3  | OSS / OVH VPS                    | Planned                              |
| OPENSTATUS-001     | status page + uptime monitoring (status.afframe.com)                                           | self-hosted OSS                 | Hleb    | Medium      | None       | Tier 3  | OSS / OVH VPS                    | Active                               |
| CF-WORKER-TURBO    | Turborepo Remote Cache Worker (CI only)                                                        | Cloudflare Worker               | Hleb    | Low         | None       | Tier 3  | Cloudflare                       | Active                               |
| CF-R2-TURBO        | turbo-cache-prod R2 bucket (CI artifacts, 14d TTL)                                             | Cloudflare R2 bucket            | Hleb    | Low         | None       | Tier 3  | Cloudflare                       | Active                               |
| RESEND-001         | transactional email (auth, invites, feedback)                                                  | SaaS                            | Hleb    | High        | Customer   | Tier 2  | Resend                           | Active                               |
| CF-ACCOUNT-001     | Cloudflare account (afframe.com DNS zone, Tunnel, Email Routing, Workers + R2 platform)        | network / SaaS                  | Hleb    | Critical    | Customer   | Tier 1  | Cloudflare                       | Active                               |
| CF-WORKER-BOT      | Telegram dev bot Worker (bot.afframe.com; alert choke point, holds GitHub dispatch capability) | Cloudflare Worker               | Hleb    | High        | Internal   | Tier 3  | Cloudflare                       | Active                               |
| CF-WORKER-SLEEPING | afframe-sleeping Worker ("app is asleep" page for cold-paused envs)                            | Cloudflare Worker               | Hleb    | Medium      | None       | Tier 3  | Cloudflare                       | Active                               |
| CF-R2-VAULT-BACKUP | afframe-vault-backup R2 bucket (restic Vault snapshots, 6h timer)                              | Cloudflare R2 bucket            | Hleb    | Critical    | Internal   | Tier 1  | Cloudflare                       | Active                               |
| PAYMENTS-001       | payment processor (deferred)                                                                   | SaaS                            | `<TBD>` | n/a         | n/a        | n/a     | n/a                              | Deferred until payments are in scope |
