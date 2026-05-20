# `@afframe/sdk` — TypeScript SDK Design

> **[Concept]** Not implemented. Tracked under the developer-platform initiative ([`ADR-0023`](../adr/0023-public-api-developer-platform.md)).

Reference design for the official TypeScript client of `api.afframe.com/v1`.

---

## 1. Decisions

| Question                     | Answer                                                                                                                                                                                          | Why                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Generator                    | [`hey-api/openapi-ts`](https://github.com/hey-api/openapi-ts)                                                                                                                                   | MIT, plugin architecture (TS types, Zod, fetch/axios, TanStack Query). Used by Vercel, PayPal. Tree-shake-friendly. |
| Languages                    | TypeScript at launch. Python via Speakeasy when a paying partner asks. Go on first partner ask.                                                                                                 | Don't fan out languages until there's demand                                                                        |
| Runtime client               | `fetch` (built-in, edge-compatible)                                                                                                                                                             | No `axios` dep. Works on Node 18+, Workers, Deno, browser.                                                          |
| Module format                | ESM-first, CJS shim via `tsup`                                                                                                                                                                  | Modern Node, Workers, edge runtimes                                                                                 |
| Package name                 | `@afframe/sdk` on npm                                                                                                                                                                           | Standard org-prefixed                                                                                               |
| Semver vs API version        | **Independent**. API path = `/v1`; SDK = its own MAJOR/MINOR/PATCH                                                                                                                              | A new `/v2` doesn't auto-bump the SDK MAJOR                                                                         |
| Validation                   | Zod schemas re-exported from `@workspace/shared/api`                                                                                                                                            | One source of truth, server and client agree                                                                        |
| Branded types (`Money<CZK>`) | `x-typescript-type` extension on OpenAPI + post-codegen `tsmorph` pass                                                                                                                          | OpenAPI alone can't express brand; rewrite fields tagged `x-brand: Money`                                           |
| Dates                        | Wire as ISO-8601 string. Opt-in `Date` transformer.                                                                                                                                             | Avoid hidden `JSON.parse` reviver footguns                                                                          |
| Discriminated unions         | `parseEvent()` helper using `z.discriminatedUnion` until [hey-api #3270](https://github.com/hey-api/openapi-ts/issues/3270) lands. Switch to Speakeasy if needed for Event union strict typing. | Webhook event union needs strict typing                                                                             |
| Tree-shake                   | `sideEffects: false`, top-level `exports` map per environment                                                                                                                                   | Modern bundler-friendly                                                                                             |
| Repo location                | `packages/sdk` (internal source) + published as `@afframe/sdk`                                                                                                                                  | Monorepo-co-located; published artefact only                                                                        |

---

## 2. Public surface

```ts
import { Afframe } from "@afframe/sdk"

const afframe = new Afframe({
  apiKey: process.env.AFFRAME_API_KEY!, // affk_live_... or affk_test_...
  // Optional:
  baseUrl: "https://api.afframe.com", // default
  timeoutMs: 30_000, // default
  retries: 2, // default; 0 to disable
  fetch, // BYO fetch (Workers, undici, etc.)
})

// Resource-method style
const me = await afframe.organization.get()
const draft = await afframe.invoices.create(
  {
    customerId: "cust_…",
    lines: [
      {
        description: "Audit fee",
        amount: { amount: "1234500", currency: "CZK" },
      },
    ],
  },
  {
    idempotencyKey: crypto.randomUUID(),
  },
)

// Pagination — generator (cursor-aware)
for await (const inv of afframe.invoices.list({ status: "draft" })) {
  console.log(inv.id, inv.total)
}

// Webhook signature verify (Standard Webhooks)
import { verifyWebhook } from "@afframe/sdk/webhooks"
const event = verifyWebhook(request.body, request.headers, {
  secret: WEBHOOK_SECRET,
})
```

---

## 3. Errors

```ts
import { ApiError, RateLimitError, ValidationError } from "@afframe/sdk"

try {
  await afframe.invoices.create({ ... })
} catch (err) {
  if (err instanceof ValidationError) {
    // err.code === "validation_failed"
    // err.details — field-level paths
  } else if (err instanceof RateLimitError) {
    // err.retryAfterMs — derived from Retry-After
  } else if (err instanceof ApiError) {
    // err.code, err.message, err.requestId
  }
}
```

The SDK exports typed `Error` subclasses keyed off `error.code` (the same registry as [`ERRORS.md`](./ERRORS.md)). Unknown codes fall back to `ApiError`.

---

## 4. Idempotency

- Every mutating method accepts an `idempotencyKey` option.
- If omitted on money-mutating endpoints (`invoices.create`, `journals.post`, future `payments.create`), the SDK generates a UUID v4 and warns once in development (`process.env.NODE_ENV !== "production"`).
- On retry-after-network-error, the same key is reused. The SDK does NOT generate a new key.

---

## 5. Pagination

Cursor-based. The SDK exposes both:

```ts
// Async iterator
for await (const inv of afframe.invoices.list({ status: "draft" })) { ... }

// Manual cursor
const page1 = await afframe.invoices.list.page({ status: "draft", limit: 50 })
const page2 = await afframe.invoices.list.page({ status: "draft", cursor: page1.nextCursor })
```

No offsets. No total counts (`hasMore: boolean` only).

---

## 6. Versioning

| Change                                  | API path                                                                                               | SDK                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Additive field on existing endpoint     | `/v1` unchanged                                                                                        | MINOR                              |
| Additive endpoint                       | `/v1` unchanged                                                                                        | MINOR                              |
| Endpoint deprecation (Sunset announced) | `/v1` unchanged                                                                                        | MINOR (logs `console.warn` on use) |
| Endpoint removal post-Sunset            | `/v1` unchanged                                                                                        | MAJOR                              |
| Breaking schema change                  | `/v2` ships in parallel; SDK adds `afframe.v2.*` namespace, eventually flips default at next SDK MAJOR | MAJOR (whichever ships first)      |

Document the matrix in `packages/sdk/README.md`.

---

## 7. Generation pipeline

1. `pnpm --filter api emit:openapi` produces `apps/api/openapi/v1.json`.
2. `pnpm --filter @afframe/sdk codegen` runs `hey-api/openapi-ts` against the spec, emits to `packages/sdk/src/generated/`.
3. Post-codegen `tsmorph` pass rewrites `x-brand` fields to branded types.
4. `pnpm --filter @afframe/sdk build` (`tsup`) emits ESM + CJS + `.d.ts`.
5. Release: tag `sdk-v*` → `.github/workflows/sdk-release.yml` (concept) publishes to npm with provenance (`npm publish --provenance`).

The codegen step is part of `pnpm --filter api emit:openapi`'s CI check — if codegen output diffs, CI fails (mirrors the OpenAPI drift gate).

---

## 8. Roadmap

| Milestone | Scope                                                                             |
| --------- | --------------------------------------------------------------------------------- |
| 0.1       | Generated client for `/v1/ping` + `/v1/organization`. Internal only.              |
| 0.5       | Full AFF-71 domain coverage. Error class hierarchy. Pagination iterator.          |
| 0.9       | Idempotency defaults. Webhook verifier. Worker / edge runtime tested.             |
| 1.0       | Documented `@afframe/sdk` on npm. README on `/docs/sdk`. SemVer policy published. |

---

## 9. Out of scope (deliberately)

- **Caching**. The SDK is a thin wire client. Callers wire their own caching (React Query, Apollo, Tanstack Query, …). The TanStack Query plugin in hey-api gives them helpers.
- **Background sync**. Out of scope until partner ask.
- **CLI wrapping**. `apps/cli` is its own product — see [`CLI.md`](./CLI.md).
- **Schema-only export**. We export Zod schemas under `@afframe/sdk/schemas` for partners who want to validate without the client.

---

## 10. References

- [`hey-api/openapi-ts`](https://github.com/hey-api/openapi-ts)
- [Speakeasy SDK comparison](https://www.speakeasy.com/blog/comparison-sdk-generators-openapi)
- [Standard Webhooks](https://www.standardwebhooks.com/) — webhook verifier
- [Semantic Versioning](https://semver.org/)
- [`ADR-0023`](../adr/0023-public-api-developer-platform.md), [`ERRORS.md`](./ERRORS.md), [`WEBHOOKS.md`](./WEBHOOKS.md)
