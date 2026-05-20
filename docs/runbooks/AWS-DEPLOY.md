# AWS Deploy

> Public host + email inventory: [`docs/DOMAINS-AND-EMAIL.md`](../DOMAINS-AND-EMAIL.md). This runbook covers the operational steps; the inventory file is the source of truth for what each host is.

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
  --role-name monorepo-deploy-staging \
  --assume-role-policy-document file:///tmp/trust-staging.json

aws iam attach-role-policy \
  --role-name monorepo-deploy-staging \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

Repeat the trust JSON + role for `production` (substitute `staging` → `production` in the sub claim and role name).

### 3. Repo secrets + variables

```bash
gh secret set AWS_ACCOUNT_ID --body "${AWS_ACCOUNT_ID}" --repo hlebtkachenko/monorepo
gh secret set AWS_DEPLOY_ROLE_ARN_STAGING --body "arn:aws:iam::${AWS_ACCOUNT_ID}:role/monorepo-deploy-staging" --repo hlebtkachenko/monorepo
gh secret set AWS_DEPLOY_ROLE_ARN_PRODUCTION --body "arn:aws:iam::${AWS_ACCOUNT_ID}:role/monorepo-deploy-production" --repo hlebtkachenko/monorepo

gh variable set AWS_REGION --body eu-central-1 --repo hlebtkachenko/monorepo
gh variable set APP_DOMAIN_STAGING --body app-staging.afframe.com --repo hlebtkachenko/monorepo
gh variable set APP_DOMAIN_PRODUCTION --body app.afframe.com --repo hlebtkachenko/monorepo
gh variable set ADMIN_DOMAIN_STAGING --body admin-staging.afframe.com --repo hlebtkachenko/monorepo
gh variable set ADMIN_DOMAIN_PRODUCTION --body admin.afframe.com --repo hlebtkachenko/monorepo
gh variable set AWS_BOOTSTRAPPED --body false --repo hlebtkachenko/monorepo
```

### 4. CDK bootstrap

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=eu-central-1
export APP_DOMAIN=placeholder.local   # cdk bootstrap doesn't synth app stacks but bin/app.ts requires this
export ADMIN_DOMAIN=placeholder.local # same — bin/app.ts requires it even though bootstrap skips app stacks
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

`packages/email` already has the Resend client wired. The web container's
`EMAIL_TRANSPORT=resend` (set in `infra/cdk/lib/app-stack.ts`) pins the
transport so a partially-configured task can't silently fall through to
console + dev outbox.

The deploy workflow's "Ensure Resend API key secret exists" step copies the
GitHub repo secret into Secrets Manager as
`monorepo-{env}-resend-api-key` (the secret name AppStack references via
`Secret.fromSecretNameV2`). Rotation: `gh secret set RESEND_API_KEY ...`,
then re-deploy.

#### Email sender verification — Resend is per-EXACT-domain

Subdomains are **NOT** auto-trusted from a parent verification. A verified
`afframe.com` does NOT cover `app-staging.afframe.com` or `app.afframe.com`
as senders — Resend rejects sends from any unverified sender domain with
`validation_error … domain is not verified`.

Three options:

1. **Centralise on the verified parent** (current default). Every env sends
   from `no-reply@afframe.com`. Set `MAIL_FROM_ADDRESS` repo var/secret to
   `no-reply@afframe.com` (or leave unset — `infra/cdk/bin/app.ts` falls
   back to this). Simple, but staging and prod share the same sender — no
   visual distinction in the recipient inbox.

2. **Per-env subdomain verification.** Verify `app-staging.afframe.com`
   and `app.afframe.com` independently in Resend, add their DNS records at
   Cloudflare, then set `MAIL_FROM_ADDRESS=no-reply@app-staging.afframe.com`
   (and `no-reply@app.afframe.com` for prod). Cleanest DMARC posture +
   inbox-side distinction; costs an extra round of DNS for every env.

3. **Dedicated mail subdomain.** Verify a single `mail.afframe.com` once,
   send staging from `no-reply-staging@mail.afframe.com` and prod from
   `no-reply@mail.afframe.com`. One verification, two distinguishable
   senders. **Recommended once we leave MVP.** Plumbs through the same
   `MAIL_FROM_ADDRESS` env wired to `AppStack.mailFromAddress`.

Symptom of misalignment (from `2026-05-19` incident): every Better-Auth
background task (`forgot-password`, `verify-email`) and every
`onboarding/team/issueInvite` Resend call logs:

