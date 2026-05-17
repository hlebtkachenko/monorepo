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
    bin/app.ts              # stack registration (6 stacks)
    lib/                    # network, data, app, security, observability, backup
    tests/                  # vitest CDK template assertions
    cdk.json
    cdk.context.json        # committed AZ data for reproducible synth
  cerbos/                   # L3 authz: policies + tests + DockerImageAsset (ADR-0018)
    Dockerfile, policies/, .cerbos-tests/, config/cerbos-config.yaml
  openfga/                  # L2 authz: model + tests + bootstrap.mjs -> SSM
  compose/                  # Local Docker Compose; profiles: auth, observability, mailpit
    docker-compose.dev.yml
    postgres/               # custom postgres:18 + pgvector + pgaudit + init.d roles
    pgbouncer/              # transaction-mode config (ADR-0012 amendment)
    pg_exporter/queries.yaml # pg-boss + outbox gauges (observability profile)
    pgtap/                  # pgtap test runner image
  observability/            # OTel + FireLens configs (UNWIRED in CDK; ADR-0002 trip-wire)
  openstatus/               # status.afframe.com monitors-as-code (OVH VPS Docker Compose — NOT AWS/CDK; ADR-0019)
  scripts/                  # backup + restore + WAL archive scripts (Commit 11)
  Dockerfile.backup         # minimal image for the ECS Scheduled Task
  secrets/                  # SOPS+age scaffold per docs/runbooks/SECRETS.md
```

`openstatus/` is the one infra directory that is **not** AWS: the `status.afframe.com`
status page runs OpenStatus on the OVH VPS (Docker Compose + Cloudflare Tunnel). No CDK
stack, no Makefile target, and no `_deploy-aws.yml` step touches it — see
`docs/adr/0019-status-page-and-uptime-monitoring.md` and `docs/runbooks/STATUS-PAGE.md`.

App task topology (one Fargate task per env): 6 containers
`web + api + pgbouncer + cerbos + openfga + cloudflared`. See
`infra/cdk/lib/app-stack.ts` and ADR-0008 / ADR-0012 / ADR-0018.

## Bootstrap state

Bootstrap is **complete** (2026-05-11). The GitHub OIDC provider + deploy role exist, `cdk bootstrap` has run, and repo variable `AWS_BOOTSTRAPPED=true` is set — so `_deploy-aws.yml` and the Make targets below are live. Staging is deployed at `app-staging.afframe.com`; production (`app.afframe.com`) is prepared but not yet deployed.

To re-verify the flag: `gh variable list` should show `AWS_BOOTSTRAPPED  true`. The one-time bootstrap procedure is in `docs/runbooks/AWS-DEPLOY.md`.

## Quickstart

```bash
make synth-cdk ENV=staging          # cdk synth --context env=staging
make diff-cdk ENV=staging           # cdk diff vs deployed state
make deploy-cdk ENV=staging         # cdk deploy --all --context env=staging
make drift-cdk ENV=staging          # cdk drift --all
make bootstrap-cdk REGION=eu-central-1  # one-time per fresh env
```

## State location

| Item       | Where                                                      |
| ---------- | ---------------------------------------------------------- |
| CDK state  | CloudFormation per stack in the same AWS account           |
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
