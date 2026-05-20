import type { INestApplication } from "@nestjs/common"
import express from "express"
import type { Request, Response } from "express"

/**
 * Mock-server mount at `/void/*`. Echoes the request shape back —
 * method, path, headers (minus auth / cookies), query, body — so partners
 * can exercise SDK / CLI / MCP request builders without hitting the live
 * api. Any verb, any path, status 200.
 *
 * Body parsers are mounted locally on `/void` so JSON / text / urlencoded
 * payloads land in `req.body`. Nest's global parsers don't reach this
 * route because it's wired below the controller stack via `app.use`. The
 * 100 KB cap matches the rest of the API.
 */
const BODY_LIMIT = "100kb"

export function registerVoidRoutes(app: INestApplication): void {
  app.use(
    "/void",
    express.json({ limit: BODY_LIMIT }),
    express.text({ limit: BODY_LIMIT }),
    express.urlencoded({ extended: true, limit: BODY_LIMIT }),
  )

  app.use("/void", (req: Request, res: Response) => {
    if (req.method === "OPTIONS") {
      res
        .status(204)
        .header("access-control-allow-origin", "*")
        .header("access-control-allow-methods", "*")
        .header("access-control-allow-headers", "*")
        .end()
      return
    }
    const safeHeaders: Record<string, string | string[] | undefined> = {}
    for (const [k, v] of Object.entries(req.headers)) {
      const lower = k.toLowerCase()
      if (lower === "authorization") continue
      if (lower === "cookie") continue
      safeHeaders[k] = v
    }
    res
      .status(200)
      .header("content-type", "application/json; charset=utf-8")
      .json({
        method: req.method,
        path: req.url,
        headers: safeHeaders,
        body: req.body ?? null,
      })
  })
}
