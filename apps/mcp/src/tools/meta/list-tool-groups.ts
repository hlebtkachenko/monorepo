import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { TOOL_GROUP_CATALOG } from "../generated"

/**
 * Always-registered discovery tool. Lets an agent that connected to a narrow
 * subset (`?groups=…`) learn which other groups exist without leaving the
 * session. Lives outside `generated/`, so `mcp-coverage` never sees it.
 */
export function registerListToolGroups(server: McpServer): void {
  server.registerTool(
    "list_tool_groups",
    {
      title: "List tool groups",
      description:
        "List the selectable Afframe MCP tool groups (slug, description, tool count). Reconnect with `?groups=<slug>,…` (and optional `?scope=read|write`) to load just those tools instead of the full set.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (): CallToolResult => ({
      content: [
        { type: "text", text: JSON.stringify(TOOL_GROUP_CATALOG, null, 2) },
      ],
    }),
  )
}
