import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Build-time corpus assembly for Ask AI. Reads the committed OpenAPI spec
 * plus a curated set of developer-page summaries, returns the concatenated
 * text Anthropic's Haiku 4.5 grounds answers against.
 *
 * Two reasons this is build-time, not request-time:
 *   1. The corpus is small (current OpenAPI v1 + ~15 narrative summaries
 *      fit in well under 100 KB), so streaming retrieval is overkill.
 *   2. Prompt caching wants a stable prefix on every request; loading
 *      from disk per request inflates first-token latency.
 *
 * A future Pagefind-driven retrieval layer can replace `assembleCorpus`
 * without touching the route handler.
 */

const NARRATIVE: { path: string; summary: string }[] = [
  {
    path: "/developers/quickstart",
    summary:
      "Quickstart: get an API key in the dashboard, send `Authorization: " +
      "Bearer affk_live_...` to https://api.afframe.com/v1/ping, get back " +
      "the resolved organizationId + workspaceId.",
  },
  {
    path: "/developers/authentication",
    summary:
      "Authentication is bearer-only. Keys are `affk_live_...` (prod) " +
      "or `affk_test_...` (sandbox). Missing/malformed → 401, wrong env " +
      "→ 403, scope miss → 403 with missing scope in display_message. Each " +
      "key is bound to one organizationId + workspaceId; server injects, " +
      "never an input field.",
  },
  {
    path: "/developers/errors",
    summary:
      "Plaid envelope: { error: { code, error_type, message, " +
      "documentation_url, requestId, details? } }. Codes: bad_request, " +
      "unauthorized, forbidden, not_found, conflict, idempotency_conflict, " +
      "stale_resource, feature_not_enabled, payload_too_large, " +
      "validation_error, rate_limited, internal_error. SDK maps each to a " +
      "typed Error subclass. Switch on `code`, never `message`.",
  },
  {
    path: "/developers/rate-limits",
    summary:
      "IETF RateLimit-Limit / -Remaining / -Reset on every response. On " +
      "429, Retry-After (seconds or HTTP-date). SDK retries 429 + 5xx " +
      "once at 5s cap, honouring Retry-After. Mutations retry only when " +
      "Idempotency-Key is set.",
  },
  {
    path: "/developers/idempotency",
    summary:
      "Send Idempotency-Key header on mutations. Server caches first " +
      "response under the key for 24h. Same key + same body → cached " +
      "response. Same key + different body → 409 idempotency_conflict.",
  },
  {
    path: "/developers/webhooks",
    summary:
      "Standard Webhooks v1: webhook-id, webhook-timestamp, " +
      "webhook-signature headers. Signature = `v1,` + base64(HMAC-SHA-256(" +
      "secret, id.timestamp.body)). Tolerance default 300s. `verifyWebhook` " +
      "in @afframe/sdk throws WebhookVerificationError with codes " +
      "missing_header / invalid_timestamp / stale_timestamp / " +
      "invalid_signature.",
  },
  {
    path: "/developers/sdks",
    summary:
      "@afframe/sdk: `createAfframeClient({ apiKey })` returns an " +
      "openapi-fetch client typed from the spec. Brands: Money<C> bigint, " +
      "FxRate<F,T>, branded resource IDs. Auth + accept + x-afframe-client " +
      "set as default headers (no forbidden user-agent). Retries + timeout " +
      "via fetch wrapper, not middleware.",
  },
  {
    path: "/developers/cli",
    summary:
      "@afframe/cli: thin wrapper over the SDK. Config: AFFRAME_API_KEY / " +
      "AFFRAME_API_BASE / AFFRAME_PROFILE env vars or ~/.config/afframe/" +
      "config.toml. Output: JSON to stdout, Plaid envelope to stderr on " +
      "error.",
  },
  {
    path: "/developers/mcp",
    summary:
      "@afframe/mcp: Model Context Protocol server. Every operationId " +
      "becomes a tool. Stdio for npx install. Method-derived annotations " +
      "with hand-curated overrides in tools/_curate.ts for destructive " +
      "POSTs (e.g. send-email).",
  },
]

// Process-wide cache. The corpus is identical for every request in a
// running container (the spec is baked into the image; narrative is
// module-level), so a single assembly per process is what we want.
// Restart the container to pick up a fresh spec.
let cached: string | null = null

/**
 * Lazy-assemble the Ask AI corpus from the on-disk OpenAPI spec + the
 * `NARRATIVE` table. First call reads + concatenates; subsequent calls
 * return the cached string.
 */
export function getCorpus(specPath: string): string {
  if (cached !== null) return cached
  const spec = readFileSync(specPath, "utf8")
  const narrative = NARRATIVE.map((n) => `## ${n.path}\n${n.summary}`).join(
    "\n\n",
  )
  cached = [
    "# Afframe OpenAPI 3.1 spec (canonical)",
    "```json",
    spec,
    "```",
    "",
    "# Narrative summaries",
    narrative,
  ].join("\n")
  return cached
}

/**
 * Resolve the path the route handler reads. Different at build time
 * (workspace-relative) vs. inside the docker container (relative to
 * `/app/apps/docs/public/spec.json` once copied in).
 */
export function specPath(): string {
  return (
    process.env.AFFRAME_OPENAPI_PATH ??
    join(process.cwd(), "..", "..", "apps", "api", "openapi", "v1.json")
  )
}
