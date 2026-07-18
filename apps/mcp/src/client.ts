import { createAfframeClient, type AfframeClient } from "@afframe/sdk"

/**
 * Build the Afframe SDK client used by every generated tool handler.
 *
 * Request-scoped by design: the caller supplies the API key, so the same
 * factory serves both transports without a shared, long-lived client — the
 * stdio entrypoint passes the boot-time `AFFRAME_API_KEY`, and the hosted
 * Worker passes the per-request bearer (a fresh client per request, never a
 * cached principal). `baseUrl` overrides the API base (staging / a local
 * container) and defaults to the SDK's production base.
 *
 * Returns the openapi-fetch surface so the generated tools can `client.GET(...)`
 * / `client.POST(...)` directly against the typed paths from
 * `apps/api/openapi/v1.json`.
 */
export function buildClient(apiKey: string, baseUrl?: string): AfframeClient {
  return createAfframeClient({
    apiKey,
    baseUrl,
    userAgent: "mcp",
  })
}
