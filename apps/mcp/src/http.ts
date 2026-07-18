// This file is the Cloudflare Worker entrypoint. It is typechecked under BOTH
// tsconfig.json (node) and tsconfig.worker.json (@cloudflare/workers-types), so
// it must use only Web-standard globals (Request/Response/URL) available in both
// runtimes — no node-only (Buffer, process) or worker-only (caches, WebSocketPair)
// APIs, or one of the two typecheck passes will fail.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { buildClient } from "./client"
import { registerGeneratedTools } from "./tools/generated"

const VERSION = "0.0.1"

interface Env {
  /**
   * Public API base the generated tools call (e.g. https://api.afframe.com).
   * Set per wrangler environment in `wrangler.jsonc` `vars`; required — the
   * Worker fails closed if it is missing rather than silently forwarding the
   * caller's key to the SDK's production default.
   */
  AFFRAME_API_BASE: string
}

/**
 * Extract a non-empty Bearer token from the request, or `null`.
 *
 * Prefix-agnostic on purpose: live keys still carry the legacy `afk_` prefix,
 * and the token's validity is the API's job (`ApiKeyGuard`), not the edge's.
 * The edge only enforces *presence* so the tool catalog cannot be listed
 * anonymously.
 */
function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? ""
  const match = /^Bearer[ ]+(\S.*)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  return token ? token : null
}

function unauthorized(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message:
          "Unauthorized: send an Afframe API key as `Authorization: Bearer <key>`.",
      },
      id: null,
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": 'Bearer realm="afframe-mcp"',
      },
    },
  )
}

/**
 * Hosted Streamable-HTTP entrypoint for `mcp.afframe.com` (Cloudflare Worker).
 *
 * Stateless: a fresh McpServer + transport is built per request and discarded
 * after it responds — no session store, no cached principal. The caller's API
 * key is read from the `Authorization` header and forwarded through a
 * per-request SDK client to the public API, where `ApiKeyGuard` verifies the
 * key and enforces scopes + tenant isolation. The Worker cannot reach the
 * database, so the API is the sole enforcement point; the Worker only
 * transports and gates on bearer presence.
 *
 * Every MCP method — including `initialize` and `tools/list` — requires a
 * bearer, so the (write-capable) tool catalog cannot be enumerated
 * anonymously. Only the unauthenticated `GET /health` liveness probe is open.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "@afframe/mcp",
        transport: "streamable-http",
      })
    }

    const token = bearerToken(request)
    if (!token) return unauthorized()

    if (!env.AFFRAME_API_BASE) {
      // Deploy misconfiguration — fail closed rather than let the SDK forward
      // the caller's key to its production default base from a wrong env.
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Server misconfigured." },
          id: null,
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      )
    }

    const client = buildClient(token, env.AFFRAME_API_BASE)
    const server = new McpServer({ name: "@afframe/mcp", version: VERSION })
    registerGeneratedTools(server, client)

    const transport = new WebStandardStreamableHTTPServerTransport({
      // Stateless: no session id → one server+transport per request.
      sessionIdGenerator: undefined,
      // Return a single JSON response instead of opening an SSE stream.
      enableJsonResponse: true,
    })
    await server.connect(transport)
    return transport.handleRequest(request)
  },
}