```
resend.send failed: validation_error The <subdomain> domain is not verified.
```

The Server Action that triggered the send still returns `{ ok: true }` to
the client (intentional, to avoid email-enumeration leaks), so the UI shows
a "Reset link sent" toast despite the silent failure. Always check the
web container logs for `resend.send failed` before debugging anywhere else
when "the email never arrived".

### 8. AWS SES (outbound transactional, larger free tier - wait 24-48h for approval)

```bash
aws ses verify-domain-identity --domain afframe.com --region eu-central-1
aws ses verify-domain-dkim --domain afframe.com --region eu-central-1
```

Both commands return DNS records. Add them at Cloudflare DNS. SES auto-verifies in 5-15 min.

Then file SES production access request in the AWS console (SES → Account dashboard → Request production access) with use case "Transactional email for a SaaS, expected volume <5K/mo, no marketing." Auto-approval typically 24-48h.

Until approved, SES is sandboxed (200/day to verified addresses only). Resend covers MVP volume meanwhile.

### 9. Cloudflare Tunnels

The two tunnels already exist (Zero Trust → Networks → Connectors):
`monorepo-staging` and `monorepo-production`. Their connector tokens are in
the repo secrets `CLOUDFLARE_TUNNEL_TOKEN_STAGING` / `_PRODUCTION`; the deploy
workflow copies each into Secrets Manager as
`monorepo-{env}-cloudflare-tunnel-token`.

> ~~One-time: the `windhoek`→`monorepo` codename rename~~ — done 2026-05-17.
> Both tunnels now show as `monorepo-staging` and `monorepo-production` in
> the Cloudflare dashboard. Tunnel IDs and connector tokens are unchanged.

Per env, open the tunnel (Connectors → click `monorepo-{env}` → Edit →
**Published application routes** / Public Hostname) and add — `monorepo-staging`
shown, substitute the production hosts for `monorepo-production`:

- **Subdomain** `app.staging`, **Domain** `afframe.com`, **Path** (blank, catch-all), **Service** `HTTP localhost:3000` — the web app. Includes `/api/*` (Next.js native API routes: Better Auth, avatar upload, version, dev outbox).
- **Subdomain** `api.staging`, **Domain** `afframe.com`, **Path** (blank), **Service** `HTTP localhost:3001` — the public NestJS API (`api.afframe.com` in production). Same container; $0 infra.
- **Subdomain** `admin.staging`, **Domain** `afframe.com`, **Path** (blank), **Service** `HTTP localhost:3100` — the admin surface. This host MUST match the admin container's `BETTER_AUTH_URL`, which CDK reads from the `ADMIN_DOMAIN` variable (`admin-staging.afframe.com` for staging).

> ~~Path-prefix rule `app-staging.afframe.com /api/.*` → `localhost:3001`~~ —
> **REMOVED 2026-05-20**, both envs. The earlier topology mounted the
> public API at `app-staging.afframe.com/api/*` (shared host with the web
> app). After API moved to its own subdomain (`api-staging.afframe.com` /
> `api.afframe.com`), the path-prefix rule became actively harmful: it
> intercepted Next.js' native `/api/*` routes (Better Auth catch-all
> `apps/web/app/api/auth/[...all]/route.ts`, avatar upload
> `apps/web/app/api/upload/avatar/route.ts`, dev outbox, version) and
> shipped them to the NestJS api container, which only mounts
> `/api/health` + `/v1/*` and returns a NestJS-style 404 for everything
> else. Symptom: avatar upload "Could not upload your profile photo",
> 2FA "Cannot POST /api/auth/two-factor/enable", silent password-reset
> failures via Better Auth's `/api/auth/forgot-password`. Fix is a single
> click — delete the rule in the Cloudflare dashboard; cloudflared picks
> up the new config in seconds, no redeploy. Do NOT re-add this rule.

Production: same on `monorepo-production` with `app.afframe.com`,
`api.afframe.com`, and **`admin.afframe.com`** — note the production admin host
is `admin.afframe.com`, NOT `admin.app.afframe.com`. Admin is a distinct host,
not a subdomain of the web domain (`ADMIN_DOMAIN_PRODUCTION`).

