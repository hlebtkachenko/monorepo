# Beta environment deploy

Operating procedure for the dedicated `beta` environment — the
beta.afframe.com client portal. It is a third CDK environment alongside
`staging` and `production`, sharing no database, bucket, tunnel, or auth store
with either.

Pipeline: [`.github/workflows/deploy-beta.yml`](../../.github/workflows/deploy-beta.yml).
Stacks: `Network-beta`, `BetaData-beta`, `BetaApp-beta`
([`infra/cdk/bin/app.ts`](../../infra/cdk/bin/app.ts), the `env === "beta"`
branch). Design source of truth: `.context/beta-afframe/30-plan-v3-beta-env.md`
Part 2 and its Advisor gate `31-advisor-part2-pipeline.md`.

## What is code and what is a decision

Everything in the repository — the workflow, the CDK stacks, the IAM policy
JSON, the budget threshold — is **code only**. Nothing has been created in
AWS, Cloudflare, or GitHub settings. The first beta deploy is a Hleb gate
(plan Part 6, gate 1: "B0 first deploy of beta env + AccountTotal budget bump
— one yes"). Work the checklist below top to bottom; every item is manual.

## First-deploy gate checklist

### 1. GitHub `beta` environment

```bash
gh api -X PUT repos/hlebtkachenko/monorepo/environments/beta \
  -F deployment_branch_policy='{"protected_branches":false,"custom_branch_policies":true}'
gh api -X POST repos/hlebtkachenko/monorepo/environments/beta/deployment-branch-policies \
  -f name=main-beta -f type=branch
```

No required reviewers and no wait timer: the environment exists to scope the
OIDC subject claim and hold beta's secrets, not to gate. The branch policy is
what keeps a deploy pinned to `main-beta`.

### 2. AWS deploy role

Create `monorepo-deploy-beta` with the trust policy and least-privilege
permissions policy in
[`../specs/OIDC-TRUST.md`](../specs/OIDC-TRUST.md) § "Beta environment deploy
role". Substitute `<TBD-account-id>` with the real account ID.

The trust condition is `repo:hlebtkachenko/monorepo:environment:beta`. Never
reuse `monorepo-deploy-staging` or `monorepo-deploy-production` — those carry
`AdministratorAccess`, and beta must not be able to touch either env.

### 3. Cloudflare tunnel + DNS

Beta runs its **own** tunnel, separate from the prod and staging ones.

1. Cloudflare → Zero Trust → Networks → Tunnels → create a tunnel named
   `monorepo-beta`. Copy the connector token (it is shown once).
2. Add a public hostname on that tunnel: `beta.afframe.com` →
   `http://localhost:3000`.
3. DNS: an explicit **proxied CNAME** record `beta` → the tunnel. It must be
   explicit, not left to the wildcard — an explicit record overrides the
   wildcard and keeps beta pinned to its own tunnel.
4. Do **not** add a `/api/.*` Cloudflare route for this host. That pattern
   intercepts the Next.js `/api/*` routes; it broke `app-staging` once
   already.

### 4. Secrets and variables

```bash
gh variable set APP_DOMAIN_BETA --body beta.afframe.com --repo hlebtkachenko/monorepo
gh secret set AWS_DEPLOY_ROLE_ARN_BETA --env beta --body "<beta-role-arn>"
gh secret set CLOUDFLARE_TUNNEL_TOKEN_BETA --env beta --body "<tunnel-connector-token>"
```

`AWS_ACCOUNT_ID`, `AWS_REGION`, `AWS_BOOTSTRAPPED` and `MAIL_FROM_ADDRESS` are
existing repo-level values and need no change.

### 5. Vault-backed SSM secrets

The beta app container reads `/monorepo/beta/better-auth-secret` and
`/monorepo/beta/resend-api-key` as SSM SecureStrings. Vault is the source of
truth; the VPS `vault-to-ssm-sync` timer mirrors it (see
[`VAULT-OPS.md`](VAULT-OPS.md)).

1. Seed Vault:
   ```bash
   vault kv put platform/beta/better-auth-secret value="$(openssl rand -base64 32)"
   vault kv put platform/beta/resend-api-key value="<resend-key>"
   ```
   The Better Auth secret must be **new**, never the production one — a shared
   signing secret would make prod sessions valid on beta.
2. Add `beta` to the VPS sync timer's environment list so it mirrors both keys
   plus `/monorepo/beta/sync-heartbeat`.
3. Extend the `gha-drift` Vault policy to read `platform/data/beta/*`, and add
   the three `/monorepo/beta/*` parameters to the `AWS_SECRETS_DRIFT_ROLE_ARN`
   permissions policy (the ARN list is in
   [`../specs/OIDC-TRUST.md`](../specs/OIDC-TRUST.md) § "Read-only CI roles").

`.github/workflows/secrets-drift.yml` already tracks beta's two keys and its
heartbeat. Until steps 1-3 are done the daily drift check would fail on beta —
harmless while this work lives on `main-beta` (schedules only fire from the
default branch), but it must be complete before `main-beta` transfers.

### 6. AccountTotal budget

`infra/cdk/lib/security-stack.ts` raises the production-only account-wide
`AccountTotal` budget from $55 to $75 (ADR-0016, amendment 2026-08-26). Beta
instantiates no `SecurityStack`, so its ~$20-22/mo is invisible to the per-env
tag-filtered budgets and lands entirely in this untagged one; at $55 the guard
would fire on normal steady state and stop **production**.

The new threshold only takes effect on the next **production** deploy
(`Security-production`). The beta pipeline never deploys it. Review the
`cdk diff` before that deploy: this budget feeds the kill-switch Lambda, so
verify only `BudgetLimit.Amount` moved and no notification / subscriber wiring
changed.

### 7. Dispatch

```bash
gh workflow run deploy-beta.yml --ref main-beta
```

**Expect this to fail while `deploy-beta.yml` lives only on `main-beta`.**
GitHub resolves `workflow_dispatch` availability from the repository's
**default** branch, so a workflow that has never been on `main` is not
dispatchable from anywhere — the Actions UI will not list it and `gh workflow
run` returns "Workflow does not have 'workflow_dispatch' trigger". Use the
local fallback in the next section until `main-beta` transfers to `main`.

Order on the very first run: the workflow builds and pushes the image before
`cdk deploy` creates the ECR repository, so it creates the repository itself
(idempotent, settings matched to `BetaDataStack`). The RDS instance takes
~15 minutes on first create; the 75-minute deploy timeout covers it.

## Local fallback deploy (`AWS_PROFILE=hleb`)

Runs the same three steps the workflow does, from a `main-beta` checkout.

```bash
export AWS_PROFILE=hleb
export AWS_REGION=eu-central-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export APP_DOMAIN=beta.afframe.com
export IMAGE_TAG=sha-$(git rev-parse HEAD)
```

```bash
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
```

```bash
docker buildx build \
  --platform linux/arm64 \
  --file apps/beta/Dockerfile \
  --tag "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/monorepo-beta-beta:${IMAGE_TAG}" \
  --provenance=false --sbom=false \
  --push .
```

```bash
aws ssm put-parameter \
  --name /monorepo/beta/cloudflare-tunnel-token \
  --value "<tunnel-connector-token>" \
  --type SecureString --overwrite --region "$AWS_REGION"
```

```bash
pnpm --filter @workspace/cdk exec cdk deploy \
  Network-beta BetaData-beta BetaApp-beta \
  --exclusively \
  --context env=beta \
  --context "betaImageTag=${IMAGE_TAG}" \
  --context "imageTag=${IMAGE_TAG}" \
  --require-approval=never
```

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://beta.afframe.com/healthz
```

The CVE gate is the one thing the local path skips. Before exposing beta to
any real client, run one deploy through the workflow (or reproduce the gate by
hand with `aws ecr describe-image-scan-findings`).

## Rollback

There is **no automatic rollback**, by design. The beta app applies its
Drizzle migrations from the container entrypoint on every start
(`infra/cdk/lib/beta-app-stack.ts`), so rolling the ECS service back to the
previous task definition would run OLD code against a MIGRATED schema — the
same unsafe shape `_deploy-aws.yml` refuses when `migrations_applied=true`.

Recovery order:

1. **Forward-fix.** Read the container logs, fix, redeploy. This is the
   default and almost always the right answer.
2. **Pin a known-good image** when the regression is in application code only
   and the schema did not move:
   ```bash
   gh workflow run deploy-beta.yml --ref main-beta -f image_tag_override=sha-<good-sha>
   ```
   The last green deploy's tag is in `/monorepo/beta/last-deploy/image-tag`
   (written only after smoke passes).
3. **Schema regression.** RDS point-in-time restore (7-day automated backups
   on `BetaData-beta`), then redeploy. Beta is a demo/reporting surface, not a
   system of record — printed and office-side archives are authoritative.

Diagnostics:

```bash
aws logs tail /ecs/monorepo-beta/beta --since 15m --follow --region eu-central-1
aws logs tail /ecs/monorepo-beta/cloudflared --since 15m --region eu-central-1
aws ecs describe-services --cluster monorepo-beta \
  --services "$(aws ecs list-services --cluster monorepo-beta --query 'serviceArns[0]' --output text | sed 's#.*/##')" \
  --query 'services[0].events[:10]' --region eu-central-1
```

## Things that do not apply to beta

- **Power / sleeping page.** `_power-environment.yml`, `power.yml` and
  `deploy-sleeping.yml` hardcode staging/production across five sites and
  derive the RDS identifier from a `data-<env>` prefix that `BetaData-beta`
  never matches. Beta is out of power scope and runs 24/7 (~$20/mo). See
  [`ENV-POWER.md`](ENV-POWER.md) for the envs that are in scope.
- **`_deploy-aws.yml`.** Beta never calls it, and its `all_services=(web api
admin)` list deliberately excludes beta so `apps/beta/Dockerfile` cannot
  join the production build matrix.
- **Observability / Security / Backup stacks.** Not instantiated for beta
  (plan Part 1). Durability at MVP is RDS automated backups plus S3
  versioning; revisited at gate B6, before any real client access.
