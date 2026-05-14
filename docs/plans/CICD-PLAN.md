# CI/CD Execution Plan

> **SUPERSEDED** by ADR-0007 (MVP single-account CDK-only, 2026-05-11). The OpenTofu state-bucket + DDB-lock design below is no longer current. Current CI/CD state: see `.github/workflows/_deploy-aws.yml` and `docs/runbooks/AWS-DEPLOY.md`.

Foundation for a financial SaaS monorepo. GitHub Actions + AWS + Mac dev parity. No time-based deadlines. Priorities: **Critical** (blocking, security/compliance), **High** (significant value or risk), **Medium** (real value), **Easy** (low effort, often missed).

## Priority Legend

| Priority | Meaning |
|----------|---------|
| Critical | Cannot ship to prod / handle real customer data / pass an audit without this. |
| High | Will slow team velocity, weaken security posture, or fail review if missing. |
| Medium | Real value, defer if needed but plan it. |
| Easy | Low effort, high signal. Bundle into other work. |

## Architecture Principles (Non-Negotiable)

| Principle | Priority |
|-----------|----------|
| OIDC for AWS auth, no long-lived AWS keys in GitHub Secrets | Critical |
| Branch protection + required reviewers + signed commits before opening repo to team | Critical |
| Immutable artifacts: build once in CI, promote same artifact across environments | Critical |
| Deterministic builds: lockfile-pinned everything, same inputs produce same attested output | High |
| Default-deny `permissions: {}` on every workflow at org level | Critical |
| Concurrency cancellation on PR workflows | Easy |
| Audit trail forever: signed commits, signed tags, immutable commit history | Critical |

> **Note on "reproducible builds":** bit-identical reproducibility is brutal in Node/TS land. Target *deterministic* builds (lockfile-pinned, attested) rather than Bazel-grade reproducibility.

## Pipeline Shape

PR → static checks (parallel) → security gates (parallel) → tests (parallel by package) → build artifacts → preview deploy with synthetic data.
Merge to main → staging deploy (auto) → manual approval → production canary → progressive rollout.

## Static Checks

| Item | Priority |
|------|----------|
| Format check (prettier --check) | Easy |
| Lint (ESLint flat config) | Easy |
| Typecheck (tsc) | Easy |
| Commitlint enforcing conventional commits | Easy |
| `actionlint` + `zizmor` as PR gate (catches workflow vulns: script injection, untrusted input) | High |

## Security Gates

| Item | Priority |
|------|----------|
| Secret scanning (gitleaks) | Critical |
| SAST (CodeQL on JS/TS) | Critical |
| Dependency CVE scan (osv-scanner or Renovate `osvVulnerabilityAlerts`) | Critical |
| Container CVE scan (Trivy) | Critical |
| License allowlist enforcement (block GPL/AGPL transitive deps) | High |
| `actions/dependency-review-action` blocks malicious deps in PRs | High |
| `harden-runner` (StepSecurity) in audit mode → enforce later | High |
| GitHub native egress firewall (when GA) | Medium |
| Workflow dependency lockfile (when GitHub ships it 2026) | Medium |
| SHA-pin third-party actions, automated digest updates via Renovate | High |

## Tests

| Item | Priority |
|------|----------|
| Unit tests (vitest) per package | Critical |
| Integration tests with testcontainers (real Postgres, real Redis) | Critical |
| Risk-weighted coverage: 95% on money/ledger code, 70% on UI shells (NOT flat 80%) | High |
| Mutation testing (Stryker) on hot paths, **nightly on main**, gate releases not PRs | High |
| Contract tests: schema-first OpenAPI/Zod with generated clients (NOT Pact unless external consumers) | High |
| Tenant data boundary fuzz tests (RLS isolation) — generated tenant tries to read another's rows | Critical |
| Property-based tests (fast-check) on all money math | Critical |
| Visual regression: Storybook test-runner + Playwright (NOT Chromatic at PR scale; Chromatic only for design-system PRs) | Medium |
| A11y (axe-core) on every PR | Medium |
| Bundle size budget (size-limit) | Medium |
| Lighthouse CI performance budget | Medium |
| DB migration safety (squawk + pgroll, expand-contract enforced, dual-write window ≥1 release) | Critical |
| k6 load test in nightly | Medium |

> **Coverage policy:** flat-percentage coverage gates are theatre. Risk-weighted by directory, mutation-score floor on hot paths.

## Build & Artifacts

| Item | Priority |
|------|----------|
| Turbo remote cache (S3-backed) | High |
| Multi-arch container builds (linux/amd64 + linux/arm64 via buildx) | Critical |
| ECR push via OIDC-assumed role | Critical |
| SBOM generation (syft, CycloneDX format) per artifact | Critical |
| Cosign signing of every container image | Critical |
| Sigstore Rekor transparency log entry | Critical |
| SLSA build provenance attestation via `actions/attest-build-provenance` (L2 baseline; L3 only for release artifacts via SLSA generator reusable workflows) | Critical |
| SBOM + provenance attached as ECR/OCI attestations, NOT loose files | High |
| SBOM diff gate: reject PRs introducing new GPL/AGPL or new high-CVE deps | High |

