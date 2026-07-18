import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { buildClient } from "./client"
import { registerGeneratedTools } from "./tools/generated"

const VERSION = process.env.MCP_BUILD_VERSION ?? "0.0.0-dev"

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
 * server (mcp.afframe.com) is a separate entrypoint (`src/http.ts`) backed by
 * the same generated table and the same `buildClient` factory.
 *
 * Auth: `AFFRAME_API_KEY` env var (Bearer), read here at boot — the server
 * fails fast with a one-line stderr message if it is missing. Key *validity*
 * is checked lazily: the first tool call surfaces an `UnauthorizedError` if
 * the API rejects the key; the server itself boots offline.
 */
async function main(): Promise<void> {
  const apiKey = process.env.AFFRAME_API_KEY
  if (!apiKey) {
    process.stderr.write(
      "@afframe/mcp: AFFRAME_API_KEY is required (set in claude_desktop_config.json env)\n",
    )
    process.exit(1)
  }
  const client = buildClient(apiKey, process.env.AFFRAME_API_BASE)
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