**No Cloudflare Access on `admin.*` or `api.*`.** Cloudflare Access can only
filter by Cloudflare-visible identity (email, email domain, IdP groups) — it
has no knowledge of afframe `workspace_membership`, so it cannot express
"member of an allowlisted staff workspace." Staff are intentionally
cross-domain, so an email/domain Access policy would wrongly exclude valid
staff, and an allow-everyone policy is just a useless second login. Admin
access is controlled solely by the in-app workspace-allowlist gate
(`apps/admin/app/(gated)/layout.tsx` + `ADMIN_WORKSPACE_ALLOWLIST`); `api.*`
solely by API keys. (If bot-walling the admin surface is wanted later, use
Cloudflare WAF rate-limit rules — not Access.)

The tunnel connector runs as the `cloudflared` container inside the Fargate
task — a tunnel shows "DOWN"/"INACTIVE" in Cloudflare until that task is
running and its token matches.

> **Admin allowlist** — set the `ADMIN_WORKSPACE_ALLOWLIST` GitHub Actions
> variable (per environment) to a comma-separated list of `workspace` ids whose
> members may sign into admin. Unset ⇒ the gate denies everyone. Changing it is
> a redeploy. Staff workspaces are created manually; there is no admin role.

### 10. Flip the bootstrap flag

```bash
gh variable set AWS_BOOTSTRAPPED --body true --repo hlebtkachenko/monorepo
```

This unblocks `_deploy-aws.yml`.

## Deploys

**Deploys are manual-only by design.** Pushing to `main` does NOT auto-deploy. Every deploy is an explicit `gh workflow run` command. This is intentional: no surprise charges, no accidental prod pushes, full control over when AWS sees new code.

### Steady-state deploy (after main is updated)

After your PR merges to `main`, when you decide it's time to ship:

```bash
gh workflow run _deploy-aws.yml \
  -f environment=staging \
  -f stack=app-only \
  --repo hlebtkachenko/monorepo \
  --ref main
```

`app-only` skips Network + Data deploy. Use this for any change that's purely in code (`apps/**`, `packages/**`, app config). Takes ~8-12 min: image build + ECR push + CDK App stack update + ECS rolling deploy.

Watch progress:

```bash
RUN_ID=$(gh run list --workflow=_deploy-aws.yml --repo hlebtkachenko/monorepo --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --repo hlebtkachenko/monorepo
# Or open in browser:
gh run view "$RUN_ID" --web --repo hlebtkachenko/monorepo
```