> **SLSA L3 nuance:** L3 requires hosted hermetic builder. Don't claim L3 across the board — claim L3 *for release artifacts* via SLSA generator, L2 for everything else.

## Preview Environments

| Item | Priority |
|------|----------|
| Ephemeral env per PR (CDK app stack with PR-scoped suffix) | High |
| **Synthetic data only — no real customer data ever in preview** (GDPR Article 32) | Critical |
| Ephemeral DB schemas (pgroll branches or per-PR schema) | Critical |
| Auto-teardown on PR close + max 7-day TTL | High |
| Smoke tests + Lighthouse + a11y after deploy | Medium |
| Preview env URL posted as PR comment | Easy |

## Deployment

| Item | Priority |
|------|----------|
| GitHub environments: `staging`, `production` with required reviewers (2 for prod), wait timer 5 min, deployment branch policy = `main` only | Critical |
| Cosign signature **verification at deploy** (Kyverno/OPA admission control if EKS, or pre-deploy verify step for ECS) | Critical |
| Blue/green via ECS or App Runner | High |
| Progressive canary rollout (5% → 25% → 100%) with auto-rollback on SLO breach | High |
| Feature flags (AWS AppConfig or Unleash self-hosted) as **rollback primitive**, not deploy itself | Critical |
| CI must produce flag manifest as artifact | High |
| Manual prod approval gate per GitHub environment | Critical |

> **Single deploy target:** pick ECS Fargate **or** EKS, not both. Lambda for event-glue only. Three runtimes triples IAM surface, observability cost, and incident playbooks.

## Secrets Management

| Item | Priority |
|------|----------|
| GitHub Secrets: only AWS account IDs + role ARNs (non-sensitive) | Critical |
| AWS Secrets Manager for runtime creds with rotation Lambdas (90 days max) | Critical |
| Customer-managed KMS keys per data domain (DB, app, logs) | Critical |
| SSM Parameter Store SecureString for non-rotated config | High |
| Define rotation cadence per secret type as policy doc in repo | High |
| Never: long-lived AWS access keys, classic PATs, dotenv in repo | Critical |

## Release Engineering

| Item | Priority |
|------|----------|
| Changesets for monorepo versioning + changelog | High |
| Tag-triggered prod deploys (push `v*` tag → workflow with approval) | High |
| Release artifact = signed image + SBOM + provenance bundle | Critical |
| Release notes auto-generated from changesets | Easy |

## Supply Chain Security

| Item | Priority |
|------|----------|
| Branch protection requires GPG/SSH signed commits | Critical |
| Cosign signing of all container images | Critical |
| SBOM generation (syft) per build | Critical |
| Provenance attestation (SLSA L3 for release artifacts, L2 baseline) | Critical |
| Verification at deploy time via Kyverno/OPA or pre-deploy step | Critical |
| `actions/dependency-review-action` blocks risky deps in PRs | High |
| Vendor risk register: Codecov, Chromatic, Sentry, Datadog tracked as third parties in audit boundary | High |
| `gh-aw` ban list: AI-driven workflow steps cannot touch `secrets.*` or production environments | High |

## Observability Hooks (CI side)

| Item | Priority |
|------|----------|
| Sentry release tracking on every prod deploy | High |
| Datadog/Honeycomb deploy markers | High |
| Build metadata baked into image labels + exposed at `/version` | Easy |
| OpenTelemetry traces from CI itself (find slow steps) | Medium |
| DORA metrics: lead time, change failure rate, MTTR, deploy frequency tracked per pipeline | High |

> **Pipeline SLO:** tune coverage and mutation thresholds against measured CFR, not gut feel.

## Cost Controls

| Item | Priority |
|------|----------|
| Concurrency cancellation on PR workflows | Easy |
| Path filters: skip web tests if only docs changed | Easy |
| Turbo remote cache (biggest single speedup) | High |
| Larger runners selectively for slow steps (4× vCPU often <2× cost for 4× speed) | Medium |
| Self-hosted runners only for **private repos** with >50 engineers (otherwise loses money on ops time + security surface) | Medium |
| **NEVER** self-hosted runner on public repo (untrusted PR code execution = compromise) | Critical |

## Compliance Hooks

| Item | Priority |
|------|----------|
| S3 audit log with Object Lock (Compliance mode, 7-year retention for fintech) | Critical |
| Required PR template fields: data sensitivity, breaking change, blast radius, rollback plan | High |
| CODEOWNERS per sensitive path (`/payments/`, `/auth/`, `/migrations/`, `/ledger/`) | Critical |
| Quarterly access review workflow (auto-export IAM/GitHub access → reviewer signs off) | High |
| Evidence collection workflow (nightly export of audit data for compliance team) | High |
| DR restore drill: quarterly automated restore-to-clean-account test as a workflow | Critical |

## Operational/Runtime Gaps (Often Missed)

