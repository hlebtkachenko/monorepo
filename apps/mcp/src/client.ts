import { Afframe, type AfframeOptions } from "@afframe/sdk"

/**
 * Build the Afframe SDK client used by every tool handler.
 *
 * - `AFFRAME_API_KEY` is required at startup; the server fails fast if absent
 *   with a one-line stderr message (no MCP-tool error chatter).
 * - `AFFRAME_API_BASE` overrides the base URL — point at staging or a local
 *   container without changing the config.
 *
 * The client is created once and shared across tool calls. Stateless server,
 * stateless client.
 */
export function buildClient(): Afframe {
  const apiKey = process.env.AFFRAME_API_KEY
  if (!apiKey) {
    process.stderr.write(
      "@afframe/mcp: AFFRAME_API_KEY is required (set in claude_desktop_config.json env)\n",
    )
    process.exit(1)
  }
  const options: AfframeOptions = {
    apiKey,
    userAgent: "mcp",
  }
  const baseUrl = process.env.AFFRAME_API_BASE
  if (baseUrl) options.baseUrl = baseUrl
  return new Afframe(options)
}
