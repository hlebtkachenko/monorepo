# AWS Deploy

Single-account MVP deploy. Owner-side one-time setup, then push-button.

The runbook for the older multi-account bootstrap is at `_junk/2026-05-11-mvp-single-account-pivot/AWS-BOOTSTRAP.md`. See ADR `docs/adr/0007-mvp-single-account-cdk-only.md` for the pivot rationale.

> All `<TBD>` markers below are personal values you fill in at the moment you run the step. Do not commit them to the repo.

## Public-repo security

This repo is public. Several inputs MUST stay out of code and PR descriptions:
- AWS account ID
- Any IAM role ARN (contains account ID)
- ACM certificate ARN (contains account ID)
- Secrets Manager ARN (contains account ID)

These live as **GitHub repo secrets** (`gh secret set ...`) and are passed into workflows via `secrets.*`. The deploy workflow masks them in logs via `::add-mask::`.

## One-time owner setup

Order matters. Skipping a step makes a later one fail.

### 1. Local AWS credentials

Confirm your CLI can talk to the account:

```bash
aws sts get-caller-identity
# Should print Account: <your 12-digit id> and a valid Arn
```

If not configured: `aws configure` with a personal IAM user, or use `granted` per ADR 0006.

### 2. GitHub Actions OIDC trust + deploy role

Create the OIDC provider once per account (idempotent — re-running fails with "EntityAlreadyExists" which is fine):

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Create the staging deploy role with environment-scoped trust:

```bash
cat > /tmp/trust-staging.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::<TBD-account-id>:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:hlebtkachenko/monorepo:environment:staging"
      }
    }
  }]
}
JSON

aws iam create-role \
  --role-name windhoek-deploy-staging \
  --assume-role-policy-document file:///tmp/trust-staging.json
```

Attach `AdministratorAccess` for MVP (downgrade to least-privilege after first deploy works):

```bash
aws iam attach-role-policy \
  --role-name windhoek-deploy-staging \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

Repeat for `windhoek-deploy-production` with `environment:production` in the sub claim.

Record both role ARNs.

### 3. Repo secrets + variables

Use `gh` from any machine with repo admin access:

```bash
gh secret set AWS_ACCOUNT_ID --body "<TBD-account-id>" --repo hlebtkachenko/monorepo
gh secret set AWS_DEPLOY_ROLE_ARN_STAGING --body "arn:aws:iam::<TBD-account-id>:role/windhoek-deploy-staging" --repo hlebtkachenko/monorepo
gh secret set AWS_DEPLOY_ROLE_ARN_PRODUCTION --body "arn:aws:iam::<TBD-account-id>:role/windhoek-deploy-production" --repo hlebtkachenko/monorepo
```

Variables (lower sensitivity):
```bash
gh variable set AWS_REGION --body eu-central-1 --repo hlebtkachenko/monorepo
gh variable set APP_DOMAIN_STAGING --body staging.afframe.com --repo hlebtkachenko/monorepo
gh variable set APP_DOMAIN_PRODUCTION --body app.afframe.com --repo hlebtkachenko/monorepo
gh variable set AWS_BOOTSTRAPPED --body false --repo hlebtkachenko/monorepo
```

### 4. CDK bootstrap

CDK needs an assets bucket + execution roles in the account. One-time per account+region:

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=eu-central-1
cd infra
make bootstrap-cdk REGION=eu-central-1
```

This creates the `cdk-hnb659fds-*` resources used by every subsequent `cdk deploy`.

### 5. Upstash Redis (optional, for bullmq workers)

Sign up at upstash.com. Create a Redis database in eu-central-1. Copy the connection URL (`rediss://default:<token>@<host>:6379`).

Create a Secrets Manager secret holding the URL:

```bash
aws secretsmanager create-secret \
  --name windhoek-staging-upstash-url \
  --secret-string '{"REDIS_URL":"rediss://default:<token>@<host>:6379"}' \
  --region eu-central-1
```

Record the secret ARN. Then:

