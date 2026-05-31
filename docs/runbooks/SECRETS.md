# Secrets and Variables Convention

> **As-built 2026-05-31 (M8).** App-runtime secrets live in HashiCorp Vault
> on the Hostinger KVM 2 VPS (source of truth) and are mirrored to AWS SSM
> SecureString every 5 minutes by a systemd timer; ECS reads SSM at task
> start. **New here? Start at [`SECRETS-ADD-DELETE.md`](SECRETS-ADD-DELETE.md)**
> — the add / change / delete / scope-a-teammate entrypoint. Day-to-day
> Vault operations: [`VAULT-OPS.md`](VAULT-OPS.md). Rotation recipes:
> [`SECRETS-ROTATION.md`](SECRETS-ROTATION.md). Plan + milestone history:
> [`docs/plans/SECRETS-MIGRATION.md`](../plans/SECRETS-MIGRATION.md).
>
> **Three storage tiers, by purpose:**
>
> 1. **Vault → SSM SecureString** — app-runtime secrets (`BETTER_AUTH_SECRET`,
>    `RESEND_API_KEY`, `CLOUDFLARE_TUNNEL_TOKEN`). Vault is authoritative.
> 2. **AWS Secrets Manager** — RDS-managed credentials only (`DbSecret`,
>    `AppUserSecret`). These stay in SM: they are RDS-native, rotated by
>    AWS, never transit Vault. Dynamic DB secrets are deferred to AFF-243.
> 3. **GitHub Actions secrets / vars** — CI/CD identity + config
>    (`AWS_DEPLOY_ROLE_ARN_*`, `CLOUDFLARE_TUNNEL_TOKEN_*` for the deploy
>    bootstrap, `EMAIL_FORWARD_TO`, etc.). `LINEAR_API_KEY` migrated to
>    Vault-via-OIDC (M5); see [`VAULT-OPS.md`](VAULT-OPS.md) § JWT auth.

## Decision matrix

| Value                                                             | Type                                 | Where                                                             | Why                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AWS_REGION`                                                      | repo `vars`                          | repository                                                        | static, non-sensitive                                                                                                                                                                                                                                                          |
| `AWS_ACCOUNT_ID`                                                  | repo `secrets`                       | repository                                                        | single-account MVP (ADR-0007); stored as secret to keep account ID out of logs                                                                                                                                                                                                 |
| `AWS_DEPLOY_ROLE_ARN_STAGING`, `AWS_DEPLOY_ROLE_ARN_PRODUCTION`   | repo `secrets`                       | repository                                                        | contain account ID; trust policy gates the actual access                                                                                                                                                                                                                       |
| `AWS_BOOTSTRAPPED`                                                | repo `vars`                          | repository                                                        | boolean flag, gates AWS-touching workflows                                                                                                                                                                                                                                     |
| `OPENSTATUS_*` (5) + `OVH_VPS_SSH_KEY` + `OVH_VPS_HOST_KEY`       | repo `secrets`                       | repository                                                        | OpenStatus stack + VPS deploy path. Status page is off-AWS (ADR-0019) so these do not live in AWS Secrets Manager. Rendered into `/opt/openstatus/.env.docker` by `deploy-statuspage.yml`. See [`infra/openstatus/deploy/README.md`](../../infra/openstatus/deploy/README.md). |
| `OVH_VPS_HOST` / `OVH_VPS_PORT` / `OVH_VPS_USER`                  | repo `vars`                          | repository                                                        | non-secret deploy coordinates                                                                                                                                                                                                                                                  |
| Cosign signing                                                    | none                                 | n/a                                                               | keyless OIDC via Sigstore; no secret stored                                                                                                                                                                                                                                    |
| Sentry DSN                                                        | environment `secrets`                | `staging`, `production`                                           | per-env DSN; isolation                                                                                                                                                                                                                                                         |
| Honeycomb API key                                                 | environment `secrets`                | `staging`, `production`                                           | per-env writer key                                                                                                                                                                                                                                                             |
| `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `CLOUDFLARE_TUNNEL_TOKEN` | Vault (KV-v2) → AWS SSM SecureString | `platform/{env}/<name>` in Vault; `/monorepo/{env}/<name>` in SSM | app-runtime secrets. Vault = source of truth; SSM = read cache for ECS (`EcsSecret.fromSsmParameter`). Sync timer every 5 min. Rotate via `vault kv put`.                                                                                                                      |
| `DbSecret`, `AppUserSecret` (RDS credentials)                     | AWS Secrets Manager                  | runtime, not GitHub                                               | RDS-native, AWS-rotated, never transit Vault. Dynamic DB secrets deferred → AFF-243                                                                                                                                                                                            |
| Payment processor secret keys (deferred — no payments yet)        | Vault (KV-v2) → SSM                  | runtime, not GitHub                                               | rotate quarterly when introduced; same Vault→SSM path as other app secrets                                                                                                                                                                                                     |
| GitHub App private key (future cross-repo automation)             | org `secrets`                        | org-level                                                         | one source for many repos                                                                                                                                                                                                                                                      |

