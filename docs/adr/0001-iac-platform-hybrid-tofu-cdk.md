# 1. IaC platform: hybrid OpenTofu + AWS CDK

- Status: Accepted
- Date: 2026-05-10
- Deciders: Hleb Tkachenko

## Context and Problem Statement

The monorepo targets fintech-adjacent workloads on AWS. Two tools cover the surface: AWS CDK (TypeScript, native to the monorepo) and OpenTofu (HCL, vendor-neutral fork of Terraform). A single-tool answer forces a trade-off between auditor familiarity and developer ergonomics.

## Decision Drivers

- DORA / SOC 2 / PCI-DSS auditors expect HCL or CFN they can read independently.
- Application stacks share types with `apps/web` and benefit from CDK L2/L3 constructs.
- Avoid CodePipeline (CDK Pipelines): keep deploys in GitHub Actions.
- State portability: must survive a tooling migration without rewrites.
- Solo dev today; runbook-driven onboarding tomorrow.

## Considered Options

1. **CDK only.** Tight integration with TS, but auditors push back on synthesized CFN; state lives in CloudFormation, harder to migrate.
2. **OpenTofu only.** Auditor-friendly, portable state, but heavy boilerplate for app stacks (IAM, ECS, RDS) that CDK L2 constructs collapse.
3. **Hybrid.** OpenTofu owns the platform layer (Org, OUs, SCPs, Identity Center, log archive, baseline network). CDK owns application stacks (Network*, Data, App, Observability). Boundary at SSM Parameter Store.

\* Application-level VPC, not the org baseline VPC.

## Decision Outcome

Chosen: **Option 3, Hybrid.**

- Platform-layer resources are long-lived, cross-account, and audit-critical. HCL + OpenTofu is what auditors and SRE generalists already know. State stays portable across employers.
- Application stacks change per release. CDK gives type sharing with the monorepo, `cdk drift`, and L2 constructs that compress IAM and RDS boilerplate.
- Cross-tool boundary handled via SSM Parameter Store, one-way (Tofu produces, CDK consumes). No CloudFormation Exports.
- Both invoked from GitHub Actions via OIDC. No CodePipeline.

Status default is Accepted; revisit on PR if a contributor disagrees.

## Consequences

Positive:
- Auditor-friendly platform layer.
- Developer-friendly app layer.
- Clear ownership boundary at SSM `/platform/*`.
- Each tool is replaceable in isolation.

Negative:
- Two state systems to back up (Tofu S3+DDB, CDK CloudFormation).
- Two CI paths in `_deploy-aws.yml`.
- Slightly higher onboarding cost.

## Validation

- `make plan-tofu` and `make synth-cdk` work locally without AWS access.
- `cdk-nag` (added later) runs in `infra/cdk` test target.
- This ADR is superseded only if we collapse to one tool — by a follow-up ADR, not silently.

## References

- `infra/README.md`
- `docs/runbooks/AWS-BOOTSTRAP.md`
- `docs/plans/AWS-INTEGRATION-PLAN.md`
