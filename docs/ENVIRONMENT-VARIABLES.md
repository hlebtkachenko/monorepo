# Environment variable registry

> **As-built 2026-05-31.** `BETTER_AUTH_SECRET`, `RESEND_API_KEY`,
> `CLOUDFLARE_TUNNEL_TOKEN` live in Vault-on-VPS (source of truth) and are
> mirrored to AWS SSM Parameter Store SecureString (runtime cache for ECS,
> read via `EcsSecret.fromSsmParameter`). Legacy AWS Secrets Manager copies
> were deleted (M4.5). Rotation: `vault kv put` → see
> [`SECRETS-ROTATION.md`](runbooks/SECRETS-ROTATION.md).
> Current operations: [`VAULT-OPS.md`](runbooks/VAULT-OPS.md).

Canonical list of every env var read by the app. Pair with
`scripts/generate-env.sh` (auto-creates `apps/web/.env.local` with random
secrets) for local dev, or copy `apps/web/.env.example` and fill in
placeholders by hand. In CI / production, values come from GitHub Actions
secrets, AWS SSM Parameter Store (app secrets, synced from Vault), and
AWS Secrets Manager (RDS credentials only); see
`docs/runbooks/AWS-SETUP.md` for the wiring chain.

Section labels track which package reads the variable.

## Next.js (apps/web)

| Var                | Required | Phase   | Notes                                                                                                                                                                                                                                                                                                             |
| ------------------ | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`         | yes      | runtime | `development` \| `production` \| `test`                                                                                                                                                                                                                                                                           |
| `PORT`             | no       | dev     | web listen port (3000 default)                                                                                                                                                                                                                                                                                    |
| `HOST`             | no       | dev     | web listen host (`0.0.0.0` default)                                                                                                                                                                                                                                                                               |
| `APP_DOMAIN`       | yes      | runtime | public hostname (no protocol), e.g. `app.afframe.com`                                                                                                                                                                                                                                                             |
| `API_INTERNAL_URL` | no       | runtime | Server-only base URL for apps/api, used by the `reportFeedback` server action and Web/Admin utility-report proxies to forward Bug feedback to `POST /v1/feedback` (server-to-server, no browser CORS). Defaults to `http://localhost:3001` for local dev and same-task deployments. Never exposed to the browser. |

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

