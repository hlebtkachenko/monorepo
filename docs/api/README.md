# Public API Architecture

> Public host + email inventory: [`docs/DOMAINS-AND-EMAIL.md`](../DOMAINS-AND-EMAIL.md).

`apps/api` (NestJS) serves two surfaces from a single `:3001` process:

- **BFF** `app.afframe.com/api/*` — private, session-cookie auth, same-origin web app calls.
- **Public** `api.afframe.com/v1/*` — stable, versioned, API-key auth, documented, rate-limited.

Both are the same NestJS container; Cloudflare Tunnel routes the two hostnames to the same port. See ADR-0020 for the full decision.

## Versioning

URI prefix versioning: `/v1/`. NestJS `APP_CONTROLLER_VERSION` + `@nestjs/common` `VersioningType.URI`. New breaking changes increment the prefix; old versions stay live until deprecated. No header/media-type versioning.

## Authentication

### API-key auth (public surface)

`ApiKeyGuard` (`apps/api/src/auth/api-key.guard.ts`) — NestJS `CanActivate` guard applied to all `/v1/` controllers.

Flow: `Authorization: Bearer affk_live_...` header → SHA-256 hash → lookup in `api_key` table → reject if `revoked_at IS NOT NULL` or `expires_at < now()` → attach `ApiKeyPrincipal` (organization-scoped) to `req.principal` → downstream queries use `withOrganization(principal.organizationId, ...)` for RLS scoping.

Key format: `affk_live_<43-char base64url>` (256-bit random). Only the SHA-256 hash is stored, never the raw key. Same opaque-token + DB-hash pattern as invite tokens. See `packages/auth/src/api-key-verifier.ts` for the `verifyApiKey` function.

Issuing keys: no UI yet. Seed manually in the `api_key` table. Future: admin dashboard key management (AFF-73).

### Session auth (BFF surface)

Same Better Auth session cookies as the web app. No API-key needed for `/api/*` routes hit by the web frontend.

## Error handling

`DomainExceptionFilter` (`apps/api/src/filters/domain-exception.filter.ts`) — global NestJS exception filter that catches `DomainError` subclasses from `@workspace/shared/errors` and maps them to stable HTTP status codes:

| Error class          | HTTP status                        |
| -------------------- | ---------------------------------- |
| `NotFoundError`      | 404                                |
| `ConflictError`      | 409                                |
| `ForbiddenError`     | 403                                |
| `ValidationError`    | 422                                |
| `DomainError` (base) | 400                                |
| Unhandled            | 500 (no stack trace in production) |

Response envelope: `{ error: { code, message, details? } }`. Errors logged server-side via NestJS logger.

## Rate limiting

Per-API-key, NOT per-IP. Behind the Cloudflare Tunnel, all requests share the sidecar's loopback IP, so an IP-based throttler would create one global bucket for all clients. `ThrottlerModule` uses a custom `ApiKeyThrottlerGuard` that keys on sha256(bearer token), with IP fallback for unauthenticated requests.

Default: 100 requests / 60s per API key. Configurable via `THROTTLE_TTL` / `THROTTLE_LIMIT` env vars (not yet exposed in `docs/env-vars.md` — defaults are fine for now).

## OpenAPI

- Spec emitted at build time: `apps/api/scripts/emit-openapi.ts` → `apps/api/openapi/v1.json`.
- Spectral lint: `.spectral.yaml` at repo root.
- CI: `.github/workflows/openapi-lint.yml` (advisory) — catches spec drift (re-emits + `git diff --exit-code`) and Spectral violations.
- Spec served live at `api.afframe.com/v1/openapi.json` (same document, same path on staging under `api-staging.afframe.com`).
- Interactive API reference (Scalar): `api.afframe.com/` — see [`API-REFERENCE.md`](./API-REFERENCE.md) for the full rules + extension guide. (`/v1/docs` 301-redirects here.)

## Build

`apps/api` uses a **webpack bundle** build (`nest build --webpack`), not plain `tsc`. This is required to consume source-first `@workspace/*` packages (raw TypeScript, no pre-built dist). The webpack config is `apps/api/webpack.config.js`. `moduleResolution: Bundler` in `tsconfig.json`.

Deployment uses `pnpm deploy --config.node-linker=hoisted` so the bundle's externalized transitive dependencies resolve flat inside the Docker image. See ADR-0020 for the decision + tradeoffs.

## Container

- Port: 3001 (both BFF and public API).
- `essential: true` in the Fargate task definition — a crash kills the whole task (web, admin, sidecars restart too). Locally verified on arm64; Fargate runtime verification is pending on first deploy (AFF-33).
- Dockerfile: `apps/api/Dockerfile`. Multi-stage: build → deploy with `pnpm deploy --prod`.
- Health: `GET /api/health` returns `{ status: "ok", buildSha, buildVersion, uptimeSeconds }`.

## Endpoints (v1 foundation)

| Method | Path               | Auth    | Description                                          |
| ------ | ------------------ | ------- | ---------------------------------------------------- |
| `GET`  | `/v1/ping`         | API key | Connectivity check. Returns `{ ok: true }`.          |
| `GET`  | `/v1/organization` | API key | Returns the API key's organization details.          |
| `GET`  | `/v1/status`       | None    | Service health summary (proxies status.afframe.com). |
| `POST` | `/v1/feedback`     | None    | Partner feedback ingestion.                          |
| `GET`  | `/api/health`      | None    | Container health (used by ECS, Cloudflare).          |

