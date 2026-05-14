# Environment variable registry

Canonical list of every env var read by the app. Pair with
`scripts/generate-env.sh` (auto-creates `apps/web/.env.local` with random
secrets) for local dev. In CI / production, values come from GitHub Actions
secrets and AWS Secrets Manager / SSM Parameter Store; see
`docs/runbooks/AWS-DEPLOY.md` for the wiring chain.

Section labels track which package reads the variable.

## Next.js (apps/web)

| Var | Required | Phase | Notes |
|---|---|---|---|
| `NODE_ENV` | yes | runtime | `development` \| `production` \| `test` |
| `PORT` | no | dev | web listen port (3000 default) |
| `HOST` | no | dev | web listen host (`0.0.0.0` default) |
| `APP_ENV` | yes | runtime | `development` \| `staging` \| `production` |
| `APP_DOMAIN` | yes | runtime | public hostname (no protocol), e.g. `app.afframe.com` |

## API (apps/api, NestJS)

`PORT` defaults to `3001`. `HOST` same as web. Both reused; in production
they run side-by-side in the same Fargate task on different ports.

Build-time identity (set by Dockerfile ARG; empty in local dev is fine):

| Var | Phase |
|---|---|
| `BUILD_SHA` | image build |
| `BUILD_TIME` | image build |
| `BUILD_VERSION` | image build (used as Sentry release) |

## Database (packages/db + drizzle migrations + workers)

| Var | Path | Notes |
|---|---|---|
| `DATABASE_URL` | runtime app queries | pgBouncer transaction mode, port 6432, role `app_user`. FORCE RLS active. |
| `DATABASE_DIRECT_URL` | migrations + workers | Direct Postgres port 5432, role `app_owner`. pg-boss requires direct (advisory locks + LISTEN/NOTIFY). |

Migration runner refuses to run against port 6432. See `packages/db/scripts/apply-migrations.ts`.

## Better Auth (packages/auth — identity only)

| Var | Required | Notes |
|---|---|---|
| `BETTER_AUTH_SECRET` | yes | 32+ bytes; `openssl rand -base64 33`. NEVER commit. |
| `BETTER_AUTH_URL` | yes | server-side base URL |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | yes | client-side base URL |
| `BETTER_AUTH_TRUSTED_ORIGINS` | yes | CSV of allowed origins |
| `APP_TOKEN_SECRET` | yes | AI-tool token signing secret; same generator |

## Email (packages/email)

| Var | Notes |
|---|---|
| `RESEND_API_KEY` | empty in dev = log to console; required in prod |
| `EMAIL_FROM` | `no-reply@<domain>` |

## AWS (apps/api, infra/openfga/bootstrap.mjs, scripts)

| Var | Notes |
|---|---|
| `AWS_REGION` | `eu-central-1` |
| `ALERT_EMAIL` | cost-runaway alerts destination (BillingAlarmsStack — PR #77) |
| `APP_BUCKET` | S3 app bucket; empty in dev = no uploads |
| `APP_S3_REGION` | consumed by backup scripts (`infra/scripts/pg-dump-nightly.sh`) |

`AWS_ACCOUNT_ID` is NOT an app env. Runtime IAM identity comes from the task
role. CI reads the account id from a GitHub Actions secret only.

## Observability (apps/api, apps/web)

| Var | Notes |
|---|---|
| `SENTRY_DSN` | empty = noop (SDK gated by `Boolean(SENTRY_DSN)`) |
| `HONEYCOMB_API_KEY` | DEFERRED per ADR-0002; configs in `infra/observability/` ship UNWIRED |

`tracesSampleRate` is hardcoded to 0 at MVP (errors only); see
`.context/decision-observability-mvp.md`.

## pg-boss workers (packages/workers)

Reads `DATABASE_DIRECT_URL` above. No additional env. No `REDIS_URL` —
pg-boss is Postgres-only (ADR-0017).

## Three-layer authz (ADR-0018)

L2 — OpenFGA sidecar at `localhost:8080` HTTP in the api task. `store_id` +
`model_id` come from SSM Parameter Store in production
(`/monorepo/{env}/openfga/{store-id,model-id}`), populated by
`infra/openfga/bootstrap.mjs`. In dev, run that script against a local
OpenFGA container and paste the echoed values.

| Var | Notes |
|---|---|
| `OPENFGA_API_URL` | `http://localhost:8080` |
| `OPENFGA_STORE_ID` | from SSM in prod; from `bootstrap.mjs` stdout in dev |
| `OPENFGA_MODEL_ID` | from SSM in prod; from `bootstrap.mjs` stdout in dev |

L3 — Cerbos sidecar at `localhost:3593` gRPC.

| Var | Notes |
|---|---|
| `CERBOS_ENDPOINT` | override for non-default endpoint (none today) |

## Test containers (vitest integration tests)

| Var | Notes |
|---|---|
| `TESTCONTAINERS_REUSE_ENABLE` | `1` reuses containers across runs (faster local). `0` or unset in CI. |