| Item | Priority |
|------|----------|
| On-call rotation defined and integrated with AWS Incident Manager + SNS (email + ntfy.sh push). Paid pager deferred until headcount >= 2. | Critical |
| Runbooks per alert, linked from CloudWatch alarm description | Critical |
| Production access model: SSO + session recording + Verified Access for human prod access | Critical |
| Change advisory: PRs feeding prod must include risk classification | High |
| Post-incident review tied to CI changes — pipeline change that broke prod auto-spawns postmortem doc | High |
| Chaos / game-day cadence quarterly (regulators increasingly expect documented resilience tests) | High |
| Error-budget policy that gates deploys when budget burned (otherwise SLOs are vibes) | High |
| Status page on Statuspage.io or similar | Medium |

## GitHub Actions Patterns

| Item | Priority |
|------|----------|
| Reusable workflows under `.github/workflows/_*.yml` (setup, build-docker, deploy-aws) | High |
| Composite actions for repeated step blocks (5+ uses → composite) | Medium |
| Concurrency groups with PR cancellation | Easy |
| Matrix builds (Node 22 + 24 LTS, amd64 + arm64) | Medium |
| GitHub-native ARM runners (no longer need self-hosted Graviton for ARM) | Medium |
| Custom deployment protection rules for prod | High |

## Tools (Opinionated)

| Need | Pick | Priority |
|------|------|----------|
| IaC platform layer (accounts, VPC, IAM, data) | **Decision pending** — see Open Decisions below | Critical |
| IaC application stacks | AWS CDK (TypeScript, fits monorepo) | Critical |
| Container scan | Trivy | Critical |
| SAST | CodeQL | Critical |
| Secrets scan | gitleaks | Critical |
| Dep updates + CVE | Renovate (better policy controls than Dependabot for fintech) | High |
| SBOM | syft + grype | Critical |
| Image sign | cosign + Rekor | Critical |
| Coverage | codecov | Medium |
| Feature flags | AWS AppConfig (or Unleash self-hosted) | Critical |
| Workflow lint | actionlint + zizmor | High |
| Runner hardening | StepSecurity harden-runner | High |
| Release | changesets | High |
| Mutation | Stryker (nightly only) | High |

## Open Decisions

These are real architectural decisions that need a call before execution. Both sides have merit.

### IaC platform layer: CDK vs OpenTofu

| Argument for CDK | Argument for OpenTofu |
|------------------|----------------------|
| TypeScript native, shares types with monorepo | Vendor-neutral, every auditor knows HCL |
| L2/L3 constructs eliminate boilerplate | State portability, no CloudFormation lock-in |
| Native drift detection (`cdk drift`) | Larger ecosystem of providers (PagerDuty, Datadog, GitHub) |
| Single tooling chain | Stable provider API, less churn than CDK constructs |

**Recommended call:** **hybrid.** OpenTofu for accounts/Org/VPC/IAM/data layer (auditor-friendly, vendor-neutral). CDK for application stacks inside an environment (TypeScript ergonomics). State for Tofu in S3 + DynamoDB lock per management account.

### Coverage policy

Pick risk-weighted, not flat. Document the directory→percent mapping in repo.

### Self-hosted runners

Default: **no** — GitHub-hosted ARM runners are now competitive at <50 engineers. Revisit only if private-repo minutes overage becomes a concrete monthly problem.

## Sequencing Dependencies (Things That Block Other Things)

These are not deadlines, but ORDER constraints that hold regardless of when work is scheduled:

1. **OIDC + multi-account IAM** must land before any CI deploys.
2. **Branch protection + CODEOWNERS + signed commits** before opening repo to team.
3. **SBOM generation** must precede signing (signatures attest SBOMs; reverse order produces orphan signatures).
4. **Migration tooling (squawk + pgroll)** before any preview environment (PRs corrupt schema otherwise; ephemeral DBs become unrecoverable).
5. **Observability deploy markers** before progressive delivery (canary without per-version error budgets is theatre).
6. **Secrets rotation tooling** before prod deploy (ship to prod with un-rotatable creds → never retrofitted cleanly).
7. **DORA metrics collection** before tuning quality gate thresholds.
8. **Audit log + Object Lock S3** before any prod data lands (audit baseline cannot be retrofitted to past events).

## What NOT to Build (Avoid Over-Engineering)

- **Pact** unless you have external consumers. For internal services in one repo, schema-first + generated clients break at compile time.
- **Bit-identical reproducible builds.** Aim for deterministic.
- **EKS + ECS + Lambda all together.** Pick ECS Fargate (recommended for fintech) OR EKS.
- **Chromatic on every PR** at >500 PR/month. Use self-hosted visual regression.
- **Mutation testing on every PR.** Nightly on main, gate releases.
- **Self-hosted runners on public repo.** Hard no.
- **Dependabot AND Renovate together.** Pick one (Renovate has stronger fintech policy controls).
- **Three deploy targets** (ECS + EKS + Lambda). Two max. Lambda for glue only.
