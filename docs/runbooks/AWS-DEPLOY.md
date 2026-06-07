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
    ├── admin (Next.js :3100)                      │
    ├── pgbouncer                                  │
    ├── cerbos                                     │
    ├── openfga                                    │
    └── cloudflared sidecar                        │
    │                                              │
    │ Postgres                                     │ MX records
    ▼                                              ▼
AWS RDS Postgres 18 (isolated subnet)        Cloudflare Email Routing
                                                    │
                                                    └─→ EMAIL_FORWARD_TO secret
```

Email outbound flows via Resend (SES is off the table — production access denied). Logs flow to CloudWatch (ECS infra) and Grafana Cloud free (app).

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

`RESEND_API_KEY` is stored in Vault (`platform/{env}/resend-api-key`,
source of truth) and mirrored to AWS SSM SecureString
(`/monorepo/{env}/resend-api-key`) by the `vault-to-ssm-sync` timer; the
AppStack web/api/admin containers read it via `EcsSecret.fromSsmParameter`.
The deploy workflow no longer touches the value (M4/M6). Rotation:
`vault kv put platform/{env}/resend-api-key value=<new>` — see
[`SECRETS-ROTATION.md`](SECRETS-ROTATION.md).

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

### 8. AWS SES — NOT PURSUED (production access denied; Resend is the permanent transactional provider)

> **Historical note — steps below are no longer applicable.** AWS SES production access was denied (sandbox capped at 200/day to verified addresses only). Resend is the permanent transactional email provider for all environments. The steps below are kept for reference only; do not execute them.

```bash
# NOT APPLICABLE — kept for historical reference only
# aws ses verify-domain-identity --domain afframe.com --region eu-central-1
# aws ses verify-domain-dkim --domain afframe.com --region eu-central-1
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

`app-only` skips Network + Data deploy. Use this for any change that's purely in code (`apps/**`, `packages/**`, app config). Takes ~6-10 min: image build + ECR push + CDK App stack update + ECS rolling deploy.

#### Deploy mode — vanilla CloudFormation, both envs

Both staging and production run vanilla `cdk deploy` (no `--hotswap`). Full CFN change set, drift detection intact, audit trail in CloudTrail, identical code path across envs.

Staging used to run `--hotswap-fallback` to shave ~150s off app-only deploys, but it was removed (2026-06-01): hotswap left staging's CFN state stale vs live resources, and its direct-API path forwarded CloudFormation's reserved `aws:cloudformation:*` tags to the CloudWatch API on any Observability dashboard/alarm change, which AWS rejects (`aws: prefixed tag key names are not allowed for external use`) — wedging every Observability deploy on staging. The ~150s was not worth a class of staging-only failures.

#### Deploys are power-state safe (auto-resume RDS)

A deploy no longer needs the env to be running first. The deploy job's **"Ensure RDS is available (auto-resume)"** step starts a cold-paused RDS instance and waits for `available` before migrations + the ECS rollout, so deploying into a cold-paused (or still-resuming) env just works. This removed the failure mode where a deploy fired concurrently with `power.yml resume` hung the ECS health gate for the full CFN timeout (App-production wedged ~40 min, incident 2026-06-01). The step is a ~1s no-op when RDS is already available. It does **not** scale Fargate (CDK owns `desiredCount`) and does **not** touch the sleeping page. To re-park after a deploy, run `power.yml … action=cold-pause` as a separate step.

#### Audited replace-guard overrides

The production replace-guard refuses a deploy that would `[~] replace` or `[+] create` a stateful resource type (RDS / S3 / KMS / Secret / IAM Role|User / DynamoDB / EFS) unless the head commit message carries `[allow-replace]`. The guard intentionally flags a `[+] AWS::IAM::Role` because a typo'd construct-id rename of an existing role appears as a create + orphan. Overrides used so far (each audited with `cdk diff --method=change-set` first):

- **2026-06-01 — v0.2.5 rollout.** First deploy of the env-power AutoStop Lambda to production creates a genuinely new `AWS::IAM::Role` (`AutoStopFn/ServiceRole`), and the cost-guard budgets' deterministic name-hash rewrite re-creates the three `AWS::Budgets::Budget` resources (CREATE new + DELETE old, no data). No stateful data is replaced. `[allow-replace]`

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

**Default:** when `_deploy-aws.yml` fails AFTER `build-images` succeeded (e.g. only the `deploy` job tripped a CFN race, or only `smoke` flapped), use:

