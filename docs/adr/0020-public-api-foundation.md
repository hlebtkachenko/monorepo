# 20. Public API foundation: NestJS-native contracts on a webpack bundle

> **Updated**: Live host inventory is in [`docs/DOMAINS-AND-EMAIL.md`](../DOMAINS-AND-EMAIL.md). This ADR is the decision record.

- Status: Accepted
- Date: 2026-05-17
- Deciders: Hleb Tkachenko

## Context and Problem Statement

`api.afframe.com` must become a real public API: versioned routes, machine
(API-key) auth, a generated OpenAPI spec. `apps/api` was a NestJS shell that
imported nothing — a plain `nest build` (tsc, NodeNext) compiled only its own
`src`. The foundation needs `apps/api` to consume the source-first
`@workspace/*` packages (`auth`, `db`, `shared`), which export raw `.ts` with
no build step. tsc-with-NodeNext can neither typecheck nor run those.

Two shape questions came with it: what contract/validation layer the public
API uses, and where API-key verification logic lives. An earlier draft
proposed a `packages/domain` catch-all package and an oRPC contract layer.
Both were reconsidered before any of this shipped.

## Decision

1. **Contract layer: NestJS-native controllers + `nestjs-zod`.** Zod schemas
   in `@workspace/shared/api` become DTOs via `createZodDto`; `@nestjs/swagger`
   generates the OpenAPI document. No oRPC.

2. **`apps/api` builds as a webpack bundle.** `nest build --webpack` with
   `moduleResolution: Bundler` — webpack + `ts-loader` inline the `@workspace/*`
   sources into one `dist/main.js`; every bare specifier stays external. The
   Docker `pnpm deploy` uses `node-linker=hoisted` so the bundle's externalised
   transitive deps resolve from a flat `node_modules`.

3. **No `packages/domain` package.** `verifyApiKey` lives in `packages/auth`
   (an API key is an auth credential); the `DomainError` hierarchy lives in
   `packages/shared/src/errors.ts`. Genuinely-shared business logic, when
   AFF-71 needs it, goes into capability-named packages — created per
   capability, never a pre-emptive catch-all.

4. **Docs UI is `@nestjs/swagger`'s SwaggerModule**, not Scalar.

## Consequences

Positive:

- `apps/api` can import and run the source-first workspace packages — the
  pattern every future API feature depends on.
- One Zod schema is the single source of truth for runtime validation, the
  TypeScript type, and the OpenAPI component schema.
- The contract layer is plain NestJS — no extra framework to learn, no ESM
  clash with the repo's `moduleResolution: Bundler` baseline (ADR-0015).
- `verifyApiKey` is one swappable seam: replacing the `api_key` table with an
  external provider (Unkey) later changes only that file.

Negative / trade-offs:

- `nestjs-zod` is community-maintained and its Zod-4 path is thin
  (`z.toJSONSchema`). Fallback: `@asteasolutions/zod-to-openapi`.
- The webpack build is the highest-risk piece of the foundation: native
  modules must stay external, and the deployed `node_modules` must be hoisted
  (flat) or the bundle's bare `require()`s do not resolve.
- The webpack build skips program-wide type-checking (`transpileOnly`); type
  safety relies on the separate `pnpm typecheck`.
- SwaggerModule's docs UI is less polished than Scalar.

Follow-up work required:

- Per-API-key rate limiting — the `ThrottlerModule` is IP-keyed for now.
- Domain endpoints (AFF-71) — the foundation ships only `/v1/ping` and
  `/v1/organization`.
- The `authz/` modules (Cerbos, OpenFGA) are present but not yet wired into a
  combined `AuthzModule`; the public API does no resource-level authz yet.
- Swap SwaggerModule for Scalar once the foundation is stable.

## Alternatives considered

- **oRPC contract layer** — rejected: v1.0 is too young, its ESM stance
  clashes with ADR-0015, and its one-stack benefit is moot because the only
  internal caller is Next.js Server Actions, not an oRPC client.
- **`packages/domain` catch-all package** — rejected: the repo's `packages/`
  are flat and capability-named (`auth`, `db`, `email`), not buckets.
- **Plain `nest build` (tsc)** — cannot compile the source-first `@workspace/*`
  packages; project references would force every package to emit a build.
- **Scalar docs UI** — deferred: SwaggerModule is the reliable default; Scalar
  is a future swap.
- **API-key principal as a service account** — the principal is currently the
  key's `created_by_user_id` (the audit actor). Revisit for true service
  accounts.

## See also

- ADR [0015](0015-bundler-module-resolution.md) — `moduleResolution: Bundler`
- ADR [0010](0010-multi-tenant-rls.md) — the RLS tenancy `/v1/organization` exercises
- `apps/api/webpack.config.js`, `apps/api/src/v1/`, `apps/api/scripts/emit-openapi.ts`
- `packages/auth/src/api-key-verifier.ts`, `packages/shared/src/errors.ts`
- `.github/workflows/openapi-lint.yml`
