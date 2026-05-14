# Infrastructure

Single-account AWS CDK v2 (TypeScript) for app stacks, plus a local Docker Compose stack for dev parity. One tool, one state system, one CI path.

See ADR `docs/adr/0007-mvp-single-account-cdk-only.md` for the IaC scope decision.

## Layout

```
infra/
  Makefile                  # cdk + compose task wrappers
  package.json              # scripts (no workspace member)
  README.md
  cdk/                      # AWS CDK v2 app stacks (see cdk/README.md)
    bin/app.ts              # stack registration
    lib/                    # stack definitions + Lambda code
    tests/                  # vitest CDK template assertions
    cdk.json
    cdk.context.json        # committed AZ data for reproducible synth
  compose/                  # Local Docker Compose (Postgres 18 + pgBouncer + pgTap)
    docker-compose.dev.yml
    postgres/               # custom postgres:18 + pgvector + pgaudit + init.d roles
    pgbouncer/              # transaction-mode config
    pgtap/                  # pgtap test runner image
```

## Bootstrap state

This directory is **dormant** until the deploy workflow's bootstrap flag flips:

1. Owner completes `docs/runbooks/AWS-DEPLOY.md` setup section (creates GitHub OIDC provider + deploy role; runs `cdk bootstrap` per environment).
2. Owner sets repo variable `AWS_BOOTSTRAPPED=true`.
3. Then the Make targets here become real (until then, env-var checks abort the run).

## Quickstart (post-bootstrap)

```bash
make synth-cdk ENV=staging          # cdk synth --context env=staging
make diff-cdk ENV=staging           # cdk diff vs deployed state
make deploy-cdk ENV=staging         # cdk deploy --all --context env=staging
make drift-cdk ENV=staging          # cdk drift --all
make bootstrap-cdk REGION=eu-central-1  # one-time per fresh env
```

## State location

| Item | Where |
|------|-------|
| CDK state | CloudFormation per stack in the same AWS account |
| CDK assets | The `cdk-hnb659fds-*` S3 bucket created by `cdk bootstrap` |

## Required env vars

CDK targets read from:
- `AWS_REGION` (repo var: `AWS_REGION=eu-central-1`)
- `AWS_PROFILE` (local only; deploys use the OIDC role)
- `AWS_ACCOUNT_ID` (repo secret; never logged or committed)

Local profiles managed via the `granted` CLI (see ADR-0006).

## Public-repo guardrails

- AWS account ID lives in repo **secret** `AWS_ACCOUNT_ID`. Never commit it to code, comments, commit messages, or PR descriptions.
- Deploy role ARN lives in repo **secret** `AWS_DEPLOY_ROLE_ARN_STAGING` / `AWS_DEPLOY_ROLE_ARN_PRODUCTION`. ARNs include the account ID, so they're treated as secrets too.
- Workflow logs are filtered: any line with the account ID gets masked via `::add-mask::`.

## See also

- `cdk/README.md` — stack-by-stack catalog + bootstrap order
- `compose/` — local dev stack (see `docker-compose.dev.yml` for service profiles)
- `docs/adr/0007-mvp-single-account-cdk-only.md` — IaC scope
- `docs/adr/0008-cloudflare-tunnel-and-email.md` — network topology (no ALB, Cloudflare Tunnel sidecar)
- `docs/adr/0016-cost-runaway-protection.md` — kill-switch + budgets + alarms
- `docs/runbooks/AWS-DEPLOY.md` — first-deploy bootstrap procedure
- `docs/runbooks/COST-INCIDENT-RESPONSE.md` — what to do when alarms fire
