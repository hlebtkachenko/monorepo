# Public API Reference — api.afframe.com/

> Sibling docs: [`docs/api/README.md`](./README.md) (overall public API architecture), [`ADR-0020`](../adr/0020-public-api-foundation.md) (foundation decision).

The Afframe Public API ships with a live, interactive reference at:

| Environment | URL                                |
| ----------- | ---------------------------------- |
| Production  | `https://api.afframe.com/`         |
| Staging     | `https://api-staging.afframe.com/` |
| Local dev   | `http://127.0.0.1:3001/`           |

The reference is rendered by [Scalar API Reference](https://scalar.com). It replaces the prior NestJS Swagger UI mount (AFF-220, May 2026). The OpenAPI 3.1 document — the actual contract — is unchanged and still served at `/v1/openapi.json`.

This document is the **single source of truth** for everything about the docs surface: what it is, how it works, what an engineer must do when adding endpoints, what the rules are, and what is real today vs. planned. Concept-only sections are explicitly flagged.

---

## 1. Overview

### What lives at `/` (host root)

A single-page, client-side rendered, OpenAPI-driven interactive reference. This is the primary docs surface for `api.afframe.com`. From a user's perspective:

- Browseable list of every public endpoint, grouped by `ApiTags`.
- Per-operation: HTTP method, path, parameters, request body schema, response schema, error envelopes.
- Live "Try it out" against the real `api.afframe.com` server (or staging), with the bearer token remembered for the session.
- Code snippets in curl, Node (undici/fetch), JavaScript (fetch), Python, Go, and a dozen others — generated from the spec, no manual upkeep.
- Light/dark mode, full-text search, deep-linkable URLs per operation.

`GET /v1/docs` is a 301 redirect to `/`. Do not link to `/v1/docs` directly.

### What lives at `/v1/openapi.json`

The canonical OpenAPI 3.1 document. Machine-readable, byte-stable for a given build. This is what Scalar reads, what Spectral lints, what an external SDK generator consumes, and what `apps/api/openapi/v1.json` mirrors in the repo for drift detection.

### The contract

```
NestJS controllers + Zod schemas
   ─► buildOpenApiDocument()  (apps/api/src/openapi.ts)
        ─► OpenAPI 3.1 document
              ├─► GET /v1/openapi.json  (raw spec, machine-readable)
              ├─► GET /                  (Scalar interactive UI, human-readable — primary)
              └─► GET /v1/docs           (301 redirect → /)
```

The same document feeds both routes. There is no second-source spec, no hand-written doc page, and no manual sync step.

---

## 2. Why Scalar (not Swagger UI)

Recorded for posterity so the decision isn't relitigated.

| Concern             | Swagger UI (prior)                           | Scalar (current)                                          |
| ------------------- | -------------------------------------------- | --------------------------------------------------------- |
| Visual quality      | Dated, generic                               | Modern, themeable, dark mode                              |
| Search              | Per-operation only                           | Full-text across the whole spec                           |
| Code samples        | Single client (curl-ish)                     | All major languages + clients                             |
| "Try it out" UX     | Functional, awkward                          | Functional, polished, token memory                        |
| Bundle size         | Larger, served from container                | Smaller, served from jsDelivr                             |
| OpenAPI 3.1 support | Partial                                      | Full                                                      |
| Maintenance         | Bundled, version-pinned by `@nestjs/swagger` | Decoupled — Scalar can move forward without a NestJS bump |

What changed in ADR-0024: the spec is now driven by `packages/shared/src/api/registry.ts` via `@asteasolutions/zod-to-openapi`. The `@ApiTags` / `@ApiOperation` decorators on controllers are retained for IDE hints only — they are inert at spec-emit time. Scalar remains a renderer, not a generator.

---

## 3. Audience

This doc has two audiences. Skim the section that applies.

### For API consumers

You're an accountant's developer, an integration partner, or anyone holding an `affk_live_...` key. Read sections 4 (Quickstart) and 9 (Examples). The Scalar UI itself is your real reference; the rest of this file is for the engineers who run it.

### For platform contributors

You're adding an endpoint, changing a schema, debugging CSP, or evolving the docs surface itself. Read sections 5 (How it works), 6 (Rules), 7 (Adding endpoints), 8 (Local dev), 10 (Troubleshooting), 11 (Concept / planned APIs).

---

## 4. Quickstart for API consumers

1. **Get a key.** API keys are issued manually today; ask `info@hapd.cz`. Key format: `affk_live_<random>`. The platform stores only the SHA-256 hash; the raw value is shown to you once.
2. **Open the reference.** `https://api.afframe.com/`.
3. **Authorize.** Top-right authentication panel → `BearerAuth` → paste your key. Scalar remembers it for the session (cookieless, in-memory).
4. **Try a call.** Hit `GET /v1/ping` first — it's a zero-DB smoke endpoint that confirms your key authenticated.
5. **Read the schemas.** Every request and response has a Zod-backed schema. Scroll the "Models" section.
6. **Pull the spec.** `GET /v1/openapi.json` returns the same document Scalar renders. Use it with `openapi-generator`, `oazapfts`, or `oapi-codegen` to produce a typed client.

### Curl baseline

```bash
KEY="affk_live_…"

curl -fsS \
  -H "Authorization: Bearer $KEY" \
  https://api.afframe.com/v1/ping
# { "ok": true, "principal": { "organizationId": "…", "workspaceId": "…" } }
```

```bash
curl -fsS \
  -H "Authorization: Bearer $KEY" \
  https://api.afframe.com/v1/organization
# { "organization": { "id": "…", "slug": "…", "legalName": "…", "fiscalYearStartMonth": 1 } }
```

### Error envelope

Every domain error returns:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Missing API key",
    "requestId": "…"
  }
}
```

Codes are stable across versions. `requestId` echoes the `X-Request-Id` response header — quote it in any support email.

---

## 5. How the docs surface works

### Wire-up

```ts
// apps/api/src/main.ts
const document = buildOpenApiDocument(app)
registerDocsRoutes(app, document)
```

```ts
// apps/api/src/docs.ts
export function registerDocsRoutes(app, document) {
  app.getHttpAdapter().get("/v1/openapi.json", (_req, res) => {
    res.type("application/json").send(document)
  })

  app.use(
    "/v1/docs",
    apiReference({
      content: document,
      pageTitle: "Afframe Public API · Reference",
    }),
  )
}
```

Two routes, registered once at boot.

### Rendered HTML

Scalar's NestJS middleware returns a tiny static HTML doc:

- `<style>` — Scalar's custom theme tokens (`--scalar-*`).
- `<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference">` — the renderer bundle, served from jsDelivr.
- `<script>Scalar.createApiReference("#app", { content: <spec>, ... })</script>` — inline initializer that mounts the renderer with the OpenAPI document inline.

