import type { Afframe } from "@afframe/sdk"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { renderResult, toolError } from "./_render"

/**
 * `ping` — wraps `GET /v1/ping`. Zero-DB smoke test that the configured key
 * authenticates. Read-only, idempotent.
 */
export function registerPing(server: McpServer, client: Afframe): void {
  server.registerTool(
    "ping",
    {
      title: "Ping",
      description:
        "Confirm that the configured Afframe API key authenticates. Wraps GET /v1/ping. Returns the resolved principal (organization_id, workspace_id).",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (): Promise<CallToolResult> => {
      try {
        const res = await client.meta.ping()
        return renderResult(res)
      } catch (err) {
        return toolError(err)
      }
    },
  )
}
