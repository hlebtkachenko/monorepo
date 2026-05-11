# AWS Deploy

Single-account MVP deploy with Cloudflare front door + AWS-hosted compute and data. See ADR `docs/adr/0007-mvp-single-account-cdk-only.md` (parent decision) and `docs/adr/0008-cloudflare-tunnel-and-email.md` (network + email architecture).

The runbook for the older multi-account bootstrap is at `_junk/2026-05-11-mvp-single-account-pivot/AWS-BOOTSTRAP.md`.

> All `<TBD>` markers below are personal values you fill in at the moment you run the step. Do not commit them.

## Public-repo security

The repo is public. The following inputs MUST stay out of code and PR descriptions:
- AWS account ID
- Any IAM role ARN (contains account ID)
- Secrets Manager ARN (contains account ID)
- Cloudflare Tunnel tokens
- Email forwarding destination
- Resend API key

These live as **GitHub repo secrets** (`gh secret set ...`) and are passed into workflows via `secrets.*`. The deploy workflow masks them in logs via `::add-mask::`.

## High-level architecture

```
Internet
    │
    ▼
Cloudflare edge (free) ── DDoS + WAF + CDN ── DNS for afframe.com
    │                                              │
    │ tunnel (outbound-initiated)                  │
    ▼                                              │
AWS Fargate task (one task per env)                │
    ├── web (Next.js :3000)                        │
    ├── api (NestJS :3001)                         │
    └── cloudflared sidecar                        │
    │                                              │
    │ Postgres                                     │ MX records
    ▼                                              ▼
AWS RDS Postgres 18 (isolated subnet)        Cloudflare Email Routing
                                                    │
                                                    └─→ EMAIL_FORWARD_TO secret
```

Email outbound flows via AWS SES (once production-approved) or Resend (immediate). Logs flow to CloudWatch (ECS infra) and Grafana Cloud free (app).

## One-time owner setup

Order matters. Skipping a step makes a later one fail.

### 1. Local AWS credentials

```bash
aws sts get-caller-identity
# Should print Account: <your 12-digit id> and a valid Arn
```

If not configured: `aws configure` with a personal IAM user.

### 2. GitHub Actions OIDC trust + deploy role

Create the OIDC provider once per account:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Per env, create the deploy role:

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

cat > /tmp/trust-staging.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
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

aws iam attach-role-policy \
  --role-name windhoek-deploy-staging \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

Repeat the trust JSON + role for `production` (substitute `staging` → `production` in the sub claim and role name).

### 3. Repo secrets + variables

```bash
gh secret set AWS_ACCOUNT_ID --body "${AWS_ACCOUNT_ID}" --repo hlebtkachenko/monorepo
gh secret set AWS_DEPLOY_ROLE_ARN_STAGING --body "arn:aws:iam::${AWS_ACCOUNT_ID}:role/windhoek-deploy-staging" --repo hlebtkachenko/monorepo
gh secret set AWS_DEPLOY_ROLE_ARN_PRODUCTION --body "arn:aws:iam::${AWS_ACCOUNT_ID}:role/windhoek-deploy-production" --repo hlebtkachenko/monorepo

gh variable set AWS_REGION --body eu-central-1 --repo hlebtkachenko/monorepo
gh variable set APP_DOMAIN_STAGING --body staging.afframe.com --repo hlebtkachenko/monorepo
gh variable set APP_DOMAIN_PRODUCTION --body app.afframe.com --repo hlebtkachenko/monorepo
gh variable set AWS_BOOTSTRAPPED --body false --repo hlebtkachenko/monorepo
```