```bash
gh run rerun <run-id> --failed
```

NOT `gh workflow run` (which spawns a fresh run rebuilding all 3 images for ~5-6 min).

`--failed` re-runs only the failed jobs in place, reusing the successful `build-images` matrix outputs already in ECR. Inputs (`environment`, `stack`, `image_tag_override`, `force_rebuild_images`) are preserved from the original run.

Common failure-only rerun scenarios:

| Failed job(s)          | `--failed` rerun does                             | Wall time  |
| ---------------------- | ------------------------------------------------- | ---------- |
| `smoke` only           | Reruns smoke (and rollback step if it fires) only | ~3 min     |
| `deploy` only          | Reruns CDK deploy + everything after              | ~10-15 min |
| `validate-inputs` only | Reruns one fast guard step                        | <1 min     |
| `build-images` matrix  | Reruns only the failed image build                | ~5 min     |

**When to trigger a new run instead:**

- The failure root cause is upstream of `build-images` (e.g. a Dockerfile bug).
- A new commit landed on `main` and you want the latest code, not the previous attempt's images.
- ECR has a half-pushed image at the same SHA tag (`IMAGE_TAG_MUTABILITY: IMMUTABLE`) — either `--failed` reuses the existing valid image, or `aws ecr batch-delete-image` cleans it first.
- The smoke job auto-rolled the service back. The previous task-def is now live; if you want the rolled-back-to revision to be the steady-state, no action needed. If you want the NEW code back, fix the actual cause first then run a fresh deploy.

**Anti-pattern:** Triggering a fresh `gh workflow run` after every `deploy`-job failure rebuilds all 3 images each time, eating ~5-6 min per attempt. Use `--failed` instead.

### Smoke probe failure — root-cause first

The `smoke` job (post-deploy) probes URLs through Cloudflare Tunnel. Each probed endpoint MUST exist in the build — a probe of a non-existent route 404s forever and trips rollback on every deploy (lived experience: 2026-05-20, `/api/auth/me` was probed but Better Auth exposes only catch-all routes at `[...all]/route.ts`).

Preflight `workflow-lint / shellcheck` runs `infra/scripts/tests/test-smoke-routes-exist.sh` which asserts every URL the smoke step probes maps to a real `apps/<web|admin>/app/**/route.ts` (handles Next.js catch-alls). Adding or changing a smoke probe? Verify the test still passes locally before pushing:

```bash
bash infra/scripts/tests/test-smoke-routes-exist.sh
```

When smoke fails on a real deploy, look at the job log for the per-attempt status:

```
smoke: try=N  version=<code> admin-health=<code> auth-session=<code>
```

A consistent non-2xx on one column points at the broken endpoint. If all columns are 2xx and the job still failed, the bug is in the assertion, not the deploy.

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

#### Production deploy approval gate

The `deploy` job in `_deploy-aws.yml` references `environment: ${{ inputs.environment }}`. For production this resolves to the `production` GitHub Environment, which has a deployment-protection-rule requiring a human reviewer before the `deploy` job starts. Staging has no such rule, so it flows through.

Lifecycle of a production deploy:

1. Operator triggers `_deploy-aws.yml -f environment=production` (CLI or repo Actions tab).
2. `guard` + `validate-inputs` + `detect-changes` + `build-images` all run normally.
3. `deploy` enters **"Waiting for review"** in the GitHub Actions UI.
4. Approver opens the run, clicks "Review deployments", selects `production`, approves.
5. `deploy` proceeds; `smoke` runs after; if smoke fails the rollback step fires.

One-time operator setup of the protection rule (run from a machine with `gh` configured):

```bash
# Get your own user id once
HLEB_ID=$(gh api user --jq .id)

# Configure the protection rule
gh api -X PUT "/repos/hlebtkachenko/monorepo/environments/production" \
  -f wait_timer=0 \
  -F prevent_self_review=false \
  -F deployment_branch_policy='{"protected_branches":true,"custom_branch_policies":false}'

gh api -X PUT "/repos/hlebtkachenko/monorepo/environments/production/deployment-protection-rules" \
  --input - <<JSON
{ "reviewers": [ { "type": "User", "id": $HLEB_ID } ] }
JSON
```

Sanity check the deploy role's `MaxSessionDuration` is at least 3600 (the workflow asks for that on every STS assume):

```bash
aws iam get-role --role-name <prod-deploy-role-name> --query Role.MaxSessionDuration
# If 3600: leave as is. If you want more headroom on long deploys:
# aws iam update-role --role-name <prod-deploy-role-name> --max-session-duration 7200
```