## Why not put everything in Vault?

A fair question, and the framing matters: **there is exactly one source of
truth for application secrets — Vault.** The other stores in the matrix
above are not competing sources of truth. They are either a different
_category_ of secret that structurally cannot or should not live in Vault,
or a runtime _cache_. Each boundary exists for a concrete reason, not by
accident.

### 1. Bootstrap secrets — cannot live in Vault by definition (chicken-and-egg)

Vault is only reachable _through_ things that themselves require secrets:

- The **Cloudflare tunnel token** that exposes `secrets-admin.afframe.com`
  is needed to _reach_ Vault — so it cannot be _stored in_ Vault.
- The **`vault-unseal-vps` AWS keys** that let Vault auto-unseal via KMS
  are needed before Vault is usable — Vault is sealed (inert) until they
  work, so they cannot be inside Vault.

These live in the VPS `/srv/secrets/vault/.env` (+ the GitHub deploy
bootstrap). Storing them in Vault would be locking the only key inside the
box it opens.

### 2. CI/CD bootstrap identity — the runner has no Vault access until it uses them

A fresh GitHub Actions runner starts with nothing. To reach Vault it needs
the **CF Access service token** (`CF_ACCESS_CLIENT_ID/SECRET`); to reach
AWS it needs the **deploy role ARN** (via OIDC). Those are the bootstrap
identity — they must be GitHub repo secrets because that is the only thing
the runner can read _before_ it has authenticated to anything.

`LINEAR_API_KEY` proves the model works once you are _past_ bootstrap: it
moved INTO Vault and is fetched via GitHub OIDC → Vault JWT at run time
(M5). Bootstrap credentials are exactly the ones that cannot make that
jump, because they are what authenticates the jump.

### 3. RDS credentials — AWS Secrets Manager is the better native home

`DbSecret` / `AppUserSecret` stay in AWS Secrets Manager because SM + RDS
have **native rotation**: AWS rotates the database password on a schedule
with no application code. The _correct_ way to put DB credentials in Vault
is **dynamic secrets** (Vault mints short-lived per-session DB users on
demand) — that is deferred to [AFF-243](https://linear.app/hapddev/issue/AFF-243)
because it only pays off at team scale. Until then, SM is the lower-risk
home; hand-rolling static-credential rotation in Vault would be strictly
worse than what AWS gives for free.

### 4. AWS SSM — a runtime cache, NOT a source of truth

This is the distinction that makes "4 stores" misleading. SSM owns no
secret. It is a 5-minute mirror of Vault (`vault-to-ssm-sync` timer). ECS
reads SSM instead of Vault directly because:

- **Decoupling**: if the VPS Vault is down, the last-synced SSM values
  still boot the app. Application uptime does not depend on Vault uptime.
- **No cross-cloud dependency in the boot path**: having every ECS task
  reach a VPS-hosted Vault at start-up would put a fragile
  Cloudflare-tunnel hop on the critical path. SSM is AWS-native,
  same-region, IAM-gated.
- **Zero extra infra**: `EcsSecret.fromSsmParameter` is built into CDK.

### The mental model

```
              ONE source of truth (application secrets)
                            Vault  (Hostinger KVM 2 VPS)
                              │ syncs every 5 min
                              ▼
                        SSM (cache) ──→ ECS        ← a mirror, not a source

   Bootstrap (cannot be in Vault)        RDS creds (better native home)
   GitHub secrets + VPS .env             AWS Secrets Manager
```

A single-store design would have to either lock Vault's own unseal/tunnel
keys inside Vault (impossible) or discard AWS-native RDS rotation (worse).
The split is deliberate: one source of truth for app secrets, one cache to
decouple uptime, and two categories that have correct homes elsewhere for
structural reasons.

## Forbidden

- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — never. OIDC only.
- Classic personal access tokens (PATs) — use a GitHub App with installation-scoped tokens.
- Any `.env` file checked into the repo. `.gitignore` forbids; gitleaks job catches it.
- Secrets baked into Docker images. Never. Build args are visible in the image manifest.

## GitHub environments

Two environments must exist on the repo. Create at start of bootstrap (does not need AWS).

| Environment  | Required reviewers | Wait timer | Branch policy |
| ------------ | ------------------ | ---------- | ------------- |
| `staging`    | 0 (auto-deploy)    | 0          | `main` only   |
| `production` | 1 (Hleb for now)   | 5 minutes  | `main` only   |

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
gh variable set AWS_BOOTSTRAPPED                 --body true
gh secret set AWS_ACCOUNT_ID                     --body <TBD-account-id>
gh secret set AWS_DEPLOY_ROLE_ARN_STAGING        --body <TBD-staging-deploy-role-arn>
gh secret set AWS_DEPLOY_ROLE_ARN_PRODUCTION     --body <TBD-production-deploy-role-arn>
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
    role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN_STAGING }}
    aws-region: ${{ vars.AWS_REGION }}
