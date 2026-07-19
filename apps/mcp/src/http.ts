// This file is the Cloudflare Worker entrypoint. It is typechecked under BOTH
// tsconfig.json (node) and tsconfig.worker.json (@cloudflare/workers-types), so
// it must use only Web-standard globals (Request/Response/URL) available in both
// runtimes — no node-only (Buffer, process) or worker-only (caches, WebSocketPair)
// APIs, or one of the two typecheck passes will fail.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { buildClient } from "./client"
import {
  registerGeneratedTools,
  TOOL_GROUP_CATALOG,
  type ToolSelection,
} from "./tools/generated"
import { registerMetaTools } from "./tools/meta"

const VERSION = "0.0.1"

/** RFC 9728 protected-resource metadata discovery path (relative to origin). */
const PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource"

/**
 * Scopes this resource server understands, surfaced in the RFC 9728 metadata so
 * a client knows what it may request. Mirrors the authorization server's
 * advertised set (`oauthProvider({ scopes })` in `@workspace/auth`): the OIDC
 * set plus the coarse API capability scopes the `/v1` `@RequireScopes` checks
 * accept. Advisory only — the real grant is enforced per call at the API.
 */
const OAUTH_SCOPES_SUPPORTED = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting:read",
  "accounting:write",
] as const

/**
 * Parse the connection-time tool selection from the URL query, so an agent can
 * load only a relevant subset instead of all tools:
 *   ?groups=invoices,accounting   register only those tag groups
 *   ?scope=read|write|all         register only read-only / non-destructive / all
 * Both are optional and compose. Unknown group names simply match nothing.
 *
 * NOT an authorization boundary. `groups`/`scope` only narrow what the LLM
 * *sees*; they never widen access. Registering a tool is not authorizing it —
 * every call still carries the caller's bearer to the API, where `ApiKeyGuard`
 * enforces scope + tenant per invocation. Selection also fails OPEN by design:
 * an empty/blank/unparseable value resolves to the full set (a bad `?scope`
 * typo yields all tools, never zero), so it must never be relied on as a
 * read-only control. The only real read-only guarantee is a read-scoped API
 * key.
 */
export function parseSelection(url: URL): ToolSelection {
  const groupsParam = url.searchParams.get("groups")
  const parsedGroups = (groupsParam ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean)
  // Normalize "no meaningful group named" (?groups=, ?groups=,) to undefined =
  // full set, so it never collapses to a zero-tool server.
  const groups = parsedGroups.length > 0 ? parsedGroups : undefined
  const scopeParam = url.searchParams.get("scope")
  const scope: ToolSelection["scope"] =
    scopeParam === "read" || scopeParam === "write" || scopeParam === "all"
      ? scopeParam
      : undefined
  return { groups, scope }
}

interface Env {
  /**
   * Public API base the generated tools call (e.g. https://api.afframe.com).
   * Set per wrangler environment in `wrangler.jsonc` `vars`; required — the
   * Worker fails closed if it is missing rather than silently forwarding the
   * caller's key to the SDK's production default.
   */
  AFFRAME_API_BASE: string
  /**
   * OAuth 2.1 authorization-server issuer this resource trusts — the Better
   * Auth AS mounted at `<app-host>/api/auth` (e.g.
   * https://app.afframe.com/api/auth). Advertised in the RFC 9728
   * protected-resource metadata so an MCP client auto-discovers where to log
   * in. Set per wrangler environment in `wrangler.jsonc` `vars`.
   */
  OAUTH_ISSUER: string
}

/**
 * RFC 9728 protected-resource metadata for this MCP endpoint. `resource` is the
 * canonical audience (the Worker's own origin, e.g. https://mcp.afframe.com),
 * which the client echoes back as the RFC 8707 `resource` at authorize/token
 * time so the AS stamps a matching `aud`. `authorization_servers` points the
 * client at our AS, whose own `/.well-known/oauth-authorization-server` then
 * yields the authorize/token/registration endpoints.
 */
function protectedResourceMetadata(resource: string, issuer: string) {
  return {
    resource,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: [...OAUTH_SCOPES_SUPPORTED],
  }
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

function unauthorized(resourceMetadataUrl: string): Response {
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
        // RFC 9728 §5.1: point the client at the protected-resource metadata so
        // an MCP client can auto-discover the authorization server from a 401.
        "www-authenticate": `Bearer realm="afframe-mcp", resource_metadata="${resourceMetadataUrl}"`,
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
 * anonymously. Only three unauthenticated GETs are open, none of them tenant
 * data: `/health` (liveness), `/groups` (the group catalog — slugs + counts),
 * and `/.well-known/oauth-protected-resource` (RFC 9728 discovery). The 401 on
 * every other request carries a `resource_metadata` pointer to that last one so
 * an MCP client can find the authorization server and log in.
 *
 * Connection-time selection: `?groups=` / `?scope=` (see `parseSelection`)
 * narrow the registered tool set so an agent loads only what it needs.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const resourceMetadataUrl = `${url.origin}${PROTECTED_RESOURCE_METADATA_PATH}`

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "@afframe/mcp",
        transport: "streamable-http",
      })
    }

    // RFC 9728 protected-resource metadata. Unauthenticated by design: it is
    // public discovery data (no tenant info) that lets an MCP client find the
    // authorization server and complete an OAuth login before it has any token.
    if (
      request.method === "GET" &&
      url.pathname === PROTECTED_RESOURCE_METADATA_PATH
    ) {
      if (!env.OAUTH_ISSUER) {
        // Deploy misconfiguration — advertising an empty AS would strand every
        // client mid-discovery; fail loudly instead.
        return new Response(
          JSON.stringify({ error: "Server misconfigured." }),
          { status: 500, headers: { "content-type": "application/json" } },
        )
      }
      return Response.json(
        protectedResourceMetadata(url.origin, env.OAUTH_ISSUER),
      )
    }

    // Unauthenticated discovery: the group catalog is not tenant data, and a
    // human wiring up a client needs it before they have a session.
    if (request.method === "GET" && url.pathname === "/groups") {
      return Response.json(TOOL_GROUP_CATALOG)
    }

    const token = bearerToken(request)
    if (!token) return unauthorized(resourceMetadataUrl)

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
    registerGeneratedTools(server, client, parseSelection(url))
    // Discovery tools are always present, even on a narrowed connection.
    registerMetaTools(server)

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