The spec is embedded in the HTML, so the page renders without a second round-trip to `/v1/openapi.json`.

### CSP

Helmet's strict defaults stay on. The single relaxation:

```
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net
```

- `https://cdn.jsdelivr.net` — Scalar's CDN bundle.
- `'unsafe-inline'` — Scalar's inline initializer. Removing this requires either Scalar SSR (planned, section 11) or a CSP nonce wired through helmet (planned, section 11).
- No `'unsafe-eval'`. Ever.
- Default `font-src 'self' https: data:` already covers any CDN-hosted fonts.

### Auth interplay

The docs surface is **public-by-design**. `/v1/docs` and `/v1/openapi.json` are not behind `ApiKeyGuard`. The docs describe a public API; gating the description but not the API would be theatre. The "Try it out" feature collects a bearer token client-side and includes it in real requests — those requests then hit the real `ApiKeyGuard`.

### Build, container, deploy

- Build: `pnpm --filter api build` (webpack bundle, source-first workspace deps).
- Container: same Fargate task as before — no new image layer.
- Deploy: the standard `_deploy-aws.yml` workflow. Staging first; production flip is manual per ADR-0020 / AFF-220.

---

## 6. Rules

Hard rules. Breaking any of these breaks the docs surface, CI, or the public API contract.

### R1 — One spec, two consumers

The OpenAPI document is produced exactly once by `buildOpenApiDocument(app)`. Both `/v1/docs` and `/v1/openapi.json` consume the same in-memory object. Do not generate the spec twice, do not load it from disk at request time, do not branch on environment.

### R2 — Zod is the source of truth for schemas

Request and response shapes live as Zod schemas in `@workspace/shared/api`. NestJS DTO classes (`apps/api/src/v1/dto.ts`) are derived via `nestjs-zod`'s `createZodDto`. No hand-rolled OpenAPI fragments, no `@ApiProperty` decorators bolted onto plain classes. One schema, one source.

### R3 — Versioned URI prefix

Public routes use NestJS URI versioning (`VersioningType.URI`, prefix `v`). New endpoints land at `/v1/...`. Breaking changes increment the prefix; the old version stays live until formally deprecated.

