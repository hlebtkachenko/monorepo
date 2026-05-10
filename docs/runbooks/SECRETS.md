# Secrets and Variables Convention

## Decision matrix

| Value | Type | Where | Why |
|-------|------|-------|-----|
| `AWS_REGION` | repo `vars` | repository | static, non-sensitive |
| `AWS_ACCOUNT_ID_STAGING`, `AWS_ACCOUNT_ID_PRODUCTION` | repo `vars` | repository | non-sensitive, OK in logs |
| `AWS_DEPLOY_ROLE_ARN_STAGING`, `AWS_DEPLOY_ROLE_ARN_PRODUCTION` | repo `vars` | repository | non-sensitive; trust policy gates the actual access |
| `AWS_BOOTSTRAPPED` | repo `vars` | repository | boolean flag, gates AWS-touching workflows |
| Cosign signing | none | n/a | keyless OIDC via Sigstore; no secret stored |
| Sentry DSN | environment `secrets` | `staging`, `production` | per-env DSN; isolation |
| Honeycomb API key | environment `secrets` | `staging`, `production` | per-env writer key |
| Stripe / payment processor secret keys (future) | AWS Secrets Manager | runtime, not GitHub | rotated, never in CI |
| GitHub App private key (future cross-repo automation) | org `secrets` | org-level | one source for many repos |

## Forbidden

- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — never. OIDC only.
- Classic personal access tokens (PATs) — use a GitHub App with installation-scoped tokens.
- Any `.env` file checked into the repo. `.gitignore` forbids; gitleaks job catches it.
- Secrets baked into Docker images. Never. Build args are visible in the image manifest.

## GitHub environments

Two environments must exist on the repo. Create at start of bootstrap (does not need AWS).

| Environment | Required reviewers | Wait timer | Branch policy |
|-------------|--------------------|-----------|----------------|
| `staging` | 0 (auto-deploy) | 0 | `main` only |
| `production` | 1 (Hleb for now) | 5 minutes | `main` only |

```bash
gh api -X PUT repos/hlebtkachenko/monorepo/environments/staging
gh api -X PUT repos/hlebtkachenko/monorepo/environments/production \
  -f wait_timer=300 \
  -F reviewers='[{"type":"User","id":<TBD-numeric-user-id>}]' \
  -F deployment_branch_policy='{"protected_branches":true,"custom_branch_policies":false}'
```

Get your numeric user id with `gh api user --jq .id`.

## Setting repo vars (post-bootstrap)

```bash
gh variable set AWS_REGION                       --body eu-central-1
gh variable set AWS_ACCOUNT_ID_STAGING           --body <TBD-staging-account-id>
gh variable set AWS_ACCOUNT_ID_PRODUCTION        --body <TBD-production-account-id>
gh variable set AWS_DEPLOY_ROLE_ARN_STAGING      --body <TBD-staging-deploy-role-arn>
gh variable set AWS_DEPLOY_ROLE_ARN_PRODUCTION   --body <TBD-production-deploy-role-arn>
gh variable set AWS_BOOTSTRAPPED                 --body true
```

## Setting environment secrets

```bash
gh secret set SENTRY_DSN     --env staging --body <TBD-staging-sentry-dsn>
gh secret set SENTRY_DSN     --env production --body <TBD-production-sentry-dsn>
gh secret set HONEYCOMB_KEY  --env staging --body <TBD-staging-honeycomb-key>
gh secret set HONEYCOMB_KEY  --env production --body <TBD-production-honeycomb-key>
```

## Reading vars and secrets in workflows

```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN_STAGING }}
    aws-region: ${{ vars.AWS_REGION }}
```

Never `${{ secrets.AWS_DEPLOY_ROLE_ARN_STAGING }}` — that is a category error. Role ARNs are not secret.

## Rotation cadence

| Secret class | Cadence |
|--------------|---------|
| Sentry DSN, Honeycomb keys | annual, or on suspected leak |
| AWS Secrets Manager runtime creds | 90 days, automated via Lambda |
| KMS CMKs | annual rotation enabled at key creation |
| GitHub App private keys | 12 months |
| Cosign | n/a (keyless) |

## Break-glass procedure

For emergency access when normal Identity Center login is unavailable (e.g. SAML provider outage, locked-out admin):

1. Sealed envelope in the office safe contains:
   - Root account credentials.
   - Backup MFA codes.
2. Two-person rule when a second human is available.
3. Document use immediately in incident channel `#inc-YYYYMMDD-<slug>`.
4. Replace credentials and rotate MFA within 24 hours of use.

**Solo dev caveat**: Hleb is the sole approver right now. Two-person rule is aspirational until a second admin exists. The risk is documented; mitigation is to keep the envelope physically in a separate location from primary devices.
