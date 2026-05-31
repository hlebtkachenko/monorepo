import type { INestApplication } from "@nestjs/common"
import express from "express"
import type { Request, Response } from "express"

/**
 * Mock-server mount at `/void/*`. Echoes the request shape back —
 * method, path, query, headers (allowlisted), body — so partners can
 * exercise SDK / CLI / MCP request builders without hitting the live api.
 * Any verb, any path, status 200.
 *
 * Header policy uses a strict allowlist: only headers that partners
 * legitimately tune for request building are echoed (`content-type`,
 * `accept`, `user-agent`, `idempotency-key`, custom `x-afframe-*` keys,
 * `x-request-id`). Every other header — including `authorization`,
 * `cookie`, `x-api-key`, `proxy-authorization`, and provider-specific
 * auth tokens — is stripped. A denylist would leak any new credential
 * header introduced upstream; allowlist fails closed.
 *
 * CORS headers are emitted on every response (not just OPTIONS) so a
 * browser-based partner sandbox can hit `/void/*` cross-origin without
 * the preflight succeeding only for the actual response to be blocked.
 *
 * Body parsers are mounted locally on `/void` so JSON / text / urlencoded
 * payloads land in `req.body`. Nest's global parsers don't reach this
 * route because it's wired below the controller stack via `app.use`. The
 * 100 KB cap matches the rest of the API.
 */
const BODY_LIMIT = "100kb"

// Headers a partner legitimately tunes when building a request. Everything
// else is stripped from the echo — see allowlist rationale in the module
// docstring.
const HEADER_ALLOWLIST = new Set<string>([
  "accept",
  "accept-encoding",
  "accept-language",
  "content-type",
  "content-length",
  "host",
  "idempotency-key",
  "user-agent",
  "x-request-id",
])
const HEADER_PREFIX_ALLOWLIST = ["x-afframe-"]

function isAllowedHeader(name: string): boolean {
  const lower = name.toLowerCase()
  if (HEADER_ALLOWLIST.has(lower)) return true
  return HEADER_PREFIX_ALLOWLIST.some((p) => lower.startsWith(p))
}

export function registerVoidRoutes(app: INestApplication): void {
  app.use(
    "/void",
    express.json({ limit: BODY_LIMIT }),
    express.text({ limit: BODY_LIMIT }),
    express.urlencoded({ extended: true, limit: BODY_LIMIT }),
  )

  app.use("/void", (req: Request, res: Response) => {
    res
      .header("access-control-allow-origin", "*")
      .header("access-control-allow-methods", "*")
      .header("access-control-allow-headers", "*")
    if (req.method === "OPTIONS") {
      res.status(204).end()
      return
    }
    const safeHeaders: Record<string, string | string[] | undefined> = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (isAllowedHeader(k)) safeHeaders[k] = v
    }
    res
      .status(200)
      .header("content-type", "application/json; charset=utf-8")
      .json({
        method: req.method,
        path: req.url,
        query: req.query,
        headers: safeHeaders,
        body: req.body ?? null,
      })
  })
}
