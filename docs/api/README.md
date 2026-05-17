# API Specifications

OpenAPI 3.1 specifications and Zod schemas for the public API surface.

## Current State

`apps/api` (NestJS) has a versioned REST foundation (see [ADR-0020](../adr/0020-public-api-foundation.md)):

- **`/api/health`** — version-neutral health endpoint (Fargate + ECS healthcheck target)
- **`/v1/organization`** — returns the authenticated API key's organization. Exercises the full stack: API-key auth, RLS tenancy (`withOrganization`), typed Zod-validated response, OpenAPI spec generation
- **`/v1/ping`** — lightweight authenticated ping

Auth: Bearer token via `ApiKeyGuard` + per-key rate limiting (`ApiKeyThrottlerGuard`). Domain errors handled by `DomainExceptionFilter`.

`apps/web` exposes `app/api/version/route.ts` for its container healthcheck.

## Conventions

- `*.openapi.yaml` — one file per service surface (generated from NestJS `@nestjs/swagger` decorators)
- Zod schemas in `@workspace/shared/api` — source of truth for request/response validation
- OpenAPI document emitted at build time via `apps/api/src/openapi.ts`
