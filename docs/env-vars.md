# Environment variable registry

> **Migration in progress (2026-05-22 → 2026-06):** `BETTER_AUTH_SECRET`,
> `RESEND_API_KEY`, `CLOUDFLARE_TUNNEL_TOKEN` are moving from AWS Secrets
> Manager to AWS SSM Parameter Store SecureString (runtime cache for ECS),
> sourced from Vault-on-VPS (source of truth). Rows for those three will
> change in M8 once the migration completes. See
> [`docs/plans/SECRETS-MIGRATION.md`](plans/SECRETS-MIGRATION.md).

Canonical list of every env var read by the app. Pair with
`scripts/generate-env.sh` (auto-creates `apps/web/.env.local` with random
secrets) for local dev, or copy `apps/web/.env.example` and fill in
placeholders by hand. In CI / production, values come from GitHub Actions
secrets and AWS Secrets Manager / SSM Parameter Store; see
`docs/runbooks/AWS-DEPLOY.md` for the wiring chain.

Section labels track which package reads the variable.

## Next.js (apps/web)

| Var          | Required | Phase   | Notes                                                 |
| ------------ | -------- | ------- | ----------------------------------------------------- |
| `NODE_ENV`   | yes      | runtime | `development` \| `production` \| `test`               |
| `PORT`       | no       | dev     | web listen port (3000 default)                        |
| `HOST`       | no       | dev     | web listen host (`0.0.0.0` default)                   |
| `APP_ENV`    | yes      | runtime | `development` \| `staging` \| `production`            |
| `APP_DOMAIN` | yes      | runtime | public hostname (no protocol), e.g. `app.afframe.com` |

## API (apps/api, NestJS)

`PORT` defaults to `3001`. `HOST` same as web. Both reused; in production
they run side-by-side in the same Fargate task on different ports.

Build-time identity (set by Dockerfile ARG; empty in local dev is fine):

| Var             | Phase                                |
| --------------- | ------------------------------------ |
| `BUILD_SHA`     | image build                          |
| `BUILD_TIME`    | image build                          |
| `BUILD_VERSION` | image build (used as Sentry release) |

Public API contract:

| Var               | Required | Notes                                                                                                                                                                                                                                                                                         |
| ----------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AFFRAME_MCP_URL` | no       | Public URL of a Streamable-HTTP MCP server. When set, the Scalar reference at `/` advertises it through `mcp.url`; when unset, the MCP slot stays disabled. `apps/mcp` ships as stdio today, so this is empty for prod / staging until an HTTP wrapper lands. Read by `apps/api/src/docs.ts`. |

The `EDITOR_ENABLED` gate on `/editor` was dropped on 2026-05-21 (the
redirect target `editor.scalar.com` is public; the spec it points at is
also public via `/v1/openapi.json`, so the gate was defensive without
adding exposure). The route now redirects unconditionally.

## Public API surfaces (apps/cli, apps/mcp, packages/sdk)

`@afframe/sdk` reads no env vars directly — every option is passed to the
`Afframe` constructor. The CLI and MCP server share one config contract so a
partner can flip between live and sandbox with two exports:

| Var                | Required                      | Notes                                                                                                                                                                                                           |
| ------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AFFRAME_API_KEY`  | CLI: yes (unless `--api-key`) | Bearer token in the form `affk_live_…` (production) or `affk_test_…` (sandbox). Overrides whatever profile lives in `~/.config/afframe/config.toml`. Required by the MCP server at boot (fails fast otherwise). |
| `AFFRAME_API_BASE` | no                            | Override the API base URL. Default `https://api.afframe.com`. Useful for staging (`https://api-staging.afframe.com`) or a local container.                                                                      |
| `AFFRAME_PROFILE`  | no                            | CLI only. Selects which profile to read from `~/.config/afframe/config.toml`. Default `default`. Lets a partner keep `default` + `staging` side by side.                                                        |

## Admin (apps/admin, NestJS-free Next.js staff surface)

`apps/admin` runs its own Better Auth wiring under the admin origin and reuses
the Better Auth / Database / Email vars below. `PORT` defaults to `3100`.

| Var                         | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_DOMAIN`              | yes      | Admin public hostname (no protocol), e.g. `admin.afframe.com`. Its own per-env value, **not** a subdomain of `APP_DOMAIN` (prod web is `app.afframe.com`, admin is `admin.afframe.com`). In CI it comes from the `ADMIN_DOMAIN_{ENV}` GitHub Actions variable; `infra/cdk/bin/app.ts` requires it and `app-stack.ts` sets the admin container's `BETTER_AUTH_URL` from it. Full host inventory: [`docs/DOMAINS-AND-EMAIL.md`](DOMAINS-AND-EMAIL.md). |
| `ADMIN_WORKSPACE_ALLOWLIST` | no       | Comma-separated `workspace` ids whose members may sign into admin. Empty/unset → the gate denies everyone (fail closed). In prod it comes from the `ADMIN_WORKSPACE_ALLOWLIST` GitHub Actions variable, surfaced into the admin container by `infra/cdk/lib/app-stack.ts`.                                                                                                                                                                           |

## Database (packages/db + drizzle migrations + workers)

| Var                   | Path                 | Notes                                                                                                  |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`        | runtime app queries  | pgBouncer transaction mode, port 6432, role `app_user`. FORCE RLS active.                              |
| `DATABASE_DIRECT_URL` | migrations + workers | Direct Postgres port 5432, role `app_owner`. pg-boss requires direct (advisory locks + LISTEN/NOTIFY). |