### 4. CDK bootstrap

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=eu-central-1
export APP_DOMAIN=placeholder.local   # cdk bootstrap doesn't synth app stacks but bin/app.ts requires this
cd infra
make bootstrap-cdk REGION=eu-central-1
```

One-time per account+region.

### 5. Cloudflare account + DNS migration

1. Sign up at cloudflare.com (free plan)
2. **Add a Site** → `afframe.com` → Free plan
3. Cloudflare auto-scans current DNS. Verify the imported records look complete (apex A/AAAA, wildcards, MX, SPF TXT, DMARC TXT, DKIM TXT)
4. Cloudflare gives 2 nameservers (e.g., `ana.ns.cloudflare.com`, `bob.ns.cloudflare.com`)
5. At the registrar (Spaceship): change nameservers for `afframe.com` to Cloudflare's pair
6. Wait propagation - Cloudflare dashboard shows "Active" within 1-24h

After Active: adm.tools can be dropped entirely.

### 6. Cloudflare Email Routing

1. Set the forwarding destination as a repo secret first:
   ```bash
   gh secret set EMAIL_FORWARD_TO --body "<your-destination-email>" --repo hlebtkachenko/monorepo
   ```
   (The actual destination address only lives in the secret. Cloudflare also needs it for its own dashboard.)
2. In Cloudflare → afframe.com → Email → Email Routing → enable
3. Add the destination address (same value as the secret). Cloudflare emails a verification link there; click it.
4. Create catch-all route: `*@afframe.com` → that destination
5. Optionally add specific routes (`hi@`, `support@`, `noreply@` → discard or different destinations)
6. Test: send a mail from your phone to `anything@afframe.com`, it should land at the destination within seconds.

### 7. Resend (outbound transactional, immediate)

1. Sign up at resend.com (free plan, 3K/mo + 100/day)
2. Add domain `afframe.com` in Resend → it emits ~3 DNS records (SPF, DKIM CNAMEs, return-path)
3. Add those records at Cloudflare DNS
4. In Resend, click "Verify" - flips to verified in ~5 min
5. Generate API key in Resend → store as repo secret:
   ```bash
   gh secret set RESEND_API_KEY --body "<key>" --repo hlebtkachenko/monorepo
   ```

`packages/email` already has the Resend client wired.

### 8. AWS SES (outbound transactional, larger free tier - wait 24-48h for approval)

```bash
aws ses verify-domain-identity --domain afframe.com --region eu-central-1
aws ses verify-domain-dkim --domain afframe.com --region eu-central-1
```

Both commands return DNS records. Add them at Cloudflare DNS. SES auto-verifies in 5-15 min.

Then file SES production access request in the AWS console (SES → Account dashboard → Request production access) with use case "Transactional email for a SaaS, expected volume <5K/mo, no marketing." Auto-approval typically 24-48h.

Until approved, SES is sandboxed (200/day to verified addresses only). Resend covers MVP volume meanwhile.

### 9. Cloudflare Tunnels

Per env:

1. In Cloudflare → Zero Trust → Access → Tunnels → Create a tunnel
2. Name it `windhoek-staging` (then later `windhoek-production`)
3. Cloudflare emits a connector token. Copy it.
4. Store as repo secret:
   ```bash
   gh secret set CLOUDFLARE_TUNNEL_TOKEN_STAGING --body "<token>" --repo hlebtkachenko/monorepo
   ```
5. In the tunnel's Public Hostnames tab, add:
   - **Subdomain** `staging`, **Domain** `afframe.com`, **Path** `api/*`, **Service** `HTTP localhost:3001`
   - **Subdomain** `staging`, **Domain** `afframe.com`, **Path** (leave blank for catch-all), **Service** `HTTP localhost:3000`
6. Repeat for `windhoek-production` with `app.afframe.com`

The tunnel connector starts running inside the Fargate task on first deploy. Until then it'll show "inactive" in Cloudflare dashboard.

### 10. Flip the bootstrap flag

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
- `all` - deploy infra + build images + sync tunnel token + deploy app + force rollout (default)
- `infra-only` - Network + Data only
- `app-only` - skip Network + Data deploy (steady-state after first deploy)

After first successful `all` run, switch to `app-only` for routine code-change deploys.

## DNS - final wiring after first deploy

The Cloudflare Tunnel handles `staging.afframe.com` and `app.afframe.com` end-to-end. No CNAME at adm.tools to set; Cloudflare's Tunnel hostname config auto-creates a DNS record at Cloudflare DNS.

Verify:
```bash
dig +short staging.afframe.com
# Should show Cloudflare's edge IPs (104.x or 172.67.x)
```

## Health check

```bash
curl -i https://staging.afframe.com/api/version    # Next.js version endpoint
curl -i https://staging.afframe.com/api/health     # NestJS health endpoint
```

Both should return 200 with JSON.

## Monitoring after first deploy

Watch for 24h:
- **CloudWatch** → `/ecs/windhoek-staging/{web,api,cloudflared}` log groups for errors
- **CloudWatch** → ECS Cluster `windhoek-staging` → task count steady at 1
- **Cloudflare dashboard** → Zero Trust → Tunnels → connector status "Healthy"
- **Cost Explorer** → AWS daily spend tracks against ~$1.50/day target

## Rolling back

Bad deploy? Revert the git commit, push, the deploy workflow re-runs with previous image SHA. ECS circuit breaker auto-rolls if new tasks fail health checks.

Hard reset (delete app stack only, keep DB):

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text) \
APP_DOMAIN=staging.afframe.com \
pnpm --filter @workspace/cdk exec cdk destroy App-staging --context env=staging
```

## What this runbook deliberately does NOT cover

Trip-wired for later (see ADR 0008 trip-wire section):
- AWS Organizations / multi-account
- AWS WAF (Cloudflare handles edge)
- GuardDuty / Inspector v2 / Security Hub
- Customer-managed KMS keys
- DR region replication
- Object Lock buckets for audit
- RDS Multi-AZ + Read Replica
- RDS Proxy
- Drizzle migration ECS task (deferred until `packages/db` ships schema + `src/migrate.ts`)
- Workers / Upstash Redis (deferred)
- ALB + ACM cert (replaced by Cloudflare Tunnel)
