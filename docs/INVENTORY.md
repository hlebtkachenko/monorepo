# ICT Asset Inventory

> Maintained per DORA Article 8 ICT asset register requirement.

Source of truth for material ICT assets. Updated when an asset is added, retired, or changes data classification. AWS is connected; as the AWS Config aggregator is wired up it becomes the machine-readable source of truth and this file the human-readable index — both must agree on every asset.

Audit trail of changes: git history of this file.

## Legend

- **Type**: cloud account / compute / data store / network / identity / SaaS.
- **Criticality**: Critical, High, Medium, Low (impact on customers and money on outage).
- **Data class**: None, Internal, Customer, Customer + Financial, Audit, Telemetry.
- **DR tier**: Tier 1 (RTO 4h, RPO 15m) / Tier 2 (RTO 24h, RPO 4h) / Tier 3 (best-effort).
- **Status**: Planned, Active, Retired.

## 1. Cloud accounts

| Asset ID       | Name            | Type          | Owner | Criticality | Data class           | DR tier | Vendor | Status  |
| -------------- | --------------- | ------------- | ----- | ----------- | -------------------- | ------- | ------ | ------- |
| AWS-ACC-MGMT   | Management      | cloud account | Hleb  | Critical    | Audit                | Tier 1  | AWS    | `<TBD>` |
| AWS-ACC-LOG    | Log Archive     | cloud account | Hleb  | Critical    | Audit                | Tier 1  | AWS    | `<TBD>` |
| AWS-ACC-AUDIT  | Audit           | cloud account | Hleb  | High        | Audit                | Tier 1  | AWS    | `<TBD>` |
| AWS-ACC-SHARED | Shared Services | cloud account | Hleb  | High        | Internal             | Tier 2  | AWS    | `<TBD>` |
| AWS-ACC-STG    | Staging         | cloud account | Hleb  | Medium      | Internal             | Tier 3  | AWS    | `<TBD>` |
| AWS-ACC-PRD    | Production      | cloud account | Hleb  | Critical    | Customer + Financial | Tier 1  | AWS    | `<TBD>` |

## 2. Compute services

| Asset ID          | Name                                       | Type                  | Owner   | Criticality | Data class           | DR tier | Vendor | Status  |
| ----------------- | ------------------------------------------ | --------------------- | ------- | ----------- | -------------------- | ------- | ------ | ------- |
| ECS-WEB-PRD       | web (production)                           | ECS Fargate service   | `<TBD>` | Critical    | Customer             | Tier 1  | AWS    | `<TBD>` |
| ECS-WEB-STG       | web (staging)                              | ECS Fargate service   | `<TBD>` | Medium      | Internal             | Tier 3  | AWS    | `<TBD>` |
| ECS-API-PRD       | api (production)                           | ECS Fargate container | `<TBD>` | Critical    | Customer + Financial | Tier 1  | AWS    | `<TBD>` |
| ECS-API-STG       | api (staging)                              | ECS Fargate container | `<TBD>` | Medium      | Internal             | Tier 3  | AWS    | `<TBD>` |
| ECS-ADMIN-PRD     | admin (production)                         | ECS Fargate container | `<TBD>` | High        | Internal             | Tier 1  | AWS    | `<TBD>` |
| ECS-ADMIN-STG     | admin (staging)                            | ECS Fargate container | `<TBD>` | Medium      | Internal             | Tier 3  | AWS    | `<TBD>` |
| LAMBDA-ROT-PRD    | secret rotation                            | Lambda                | `<TBD>` | High        | Internal             | Tier 2  | AWS    | `<TBD>` |
| LAMBDA-KILLSWITCH | cost kill-switch (SecurityStack)           | Lambda                | Hleb    | High        | Internal             | Tier 2  | AWS    | `<TBD>` |
| LAMBDA-RDSWATCH   | RDS auto-restart watcher (SecurityStack)   | Lambda                | Hleb    | Medium      | Internal             | Tier 3  | AWS    | `<TBD>` |
| ECS-PGBOUNCER-SC  | pgBouncer sidecar (api task)               | ECS Fargate container | Hleb    | High        | Customer + Financial | Tier 1  | AWS    | `<TBD>` |
| ECS-CERBOS-SC     | Cerbos PDP sidecar (api task, L3 authz)    | ECS Fargate container | Hleb    | High        | Internal             | Tier 1  | AWS    | `<TBD>` |
| ECS-OPENFGA-SC    | OpenFGA sidecar (api task, L2 authz)       | ECS Fargate container | Hleb    | High        | Customer             | Tier 1  | AWS    | `<TBD>` |
| ECS-BACKUP-TASK   | nightly backup scheduled task              | ECS Fargate Spot      | Hleb    | High        | Customer + Financial | Tier 1  | AWS    | `<TBD>` |
| OVH-VPS-001       | OVH VPS (Windows Server 2025, WSL2 Docker) | compute / VPS         | Hleb    | Medium      | Internal             | Tier 3  | OVH    | Active  |