```

Role ARNs contain the account ID, so they are stored as secrets (single-account MVP; see `docs/runbooks/AWS-DEPLOY.md`).

## Rotation cadence

| Secret class                            | Cadence                                                          |
| --------------------------------------- | ---------------------------------------------------------------- |
| Sentry DSN, Honeycomb keys              | annual, or on suspected leak                                     |
| Vault-backed app secrets (the 3)        | on suspected leak; rotate via `vault kv put` → SSM sync ≤5min    |
| RDS creds (`DbSecret`, `AppUserSecret`) | AWS-managed (Secrets Manager native rotation)                    |
| Vault operator-admin token              | 90 days (TTL 2160h; re-mint via recovery keys if expired)        |
| Vault `vault-ssm-sync` token            | annual (TTL 8760h, renewable)                                    |
| KMS CMKs                                | annual rotation enabled at key creation                          |
| GitHub App private keys                 | 12 months                                                        |
| Cosign                                  | n/a (keyless)                                                    |
| Linear API key (Vault-backed, M5)       | annual; rotate via `vault kv put platform/shared/linear-api-key` |

The Anthropic API key provisioning steps (Ask AI on `docs.afframe.com`)
were removed on 2026-05-21 alongside the rest of the `apps/docs` Ask AI
work. If a future docs surface needs an Anthropic-backed feature,
restore the procedure from
`.context/archive/apps-docs-2026-05-21/`.

## Linear API key (CI write-back) — Vault-backed via OIDC (M5)

`linear-sync.yml` no longer reads a `LINEAR_API_KEY` GitHub secret. It
fetches the key from Vault at run time using the GitHub-OIDC → Vault-JWT
trust chain (M5 pilot):

1. The workflow requests a GitHub OIDC token (`permissions: id-token: write`).
2. `hashicorp/vault-action` exchanges it at `auth/jwt/login` (role
   `gha-monorepo`, audience `https://secrets-admin.afframe.com`), passing
   Cloudflare Access service-token headers (`CF-Access-Client-Id/Secret`,
   stored as repo secrets) to clear the edge gate.
3. Vault returns the value of `platform/shared/linear-api-key`, scoped by
   the `gha-read-shared-tokens` policy (read-only on `platform/data/shared/*`).

Rotate the key: `vault kv put platform/shared/linear-api-key value=<new>`
(no GitHub-secret update needed). The legacy `LINEAR_API_KEY` repo secret
is deleted after the 7-day soak. Full chain + audit verification in
[`VAULT-OPS.md`](VAULT-OPS.md) § "GitHub Actions JWT auth (M5)".

## Break-glass procedure

For emergency access when normal Identity Center login is unavailable (e.g. SAML provider outage, locked-out admin):

1. Sealed envelope in the office safe contains:
   - Root account credentials.
   - Backup MFA codes.
2. Two-person rule when a second human is available.
3. Document use immediately in incident channel `#inc-YYYYMMDD-<slug>`.
4. Replace credentials and rotate MFA within 24 hours of use.

**Solo dev caveat**: Hleb is the sole approver right now. Two-person rule is aspirational until a second admin exists. The risk is documented; mitigation is to keep the envelope physically in a separate location from primary devices.
