import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { buildClient } from "./client"
import { registerGetOrganization } from "./tools/get_organization"
import { registerPing } from "./tools/ping"

const VERSION = "0.0.1"

/**
 * `@afframe/mcp` — MCP server exposing the Afframe public API to LLM clients
 * (Claude Desktop, Claude Code, Cursor, …).
 *
 * v0.1 surface: two read tools wrapping the foundation endpoints. New tools
 * land per docs/api/MCP.md as the API grows. Transport is STDIO for the
 * npx-install path; the hosted Streamable HTTP server at mcp.afframe.com is a
 * separate deployment using the same tool registry.
 *
 * Auth: AFFRAME_API_KEY env var (Bearer). Validated lazily — first tool call
 * surfaces an UnauthorizedError if the key is rejected; the server itself
 * boots offline.
 */
async function main(): Promise<void> {
  const client = buildClient()
  const server = new McpServer({
    name: "@afframe/mcp",
    version: VERSION,
  })

  registerPing(server, client)
  registerGetOrganization(server, client)

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err: unknown) => {
  process.stderr.write(`@afframe/mcp: ${(err as Error).message}\n`)
  process.exit(2)
})