Migration runner refuses to run against port 6432. See `packages/db/scripts/apply-migrations.ts`.

## Better Auth (packages/auth — identity only)

| Var                           | Required | Notes                                                                                                                                                                                                                                                               |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`          | yes      | 32+ bytes; `openssl rand -base64 33`. NEVER commit. In prod, generated by CDK in `monorepo-{env}-better-auth-secret`.                                                                                                                                               |
| `BETTER_AUTH_URL`             | yes      | Absolute origin (e.g. `https://app-staging.afframe.com`). Prod: missing → `resolveBaseURL()` throws at startup.                                                                                                                                                     |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | yes      | Same value as `BETTER_AUTH_URL`, surfaced to the browser.                                                                                                                                                                                                           |
| `BETTER_AUTH_COOKIE_DOMAIN`   | no       | Leading-dot domain (e.g. `.afframe.com`) for cross-subdomain session cookies. Required once the admin / api surfaces all share the same Better Auth session. Unset on `localhost` dev so the session cookie stays host-only. Read by `packages/auth/src/server.ts`. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | yes      | CSV of allowed origins. Include every host the client may POST from.                                                                                                                                                                                                |

`resolveBaseURL()` in `packages/auth/src/server.ts` is the canonical reader.
Server actions that build absolute URLs (invite + magic link emails) MUST call
this helper instead of inlining `process.env.BETTER_AUTH_URL` so the
production guard fires uniformly.

Route handlers and middleware redirects use a different helper —
`publicOrigin(request)` in `apps/web/lib/request-origin.ts`. Behind Cloudflare
Tunnel → Fargate, `request.url` reflects the container listener
(`http://0.0.0.0:3000`), not the user-visible origin, so
`new URL(path, request.url)` emits `Location: https://0.0.0.0:3000/...` which
browsers refuse (WebKitErrorDomain:103, "restricted port"). `publicOrigin`
prefers `x-forwarded-host` + `x-forwarded-proto` (set by Cloudflare Tunnel on
every request), falls back to `BETTER_AUTH_URL`, then `request.url`. See
ADR-0008 "Amendment 2026-05-17 — redirect base URLs".

## Email (packages/email)

| Var               | Notes                                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMAIL_TRANSPORT` | optional override: `console` \| `resend` \| `ses`. AWS Fargate task sets `resend`.                                                                                                            |
| `RESEND_API_KEY`  | Empty in dev = console transport. Required in prod when `EMAIL_TRANSPORT=resend`. CDK references `monorepo-{env}-resend-api-key` by name; deploy workflow seeds the value from GitHub secret. |
| `EMAIL_FROM`      | `no-reply@<domain>`. Prod: `no-reply@app-staging.afframe.com` or `no-reply@app.afframe.com`. Must be on a Resend/SES-verified domain.                                                         |

## AWS (apps/api, infra/openfga/bootstrap.mjs, scripts)

| Var             | Notes                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AWS_REGION`    | **Required, no default.** `infra/cdk/bin/app.ts` throws on missing. In CI sourced from the `AWS_REGION` repo variable (e.g. `eu-central-1`).                                                                    |
| `ALERT_EMAIL`   | **Required, no default.** Cost-runaway alerts destination (SecurityStack budgets + ObservabilityStack alarms). In CI sourced from the `EMAIL_FORWARD_TO` repo secret. `infra/cdk/bin/app.ts` throws on missing. |
| `APP_BUCKET`    | S3 app bucket; empty in dev = no uploads                                                                                                                                                                        |
| `APP_S3_REGION` | consumed by backup scripts (`infra/scripts/pg-dump-nightly.sh`)                                                                                                                                                 |

`AWS_ACCOUNT_ID` is NOT an app env. Runtime IAM identity comes from the task
role. CI reads the account id from a GitHub Actions secret only.

## Observability (apps/api, apps/web)

| Var                 | Notes                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| `SENTRY_DSN`        | empty = noop (SDK gated by `Boolean(SENTRY_DSN)`)                     |
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

| Var                | Notes                                                |
| ------------------ | ---------------------------------------------------- |
| `OPENFGA_API_URL`  | `http://localhost:8080`                              |
| `OPENFGA_STORE_ID` | from SSM in prod; from `bootstrap.mjs` stdout in dev |
| `OPENFGA_MODEL_ID` | from SSM in prod; from `bootstrap.mjs` stdout in dev |

L3 — Cerbos sidecar at `localhost:3593` gRPC.

| Var               | Notes                                          |
| ----------------- | ---------------------------------------------- |
| `CERBOS_ENDPOINT` | override for non-default endpoint (none today) |

## Dev-only HTTP endpoints (apps/web)

Second gate alongside `NODE_ENV !== 'production'`. Both routes return 404 unless their flag is `1`.
Default `1` in `apps/web/.env.example` and `scripts/generate-env.sh`; must be absent or `0` in staging/production env.

| Var                  | Notes                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `ENABLE_DEV_OUTBOX`  | Enables `GET /api/dev/outbox` (in-memory email list — contains password-reset and invite-token links). |
| `ENABLE_DEV_PREVIEW` | Enables `GET /api/dev/preview` (sets/clears the auth-guard bypass cookie).                             |

## Test containers (vitest integration tests)

| Var                           | Notes                                                                 |
| ----------------------------- | --------------------------------------------------------------------- |
| `TESTCONTAINERS_REUSE_ENABLE` | `1` reuses containers across runs (faster local). `0` or unset in CI. |