Domain endpoints (invoices, accounts, journals) land with AFF-71. Authz (Cerbos L3 + OpenFGA L2) wires in with the first resource endpoint (AFF-46).

## Auxiliary developer routes

Three non-versioned routes ride alongside `/v1/*` to support the
developer-platform UX. None of them carries auth; what they expose is
already public via `/v1/openapi.json`.

| Method | Path               | Source                   | Description                                                                                                                                                                                        |
| ------ | ------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/`                | `apps/api/src/docs.ts`   | Scalar API Reference (interactive). See [`API-REFERENCE.md`](./API-REFERENCE.md).                                                                                                                  |
| `GET`  | `/v1/openapi.json` | `apps/api/src/docs.ts`   | Canonical OpenAPI 3.1 spec, byte-stable per build.                                                                                                                                                 |
| `GET`  | `/v1/docs`         | `apps/api/src/docs.ts`   | 301 redirect to `/`. Preserves legacy AFF-220 bookmarks; do not link to `/v1/docs` in new content.                                                                                                 |
| `GET`  | `/editor`          | `apps/api/src/editor.ts` | 302 redirect to `editor.scalar.com?url=<env-spec>`. Spec URL is derived from `PUBLIC_API_URL` so staging `/editor` opens the staging spec, prod `/editor` opens the prod spec. No auth gate.       |
| `ANY`  | `/void/*`          | `apps/api/src/void.ts`   | Mock-server echo. Returns `{ method, path, query, headers, body }`. Strict header allowlist — no credentials echoed (authorization, cookie, x-api-key, etc. stripped). 100 KB body cap. CORS open. |

## Conventions

- `apps/api/openapi/v1.json` — emitted from the `@workspace/shared/api` Zod registry via `@asteasolutions/zod-to-openapi` (the `@nestjs/swagger` decorators are inert/documentation-only)
- Zod schemas in `@workspace/shared/api` — source of truth for request/response validation
- OpenAPI document emitted at build time via `apps/api/src/openapi.ts`

## Developer platform docs

The Scalar reference is one surface. The public-launch story is broader — narrative docs, CLI, MCP, SDK, webhooks, sandbox. Each lives in its own file:

| Doc                                      | Purpose                                                                   | Status                    |
| ---------------------------------------- | ------------------------------------------------------------------------- | ------------------------- |
| [`API-REFERENCE.md`](./API-REFERENCE.md) | Rules for the `/v1/docs` Scalar surface                                   | Live                      |
| [`PUBLIC-LAUNCH.md`](./PUBLIC-LAUNCH.md) | Master launch checklist (security, legal, comms, surfaces)                | Wip                       |
| [`DEV-PORTAL.md`](./DEV-PORTAL.md)       | Page map + sidebar IA for `api.afframe.com/docs`                          | Concept                   |
| [`ERRORS.md`](./ERRORS.md)               | Error envelope + code registry                                            | Live + concept extension  |
| [`RATE-LIMITS.md`](./RATE-LIMITS.md)     | Throttle contract, `RateLimit-*` headers, 429                             | Live + concept upgrades   |
| [`IDEMPOTENCY.md`](./IDEMPOTENCY.md)     | `Idempotency-Key` contract for money-mutating writes                      | Concept                   |
| [`VERSIONING.md`](./VERSIONING.md)       | URL-path versioning, RFC 8594 Sunset, deprecation policy                  | Live + concept signalling |
| [`SANDBOX.md`](./SANDBOX.md)             | `affk_test_…` keys, seeded fixtures, force-trigger endpoints              | Concept                   |
| [`WEBHOOKS.md`](./WEBHOOKS.md)           | Standard Webhooks contract, Svix Cloud backend                            | Concept                   |
| [`SDK.md`](./SDK.md)                     | `@afframe/sdk` TypeScript design (`openapi-typescript` + `openapi-fetch`) | Concept                   |
| [`CLI.md`](./CLI.md)                     | `afframe` CLI (oclif + Homebrew tap)                                      | Concept                   |
| [`MCP.md`](./MCP.md)                     | `@afframe/mcp` server (npx + hosted)                                      | Concept                   |
| [`CHANGELOG.md`](./CHANGELOG.md)         | Public changelog format + entries                                         | Wip                       |

The platform-level decision behind all of this is [`ADR-0023`](../adr/0023-public-api-developer-platform.md).

## Related

- [ADR-0020](../adr/0020-public-api-foundation.md) — public API foundation decision
- [ADR-0023](../adr/0023-public-api-developer-platform.md) — developer platform (pages, CLI, MCP, SDK, webhooks)
- [ADR-0008](../adr/0008-cloudflare-tunnel-and-email.md) — Cloudflare tunnel + domain routing
- [ADR-0018](../adr/0018-three-layer-authorization.md) — authz layers (deferred to AFF-46/71)
- [env-vars.md](../env-vars.md) — all environment variables
- [AWS-DEPLOY.md](../runbooks/AWS-DEPLOY.md) — deploy procedure + tunnel config
- [PUBLIC-REPO-CHECKLIST.md](../runbooks/PUBLIC-REPO-CHECKLIST.md) — repo-side public hardening (separate from API launch)
