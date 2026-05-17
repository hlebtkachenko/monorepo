# Public API Architecture

`apps/api` (NestJS) serves two surfaces from a single `:3001` process:

- **BFF** `app.afframe.com/api/*` — private, session-cookie auth, same-origin web app calls.
- **Public** `api.afframe.com/v1/*` — stable, versioned, API-key auth, documented, rate-limited.

Both are the same NestJS container; Cloudflare Tunnel routes the two hostnames to the same port. See ADR-0020 for the full decision.

## Versioning

URI prefix versioning: `/v1/`. NestJS `APP_CONTROLLER_VERSION` + `@nestjs/common` `VersioningType.URI`. New breaking changes increment the prefix; old versions stay live until deprecated. No header/media-type versioning.

## Authentication

### API-key auth (public surface)

`ApiKeyGuard` (`apps/api/src/guards/api-key.guard.ts`) — NestJS `CanActivate` guard applied to all `/v1/` controllers.

Flow: `Authorization: Bearer afk_...` header → SHA-256 hash → lookup in `api_key` table → verify `is_active`, not expired → attach `ApiKeyPrincipal` (organization-scoped) to `req.principal` → downstream queries use `withOrganization(principal.organizationId, ...)` for RLS scoping.

Key format: `afk_<44-char base64>` (256-bit random). Only the SHA-256 hash is stored, never the raw key. Same opaque-token + DB-hash pattern as invite tokens. See `packages/auth/src/api-key-verifier.ts` for the `verifyApiKey` function.

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

Per-API-key, NOT per-IP. Behind the Cloudflare Tunnel, all requests share the sidecar's loopback IP, so an IP-based throttler would create one global bucket for all clients. `ThrottlerModule` uses a custom `ApiKeyThrottlerGuard` that keys on `req.principal.apiKeyId`.

Default: 100 requests / 60s per API key. Configurable via `THROTTLE_TTL` / `THROTTLE_LIMIT` env vars (not yet exposed in `docs/env-vars.md` — defaults are fine for now).

## OpenAPI

- Spec emitted at build time: `apps/api/scripts/emit-openapi.ts` → `apps/api/openapi.json`.
- Spectral lint: `.spectral.yaml` at repo root.
- CI: `.github/workflows/openapi-lint.yml` (advisory) — catches spec drift (re-emits + `git diff --exit-code`) and Spectral violations.
- Swagger UI: served at `api.afframe.com/` (root) when a Swagger plugin is wired.

## Build

`apps/api` uses a **webpack bundle** build (`nest build --webpack`), not plain `tsc`. This is required to consume source-first `@workspace/*` packages (raw TypeScript, no pre-built dist). The webpack config is `apps/api/webpack.config.js`. `moduleResolution: Bundler` in `tsconfig.json`.

Deployment uses `pnpm deploy --config.node-linker=hoisted` so the bundle's externalized transitive dependencies resolve flat inside the Docker image. See ADR-0020 for the decision + tradeoffs.

## Container

- Port: 3001 (both BFF and public API).
- `essential: true` in the Fargate task definition — a crash kills the whole task (web, admin, sidecars restart too). Locally verified on arm64; Fargate runtime verification is pending on first deploy (AFF-33).
- Dockerfile: `apps/api/Dockerfile`. Multi-stage: build → deploy with `pnpm deploy --prod`.
- Health: `GET /api/health` returns `{ status: "ok", buildSha, buildVersion, uptimeSeconds }`.

## Endpoints (v1 foundation)

| Method | Path               | Auth    | Description                                 |
| ------ | ------------------ | ------- | ------------------------------------------- |
| `GET`  | `/v1/ping`         | API key | Connectivity check. Returns `{ ok: true }`. |
| `GET`  | `/v1/organization` | API key | Returns the API key's organization details. |
| `GET`  | `/api/health`      | None    | Container health (used by ECS, Cloudflare). |

Domain endpoints (invoices, accounts, journals) land with AFF-71. Authz (Cerbos L3 + OpenFGA L2) wires in with the first resource endpoint (AFF-46).

## Conventions

- `*.openapi.yaml` — one file per service surface (generated from NestJS `@nestjs/swagger` decorators)
- Zod schemas in `@workspace/shared/api` — source of truth for request/response validation
- OpenAPI document emitted at build time via `apps/api/src/openapi.ts`

## Related

- [ADR-0020](../adr/0020-public-api-foundation.md) — public API foundation decision
- [ADR-0008](../adr/0008-cloudflare-tunnel-and-email.md) — Cloudflare tunnel + domain routing
- [ADR-0018](../adr/0018-three-layer-authorization.md) — authz layers (deferred to AFF-46/71)
- [env-vars.md](../env-vars.md) — all environment variables
- [AWS-DEPLOY.md](../runbooks/AWS-DEPLOY.md) — deploy procedure + tunnel config
