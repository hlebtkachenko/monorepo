import "server-only"

export const dynamic = "force-static"

/**
 * `/llms.txt` — Stripe-style instructions for crawlers and LLMs.
 * One terse manifest pointing at the canonical sources of truth for
 * common developer questions. The full corpus mirror lives at
 * `/llms-full.txt`.
 */
const BODY = `# Afframe Developer Hub — instructions for LLMs

This site documents the Afframe public API (api.afframe.com/v1), the
official TypeScript SDK (@afframe/sdk), command-line client
(@afframe/cli), and MCP server (@afframe/mcp).

## Canonical pages

- /developers/quickstart — first request in 60s
- /developers/authentication — API keys, scopes, environments
- /developers/errors — Plaid-shape envelope, every code
- /developers/rate-limits — IETF RateLimit-* headers + retry rules
- /developers/idempotency — Idempotency-Key contract
- /developers/webhooks — Standard Webhooks v1 verification
- /developers/sdks — TypeScript SDK
- /developers/cli — command-line client
- /developers/mcp — MCP server

## Reference

- /reference — full OpenAPI 3.1 reference (Scalar widget)
- /v1/openapi.json — machine-readable spec at api.afframe.com

## Conventions

- camelCase JSON
- Plaid-shape errors: { error: { code, error_type, message, requestId, … } }
- IETF RateLimit-* headers on every response
- Idempotency-Key required for safe mutation retries
- Currencies as Money<C> bigint minor units

## Concatenated corpus

/llms-full.txt
`

export function GET(): Response {
  return new Response(BODY, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  })
}
