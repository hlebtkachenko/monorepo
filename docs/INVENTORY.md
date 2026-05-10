# ICT Asset Inventory

> Maintained per DORA Article 8 ICT asset register requirement.

Source of truth for material ICT assets. Updated when an asset is added, retired, or changes data classification. Once AWS lands, AWS Config aggregator becomes the machine-readable source of truth and this file becomes the human-readable index — both must agree on every asset.

Audit trail of changes: git history of this file.

## Legend

- **Type**: cloud account / compute / data store / network / identity / SaaS.
- **Criticality**: Critical, High, Medium, Low (impact on customers and money on outage).
- **Data class**: None, Internal, Customer, Customer + Financial, Audit, Telemetry.
- **DR tier**: Tier 1 (RTO 4h, RPO 15m) / Tier 2 (RTO 24h, RPO 4h) / Tier 3 (best-effort).
- **Status**: Planned, Active, Retired.

## 1. Cloud accounts

| Asset ID | Name | Type | Owner | Criticality | Data class | DR tier | Vendor | Status |
|----------|------|------|-------|-------------|------------|---------|--------|--------|
| AWS-ACC-MGMT | Management | cloud account | Hleb | Critical | Audit | Tier 1 | AWS | `<TBD>` |
| AWS-ACC-LOG  | Log Archive | cloud account | Hleb | Critical | Audit | Tier 1 | AWS | `<TBD>` |
| AWS-ACC-AUDIT | Audit | cloud account | Hleb | High | Audit | Tier 1 | AWS | `<TBD>` |
| AWS-ACC-SHARED | Shared Services | cloud account | Hleb | High | Internal | Tier 2 | AWS | `<TBD>` |
| AWS-ACC-STG | Staging | cloud account | Hleb | Medium | Internal | Tier 3 | AWS | `<TBD>` |
| AWS-ACC-PRD | Production | cloud account | Hleb | Critical | Customer + Financial | Tier 1 | AWS | `<TBD>` |

## 2. Compute services

| Asset ID | Name | Type | Owner | Criticality | Data class | DR tier | Vendor | Status |
|----------|------|------|-------|-------------|------------|---------|--------|--------|
| ECS-WEB-PRD | web (production) | ECS Fargate service | `<TBD>` | Critical | Customer | Tier 1 | AWS | `<TBD>` |
| ECS-WEB-STG | web (staging) | ECS Fargate service | `<TBD>` | Medium | Internal | Tier 3 | AWS | `<TBD>` |
| LAMBDA-ROT-PRD | secret rotation | Lambda | `<TBD>` | High | Internal | Tier 2 | AWS | `<TBD>` |

## 3. Data stores

| Asset ID | Name | Type | Owner | Criticality | Data class | DR tier | Vendor | Status |
|----------|------|------|-------|-------------|------------|---------|--------|--------|
| RDS-PRD-OLTP | primary OLTP | RDS Postgres Multi-AZ | `<TBD>` | Critical | Customer + Financial | Tier 1 | AWS | `<TBD>` |
| RDS-STG-OLTP | staging OLTP | RDS Postgres single-AZ | `<TBD>` | Medium | Internal | Tier 3 | AWS | `<TBD>` |
| S3-AUDIT | audit log archive | S3 (Object Lock COMPLIANCE) | Hleb | Critical | Audit | Tier 1 | AWS | `<TBD>` |
| S3-ASSETS-PRD | static assets (production) | S3 | `<TBD>` | High | None | Tier 2 | AWS | `<TBD>` |
| SECRETS-PRD | runtime secrets | Secrets Manager | `<TBD>` | Critical | Customer + Financial | Tier 1 | AWS | `<TBD>` |

## 4. Networking

| Asset ID | Name | Type | Owner | Criticality | Data class | DR tier | Vendor | Status |
|----------|------|------|-------|-------------|------------|---------|--------|--------|
| VPC-PRD | production VPC | VPC | `<TBD>` | Critical | n/a | Tier 1 | AWS | `<TBD>` |
| VPC-STG | staging VPC | VPC | `<TBD>` | Medium | n/a | Tier 3 | AWS | `<TBD>` |
| TGW-SHARED | transit gateway | Transit Gateway | `<TBD>` | High | n/a | Tier 2 | AWS | `<TBD>` |
| ALB-WEB-PRD | web ALB (production) | ALB | `<TBD>` | Critical | n/a | Tier 1 | AWS | `<TBD>` |
| WAF-WEB-PRD | web WAF (production) | WAFv2 | `<TBD>` | Critical | n/a | Tier 1 | AWS | `<TBD>` |

## 5. Identity

| Asset ID | Name | Type | Owner | Criticality | Data class | DR tier | Vendor | Status |
|----------|------|------|-------|-------------|------------|---------|--------|--------|
| IDC-001 | Identity Center | identity provider | Hleb | Critical | Internal | Tier 1 | AWS | `<TBD>` |
| GW-SAML-001 | Google Workspace SAML | external IdP | Hleb | Critical | Internal | Tier 1 | Google | `<TBD>` |
| GHOID-PRD | GitHub OIDC provider (prod) | OIDC provider | Hleb | High | Internal | Tier 2 | AWS | `<TBD>` |
| GHOID-STG | GitHub OIDC provider (staging) | OIDC provider | Hleb | Medium | Internal | Tier 3 | AWS | `<TBD>` |

## 6. Third-party SaaS

| Asset ID | Name | Type | Owner | Criticality | Data class | DR tier | Vendor | Status |
|----------|------|------|-------|-------------|------------|---------|--------|--------|
| GH-REPO-001 | hlebtkachenko/monorepo | source repo | Hleb | High | Code | Tier 2 | GitHub | Active |
| GH-ACT-001 | GitHub Actions runners | CI compute | Hleb | High | Code | Tier 2 | GitHub | Active |
| GHCR-001 | GHCR container registry | container registry | Hleb | High | Code | Tier 2 | GitHub | `<TBD>` |
| SENTRY-001 | error monitoring | SaaS | Hleb | Medium | Telemetry | Tier 3 | Sentry | `<TBD>` |
| HONEY-001 | observability | SaaS | Hleb | High | Telemetry | Tier 2 | Honeycomb | `<TBD>` |
| SIGSTORE-001 | Sigstore Rekor + Fulcio | public log + CA | Hleb | High | Code | Tier 2 | Sigstore | Active |
| STRIPE-001 | payment processor (future) | SaaS | `<TBD>` | Critical | Customer + Financial | Tier 1 | Stripe | Planned |
| 1PWD-001 | break-glass vault | SaaS | Hleb | Critical | Internal | Tier 1 | 1Password | Active |
| GOOGLE-001 | Google Workspace | SaaS | Hleb | High | Internal | Tier 2 | Google | Active |
| PAGERDUTY-001 | on-call paging | SaaS | Hleb | High | Internal | Tier 2 | PagerDuty | `<TBD>` |