## 3. Data stores

| Asset ID           | Name                                        | Type                                             | Owner   | Criticality | Data class           | DR tier | Vendor | Status  |
| ------------------ | ------------------------------------------- | ------------------------------------------------ | ------- | ----------- | -------------------- | ------- | ------ | ------- |
| RDS-PRD-OLTP       | primary OLTP                                | RDS Postgres Multi-AZ                            | `<TBD>` | Critical    | Customer + Financial | Tier 1  | AWS    | `<TBD>` |
| RDS-STG-OLTP       | staging OLTP                                | RDS Postgres single-AZ                           | `<TBD>` | Medium      | Internal             | Tier 3  | AWS    | `<TBD>` |
| S3-AUDIT           | audit log archive                           | S3 (Object Lock COMPLIANCE)                      | Hleb    | Critical    | Audit                | Tier 1  | AWS    | `<TBD>` |
| S3-CT-AUDIT        | CloudTrail management-events archive        | S3                                               | Hleb    | High        | Audit                | Tier 2  | AWS    | `<TBD>` |
| S3-ASSETS-PRD      | static assets (production)                  | S3                                               | `<TBD>` | High        | None                 | Tier 2  | AWS    | `<TBD>` |
| SECRETS-PRD        | runtime secrets                             | Secrets Manager                                  | `<TBD>` | Critical    | Customer + Financial | Tier 1  | AWS    | `<TBD>` |
| CT-MGMT            | CloudTrail management-events trail          | CloudTrail                                       | Hleb    | High        | Audit                | Tier 2  | AWS    | `<TBD>` |
| BUDGETS-COST       | 5 AWS Budgets (cost-runaway protection)     | AWS Budgets                                      | Hleb    | High        | Internal             | Tier 2  | AWS    | `<TBD>` |
| SSM-OPENFGA-IDS    | OpenFGA store-id + model-id (L2 authz)      | SSM Parameter Store                              | Hleb    | High        | Internal             | Tier 1  | AWS    | `<TBD>` |
| S3-BACKUPS         | encrypted nightly backups (BackupStack)     | S3 (versioned, IA/Glacier/DeepArchive lifecycle) | Hleb    | Critical    | Customer + Financial | Tier 1  | AWS    | `<TBD>` |
| RDS-OPENFGA-SCHEMA | openfga schema in primary RDS (ReBAC graph) | RDS Postgres schema                              | Hleb    | High        | Customer             | Tier 1  | AWS    | `<TBD>` |

## 4. Networking

| Asset ID    | Name                 | Type            | Owner   | Criticality | Data class | DR tier | Vendor | Status  |
| ----------- | -------------------- | --------------- | ------- | ----------- | ---------- | ------- | ------ | ------- |
| VPC-PRD     | production VPC       | VPC             | `<TBD>` | Critical    | n/a        | Tier 1  | AWS    | `<TBD>` |
| VPC-STG     | staging VPC          | VPC             | `<TBD>` | Medium      | n/a        | Tier 3  | AWS    | `<TBD>` |
| TGW-SHARED  | transit gateway      | Transit Gateway | `<TBD>` | High        | n/a        | Tier 2  | AWS    | `<TBD>` |
| ALB-WEB-PRD | web ALB (production) | ALB             | `<TBD>` | Critical    | n/a        | Tier 1  | AWS    | `<TBD>` |
| WAF-WEB-PRD | web WAF (production) | WAFv2           | `<TBD>` | Critical    | n/a        | Tier 1  | AWS    | `<TBD>` |