### R4 — `@ApiTags` is mandatory

Every public controller carries `@ApiTags("…")`. Scalar groups operations by tag in the sidebar; an untagged operation drops to a generic bucket and degrades discovery. Tag values must match those declared in `buildOpenApiDocument` (`addTag(...)`).

### R5 — Bearer auth declared on protected operations

Every protected controller uses `@ApiBearerAuth()` alongside `@UseGuards(ApiKeyGuard)`. The decorator is what makes the "Try it out" lock icon appear and routes the configured bearer token. Missing the decorator means the UI can't authenticate even though the runtime guard still requires a key.

### R6 — No CSP loosening beyond Scalar's needs

The only allowed `script-src` additions are `'self'`, `'unsafe-inline'`, and `https://cdn.jsdelivr.net`. Do not add `'unsafe-eval'`. Do not add other CDN hosts without changing the Scalar `cdn` option to match. Self-hosting the bundle (section 11) would let us drop the CDN host entirely.

### R7 — Spec drift is fatal

`apps/api/openapi/v1.json` is the committed snapshot. CI re-emits the spec from code (`pnpm --filter api emit:openapi`) and fails on `git diff --exit-code`. If you change an endpoint, you re-emit and commit. No exceptions.

### R8 — Test the docs surface

`apps/api/src/docs.test.ts` asserts both routes respond, the HTML carries Scalar markers (`Scalar.createApiReference`, `cdn.jsdelivr.net/npm/@scalar/api-reference`), and the HTML does **not** contain `swagger-ui`. A silent package downgrade, a stale build, or an accidental re-introduction of `SwaggerModule.setup` all break this test. Keep it.

### R9 — Docs surface stays public

`/v1/docs` and `/v1/openapi.json` are never put behind a guard. If a future endpoint needs to be private, omit it from the OpenAPI build via `SwaggerModule.createDocument(..., { include: [PublicModule] })` rather than gating the docs page.

### R10 — Don't hand-edit the OpenAPI document at runtime

Mutating `document` after `buildOpenApiDocument` returns is forbidden. If you need different output, fix the controllers, the Zod schemas, or `packages/shared/src/api/registry.ts`. Runtime mutation has bitten teams in production; the document object is treated as immutable downstream.

---

## 7. Adding or changing endpoints

Every public API endpoint flows through seven steps. See `docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md` for the full procedure with exact paths and diffs.

1. **Author the Zod schema** in `packages/shared/src/api/<resource>.ts`. Chain `.openapi({ description, example })` on every public field.
2. **Register the operation** via `registry.registerPath({ ... })` in `packages/shared/src/api/registry.ts`. Reference the schema by name. Spread `ERROR_RESPONSE_REFS` into the `responses` map.
3. **Implement the controller** under `apps/api/src/v1/<resource>/`, mounted on `V1Module`. Read principal from the API key guard; never accept `organization_id` / `workspace_id` / `role` as input.
4. **Run `pnpm gen:all`** from the repo root. Commit the regenerated `apps/api/openapi/v1.json`, `packages/sdk/src/generated/`, and `apps/mcp/src/tools/generated/`.
5. **Write an E2E test** with tenant isolation. Co-locate under `apps/api/src/**/*.test.ts` (NestJS testing module) or `apps/web/e2e/` (Playwright auth-bound flow).
6. **Add a changeset** entry under `.changeset/` summarising the surface change.
7. **`pnpm verify` green** locally (typecheck + lint + test + boundaries + openapi-lint).

---

## 8. Local development

```bash
# from repo root
pnpm install
pnpm --filter api dev          # nest start --watch on :3001
open http://127.0.0.1:3001/
```

Useful one-offs:

```bash
pnpm --filter api typecheck     # tsc --noEmit
pnpm --filter api lint          # eslint
pnpm --filter api test          # vitest run (includes docs.test.ts)
pnpm --filter api build         # nest build --webpack
pnpm --filter api emit:openapi  # write apps/api/openapi/v1.json
```

Smoke-checking a built bundle locally requires either running through `tsx` (the dev command) or shipping with the deploy image — the webpack bundle externalizes runtime deps and pnpm's symlinked layout doesn't always resolve them from `apps/api/dist`.

---

## 9. Examples

Real endpoints, real shapes. These are the two operations that exist today.

### `GET /v1/ping`

Zero-DB smoke endpoint. Confirms the API key authenticated.

**Request:**

```http
GET /v1/ping HTTP/1.1
Host: api.afframe.com
Authorization: Bearer affk_live_…
```

