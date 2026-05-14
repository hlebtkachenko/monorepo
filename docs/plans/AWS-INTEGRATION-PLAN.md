# AWS Integration Plan

> **SUPERSEDED** by ADR-0007 (MVP single-account CDK-only, 2026-05-11). The multi-account control-tower vision below is aspirational post-MVP work. Current state: single account, CDK-only, no OpenTofu. See `docs/runbooks/AWS-DEPLOY.md` and `docs/adr/0007-mvp-single-account-cdk-only.md`.

Dependencies and configuration to put this monorepo on AWS for production. Three poles: GitHub (source + CI), AWS (runtime), Mac (developer). Priorities: **Critical** (blocking before prod traffic), **High** (significant value/risk), **Medium** (real value), **Easy** (low effort).

## Priority Legend

| Priority | Meaning |
|----------|---------|
| Critical | Cannot accept real customer traffic without this. Audit blocker. |
| High | Significant security, cost, or velocity impact if missing. |
| Medium | Defer if needed but plan it. |
| Easy | Bundle into related work. |

## 1. AWS Account Architecture

### Foundation

| Item | Priority |
|------|----------|
| AWS Organizations enabled | Critical |
| AWS Control Tower (default 2026 baseline; manual landing zones now justified only for >100 account orgs) | Critical |
| OU structure: `Security`, `Infrastructure`, `Workloads` (with `Prod`/`Non-Prod` sub-OUs), `Sandbox`, `Suspended` | Critical |
| Log Archive account with CloudTrail org trail → S3 with Object Lock (Compliance mode, 7-year retention, MFA Delete) | Critical |
| Audit account (Security Hub delegated admin, Config aggregator) | Critical |
| Shared Services account (ECR, Route53 hosted zones, central CI deploy hub role) | High |
| Network account (Transit Gateway hub, central egress) | High |

### Identity Center (replaces IAM users entirely)

| Item | Priority |
|------|----------|
| Identity Center enabled with built-in identity store (no external IdP today; SAML federation deferred until external IdP is in scope) | Critical |
| Permission sets: `AdministratorAccess` (break-glass, MFA-required), `PowerUserAccess` (dev), `ReadOnlyAccess` (auditors), `BillingViewer` | Critical |
| Session duration max 4h for prod permission sets | High |
| **No IAM users for humans, ever** | Critical |

### Service Control Policies (org-level guardrails)

| Item | Priority |
|------|----------|
| Deny all regions except `eu-central-1`, `eu-west-1` (DR), `us-east-1` (CloudFront/IAM/Route53 globals) | Critical |
| Deny `iam:CreateUser`, `iam:CreateAccessKey` (force OIDC + Identity Center) | Critical |
| Deny disabling CloudTrail, Config, GuardDuty, Security Hub | Critical |
| Deny `kms:DisableKey`, `kms:ScheduleKeyDeletion` outside admin role | Critical |
| Require MFA on `Delete*` and `Stop*` in prod | Critical |
| Deny S3 buckets without encryption; deny public S3 ACLs | Critical |
| Enforce required tags: `Environment`, `Owner`, `CostCenter`, `DataClass` | High |

## 2. GitHub ↔ AWS Integration

| Item | Priority |
|------|----------|
| One IAM OIDC provider per workload account (URL `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`) | Critical |
| Trust policies scoped to `repo:hlebtkachenko/monorepo:environment:<env>` (environment-scoped, NOT branch-scoped — branch claims spoofable from PR forks) | Critical |
| One IAM role per environment per account (`gh-actions-deploy-dev`, `gh-actions-deploy-prod`) | Critical |
| `aws-actions/configure-aws-credentials@v4` in workflows | Critical |
| GitHub environments: `staging`, `production` with required reviewers, wait timer, deployment branch policy = `main` only | Critical |
| Cross-account deploy via role chaining: GitHub assumes role in deploy-hub account → `sts:AssumeRole` into target workload account | Critical |
| ECR auth via assumed OIDC role; no static creds | Critical |
| GitHub Apps for cross-repo automation; never classic PATs | High |
| Repository ruleset: signed commits required on `main` | Critical |

## 3. Networking (Per Workload Account)

