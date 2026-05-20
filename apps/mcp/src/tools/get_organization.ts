import type { Afframe } from "@afframe/sdk"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { renderResult, toolError } from "./_render"

/**
 * `get_organization` — wraps `GET /v1/organization`. Returns the API key's
 * own organization (id, slug, legal name, fiscal year start month).
 * Read-only.
 */
export function registerGetOrganization(
  server: McpServer,
  client: Afframe,
): void {
  server.registerTool(
    "get_organization",
    {
      title: "Get organization",
      description:
        "Return the organization the configured API key belongs to. Wraps GET /v1/organization.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (): Promise<CallToolResult> => {
      try {
        const res = await client.organization.get()
        return renderResult(res)
      } catch (err) {
        return toolError(err)
      }
    },
  )
}