**Response 200:**

```json
{
  "ok": true,
  "principal": {
    "organizationId": "01HXY…",
    "workspaceId": "01HXY…"
  }
}
```

**Response 401 (no key):**

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Missing API key",
    "requestId": "ab544b02-b43d-…"
  }
}
```

### `GET /v1/organization`

Returns the API key's own organization. Exercises the whole foundation: API-key auth → RLS tenancy (`withOrganization`) → typed response in OpenAPI.

**Request:**

```http
GET /v1/organization HTTP/1.1
Host: api.afframe.com
Authorization: Bearer affk_live_…
```

**Response 200:**

```json
{
  "organization": {
    "id": "01HXY…",
    "slug": "hapd",
    "legalName": "HAPD s.r.o.",
    "fiscalYearStartMonth": 1
  }
}
```

**Response 404:**

```json
{
  "error": {
    "code": "not_found",
    "message": "Organization not found",
    "requestId": "…"
  }
}
```

### Authentication header — every protected operation

```
Authorization: Bearer affk_live_<44-char-base64>
```

No query-string, no cookie, no basic auth. The lock icon in the Scalar UI maps to exactly this header.

---

## 10. Troubleshooting

### `/v1/docs` returns blank page

- Open devtools → Network. If `https://cdn.jsdelivr.net/npm/@scalar/api-reference` is blocked, CSP is wrong or the visitor's network blocks jsDelivr. Confirm the response header `Content-Security-Policy` lists `https://cdn.jsdelivr.net` in `script-src`.
- If the CDN script loaded but the page is empty, check the console for an error in `Scalar.createApiReference(...)`. Most commonly: the inline spec is invalid (Spectral would have caught it — re-run `pnpm --filter api emit:openapi` and `pnpm --filter . spectral lint`).

### `/v1/openapi.json` 404

- Confirm `registerDocsRoutes(app, document)` is called in `apps/api/src/main.ts`. The JSON route is registered there, not by Scalar.

### `swagger-ui` string appears in the rendered HTML

- A regression: someone re-introduced `SwaggerModule.setup(...)` somewhere. `apps/api/src/docs.test.ts` should have failed. Grep for `SwaggerModule.setup` across the repo.

### CSP violations in production console

- Read the directive name in the violation. If it's a font/style/img issue, default helmet directives already permit `https:` for fonts and `data:` for images — investigate before widening. If it's `script-src`, the only legitimate addition is the existing `cdn.jsdelivr.net` host; anything else means Scalar's renderer changed CDN, and the Scalar dep update needs review.

### "Try it out" requests fail with CORS

- The docs page is hosted on the same domain as the API (`api.afframe.com/` → `api.afframe.com/v1/<route>`). Same origin, no CORS preflight involved.
- If a partner hosts a _copy_ of the spec on their own domain, that's their proxy / CORS problem, not ours.

### Spec drift in CI (`openapi-lint`)

- `apps/api/openapi/v1.json` is stale. Run `pnpm --filter api emit:openapi`, commit the resulting diff. (R7)

---

## 11. Concept / planned APIs

> **Everything in this section is `[Concept]` — planned, not implemented.** A concept ships when its Linear issue closes and its endpoints appear in `/v1/openapi.json`. Until then, do not write client code against it; the shapes here are sketches, not contracts.

### `[Concept]` Domain endpoints — invoices, accounts, journals (AFF-71)

The first real business surface. Planned operations (subject to refinement during discuss/plan phases):

| Method | Path                      | Purpose                                                                     |
| ------ | ------------------------- | --------------------------------------------------------------------------- |
| `GET`  | `/v1/invoices`            | List invoices, paginated, filterable by status / counterparty / date range. |
| `GET`  | `/v1/invoices/{id}`       | Fetch a single invoice including line items.                                |
| `POST` | `/v1/invoices`            | Create an invoice (faktura vydaná). Amounts in `Money<CZK>` minor units.    |
| `POST` | `/v1/invoices/{id}/issue` | Transition draft → issued. Triggers numbering, locks edits.                 |
| `GET`  | `/v1/accounts`            | Chart of accounts.                                                          |
| `GET`  | `/v1/journals`            | Posting journals, by period.                                                |
| `POST` | `/v1/journals/{id}/post`  | Post a journal entry. Domain-locked once posted.                            |

Money fields will appear as `{ "amount": "12345", "currency": "CZK" }` — minor units as a string, never a JavaScript `number` (per ADR-0013).