| Item | Priority |
|------|----------|
| VPC across 3 AZs with public/private/isolated subnet tiers | Critical |
| Transit Gateway in Network account for prod ↔ shared-services traffic | High |
| VPC peering only for one-off pairs (default to TGW) | Medium |
| PrivateLink endpoints for S3, ECR, Secrets Manager, KMS, CloudWatch Logs (cuts NAT egress, keeps traffic on AWS backbone — fintech privacy) | Critical |
| NAT Gateway in each AZ (HA) | High |
| Security groups default-deny, least privilege | Critical |

## 4. Compute

| Item | Priority |
|------|----------|
| **ECS Fargate** as primary runtime (PCI-DSS, SOC 2, HIPAA out of box; per-task kernel isolation; Graviton default — 20% cheaper, native arm64 parity with M-series Macs) | Critical |
| Lambda for event-driven glue only (S3 events, EventBridge, scheduled jobs) | High |
| **Skip EKS** unless dedicated platform team — control plane $73/cluster/mo + CNI/addon ops burden unjustified for 5-year fintech foundation without that team | High |
| Application Load Balancer in front of Fargate, AWS WAF attached | Critical |
| Target groups, health checks, ECS service auto-scaling | High |

## 5. Data Layer

| Item | Priority |
|------|----------|
| RDS Postgres Multi-AZ, gp3, customer-managed KMS encryption | Critical |
| RDS Proxy with end-to-end IAM database authentication | Critical |
| `rds.force_ssl=1` parameter group | Critical |
| Automated backups 35 days + weekly export to S3 | Critical |
| Aurora Postgres Global Database **only** if RPO <1s cross-region required | Medium |
| DynamoDB for session state / hot lookup | Medium |
| ElastiCache **Valkey** (NOT Redis OSS — licensing) for cache | High |

## 6. Edge & DDoS

| Item | Priority |
|------|----------|
| CloudFront in front of public endpoints | Critical |
| WAF managed rule groups: Core, Known Bad Inputs, SQLi, Linux, IP Reputation, Bot Control | Critical |
| Geo-restriction on sensitive endpoints | High |
| Shield Standard (free, sufficient at launch) | Critical |
| Shield Advanced ($3,000/mo, 1-year commit) only after first DDoS or before public B2C launch — includes WAF up to 1,500 WCU + DDoS cost-protection refunds | Medium |

## 7. Secrets & Encryption

| Item | Priority |
|------|----------|
| AWS Secrets Manager for all runtime creds | Critical |
| Rotation Lambdas with 90-day max cadence | Critical |
| Customer-managed KMS keys per data domain (DB, app, logs) — automatic rotation enabled | Critical |
| KMS key tags for ABAC | High |
| SSM Parameter Store (SecureString) for non-rotated config | High |

## 8. Compliance Baseline (Day 1)

| Item | Priority |
|------|----------|
| Security Hub: CIS, PCI-DSS, AWS Foundational Security Best Practices standards | Critical |
| GuardDuty with EKS/RDS/Lambda protection plans + S3 malware scanning | Critical |
| Config with PCI + NIST 800-53 conformance packs | Critical |
| Inspector (ECR + Lambda CVE scanning) | Critical |
| Macie on S3 buckets containing user data | High |
| Audit Manager with SOC 2 + PCI-DSS + GDPR frameworks (auto-pulls evidence; saves ~80% audit prep) | Critical |
| AWS Backup: cross-region copy `eu-central-1` → `eu-west-1`, vault lock Compliance mode | Critical |

## 9. EU Fintech Regulatory

| Item | Priority |
|------|----------|
| **DORA** (in force Jan 2025): full ICT asset inventory via Config; MFA on all human access; encryption at rest + TLS 1.3 in transit; KMS rotation; secrets only in Secrets Manager | Critical |
| DORA incident reporting automation: GuardDuty → EventBridge → Incident Manager (4h initial, 72h interim, 1-month final) | Critical |
| DORA TLPT (resilience testing) annually, documented in Audit Manager | High |
| Designate NIS2 entity status with Czech NÚKIB | Critical |
| **PCI-DSS scope minimization** (deferred — no payments yet): when payments enter scope, tokenize at the browser so cardholder data never touches your VPC. Aim for SAQ A. AWS Payment Cryptography only if you must touch PAN | Deferred |
| **GDPR**: SCP-deny non-EU regions; backups EU↔EU; CloudFront geo-restriction on sensitive endpoints | Critical |
| **EU CRA** (Dec 2027): SBOM generation, vulnerability disclosure policy, 5-year support commitment | High |

