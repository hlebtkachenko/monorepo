# CDK App Stacks

> Public host + email inventory: [`docs/DOMAINS-AND-EMAIL.md`](../../docs/DOMAINS-AND-EMAIL.md).

Application-layer infrastructure. Deployed per environment.

## Stacks

| Stack                | Responsibilities                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NetworkStack`       | VPC, subnets (public + isolated), security groups. Zero NAT gateways (ADR-0008).                                                                           |
| `DataStack`          | RDS Postgres 18, ECR repos, S3 app bucket, Secrets Manager runtime creds.                                                                                  |
| `AppStack`           | ECS Fargate (arm64), 3-container task (web + api + cloudflared sidecar). Hardened (capDrop ALL + readonlyRootFilesystem on api/cloudflared + shared /tmp). |
| `SecurityStack`      | Kill-switch Lambda + 6 budgets + CloudTrail + RDS restart watcher (ADR-0016).                                                                              |
| `ObservabilityStack` | CloudWatch alarms (6 attack-vector + 2 critical Fargate) wired to email + kill-switch SNS.                                                                 |
| `BetaDataStack`      | `beta` env only. RDS Postgres t4g.micro, one ECR repo, one private CMK-encrypted documents bucket.                                                         |
| `BetaAppStack`       | `beta` env only. ECS Fargate (arm64, 256/512), 2-container task (beta portal + its own cloudflared tunnel).                                                |

Stacks named `<Stack>-<env>` where `env` ∈ {`staging`, `production`, `beta`}.

`beta` is a deliberately slim, fully isolated environment for the
beta.afframe.com client portal: `Network-beta` + `BetaData-beta` +
`BetaApp-beta`, and nothing else. It shares no database, bucket, tunnel or auth
store with staging/production, and it does not get the Security /
Observability / Backup stacks or the account-wide `SecretsBootstrap` / `Audit`
stacks. Its migrations run in the app container's entrypoint (the RDS is in
isolated subnets and no runner can reach it). Design SoT:
`.context/beta-afframe/30-plan-v3-beta-env.md`.

The CDK app deploys only the stacks registered in `bin/app.ts`. `infra/openstatus/` (the
`status.afframe.com` status page) is **not** a CDK stack — it is OVH-VPS-hosted and never
touched by `cdk deploy`, `make deploy-cdk`, or `_deploy-aws.yml`. See `docs/adr/0019-status-page-and-uptime-monitoring.md`.

`cdk synth` exercises type-checking + stack instantiation pre-bootstrap (works with dummy `AWS_ACCOUNT_ID=000000000000`). `cdk.context.json` is committed with dummy AZ data; refresh after first real bootstrap via `cdk context --clear` + re-synth.

## Bootstrap order

Per environment (staging, production):

1. Run `docs/runbooks/AWS-SETUP.md` setup section (creates GitHub OIDC provider + deploy roles).
2. `make bootstrap-cdk REGION=eu-central-1` — creates the CDK toolkit stack.
3. `make synth-cdk ENV=staging` — produces `cdk.out/`, no AWS API calls.
4. `make diff-cdk ENV=staging` — first run shows the entire stack as a create.
5. `make deploy-cdk ENV=staging` — deploy via OIDC role from CI.

## Drift detection

`cdk drift --all` runs nightly via `.github/workflows/_deploy-aws.yml` (scheduled) once the env is bootstrapped. Drift report posts to a GitHub issue.

## Local synth without AWS

```bash
pnpm install
pnpm --filter @workspace/cdk exec cdk synth --context env=staging
```

`bin/app.ts` warns when no AWS account is configured (`AWS_ACCOUNT_ID` unset) but proceeds with synth, so type-checking and unit tests run without AWS credentials.