Verify post-deploy:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://app-staging.afframe.com/
curl -s https://app-staging.afframe.com/api/health | jq '.'
```

### Retry a partially-failed deploy — use `gh run rerun --failed`

**Default:** when `_deploy-aws.yml` fails AFTER `build-images` succeeded (e.g. only the `deploy` job tripped a CFN race), use:

```bash
gh run rerun <run-id> --failed
```

NOT `gh workflow run` (which spawns a fresh run rebuilding all 3 images for ~5-6 min).

`--failed` re-runs only the failed jobs in place, reusing the successful `build-images` matrix outputs already in ECR. Inputs (`environment`, `stack`, `image_tag_override`, `force_rebuild_images`) are preserved from the original run.

**When to trigger a new run instead:**

- The failure root cause is upstream of `build-images` (e.g. a Dockerfile bug).
- A new commit landed on `main` and you want the latest code, not the previous attempt's images.
- ECR has a half-pushed image at the same SHA tag (`IMAGE_TAG_MUTABILITY: IMMUTABLE`) — either `--failed` reuses the existing valid image, or `aws ecr batch-delete-image` cleans it first.

**Anti-pattern:** Triggering a fresh `gh workflow run` after every `deploy`-job failure rebuilds all 3 images each time, eating ~5-6 min per attempt. Use `--failed` instead.

### When to use which `stack` value

| Stack value  | When to use                                                                     | Time       |
| ------------ | ------------------------------------------------------------------------------- | ---------- |
| `app-only`   | Code change in `apps/**` or `packages/**`. **Default for ~99% of deploys.**     | ~8-12 min  |
| `infra-only` | Change to `infra/cdk/lib/*-stack.ts` only (no app code change).                 | ~5-15 min  |
| `all`        | Both infra + app changes in the same release, OR first-time setup of a new env. | ~15-25 min |

### Deploy to production

Same workflow, `environment=production`:

```bash
gh workflow run _deploy-aws.yml \
  -f environment=production \
  -f stack=app-only \
  --repo hlebtkachenko/monorepo \
  --ref main
```

Production deploys use a SEPARATE OIDC role (`AWS_DEPLOY_ROLE_ARN_PRODUCTION` secret) and the `app.afframe.com` Cloudflare tunnel. Same code, separate runtime.

### Rollback (revert a bad deploy)

The deploy workflow tags images with the git SHA (`sha-<commit>`). To roll back, either:

**Option 1 - Re-deploy a previous good commit** (most surgical):

```bash
gh workflow run _deploy-aws.yml \
  -f environment=staging \
  -f stack=app-only \
  --repo hlebtkachenko/monorepo \
  --ref <previous-good-sha>
```

The `--ref` checks out that commit, the build uses its SHA tag, ECS rolls to the old image.

**Option 2 - Git revert the bad commit**, push the revert to main, then deploy:

```bash
git revert <bad-commit-sha>
git push origin main
gh workflow run _deploy-aws.yml -f environment=staging -f stack=app-only --repo hlebtkachenko/monorepo --ref main
```

**Option 3 - ECS circuit breaker** auto-rolls back if new tasks fail health checks during a deploy. No manual action needed in that case; just check CloudWatch logs to understand the failure.

### What blocks a deploy

The workflow short-circuits with `go=false` and exits success if `vars.AWS_BOOTSTRAPPED != "true"`. It is currently `true` (set 2026-05-11); check with `gh variable list`. To change it:

```bash
gh variable set AWS_BOOTSTRAPPED --body true --repo hlebtkachenko/monorepo
```

Set it back to `false` to put the entire deploy machinery on ice without removing AWS resources (e.g., during a security incident).

## Auth + email env wiring

The web container in the ECS task receives every runtime value needed by
Better Auth and `packages/email` automatically. Source of truth is
`infra/cdk/lib/app-stack.ts` (`webContainer` block).

| Var                           | Source                            | Notes                                                                          |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| `BETTER_AUTH_URL`             | CDK env (`https://${domain}`)     | Drives cookie scope + every email link                                         |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | CDK env                           | Same value, browser-visible                                                    |
| `BETTER_AUTH_TRUSTED_ORIGINS` | CDK env (CSV)                     | Add www / extra aliases here if Cloudflare adds them                           |
| `EMAIL_FROM`                  | CDK env (`no-reply@${domain}`)    | Must be on a Resend-verified domain                                            |
| `EMAIL_TRANSPORT`             | CDK env (`resend`)                | Pins the email backend                                                         |
| `BETTER_AUTH_SECRET`          | Secrets Manager (CDK-generated)   | `monorepo-{env}-better-auth-secret`                                            |
| `RESEND_API_KEY`              | Secrets Manager (workflow-seeded) | `monorepo-{env}-resend-api-key`, value comes from `gh secret RESEND_API_KEY`   |
| `DATABASE_URL`                | composed at container start       | `/bin/sh` builds it from DB_USER + DB_PASSWORD secrets + DB_HOST/PORT/NAME env |

Rotating `BETTER_AUTH_SECRET` invalidates every active session. Plan a
maintenance window before rotating. Invite / signup / login-email
tokens are opaque DB rows (`auth_token`, ADR-0022) and survive a
session-secret rotation — only the BA session cookie depends on this
secret.

## DNS - final wiring after first deploy

The Cloudflare Tunnel handles `app-staging.afframe.com` and `app.afframe.com` end-to-end. No CNAME at adm.tools to set; Cloudflare's Tunnel hostname config auto-creates a DNS record at Cloudflare DNS.

Verify:

```bash
dig +short app-staging.afframe.com
# Should show Cloudflare's edge IPs (104.x or 172.67.x)
```

## Health check

```bash
curl -i https://app-staging.afframe.com/api/version    # Next.js version endpoint
curl -i https://app-staging.afframe.com/api/health     # NestJS health endpoint
```

Both should return 200 with JSON.

## Monitoring after first deploy

Watch for 24h:

- **CloudWatch** → `/ecs/monorepo-staging/{web,api,cloudflared}` log groups for errors
- **CloudWatch** → ECS Cluster `monorepo-staging` → task count steady at 1
- **Cloudflare dashboard** → Zero Trust → Tunnels → connector status "Healthy"
- **Cost Explorer** → AWS daily spend tracks against ~$1.50/day target

## Rolling back

Bad deploy? Revert the git commit, push, the deploy workflow re-runs with previous image SHA. ECS circuit breaker auto-rolls if new tasks fail health checks.

Hard reset (delete app stack only, keep DB):

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text) \
APP_DOMAIN=app-staging.afframe.com \
pnpm --filter @workspace/cdk exec cdk destroy App-staging --context env=staging
```

## Follow-up: per-tenant role split (LANDED — pgbouncer dual-user)

The role split landed via Linear AFF-206. Web + admin authenticate to
pgbouncer as `app_user` (LOGIN, RLS applies); api stays on `app_owner`
direct via `DATABASE_DIRECT_URL` because pg-boss needs advisory locks +
LISTEN/NOTIFY (incompatible with pgbouncer transaction mode).

Pattern: option 2 — pgbouncer's `DATABASE_URLS=` (plural) comma-separated.
The edoburu entrypoint's `parse_urls` loop writes both credentials into
`/etc/pgbouncer/userlist.txt` and emits matching `[databases]` entries.
Both upstream URLs target the same RDS host:port:db; one pool, one
endpoint. CDK wiring lives in `infra/cdk/lib/app-stack.ts` (pgbouncer
container) + `infra/cdk/lib/data-stack.ts` (`appUserSecret`).

Pre-deploy steps (operator, via bastion):

1. After `cdk deploy Data-{env}` creates `monorepo-{env}-app-user-secret`,
   read its `password` field via `aws secretsmanager get-secret-value`.
2. On the bastion, set the `app_user` role password to match:
   ```sql
   ALTER ROLE app_user PASSWORD '<password-from-secret>';
   ```
3. Verify migration `0002_auth.sql` has run, which includes
   `GRANT app_admin TO app_user`. Without this, `withAdminBypass` fails.
4. Revert the staging-only `GRANT app_admin TO app_owner` workaround
   applied earlier (audit #4 mitigation): `REVOKE app_admin FROM app_owner;`.
   This is no longer required because runtime traffic no longer flows
   through `app_owner`.
5. Confirm no migration drift: `_app_migrations.checksum` for
   `0002_auth.sql` matches the file in this repo.

Other related notes:

- Bootstrap chain still runs as `app_owner` (CREATE SCHEMA openfga,
  openfga migrate, drizzle migrate). This continues to use the master
  credential — schema creation requires SUPERUSER-equivalent.
- Worker pg-boss queue still uses direct (port 5432) RDS access as
  `app_owner` via `DATABASE_DIRECT_URL`. Advisory locks + LISTEN/NOTIFY
  cannot tolerate transaction-mode pooling.
- Backup task (BackupStack) keeps `app_owner` direct — `pg_dumpall`
  globals + role definitions need master.

## Bootstrap chain: schemas + openfga model (manual one-time)

Before the first `cdk deploy App-{env}` lands real app containers, the operator
must seed three things in the freshly-created RDS instance: the `openfga`
schema, the OpenFGA migration history, and the OpenFGA store + authorization
model. The `app` schema for application tables (drizzle migrations) is the
fourth step. All four run as `app_owner` (the RDS master credential) via a
temporary bastion / port-forward — there is no in-cluster bootstrap task yet
(see "Drizzle migration ECS task" in deferred work below).

This chain ships once per env. Re-runs are safe but produce a fresh
`authorization_model_id` and SSM-write it (per `infra/openfga/README.md`).

### 1. Open a tunnel to RDS

The RDS instance is in private subnets. The simplest path is a SSM Session
Manager tunnel through any task in the cluster, or an SSH bastion. Either way
the operator ends with a local port forward to `5432` on RDS:

```bash
# Substitute the actual RDS endpoint + a free local port.
aws rds describe-db-instances \
  --db-instance-identifier monorepo-{env} \
  --query 'DBInstances[0].Endpoint.Address' --output text
# → e.g. monorepo-staging.xxxx.eu-central-1.rds.amazonaws.com

# Open a forward. Operator picks transport (SSM, SSH bastion, EC2 tunnel).
# Forward localhost:55432 → <rds-endpoint>:5432.
```

Fetch the `app_owner` password from Secrets Manager:

```bash
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id /monorepo/{env}/rds/master \
  --query SecretString --output text | jq -r .password)
```

### 2. Create the `openfga` schema

```bash
psql "postgres://app_owner:${DB_PASSWORD}@localhost:55432/monorepo" \
  -c 'CREATE SCHEMA IF NOT EXISTS openfga AUTHORIZATION app_owner;'
```

Idempotent — safe to re-run.

### 3. Run `openfga migrate`

```bash
docker run --rm --network host \
  openfga/openfga:v1.15.1 \
  migrate \
    --datastore-engine postgres \
    --datastore-uri "postgres://app_owner:${DB_PASSWORD}@localhost:55432/monorepo?search_path=openfga"
```

Pin the OpenFGA image to the SAME tag deployed in the task definition
(`infra/cdk/lib/app-stack.ts` — currently `v1.15.1`) so the schema version
matches what the running server will expect.

### 4. Boot a TEMPORARY OpenFGA server + run bootstrap.mjs

This step MUST happen BEFORE the first `cdk deploy App-{env}`. CDK references
SSM parameters `/monorepo/{env}/openfga/{store-id,model-id}` via
`StringParameter.fromStringParameterName`, which resolves at deploy time —
if the parameters do not exist, the deploy fails. There is no chicken-and-egg
in the chain because we boot OpenFGA LOCALLY in docker (still pointed at the
real RDS via the same port-forward) just long enough to populate the store
and write SSM.

```bash
# Boot a throwaway OpenFGA server pointing at the migrated RDS schema.
# Background; we'll stop it after bootstrap.mjs returns.
docker run --rm -d --name openfga-bootstrap --network host \
  -e OPENFGA_DATASTORE_ENGINE=postgres \
  -e OPENFGA_DATASTORE_URI="postgres://app_owner:${DB_PASSWORD}@localhost:55432/monorepo?search_path=openfga&sslmode=disable" \
  -e OPENFGA_HTTP_ADDR="127.0.0.1:8080" \
  openfga/openfga:v1.15.1 run

# Wait for /healthz to come up (grpc_health_probe ships in the image).
docker exec openfga-bootstrap /usr/local/bin/grpc_health_probe -addr=127.0.0.1:8081

# Populate SSM (creates the store, writes the auth model, sets
# /monorepo/{env}/openfga/store-id + model-id under your AWS profile).
AWS_REGION=eu-central-1 \
OPENFGA_API_URL=http://localhost:8080 \
node infra/openfga/bootstrap.mjs --env {env}

docker stop openfga-bootstrap
```

`bootstrap.mjs` is idempotent: it looks up the store by name and reuses it.
Each run writes a fresh authorization model and overwrites the SSM parameter
`/monorepo/{env}/openfga/model-id`. The api container reads this parameter at
boot, so a deploy following a bootstrap re-run picks up the new model ID
automatically.

### 5. Run schema migrations for the `app` schema

The application tables (organizations, users, audit log, etc.) live in the
`app` schema and are managed by drizzle. Until the in-cluster migration ECS
task ships, this runs through the same tunnel:

```bash
DATABASE_URL="postgres://app_owner:${DB_PASSWORD}@localhost:55432/monorepo" \
pnpm db:migrate
```

The `pnpm db:migrate` script lives in `packages/db` and applies all pending
drizzle migrations under `packages/db/migrations/`. Re-running against an
already-current database is a no-op. Once `packages/db/src/migrate.ts` plus
the migration ECS task land, this manual step folds into the CDK pipeline.

### 6. Tear down the tunnel

Close the port forward / SSH session. Subsequent app deploys read RDS through
the task-local pgBouncer sidecar as designed — the operator credentials are
no longer required at runtime.

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
- Drizzle migration ECS task (**LANDED 2026-05-20**) — `_deploy-aws.yml`'s "Apply DB migrations via one-off ECS task" step calls `infra/scripts/apply-migrations-via-ecs.sh`, which uploads `packages/db/migrations/*.sql` to the Backup S3 bucket, presigns them, and runs the Backup TaskDef with an overridden command that fetches + applies each in order (journaling to `_app_migrations`). Replaces the operator-driven bastion `pnpm db:migrate` step described earlier. Re-runs are no-ops; failure prints the full task log and aborts the deploy before `cdk deploy App-*`.
- Workers / Upstash Redis (deferred)
- ALB + ACM cert (replaced by Cloudflare Tunnel)
- Status page / uptime monitoring — `status.afframe.com` runs OpenStatus on the OVH VPS, **not AWS**, and is not part of any `cdk deploy` / `_deploy-aws.yml` run. See `docs/runbooks/STATUS-PAGE.md` and `docs/adr/0019-status-page-and-uptime-monitoring.md`.
