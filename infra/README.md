# Infrastructure

Hybrid IaC layout. Two tools, one ownership boundary at SSM Parameter Store.

| Layer | Tool | Path | Owner |
|-------|------|------|-------|
| Platform (Org, OUs, SCPs, Identity Center, Log Archive, baseline VPC) | OpenTofu | `infra/tofu` | Platform |
| Application stacks (Network, Data, App, Observability) | AWS CDK v2 (TS) | `infra/cdk` | Service teams |

Cross-layer flow is one direction: Tofu publishes `/platform/*` keys to SSM Parameter Store, CDK consumes via `StringParameter.valueFromLookup`. We do not use CloudFormation Exports — they pin producer stacks and prevent renames.

See ADR `docs/adr/0001-iac-platform-hybrid-tofu-cdk.md`.

## Bootstrap order

This entire directory is **dormant** until the AWS account exists. Before running any target here:

1. Complete every step in `docs/runbooks/AWS-BOOTSTRAP.md` (creates the management account, OUs, SCPs, Identity Center, log archive, OIDC providers, Tofu state backend, CDK bootstrap stacks).
2. Set repo variable `AWS_BOOTSTRAPPED=true` (`gh variable set AWS_BOOTSTRAPPED --body true`).
3. Then the Make targets here become real (until then, env-var checks abort the run).

## Quickstart (post-bootstrap)

```bash
make plan-tofu                      # tofu init + plan against current workspace
make apply-tofu                     # tofu apply previously generated plan
make synth-cdk                      # cdk synth all stacks (no AWS calls)
make diff-cdk                       # cdk diff vs deployed state
make deploy-cdk ENV=staging         # cdk deploy --all --context env=staging
make drift-cdk                      # cdk drift --all (scheduled job target)
make bootstrap-cdk ACCOUNT=<TBD> REGION=eu-central-1
```

## State location

| Item | Where | Status |
|------|-------|--------|
| Tofu state | `s3://<TBD-tofu-state-bucket>/platform/global/terraform.tfstate` | `<TBD>` until bootstrap |
| Tofu lock | DynamoDB table `<TBD-tofu-lock-table>` | `<TBD>` until bootstrap |
| CDK state | CloudFormation per workload account | created by `cdk bootstrap` |

## Required env vars

OpenTofu targets:
- `AWS_REGION`, `AWS_PROFILE`, `TOFU_STATE_BUCKET`, `TOFU_LOCK_TABLE`

CDK targets:
- `AWS_REGION`, `AWS_PROFILE`, `CDK_DEFAULT_ACCOUNT`

Local profiles are managed via the `granted` CLI (see ADR 0006).

## Layout

```
infra/
  Makefile
  README.md
  package.json              # workspace member
  tofu/
    main.tf                 # backend + providers
    versions.tf
    variables.tf
    modules/
      ou/
      scp/
      identity-center/
      log-archive/
      network/
  cdk/
    cdk.json
    package.json
    tsconfig.json
    bin/app.ts
    lib/
      network-stack.ts
      data-stack.ts
      app-stack.ts
      observability-stack.ts
    README.md
```

`infra/tofu` and the `Makefile` are not pnpm-managed. `infra/cdk` is a pnpm workspace member (`@workspace/cdk`).
