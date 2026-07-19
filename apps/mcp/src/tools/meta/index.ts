import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerListToolGroups } from "./list-tool-groups"

/** Register the always-on meta/discovery tools (independent of the selection). */
export function registerMetaTools(server: McpServer): void {
  registerListToolGroups(server)
}
