# `@afframe/sdk`

Official TypeScript SDK for the Afframe public API (`api.afframe.com/v1`).

> **Status**: `0.0.1` — internal/preview. The public release that lands on npm is tracked in [`docs/api/SDK.md`](../../docs/api/SDK.md).

## Install

```bash
pnpm add @afframe/sdk
```

## Use

```ts
import { Afframe } from "@afframe/sdk"

const afframe = new Afframe({
  apiKey: process.env.AFFRAME_API_KEY!, // affk_live_… (sandbox affk_test_ keys: not issued yet)
  // Optional:
  // baseUrl: "https://api-staging.afframe.com",
  // timeoutMs: 30_000,
})

const ping = await afframe.meta.ping()
// { ok: true, principal: { organizationId, workspaceId } }

const { organization } = await afframe.organization.get()
console.log(organization.legalName, organization.fiscalYearStartMonth)
```

## Errors

Every failure throws a typed [`AfframeApiError`](./src/errors.ts) subclass with the request id and a deep link to the docs:

```ts
import { Afframe, RateLimitError, UnauthorizedError } from "@afframe/sdk"

try {
  await afframe.meta.ping()
} catch (err) {
  if (err instanceof RateLimitError) {
    await sleep((err.retryAfter ?? 1) * 1000)
  } else if (err instanceof UnauthorizedError) {
    // err.code === "unauthorized"
    // err.requestId, err.documentationUrl
  }
}
```

Code registry: [`docs/api/ERRORS.md`](../../docs/api/ERRORS.md).

## Bring your own `fetch`

Edge runtimes, undici, mocked fetch in tests — pass `fetch` explicitly:

```ts
import { Afframe } from "@afframe/sdk"
import { fetch } from "undici"

new Afframe({
  apiKey: "...",
  fetch: fetch as unknown as typeof globalThis.fetch,
})
```

## Schemas without the client

```ts
import { PingResponseSchema } from "@afframe/sdk/schemas"

const safe = PingResponseSchema.safeParse(someUnknownPayload)
```

Useful for webhook handlers that need runtime validation without taking the network shim.

## What's in here today

| Method               | API operation          |
| -------------------- | ---------------------- |
| `meta.ping()`        | `GET /v1/ping`         |
| `organization.get()` | `GET /v1/organization` |

Domain endpoints (invoices, accounts, journals) land with [AFF-71](https://linear.app/).

## Design

See [`docs/api/SDK.md`](../../docs/api/SDK.md) for the full design, versioning rules, and the matrix of API path version vs SDK semver.