| Var                                   | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AFFRAME_MCP_URL`                     | no       | Public URL of a Streamable-HTTP MCP server. When set, the Scalar reference at `/` advertises it through `mcp.url`; when unset, the MCP slot stays disabled. `apps/mcp` ships as stdio today, so this is empty for prod / staging until an HTTP wrapper lands. Read by `apps/api/src/docs.ts`.                                                                                                                                                        |
| `STATUS_API_URL`                      | no       | Upstream OpenStatus summary endpoint for `GET /v1/status`. Default `https://status.afframe.com/api/v1/status`. Read by `apps/api/src/v1/status/status.controller.ts`.                                                                                                                                                                                                                                                                                |
| `APP_ENV`                             | no       | Environment name (`production` / `staging`). Sole runtime reader: `packages/shared/src/api/registry.ts` `resolveServers()`. Controls the staging server entry in generated OpenAPI. Set by CDK.                                                                                                                                                                                                                                                      |
| `V1_THROTTLE_LIMIT`                   | no       | Per-API-key request limit. Defaults to `100`; production sets `300` through CDK. Non-positive or non-integer values fall back to the default.                                                                                                                                                                                                                                                                                                        |
| `V1_THROTTLE_TTL_MS`                  | no       | Rate-limit window in milliseconds. Defaults to `60000`. Non-positive or non-integer values fall back to the default.                                                                                                                                                                                                                                                                                                                                 |
| `OAUTH_ISSUER`                        | no       | OAuth 2.1 access-token issuer to accept (e.g. `https://app.afframe.com/api/auth`). Enables `Authorization: Bearer <JWT>` on `/v1/*` alongside `affk_` keys. Read by `verifyOAuthAccessToken` (`@workspace/auth/oauth-token-verifier`). Unset → OAuth tokens are rejected (fail closed); api keys unaffected. Verified against the AS discovery doc: `https://app.afframe.com/api/auth` (prod), `https://app-staging.afframe.com/api/auth` (staging). |
| `OAUTH_JWKS_URI`                      | no       | JWKS endpoint the API fetches to verify OAuth token signatures (e.g. `https://app.afframe.com/api/auth/jwks`). Required together with `OAUTH_ISSUER` + `OAUTH_RESOURCE` for OAuth auth to activate.                                                                                                                                                                                                                                                  |
| `OAUTH_RESOURCE`                      | no       | Expected OAuth token audience — the resource server the token is for (e.g. `https://mcp.afframe.com`). Verified against the JWT `aud`. Required together with `OAUTH_ISSUER` + `OAUTH_JWKS_URI`.                                                                                                                                                                                                                                                     |
| `ACCOUNTING_STALE_HELD_ALERT_ENABLED` | no       | Set to `true` to enable the stale held-write alert scheduler. Any other value keeps the scheduler dormant.                                                                                                                                                                                                                                                                                                                                           |
| `BRAIN_RUNTIME_ACTIVE`                | no       | Kill-switch for the accounting WRITE lane (`runGatedWrite`). Fails CLOSED: only `1` / `true` (trimmed, case-insensitive) admit writes; unset / anything else → every write gets a `429`. Read by `isBrainRuntimeActive` (packages/db admission). Held-write RESOLVE is never gated by it.                                                                                                                                                            |
| `ACCOUNTING_ADMISSION_GLOBAL_CAP`     | no       | Max concurrent admitted Brain write runs across the whole process (in-memory) or fleet (`SHARED=1`). Defaults to `32`. Non-integer / negative falls back to the default.                                                                                                                                                                                                                                                                             |
| `ACCOUNTING_ADMISSION_PER_ORG_CAP`    | no       | Max concurrent admitted write runs per organization. Defaults to `8`. Non-integer / negative falls back to the default.                                                                                                                                                                                                                                                                                                                              |
| `ACCOUNTING_ADMISSION_SHARED`         | no       | `1` selects the Postgres-backed `DbAdmissionController` (`brain_admission_slot`, migration 0063) so the caps above are enforced across every API container (#472). Any other value (default) keeps the process-local in-memory controller — zero behavior change until flipped.                                                                                                                                                                      |

The `EDITOR_ENABLED` gate on `/editor` was dropped on 2026-05-21 (the
redirect target `editor.scalar.com` is public; the spec it points at is
also public via `/v1/openapi.json`, so the gate was defensive without
adding exposure). The route now redirects unconditionally.

## Public API surfaces (apps/cli, apps/mcp, packages/sdk)

`@afframe/sdk` reads no env vars directly — every option is passed to the
`Afframe` constructor. The CLI and MCP server share one config contract so a
partner can flip between live and sandbox with two exports:

| Var                | Required                      | Notes                                                                                                                                                                                                                |
| ------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AFFRAME_API_KEY`  | CLI: yes (unless `--api-key`) | Bearer token in the form `affk_live_…` (sandbox `affk_test_…` keys: not issued yet). Overrides whatever profile lives in `~/.config/afframe/config.toml`. Required by the MCP server at boot (fails fast otherwise). |
| `AFFRAME_API_BASE` | no                            | Override the API base URL. Default `https://api.afframe.com`. Useful for staging (`https://api-staging.afframe.com`) or a local container.                                                                           |
| `AFFRAME_PROFILE`  | no                            | CLI only. Selects which profile to read from `~/.config/afframe/config.toml`. Default `default`. Lets a partner keep `default` + `staging` side by side.                                                             |

## Admin (apps/admin, NestJS-free Next.js staff surface)

`apps/admin` runs its own Better Auth wiring under the admin origin and reuses
the Better Auth / Database / Email vars below. `PORT` defaults to `3100`.

| Var                              | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_DOMAIN`                   | yes      | Admin public hostname (no protocol), e.g. `admin.afframe.com`. Its own per-env value, **not** a subdomain of `APP_DOMAIN` (prod web is `app.afframe.com`, admin is `admin.afframe.com`). In CI it comes from the `ADMIN_DOMAIN_{ENV}` GitHub Actions variable; `infra/cdk/bin/app.ts` requires it and `app-stack.ts` sets the admin container's `BETTER_AUTH_URL` from it. Full host inventory: [`docs/DOMAINS-AND-EMAIL.md`](DOMAINS-AND-EMAIL.md). |
| `ADMIN_WORKSPACE_ALLOWLIST`      | no       | Comma-separated `workspace` ids whose members may sign into admin. Empty/unset → the gate denies everyone (fail closed). In prod it comes from the `ADMIN_WORKSPACE_ALLOWLIST` GitHub Actions variable, surfaced into the admin container by `infra/cdk/lib/app-stack.ts`.                                                                                                                                                                           |
| `WEB_BASE_URL`                   | no       | Base URL of the web app used by the admin dev dashboard actions (signup-link minting, dev outbox proxy — `apps/admin/app/(gated)/dev/actions.ts`). Default `http://localhost:3010`.                                                                                                                                                                                                                                                                  |
| `GITHUB_REPOSITORY`              | no       | `owner/repo` slug used by admin server views that link to GitHub releases. Baked into the image from `${{ github.repository }}` during deploy. Empty local builds hide repo-specific GitHub links.                                                                                                                                                                                                                                                   |
| `NEXT_PUBLIC_GITHUB_REPOSITORY`  | no       | Browser-exposed `owner/repo` slug used by admin client navigation links. Baked into the image from `${{ github.repository }}` during deploy.                                                                                                                                                                                                                                                                                                         |
| `NEXT_PUBLIC_GITHUB_PROJECT_URL` | no       | Optional browser-exposed GitHub Project URL for the command palette. Baked from repo variable `ADMIN_GITHUB_PROJECT_URL`; omit when there is no stable active Project link.                                                                                                                                                                                                                                                                          |

## Beta portal — forced TOTP (apps/beta)

The beta portal's second factor is a **feature that is always available** and an
**obligation that is switched off**. Enrolment lives in Nastavení › Účet, Better
Auth stores the factor, and an account that has enrolled is still challenged for
a code at sign-in — none of that is gated. What `BETA_TOTP_REQUIRED` controls is
the one extra rule on top: whether an office account (`is_staff`, or an active
`owner` membership) that has _not_ enrolled is redirected to `/zabezpeceni`
before it may use the portal.

It is **unset everywhere today** (2026-08-27, Hleb's call for the beta), so no
one is forced to enrol. Pre-launch the install has no real users, the only
population under the mandate is the office itself, and a forced enrolment
outlives its `BETTER_AUTH_SECRET`: the stored TOTP secret is encrypted under that
secret, so a redeploy with a fresh one rejects every correct code and locks the
office out of its own portal. Turning the mandate back on is one variable, no
code change.

| Var                  | Required | Notes                                                                                                                                                                                                                                                                                                                              |
| -------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETA_TOTP_REQUIRED` | no       | Exactly `true` switches forced enrolment on, at all three enforcement points at once (`(portal)` + `/admin` layouts, and the tenancy seam `requireScope` / `requireOffice`). Unset (the deployed state) → no redirect, no "your account must keep 2FA on" notice. Compared as a string; `1` / `yes` / `TRUE` do **not** enable it. |

The rule itself is one pure module, `apps/beta/lib/auth/totp-enforcement.ts` — the
switch is read there and nowhere else, so the three doors cannot drift apart.

## Beta portal — Asistent (apps/beta)

The Asistent module (`apps/beta/lib/assistant/`, spec `.context/beta-afframe/40-beta-structure.md` §2.8) ships **dark**: none of the variables below is set anywhere — not in `infra/cdk/lib/beta-app-stack.ts`, not in any GitHub environment — and with all of them absent the module is unreachable. Two independent switches, and both default off:

- `BETA_ASSISTANT_ENABLED` gates the **surface** — the rail entry, `/{orgSlug}/asistent`, and `POST /api/orgs/{orgSlug}/asistent`. Anything other than the exact string `true` and all three answer 404. Flipping it is Hleb's client-exposure gate, taken only after the adversarial transcript is reviewed.
- `BETA_ASSISTANT_API_KEY` gates the **provider call**. Absent, `streamAssistantTurn` makes no network request at all and every send is refused with a Czech "not available" message. Wiring it is a separate, later act; when it happens it belongs in SSM + `secrets` on the beta task definition, never in the plain `environment` map.

A surface enabled without a key is a supported state: the UI renders and every send says the assistant is unavailable, which is what makes the module reviewable before any key exists.

| Var                                   | Required | Notes                                                                                                                                                                                                                          |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BETA_ASSISTANT_ENABLED`              | no       | Exactly `true` switches the surface on. Unset (the deployed state) → rail entry hidden, route and pages 404 for every role. Compared as a string; `1` / `yes` / `TRUE` do **not** enable it.                                   |
| `BETA_ASSISTANT_API_KEY`              | no       | Anthropic API key. Read in exactly one place (`lib/assistant/config.ts` → `provider.ts`) and never placed on a config object, a response or a log line. Unset → no request is made. **Not set in any environment today.**      |
| `BETA_ASSISTANT_MODEL`                | no       | Model id. Default `claude-sonnet-5` (spec §2.8: "latest Sonnet default, env-configurable").                                                                                                                                    |
| `BETA_ASSISTANT_MAX_TOKENS`           | no       | Budget control 4 — `max_tokens` on the response. Default `1500`.                                                                                                                                                               |
| `BETA_ASSISTANT_HISTORY_MESSAGES`     | no       | Budget control 5 — how many past transcript messages are replayed as context. Default `20`. Truncation happens in the query, not the caller.                                                                                   |
| `BETA_ASSISTANT_USER_DAILY_MESSAGES`  | no       | Budget control 3 — per-user, per-Prague-day message allowance. Default `50`. Enforced by an atomic increment on `chat_usage`, so concurrent turns cannot race past it.                                                         |
| `BETA_ASSISTANT_MONTHLY_TOKEN_BUDGET` | no       | Budget control 1 — **install-wide** monthly token ceiling (input + output, summed across every organization). Default `2000000`. Checked before the daily allowance is consumed, so a spent month never costs a client a slot. |
| `BETA_ASSISTANT_MAX_INPUT_CHARS`      | no       | Longest message the endpoint accepts, before any provider call. Default `4000`; over it the route answers 413. The `chat_message_content_shape` CHECK is the second floor.                                                     |

Any malformed numeric value falls back to the default ceiling (never to "no ceiling") and logs one warning per process.

## Telegram dev bot (apps/bot + app-side notify)

| Var                    | Required | Notes                                                                                                                                                                                                                                                                     |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BOT_INGEST_URL`       | no       | Bot ingest endpoint, e.g. `https://bot.afframe.com/ingest`. Read by `@workspace/notify` `notifierFromEnv()` in web + api (+ the in-api pg-boss worker). Unset → notify is a no-op. Non-secret; set in `app-stack.ts` `environment`.                                       |
| `NOTIFY_SHARED_SECRET` | no       | Bearer for `POST /ingest` (equals the bot's `INGEST_SECRET`). Vault `platform/{env}/notify-shared-secret` → SSM `/monorepo/{env}/notify-shared-secret` → ECS via `EcsSecret.fromSsmParameter`. The bot's own token + secrets live in Cloudflare Worker secrets, not here. |

### Bot Worker secrets (Cloudflare, set by `deploy-bot.yml`)

These are **Worker** secrets/vars, not app env. Pushed from GitHub repo secrets by `deploy-bot.yml`.

| Worker secret/var             | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BOT_TOKEN`                   | yes      | Telegram bot token from BotFather. Local dev: `apps/bot/.dev.vars`. Prod: repo secret **`BOT_TOKEN`**, pushed by `deploy-bot.yml` via `wrangler secret put`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `TELEGRAM_USER_ID`            | yes      | Your Telegram numeric user id — the sole allowlisted inbound command sender. Local dev: `apps/bot/.dev.vars`. Prod: repo secret **`TELEGRAM_USER_ID`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `WEBHOOK_SECRET`              | yes      | Shared secret validated against `X-Telegram-Bot-Api-Secret-Token` on inbound `POST /webhook`. Local dev: `apps/bot/.dev.vars`. Prod: repo secret **`WEBHOOK_SECRET`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `INGEST_SECRET`               | yes      | Bearer required on every outbound bot route (`/ingest`, `/issue`, `/ask`, `/answer/:id`, `/beat`) and the `?token=` on `/sns`. **Invariant: `INGEST_SECRET` (bot) == `NOTIFY_SHARED_SECRET` (app) == Vault `platform/{env}/notify-shared-secret` == SSM `/monorepo/{env}/notify-shared-secret`** — one shared value under two names. Local dev: run `scripts/bot-dev-vars.sh` to materialize it into `apps/bot/.dev.vars` (reads SSM by default, `--source vault` for the Vault fallback). Prod: repo secret **`INGEST_SECRET`**, pushed by `deploy-bot.yml`; reconciling that GitHub secret to the current SSM/Vault value is a manual maintainer step (see `apps/bot/README.md` "Obtain / rotate"). |
| `GITHUB_DISPATCH_TOKEN`       | no       | Fine-scoped GitHub PAT (`actions:write` + `contents:read`) powering the control plane: write commands (`/deploy`, `/rollback`, `/deploybot`, `/dast`) via `workflow_dispatch`, the CI **Rerun** button, and read commands (`/ci`, `/pr`, `/deploys`, `/logs`). Stored in the repo secret **`BOT_GH_DISPATCH_TOKEN`** (GitHub forbids the `GITHUB_` prefix on secret names) and pushed to the Worker under the real name. Unset → control plane stays read-only/disabled.                                                                                                                                                                                                                              |
| `GITHUB_ISSUES_TOKEN`         | no       | Fine-scoped GitHub PAT for explicit bot-created issues (`issues:write`; Project access only when optional Project config is enabled). Stored in repo secret **`BOT_GH_ISSUES_TOKEN`** and pushed under the Worker name. If unset, the bot falls back to `GITHUB_DISPATCH_TOKEN` when that token has the needed permissions.                                                                                                                                                                                                                                                                                                                                                                           |
| `GITHUB_REPO`                 | yes      | `owner/repo` the control plane targets. Pushed by `deploy-bot.yml` from `${{ github.repository }}` so repo renames do not require code changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `GITHUB_PROJECT_ID`           | no       | Optional GitHub ProjectV2 node id for bot-created issues. Pushed from repo variable `BOT_GITHUB_PROJECT_ID` when configured. Omit to create plain GitHub issues without Project writes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GITHUB_PROJECT_FIELD_CONFIG` | no       | Optional JSON mapping for ProjectV2 single-select fields and options. Pushed from repo variable `BOT_GITHUB_PROJECT_FIELD_CONFIG` when configured. Omit to skip Project field writes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GITHUB_EPIC_ISSUE_NUMBER`    | no       | Optional parent Epic issue number for bot-created issues. Pushed from repo variable `BOT_GITHUB_EPIC_ISSUE_NUMBER` when configured. Omit to skip sub-issue attachment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Database (packages/db + drizzle migrations + workers)

| Var                        | Path                 | Notes                                                                                                                                                                                            |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`             | runtime app queries  | pgBouncer transaction mode, port 6432, role `app_user`. FORCE RLS active.                                                                                                                        |
| `DATABASE_DIRECT_URL`      | migrations + workers | Direct Postgres port 5432, role `app_owner`. pg-boss requires direct (advisory locks + LISTEN/NOTIFY).                                                                                           |
| `DB_STARTUP_PROBE_LENIENT` | runtime (Fargate)    | `1` = the startup probe logs instead of throwing when the DB is briefly unreachable (RDS still waking). Set by `infra/cdk/lib/app-stack.ts`; unset locally. Read by `packages/db/src/client.ts`. |

Migration runner refuses to run against port 6432. See `packages/db/scripts/apply-migrations.ts`.

## Better Auth (packages/auth — identity only)

| Var                           | Required  | Notes                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`          | yes       | 32+ bytes; `openssl rand -base64 33`. NEVER commit. In prod: stored in Vault at `platform/{env}/better-auth-secret` (source of truth), synced to AWS SSM SecureString `/monorepo/{env}/better-auth-secret`; ECS reads SSM via `EcsSecret.fromSsmParameter`. Rotate via `vault kv put`.                                |
| `BETTER_AUTH_URL`             | yes       | Absolute origin (e.g. `https://app-staging.afframe.com`). Prod: missing → `resolveBaseURL()` throws at startup.                                                                                                                                                                                                       |
| `BETTER_AUTH_COOKIE_DOMAIN`   | no        | Leading-dot domain (e.g. `.afframe.com`) for cross-subdomain session cookies. Required once the admin / api surfaces all share the same Better Auth session. Unset on `localhost` dev so the session cookie stays host-only. Read by `packages/auth/src/server.ts`.                                                   |
| `AUTH_TOKEN_ENV`              | prod: yes | Deploy-env code stamped into opaque auth tokens (`dev` \| `stg` \| `prd`) — the cross-env replay gate of ADR-0022. Read by `packages/auth/src/tokens/auth-token.ts` (`resolveAuthTokenEnv()`): invalid value throws; unset + `NODE_ENV=production` throws (CDK sets it per env); unset elsewhere falls back to `dev`. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | yes       | CSV of allowed origins. Include every host the client may POST from.                                                                                                                                                                                                                                                  |

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

| Var               | Notes                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMAIL_TRANSPORT` | optional override: `console` \| `resend` \| `ses`. AWS Fargate task sets `resend`.                                                                                                                                                                                                                                              |
| `RESEND_API_KEY`  | Empty in dev = console transport. Required in prod when `EMAIL_TRANSPORT=resend`. Stored in Vault at `platform/{env}/resend-api-key` (source of truth), synced to AWS SSM SecureString `/monorepo/{env}/resend-api-key`; ECS reads SSM via `EcsSecret.fromSsmParameter`. Rotate via `vault kv put` (see `SECRETS-ROTATION.md`). |
| `EMAIL_FROM`      | `no-reply@<domain>`. Both envs default to `no-reply@afframe.com` (override via `MAIL_FROM_ADDRESS`). Must be a Resend-verified domain.                                                                                                                                                                                          |

## AWS (apps/api, infra/openfga/bootstrap.mjs, scripts)

| Var             | Notes                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AWS_REGION`    | **Required, no default.** `infra/cdk/bin/app.ts` throws on missing. In CI sourced from the `AWS_REGION` repo variable (e.g. `eu-central-1`).                                                                    |
| `ALERT_EMAIL`   | **Required, no default.** Cost-runaway alerts destination (SecurityStack budgets + ObservabilityStack alarms). In CI sourced from the `EMAIL_FORWARD_TO` repo secret. `infra/cdk/bin/app.ts` throws on missing. |
| `APP_BUCKET`    | S3 app bucket; empty in dev = no uploads                                                                                                                                                                        |
| `APP_S3_REGION` | consumed by backup scripts (`infra/scripts/pg-dump-nightly.sh`)                                                                                                                                                 |

`AWS_ACCOUNT_ID` is NOT an app env. Runtime IAM identity comes from the task
role. CI reads the account id from a GitHub Actions secret only.

## Documents (packages/storage — `S3DocumentStore`)

`apps/beta` has its own, independently-fenced document store
(`apps/beta/lib/storage/document-store-s3.ts`, opaque org-prefixed key
`org/{organizationId}/{objectId}.{ext}` rather than the main app's
content-addressed `documents/{workspaceId}/{sha256}.{ext}`). It reads
`DOCUMENTS_BUCKET` and `DOCUMENTS_KMS_KEY_ID` for its own bucket/CMK, wired by
`infra/cdk/lib/beta-app-stack.ts`, and honors the same `S3_ENDPOINT` /
`DOCUMENTS_S3_ACCESS_KEY_ID` / `DOCUMENTS_S3_SECRET_ACCESS_KEY` local-MinIO
override below, with identical names and precedence, so the two stores never
drift on how a custom endpoint is configured.

| Var                              | Required | Notes                                                                                                                                                                                                                                        |
| -------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOCUMENTS_BUCKET`               | yes      | S3 bucket backing the `DocumentStore` (`packages/storage/src/document-store-s3.ts`). Content-addressed key convention `documents/{workspaceId}/{sha256}.{ext}`. `S3DocumentStore` throws at construction if unset.                           |
| `DOCUMENTS_KMS_KEY_ID`           | no       | Dedicated KMS CMK id/ARN. Server-side `put` and same-key confirm/restore copies set SSE-KMS explicitly. Browser presigned POSTs intentionally omit KMS form fields and rely on the bucket's default CMK encryption. Unset locally for MinIO. |
| `S3_ENDPOINT`                    | no       | S3-compatible endpoint override for local development. When set, forces path-style addressing. Unset in staging/production. Also honored by `apps/beta`'s own store (above) for local MinIO preview.                                         |
| `DOCUMENTS_S3_ACCESS_KEY_ID`     | no       | Static access id used only when `S3_ENDPOINT` is set. Preferred over the process-global AWS credential variable so MinIO credentials do not affect avatar storage or other AWS clients. Same precedence in `apps/beta`'s own store.          |
| `DOCUMENTS_S3_SECRET_ACCESS_KEY` | no       | Static credential paired with `DOCUMENTS_S3_ACCESS_KEY_ID`, used only for a custom endpoint. Production leaves both unset and uses the ECS task-role provider chain. Same precedence in `apps/beta`'s own store.                             |

Bucket purpose, lifecycle, deletion boundaries, and the pricing decision are in
[ADR-0031](adr/0031-s3-storage-and-document-working-store.md). Implemented
flows, limits, local setup, and troubleshooting are in the
[document-store runbook](runbooks/DOCUMENT-STORE.md).

Local dev: `infra/compose/docker-compose.dev.yml` runs a default (no-profile)
`minio` service — `:9000` (S3 API), `:9001` (console) — plus a one-shot
`minio-createbucket` service that seeds the `documents-dev` bucket. Point
`S3_ENDPOINT=http://localhost:9000` and `DOCUMENTS_BUCKET=documents-dev` at it;
the generated document-scoped credentials are pinned only on the custom-endpoint
client. The bucket seeder enables versioning because confirm, restore, and
reaper behavior require VersionIds. Production has no custom endpoint or static
document credentials and resolves the ECS task role normally.

## Observability (apps/api, apps/web)

| Var                 | Notes                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SENTRY_DSN`        | empty = noop (SDK gated by `Boolean(SENTRY_DSN)`)                                                                                                |
| `HONEYCOMB_API_KEY` | DEFERRED per ADR-0002; configs in `infra/observability/` ship UNWIRED                                                                            |
| `LOG_LEVEL`         | pino level for the shared `@workspace/observability` logger (`packages/observability/src/logger.ts`). Default `info` in prod, `debug` elsewhere. |

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

| Var                | Notes                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `OPENFGA_API_URL`  | `http://localhost:8080`                                                                                      |
| `OPENFGA_STORE_ID` | from SSM in prod; from `bootstrap.mjs` stdout in dev                                                         |
| `OPENFGA_MODEL_ID` | from SSM in prod; from `bootstrap.mjs` stdout in dev                                                         |
| `MONOREPO_ENV`     | env name used by `infra/openfga/bootstrap.mjs` (store name + SSM path); CLI arg wins, then this, then `dev`. |

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

## Dev / test only

Read only by test runners and local tooling — never set in staging or
production.

| Var                           | Notes                                                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TESTCONTAINERS_REUSE_ENABLE` | `1` reuses containers across runs (faster local). `0` or unset in CI.                                                                                                         |
| `SKIP_TESTCONTAINER`          | `true` = the web vitest globalSetup (`apps/web/tests/global-setup.ts`) skips booting Postgres and expects `DATABASE_URL` / `DATABASE_DIRECT_URL` to be provided (CI pattern). |
| `PGBOUNCER_URL`               | When set, enables the pgBouncer transaction-mode canary suite (`packages/db/tests/pgbouncer-canary.test.ts`); unset = suite skipped.                                          |
