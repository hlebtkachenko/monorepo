import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { buildClient } from "./client"
import { registerGeneratedTools } from "./tools/generated"

const VERSION = "0.0.1"

/**
 * `@afframe/mcp` — MCP server exposing the Afframe public API to LLM clients
 * (Claude Desktop, Claude Code, Cursor, …).
 *
 * Tools are codegen'd from `apps/api/openapi/v1.json` into
 * `src/tools/generated/` by `pnpm --filter @afframe/mcp gen`. The hand-curated
 * `tools/_curate.ts` lookup table layers in per-operation annotations
 * (read-only / destructive / idempotent) the spec can't express. The surface
 * grows automatically as the shared registry grows — no manual tool
 * registration except for curation entries.
 *
 * Transport is STDIO for the npx-install path; the hosted Streamable HTTP
 * server (mcp.afframe.com, once deployed) is a separate process backed by
 * the same generated table.
 *
 * Auth: `AFFRAME_API_KEY` env var (Bearer). Validated lazily — the first
 * tool call surfaces an `UnauthorizedError` if the key is rejected; the
 * server itself boots offline.
 */
async function main(): Promise<void> {
  const client = buildClient()
  const server = new McpServer({
    name: "@afframe/mcp",
    version: VERSION,
  })

  registerGeneratedTools(server, client)

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err: unknown) => {
  process.stderr.write(`@afframe/mcp: ${(err as Error).message}\n`)
  process.exit(2)
})