```bash
gh secret set UPSTASH_REDIS_SECRET_ARN_STAGING --body "<TBD-secret-arn>"
```

The deploy workflow injects the secret into the api task definition as `REDIS_URL` env var. If `UPSTASH_REDIS_SECRET_ARN_<ENV>` is unset, the api runs without Redis (bullmq features unavailable).

### 6. ACM certificate (optional, for HTTPS)

Without a cert the ALB serves HTTP only — acceptable for first-day smoke against `http://staging.afframe.com`.

When ready for HTTPS:

```bash
aws acm request-certificate \
  --domain-name staging.afframe.com \
  --validation-method DNS \
  --region eu-central-1
```

ACM emits a CNAME record for validation. Add it to your DNS host (adm.tools per your CLAUDE.md), wait ~5 minutes for ACM to flip the cert to ISSUED, then:

```bash
gh secret set ACM_CERT_ARN_STAGING --body "<TBD-cert-arn>"
```

Re-run the deploy workflow — ALB picks up the cert and adds an HTTPS listener + HTTP→HTTPS redirect.

### 7. Flip the bootstrap flag

```bash
gh variable set AWS_BOOTSTRAPPED --body true --repo hlebtkachenko/monorepo
```

This unblocks `_deploy-aws.yml`.

## Deploys

Manual dispatch:

```bash
gh workflow run _deploy-aws.yml \
  -f environment=staging \
  -f stack=all \
  --repo hlebtkachenko/monorepo
```

`stack` values:
- `all` — deploy infra + build images + deploy app (default)
- `infra-only` — skip image builds and app stack (only when changing VPC/RDS/S3)
- `app-only` — skip Network + Data deploy (steady-state after first deploy)

After first successful `all` run, switch to `app-only` for routine code-change deploys to cut workflow time.

## DNS

Once the App stack deploys, find the ALB DNS name from CloudFormation outputs:

```bash
aws cloudformation describe-stacks --stack-name App-staging \
  --query 'Stacks[0].Outputs[?OutputKey==`AlbDnsName`].OutputValue' --output text
```

Add a CNAME at adm.tools: `staging.afframe.com` → `<that-alb-dns>`. Wait 5 minutes. Then `https://staging.afframe.com` resolves to your app.

## Health checks + first verification

```bash
# Web (Next.js):
curl -i https://staging.afframe.com/api/version
# api (NestJS):
curl -i https://staging.afframe.com/api/health
```

Both should return 200 with JSON.

## Monitoring after first deploy

Watch for 24h:
- CloudWatch → `/ecs/windhoek-staging/web` and `/api` log groups for errors
- CloudWatch → ECS Cluster `windhoek-staging` → task counts steady
- Cost Explorer → unexpected NAT data charges (>$5/mo = add Secrets Manager + KMS endpoints, see `infra/cdk/lib/network-stack.ts`)
- RDS console → `windhoek` Postgres connection count stays < 50

## Rolling back

Bad deploy? Revert the git commit, push, deploy workflow re-runs with previous image SHA. ECS circuit breaker on the service auto-rolls if new tasks fail health checks.

Hard reset (delete app stack only, keep DB):

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text) \
APP_DOMAIN=staging.afframe.com \
pnpm --filter @workspace/cdk exec cdk destroy App-staging --context env=staging
```

Then redeploy.

## What this runbook deliberately does NOT cover

- AWS Organizations / Control Tower / multi-account (see ADR 0007 trip-wires for when to revisit)
- AWS WAF (trigger-gated; add at first paying customer or first attack signal)
- GuardDuty premium / Inspector v2 / Security Hub (trigger-gated)
- Customer-managed KMS keys (AWS-managed are sufficient at MVP)
- DR region replication (single-region MVP)
- Object Lock buckets for audit (deferred until DORA / SOC 2 audit clause)
- RDS Multi-AZ + Read Replica (single-AZ MVP)
- RDS Proxy (under 4 Fargate tasks doesn't need it)
- Drizzle migration ECS task (deferred until `packages/db` has a schema and `src/migrate.ts`)
