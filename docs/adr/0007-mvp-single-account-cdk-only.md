# 7. MVP single-account: CDK-only, archive OpenTofu platform layer

- Status: Accepted
- Date: 2026-05-11
- Deciders: Hleb Tkachenko
- Supersedes: [0001](0001-iac-platform-hybrid-tofu-cdk.md)

## Context and Problem Statement

ADR 0001 picked a hybrid OpenTofu + AWS CDK model premised on a multi-account AWS Organizations layout (management + log-archive + audit + workload accounts). Phase B planning revealed the multi-account scaffold is over-engineered for MVP scope: one existing AWS account, single engineer, no current SOC 2 / DORA audit clause, no paying customers.

A senior AWS advisor review (`.context/attachments/AWS-PLATFORM-OVERVIEW.md`, `aws-products-review.md`, `aws-tco-decisions.md`) confirmed single-account + tag-based env separation is the AWS-recommended pattern at this scale, and that the OpenTofu platform layer adds zero MVP-functional value (no OUs to create, no SCPs to attach, no log-archive account to provision).

## Decision Drivers

- One existing AWS account, owner-administered.
- MVP scope: deploy `apps/web` (Next.js) + `apps/api` (NestJS) + RDS Postgres + S3 in eu-central-1.
- ~$140/mo baseline budget tolerance.
- Single-engineer ops surface: minimize moving parts.
- Public repo: no account ID or role ARN in committed code.

## Considered Options

1. **Stay with hybrid** (per ADR 0001). Tofu provisions Org + OUs + SCPs (no-op on single account) + a baseline VPC; CDK provisions app stacks. Adds a second state system, second CI path, second tool to keep current - for zero MVP value.
2. **CDK-only.** All application infrastructure (network, data, app, observability) in one tool. State in CloudFormation per stack. App-layer VPC owned by NetworkStack.
3. **OpenTofu-only.** Owner-familiar with neither HCL nor advanced OpenTofu features; CDK's L2 constructs (ApplicationLoadBalancedFargateService, DatabaseInstance) collapse far more boilerplate than HCL for ECS + RDS shapes.

## Decision Outcome

Chosen: **Option 2, CDK-only.**

- App-layer VPC + NAT + endpoints live in `infra/cdk/lib/network-stack.ts`. There is no separate "platform" VPC.
- The OpenTofu directory (`infra/tofu/`) and the multi-account bootstrap runbook (`docs/runbooks/AWS-BOOTSTRAP.md`) move to `_junk/2026-05-11-mvp-single-account-pivot/` for future-multi-account reference.
- ADR 0001 marked Superseded by this ADR.
- The deploy workflow (`_deploy-aws.yml`) keeps the env-scoped OIDC role pattern. Both `staging` and `production` resolve to the same AWS account; isolation is by stack name suffix (`App-staging`, `App-production`) and resource tags (`Environment=staging|production`).

### Trip-wires to revisit (move back toward hybrid or multi-account)

- First paying customer with SOC 2 or DORA audit clause in contract.
- Second engineer joining who needs scoped IAM access without console root.
- Need to isolate prod blast radius from staging beyond tag-based.
- Cost-of-mistake from a misconfigured staging stack hitting prod data.

Any one of these flips this ADR back open and we revisit multi-account + OpenTofu platform layer.

## Consequences

Positive:
- One state system (CloudFormation).
- One CI path in `_deploy-aws.yml`.
- One tool to install + version-pin (CDK only).
- Faster MVP-to-first-deploy: weeks instead of months.

Negative:
- Single account means staging + production share blast radius. Mitigated by tag-based IAM scoping + Environment=production protection on production stacks.
- CloudFormation drift detection is slower than `terraform plan -detailed-exitcode`. Mitigated by `cdk diff` in PR CI.
- Future multi-account migration becomes a forklift, not a rename. Accepted because YAGNI dominates.

## Validation

- `pnpm --filter @workspace/cdk synth` works locally with `AWS_ACCOUNT_ID` env var.
- `_deploy-aws.yml` smoke run succeeds in staging once `AWS_BOOTSTRAPPED=true`.

## References

- `infra/README.md` (updated to single-account)
- `docs/runbooks/AWS-DEPLOY.md` (replaces archived AWS-BOOTSTRAP.md)
- `.context/attachments/aws-products-review.md` advisor verdicts
- `_junk/2026-05-11-mvp-single-account-pivot/` archived hybrid scaffolding
