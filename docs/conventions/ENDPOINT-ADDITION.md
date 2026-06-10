# Convention: Endpoint Addition

What makes a public-API endpoint good enough to merge. Pairs with
`docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md` (the how-to).

## Naming

- **Path**: kebab-case nouns. Plural for collections (`/v1/invoices`),
  singular for the resource (`/v1/invoices/:invoiceId`).
- **operationId**: camelCase verb-resource (`listInvoices`,
  `getInvoice`, `createInvoice`, `updateInvoice`, `deleteInvoice`,
  `voidInvoice`). The SDK / MCP / CLI all key off this — pick once.
- **Tag**: title-cased noun (`Invoices`, `Journal entries`,
  `Organization`). Drives the docs sidebar grouping.

## Auth scopes

- Default scope: `read` (every key gets it).
- Mutations require `write`.
- Destructive / irreversible operations require `admin`.
- Per-operation scope declared via the API key guard, not in the spec.

## Tenancy

- **Never** declare `organization_id`, `user_id`, `workspace_id`, or
  `role` as request input. The server-side guard injects all four from
  the API-key principal.
- Reads / writes go through `withWorkspace(…)`, `withOrganization(…)`,
  or `withAdminBypass(…)`. Raw queries violate RLS.
- Cross-tenant existence is never leaked: a resource the caller can't
  see returns `404 not_found`, not `403 forbidden`.

## Error variants

Pick from the canonical list in `packages/shared/src/errors.ts`
(`API_ERROR_CODES`). Adding a new code is a breaking change for SDK
consumers — discuss in the PR before introducing one.

Mandatory mappings:

- Missing / malformed key → `401 unauthorized`
- Scope mismatch → `403 forbidden`
- Resource not in tenant → `404 not_found`
- Idempotency-Key reuse with different body → `409 idempotency_conflict`
- Optimistic-concurrency mismatch → `409 stale_resource`
- Schema validation fail → `422 validation_error` + `details[]`
- Rate limit exceeded → `429 rate_limited`

## Idempotency

Every mutation accepts `Idempotency-Key`. Same key + same body returns
the cached response; same key + different body returns
`409 idempotency_conflict`. Server caches for 24 hours.

## Pagination

Cursor-based per the `pageOf(ItemSchema)` envelope in
`packages/shared/src/api/primitives.ts`. Limit 1–100, default 25.
Cursors are opaque strings the server can swap the encoding of without
breaking clients.

## Money

Use the `MoneySchema` primitive. Amount is integer minor units serialised
as a string; currency is `CurrencyCode`. Never `number`. Never auto-
convert across currencies — call sites pass a `FxRate` explicitly.

## Breaking changes

A change is breaking when it:

- Removes or renames an operation, path, or operationId.
- Changes a request shape (removes a required field, adds a required
  field, renames a field, narrows an enum, tightens a regex).
- Changes a response shape (adds a required field, removes any field,
  renames a field, tightens a type).
- Changes an error code an SDK class is keyed on.
- Tightens auth (raises required scope).

Non-breaking:

- Adds an optional request field.
- Adds a response field that consumers should ignore.
- Widens an enum.
- Loosens auth (lowers required scope).

Breaking changes require a major SDK bump + a migration note in
`docs/api/CHANGELOG.md` + a deprecation window with the `Deprecation:` /
`Sunset:` response headers (the SDK forwards these to the
`onDeprecation` callback).

## Documentation

- Every developer-facing field carries `.openapi({ description, example })`
  in the Zod schema. Scalar renders these as the per-field copy in the
  Reference at `api.afframe.com/` — there is no separate narrative MDX
  surface today (ADR-0024 Amendment 2026-05-21).
- Resource-level prose (when needed) belongs in the operation's
  `description` field on `registry.registerPath({...})`.

## Tests

- E2E test with at least two tenants confirming RLS isolation
  (resource created under tenant A is invisible to tenant B).
- Per-error-code test for every variant the operation can emit.
- Roundtrip test against the SDK (the generated client calls the live
  endpoint and parses the response).

## Surfaces touched per endpoint

Adding one endpoint touches:

1. `packages/shared/src/api/<resource>.ts` — Zod schemas
2. `packages/shared/src/api/registry.ts` — registry path
3. `apps/api/src/v1/<resource>/<resource>.controller.ts` — NestJS handler
4. `apps/api/src/v1/v1.module.ts` — mount the controller
5. `apps/api/openapi/v1.json` — regenerated, drift-gated
6. `packages/sdk/src/generated/openapi.ts` — regenerated, drift-gated
7. `apps/mcp/src/tools/generated/<operationId>.ts` — regenerated
8. `apps/api/src/**/*.test.ts` or `apps/web/e2e/**` — E2E test

Steps 5–7 are codegen output of `pnpm gen:all`. Never hand-edit them.

SDK versioning/publishing (changesets + npm publish) is not wired yet —
tracked as future work; do not add `.changeset/` entries.