### `[Concept]` Authorization on resource endpoints (AFF-46)

Three-layer authz (per ADR-0018) lands with the first resource endpoint:

- **L1 — Tenancy** (already live): API-key principal scopes every query via Postgres RLS.
- **L2 — Relationship** (OpenFGA): can this principal _see_ this invoice? Multi-tenant relationship graph.
- **L3 — Policy** (Cerbos): given the role and the resource attributes, is this _action_ permitted? Per-action policy decisions.

The docs page will surface authz failures as a stable `forbidden` error code in the existing envelope. No schema change to the docs surface itself.

### `[Concept]` API key management (AFF-73)

Today: keys are seeded manually into the `api_key` table. Planned admin dashboard:

| Method   | Path                      | Purpose                                                                                                             |
| -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/v1/admin/api-keys`      | List keys for the calling org. Returns metadata only (label, prefix, last_used_at). The raw key is never re-served. |
| `POST`   | `/v1/admin/api-keys`      | Issue a new key. Returns the raw value **once** in the response body; thereafter only the hash is stored.           |
| `DELETE` | `/v1/admin/api-keys/{id}` | Revoke. Immediate, no grace.                                                                                        |

This surface lives under `/v1/admin/...` because it's gated on org-admin role on top of the API-key auth, not the same flat permission model as data endpoints.

### `[Concept]` Webhooks

Push notifications for state changes (invoice issued, payment received, period closed).

| Method   | Path                       | Purpose                                     |
| -------- | -------------------------- | ------------------------------------------- |
| `GET`    | `/v1/webhooks`             | List configured endpoints.                  |
| `POST`   | `/v1/webhooks`             | Register a target URL + event subscription. |
| `POST`   | `/v1/webhooks/{id}/rotate` | Rotate the signing secret.                  |
| `DELETE` | `/v1/webhooks/{id}`        | Remove.                                     |

Signed with HMAC-SHA256. Replay protection via timestamp + nonce header. Retries with exponential backoff, dead-lettered after N failures. Not designed yet — exact retry policy will live in a future ADR.

### `[Concept]` Money + FX endpoints

Read-only surface over the rates table referenced in ADR-0013:

| Method | Path                                           | Purpose                                                                                                         |
| ------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/v1/fx/rates?from=EUR&to=CZK&date=2026-05-20` | Resolve a single rate. Errors if the rate doesn't exist on that date — no auto-substitution, no auto-inversion. |
| `GET`  | `/v1/fx/rates?date=2026-05-20`                 | All rates for a date.                                                                                           |

Useful for partners who need to mirror the platform's FX convention exactly (e.g., when issuing invoices in EUR but reporting in CZK).

### `[Concept]` SDK distribution

`/v1/openapi.json` is enough to generate a client today. A planned future addition: a CI job that runs `openapi-typescript` + `openapi-fetch` against the committed `apps/api/openapi/v1.json` and publishes typed clients to npm under `@afframe/sdk` (TypeScript first, Python second). Out of scope for now.

### `[Concept]` Docs surface evolution

- **SSR-rendered Scalar** (`@scalar/server-side-rendering`) — drop `'unsafe-inline'` from CSP. First-paint improves; bundle still ships from jsDelivr.
- **Self-hosted bundle** — drop `cdn.jsdelivr.net` from CSP. Requires bundling `@scalar/api-reference` into the API container and serving it from `/v1/docs/assets/...`. Adds image weight; gains air-gap support.
- **Brand theme** — map shadcn / Tailwind tokens (`packages/ui`) to Scalar's `--scalar-*` CSS variables via `customCss`. Pure cosmetic.
- **Multi-version docs** — when `/v2/` lands, mount a second Scalar instance at `/v2/docs` with its own document. The current `registerDocsRoutes` shape generalizes cleanly.

---

## 12. References

- [`docs/api/README.md`](./README.md) — public API architecture overview
- [`ADR-0020`](../adr/0020-public-api-foundation.md) — public API foundation
- [`ADR-0013`](../adr/0013-money-and-fx.md) — money + FX conventions
- [`ADR-0018`](../adr/0018-three-layer-authz.md) — three-layer authorization
- [`ADR-0022`](../adr/0022-unified-opaque-tokens.md) — opaque-token + DB-hash pattern (API keys, invites)
- [Scalar repo](https://github.com/scalar/scalar) — upstream
- [Scalar NestJS integration docs](https://scalar.com/products/api-references/integrations/nestjs) — official
- Linear AFF-220 — replacement implementation issue