Remove the protection rule (rare; e.g. switching to a deploy bot):

```bash
gh api /repos/hlebtkachenko/monorepo/environments/production/deployment-protection-rules \
  --jq '.custom_deployment_protection_rules[].id' \
  | xargs -I {} gh api -X DELETE "/repos/hlebtkachenko/monorepo/environments/production/deployment-protection-rules/{}"
```

#### Staging deploy-branch policy

Staging environment is also gated by a deployment-branch-policy. Default allowed branches: `main` only. Any deploy triggered with `--ref <other-branch>` fails immediately at `validate-inputs` with:

> Branch "X" is not allowed to deploy to staging due to environment protection rules.

The `verify/*` pattern is permanently allowed so the F4 negative test (broken-container deploy → smoke rollback) can run without touching policy:

```bash
# One-time setup, already done:
gh api -X POST /repos/hlebtkachenko/monorepo/environments/staging/deployment-branch-policies \
  -f name='verify/*' -f type=branch
```

Branch convention: any local branch you intend to deploy to staging without merging to main MUST be prefixed `verify/` (e.g. `verify/m2-broken-container`). Any other prefix gets rejected.

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

### Migration rollback recovery

The smoke-failure auto-rollback (workflow's "Roll back ECS service to last-known-good task-definition" step) **refuses to run when migrations were applied this deploy**. Rolling ECS back to the previous task def would put the OLD container image (old code) in front of NEW schema. Reads/writes against new columns or migrated row shapes would either crash (column does not exist on the OLD code's expectations) or silently corrupt data.

When you see `::error::smoke failed AND migrations were applied this deploy`:

1. **Inspect what landed.** Read `_app_migrations` directly — use Drizzle Studio against `DATABASE_DIRECT_URL`, or run the migration ECS task with an overridden command. No bastion exists; there is no tunnel-to-RDS step in this runbook.

   ```sql
   SELECT filename, applied_at
   FROM _app_migrations
   ORDER BY applied_at DESC
   LIMIT 10;
   ```

   Cross-reference with `packages/db/migrations/` at the failed deploy's commit.

2. **Decide forward-fix vs PITR.**
   - **Forward-fix (default):** smoke probably failed on a code-side bug. Fix the code in a new commit, push, deploy again. The fresh deploy's migrate step is a no-op (journal already populated), ECS rolls forward to the corrected image.
   - **PITR + manual task-def revert:** only when the migration itself is destructive AND the new code is unrecoverable. PITR restores RDS to a point before the migration; you then manually `aws ecs update-service --task-definition <previous-rev>`. **This is a last resort** — it loses everything written since the migration applied. The runbook author's preferred order: forward-fix → forward-fix → PITR.

3. **Never** `aws ecs update-service --task-definition <previous-rev>` without confirming the schema is backward-compatible with that revision's image. Check `_app_migrations` against `packages/db/migrations/` at the previous deploy's SHA.

To keep this gate sharp: write destructive migrations (DROP TABLE, DROP COLUMN, NOT NULL on an existing column without default, type change that loses range) only when the deploy can be paused for human review. The expand/contract pattern (add new column, dual-write, switch reads, then drop old) makes auto-rollback safe again at the cost of two deploys per schema change.

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

| Var                           | Source                               | Notes                                                                                                                                                                  |
| ----------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`             | CDK env (`https://${domain}`)        | Drives cookie scope + every email link                                                                                                                                 |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | CDK env                              | Same value, browser-visible                                                                                                                                            |
| `BETTER_AUTH_TRUSTED_ORIGINS` | CDK env (CSV)                        | Add www / extra aliases here if Cloudflare adds them                                                                                                                   |
| `EMAIL_FROM`                  | CDK env (`no-reply@${domain}`)       | Must be on a Resend-verified domain                                                                                                                                    |
| `EMAIL_TRANSPORT`             | CDK env (`resend`)                   | Pins the email backend                                                                                                                                                 |
| `BETTER_AUTH_SECRET`          | SSM SecureString (synced from Vault) | `/monorepo/{env}/better-auth-secret`; source of truth `platform/{env}/better-auth-secret` in Vault. ECS reads via `EcsSecret.fromSsmParameter`.                        |
| `RESEND_API_KEY`              | SSM SecureString (synced from Vault) | `/monorepo/{env}/resend-api-key`; source of truth in Vault. The deploy workflow no longer touches this value (M4/M6).                                                  |
| `TUNNEL_TOKEN`                | SSM SecureString                     | `/monorepo/{env}/cloudflare-tunnel-token`; deploy workflow puts the `gh secret CLOUDFLARE_TUNNEL_TOKEN_{ENV}` value to SSM (does not transit Vault — chicken-and-egg). |
| `DATABASE_URL`                | composed at container start          | `/bin/sh` builds it from DB_USER + DB_PASSWORD secrets (RDS, AWS Secrets Manager) + DB_HOST/PORT/NAME env                                                              |