## 5. Identity

| Asset ID  | Name                                 | Type              | Owner | Criticality | Data class | DR tier | Vendor | Status  |
| --------- | ------------------------------------ | ----------------- | ----- | ----------- | ---------- | ------- | ------ | ------- |
| IDC-001   | Identity Center (built-in directory) | identity provider | Hleb  | Critical    | Internal   | Tier 1  | AWS    | `<TBD>` |
| GHOID-PRD | GitHub OIDC provider (prod)          | OIDC provider     | Hleb  | High        | Internal   | Tier 2  | AWS    | `<TBD>` |
| GHOID-STG | GitHub OIDC provider (staging)       | OIDC provider     | Hleb  | Medium      | Internal   | Tier 3  | AWS    | `<TBD>` |

## 6. Third-party SaaS

| Asset ID         | Name                                                                                         | Type                        | Owner   | Criticality | Data class | DR tier | Vendor        | Status                               |
| ---------------- | -------------------------------------------------------------------------------------------- | --------------------------- | ------- | ----------- | ---------- | ------- | ------------- | ------------------------------------ |
| GH-REPO-001      | hlebtkachenko/monorepo                                                                       | source repo                 | Hleb    | High        | Code       | Tier 2  | GitHub        | Active                               |
| GH-ACT-001       | GitHub Actions runners                                                                       | CI compute                  | Hleb    | High        | Code       | Tier 2  | GitHub        | Active                               |
| GHCR-001         | GHCR container registry                                                                      | container registry          | Hleb    | High        | Code       | Tier 2  | GitHub        | `<TBD>`                              |
| SENTRY-001       | error monitoring                                                                             | SaaS                        | Hleb    | Medium      | Telemetry  | Tier 3  | Sentry        | `<TBD>`                              |
| HONEY-001        | observability                                                                                | SaaS                        | Hleb    | High        | Telemetry  | Tier 2  | Honeycomb     | `<TBD>`                              |
| SIGSTORE-001     | Sigstore Rekor + Fulcio                                                                      | public log + CA             | Hleb    | High        | Code       | Tier 2  | Sigstore      | Active                               |
| 1PWD-001         | break-glass vault                                                                            | SaaS                        | Hleb    | Critical    | Internal   | Tier 1  | 1Password     | Active                               |
| INCIDENT-MGR-001 | on-call paging                                                                               | AWS Incident Manager + SNS  | Hleb    | High        | Internal   | Tier 2  | AWS           | `<TBD>`                              |
| NTFY-001         | push notification fan-out                                                                    | self-host or public ntfy.sh | Hleb    | Medium      | Internal   | Tier 3  | OSS / OVH VPS | `<TBD>`                              |
| OPENSTATUS-001   | status page + uptime monitoring (status.afframe.com)                                         | self-hosted OSS             | Hleb    | Medium      | None       | Tier 3  | OSS / OVH VPS | Planned                              |
| CF-WORKER-TURBO  | Turborepo Remote Cache Worker, served at `cache.afframe.com` (CI only)                       | Cloudflare Worker           | Hleb    | Low         | None       | Tier 3  | Cloudflare    | Active                               |
| CF-R2-TURBO      | turbo-cache-prod R2 bucket (CI artifacts, 14d TTL)                                           | Cloudflare R2 bucket        | Hleb    | Low         | None       | Tier 3  | Cloudflare    | Active                               |
| CF-DNS-CACHE     | `cache.afframe.com` CNAME → CF-WORKER-TURBO (auto-managed by wrangler `custom_domain: true`) | Cloudflare DNS record       | Hleb    | Low         | None       | Tier 3  | Cloudflare    | Active                               |
| PAYMENTS-001     | payment processor (deferred)                                                                 | SaaS                        | `<TBD>` | n/a         | n/a        | n/a     | n/a           | Deferred until payments are in scope |