## 10. Mac Developer Environment

| Item | Priority |
|------|----------|
| AWS CLI v2 with `aws configure sso` per account | Critical |
| **Granted (granted.dev)** for credential management — first-class Identity Center support, profile registry, Firefox container per account | High |
| Docker Desktop as container runtime (per ADR 0005). OrbStack and Colima documented as alternatives if RAM pressure forces a swap | High |
| `docker buildx build --platform linux/amd64,linux/arm64` for ECR images (Fargate now Graviton default) | Critical |
| Devcontainers (`.devcontainer/devcontainer.json`) with Linux base image for CI parity | High |
| LocalStack Pro ($39/mo per dev) for 90% of dev/CI feedback loops; sandbox AWS account for IAM/TLS/edge validation | Medium |
| Per-developer sandbox AWS account with $20/mo budget cap + sandbox OU SCPs | High |
| `mise` (or `asdf`) pinning Node, pnpm, Python, Terraform/OpenTofu versions in repo | High |
| `act` for local GitHub Actions runs | Easy |

## 11. Infrastructure as Code

> **Open decision** between platform-layer (accounts, VPC, IAM) IaC tool — see CICD-PLAN.md "Open Decisions". Recommended: **hybrid** — OpenTofu for platform layer (vendor-neutral, auditor-friendly), CDK for application stacks (TypeScript ergonomics, monorepo-native).

| Item | Priority |
|------|----------|
| CDK bootstrap with cross-account trust per workload account | Critical |
| OpenTofu state in S3 + DynamoDB lock per management account (if hybrid chosen) | Critical |
| Stack architecture: stage-per-environment, service-per-stack inside (`NetworkStack`, `DataStack`, `AppStack`, `ObservabilityStack`) | High |
| Cross-stack refs via SSM Parameter Store (NOT CloudFormation exports — exports lock you) | High |
| Drift detection: scheduled `cdk drift` via GitHub Actions cron, alert to Slack | High |
| **GitHub Actions for IaC deploy, NOT CDK Pipelines** — CDK Pipelines uses CodePipeline (extra surface, drifts from GitHub-native review flow) | High |

## 12. Observability

| Item | Priority |
|------|----------|
| CloudWatch baseline (logs, metrics, alarms) | Critical |
| X-Ray tracing | High |
| Honeycomb (trace-first, cheaper) **OR** Datadog (APM+RUM+logs all-in-one — pick by need not by hype) | High |
| CloudWatch Logs → Log Archive S3 with Object Lock | Critical |
| Sentry for app error tracking + release markers | High |
| OpenTelemetry SDK in services for portable instrumentation | High |
| Build metadata baked into image labels, exposed at `/version` | Easy |
| DORA metrics dashboard: lead time, change failure rate, MTTR, deploy frequency | High |

## 13. Backup & DR

| Item | Priority |
|------|----------|
| AWS Backup with cross-region copy + vault lock (Compliance mode) | Critical |
| **DR strategy: pilot-light** (RTO 4h, RPO <15min) — backup-restore is too slow for DORA, hot-standby is 2× cost overkill at MVP | Critical |
| Minimal RDS read replica + IaC ready in `eu-west-1` | Critical |
| Quarterly automated DR restore drill (workflow restores to clean account, validates app boots + data intact) | Critical |
| Upgrade to warm-standby after Series A or first regulatory ask | Medium |

## 14. Cost Management

| Item | Priority |
|------|----------|
| AWS Budgets per account: monthly cost, RI utilization, anomaly | Critical |
| Master budget at org level | Critical |
| Cost Anomaly Detection → EventBridge → Slack | High |
| Cost Allocation Tags activated; mandatory tags enforced via SCP | Critical |
| Cost Explorer with daily granularity | High |
| CUR (Cost and Usage Report) v2 to S3 → Athena/QuickSight for deep analysis | Medium |
| Compute Savings Plans (1-year, no upfront) at ~70% of stable baseline — defer to year 2 | Medium |

## 15. Day-2 Operations

