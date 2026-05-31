import { createAfframeClient, type AfframeClient } from "@afframe/sdk"

/**
 * Build the Afframe SDK client used by every generated tool handler.
 *
 * - `AFFRAME_API_KEY` is required at startup; the server fails fast with a
 *   one-line stderr message (no MCP-tool error chatter on auth issues).
 * - `AFFRAME_API_BASE` overrides the base URL — point at staging or a local
 *   container without changing the config.
 *
 * The client is created once and shared across tool calls. Stateless server,
 * stateless client. Returns the openapi-fetch surface (`@afframe/sdk`'s
 * `createAfframeClient`) so the generated tools can `client.GET(...)` /
 * `client.POST(...)` directly against the typed paths from
 * `apps/api/openapi/v1.json`.
 */
export function buildClient(): AfframeClient {
  const apiKey = process.env.AFFRAME_API_KEY
  if (!apiKey) {
    process.stderr.write(
      "@afframe/mcp: AFFRAME_API_KEY is required (set in claude_desktop_config.json env)\n",
    )
    process.exit(1)
  }
  return createAfframeClient({
    apiKey,
    baseUrl: process.env.AFFRAME_API_BASE,
    userAgent: "mcp",
  })
}