Rotating `BETTER_AUTH_SECRET` invalidates every active session. Plan a
maintenance window before rotating. Invite / signup / login-email
tokens are opaque DB rows (`auth_token`, ADR-0022) and survive a
session-secret rotation — only the BA session cookie depends on this
secret. Rotation procedure (Vault `kv put` → SSM sync → ECS rolling
restart): [`SECRETS-ROTATION.md`](SECRETS-ROTATION.md).

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

## Bootstrap chain: schemas + openfga model (automated)

All four bootstrap steps run as **init containers** inside App-{env}'s ECS task on every cold start. No operator action, no bastion, no port-forward.

| Step                                                                       | Init container      | Source                                                                           |
| -------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------- |
| 1. Drizzle migrations + `app_user` role password + create `openfga` schema | `db-migrate`        | `infra/Dockerfile.migrate` + `infra/scripts/apply-migrations-init.sh` (PR K)     |
| 2. `openfga migrate` (goose tables)                                        | `openfga-migrate`   | upstream `openfga/openfga:v1.15.1` (PR K)                                        |
| 3. OpenFGA store + authorization model + SSM write                         | `openfga-bootstrap` | `infra/Dockerfile.openfga-bootstrap` + `infra/scripts/openfga-bootstrap-init.sh` |
| 4. (n/a — folded into step 1)                                              |                     |                                                                                  |

Container dependency chain: `db-migrate` → `openfga-migrate` → `openfga-bootstrap` → essential containers (`api` waits explicitly for `openfga-bootstrap` SUCCESS so its `EcsSecret.fromSsmParameter` resolves to the freshly-written values, not stale ones).

All three init containers are idempotent. Re-runs:

- `db-migrate`: journal `_app_migrations` skips already-applied files.
- `openfga-migrate`: goose schema migrations skip up-to-date schema.
- `openfga-bootstrap`: store reused by name; new `model_id` written; SSM overwritten. The api container reads SSM at every cold start, so the new model_id is picked up automatically.

Required SSM parameters (`/monorepo/{env}/openfga/store-id`, `/monorepo/{env}/openfga/model-id`) must EXIST at `cdk deploy` time because `StringParameter.fromStringParameterName` resolves at synth/deploy. For first-ever deploys the operator seeds them with placeholder strings (`placeholder-bootstrap-after-first-deploy`); the `openfga-bootstrap` init container replaces them with real UUIDs on the first task cold start of that deploy.

### Seeding the SSM placeholders on a brand-new env (one-time per env)

```bash
AWS_REGION=eu-central-1
ENV=production  # or staging, or whatever new env you're spinning up
aws ssm put-parameter --name "/monorepo/${ENV}/openfga/store-id" \
  --value "placeholder-bootstrap-after-first-deploy" \
  --type String --region "$AWS_REGION"
aws ssm put-parameter --name "/monorepo/${ENV}/openfga/model-id" \
  --value "placeholder-bootstrap-after-first-deploy" \
  --type String --region "$AWS_REGION"
```

Then `cdk deploy App-{env}` proceeds normally. The init container fixes the values on the first task start.

### Forcing a model_id rotation (when the FGA model.fga changes)

The init container runs on every task cold start and rewrites the model. To force a rotation without a code change, force-deploy:

```bash
aws ecs update-service --cluster monorepo-{env} \
  --service $(aws ecs list-services --cluster monorepo-{env} --region eu-central-1 \
    --query 'serviceArns[0]' --output text | awk -F/ '{print $NF}') \
  --force-new-deployment --region eu-central-1
```

### Manual bootstrap (escape hatch only)

If the init container chain is wedged and you need to bootstrap manually from a laptop, you'd need (a) network access to the RDS instance (no bastion exists today) and (b) the openfga binary + `node bootstrap.mjs` toolchain locally. The prior version of this section described that flow; it has been removed because the in-cluster automation supersedes it. Resurrect from git history if ever needed.

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