| Item | Priority |
|------|----------|
| SSM Incident Manager response plans tied to CloudWatch alarms | Critical |
| Runbooks in SSM Automation, linked from each alarm description | Critical |
| AWS Incident Manager + SNS topic -> email + ntfy.sh (OSS push). Paid pager (PagerDuty / OpsGenie / Grafana OnCall) deferred until headcount >= 2 demands rotation logic Incident Manager does not provide | High |
| Pager rules: SEV1 <5min ack, SEV2 <15min | Critical |
| SSM Change Manager for prod changes outside IaC (rare emergencies) | High |
| Status page (Statuspage.io or Atlassian) | Medium |
| Game-day / chaos test cadence — quarterly minimum (DORA expects documented resilience tests) | High |

## 16. Vendor Risk Register

Third parties become part of your audit boundary. Track these from day 1:

| Vendor | What it processes | Priority |
|--------|-------------------|----------|
| GitHub | Source code, CI execution | Critical |
| AWS | All runtime + customer data | Critical |
| Sentry | Error data (potentially PII in stack traces) | High |
| Datadog/Honeycomb | Telemetry (sample rates, scrubbing) | High |
| Codecov | Source code (coverage upload) | High |
| Payment processor (deferred) | Cardholder data when payments enter scope | Critical when in scope |
| LocalStack | Dev only (no prod data) | Medium |

Each must have: DPA signed, data residency confirmed (EU), SOC 2 report on file, incident notification clause.

## Foundation Order (Critical Path)

These items have hard ordering — do not parallelize across the boundary:

1. AWS Organization
2. Control Tower
3. OU structure
4. SCPs (region, MFA, encryption guardrails)
5. Identity Center built-in identity store (no external IdP)
6. Log Archive bucket with Object Lock + CloudTrail org trail
7. GitHub OIDC providers per workload account
8. CDK / OpenTofu bootstrap with cross-account trust
9. Security Hub, GuardDuty, Config, Inspector enabled org-wide
10. NetworkStack (VPC + Transit Gateway)
11. KMS CMKs + Secrets Manager
12. RDS + ECS Fargate
13. CloudFront + WAF
14. AWS Backup + cross-region copy
15. Audit Manager (SOC 2, PCI, GDPR frameworks)
16. Budgets + Cost Anomaly Detection
17. AWS Incident Manager response plan + SNS notifications (email + ntfy.sh)
18. DR drill → only then production launch

After step 6 (Log Archive), most subsequent items can parallelize.

## Order-of-Magnitude Cost (MVP, 4 accounts, 1 region)

| Category | Monthly |
|----------|---------|
| Security services (Security Hub, GuardDuty, Config, Inspector, Macie) | ~$300 |
| RDS Multi-AZ baseline | ~$400 |
| Fargate baseline | ~$200 |
| NAT Gateway + PrivateLink endpoints | ~$300 |
| Observability (CloudWatch + Datadog/Honeycomb) | ~$500 |
| Third-party tooling (Sentry; OSS push via ntfy.sh; standard Docker on Mac) | ~$50 |
| Control Tower + Identity Center | free |
| **Estimated MVP total** | **~$2,500–4,000** |
| Shield Advanced (deferred until B2C/post-DDoS) | +$3,000 |

## Things to NOT Do

- **No IAM users for humans, ever.** Identity Center only.
- **No long-lived AWS keys in GitHub Secrets.** OIDC only.
- **No branch-scoped OIDC trust policy.** Environment-scoped only (branch claims are spoofable from PR forks).
- **No EKS** unless dedicated platform team exists.
- **No CDK Pipelines.** Use GitHub Actions for IaC deploys.
- **No real customer data in preview environments.** Synthetic data only.
- **No CloudFormation exports for cross-stack refs.** SSM Parameter Store.
- **No Redis OSS** — Valkey instead (licensing).
- **No NAT egress for AWS-internal traffic.** PrivateLink endpoints.
- **No deferring Audit Manager** — evidence collection cannot be backfilled.
- **No deferring KMS CMKs** — converting from AWS-managed to customer-managed keys later is painful.

## Cross-Reference

CI/CD pipeline plan: see `docs/plans/CICD-PLAN.md`. The two plans share OIDC, environments, deploy targets, observability, and supply chain sections. AWS plan owns infrastructure; CI/CD plan owns the pipeline that talks to it.
