import type { INestApplication } from "@nestjs/common"
import type { NextFunction, Request, Response } from "express"

/**
 * Mock-server mount at `/void/*`. Echoes the request shape back —
 * method, path, headers (minus auth), query, body — so partners can
 * exercise SDK / CLI / MCP request builders without hitting the live
 * api. Any verb, any path, status 200.
 *
 * The same behaviour ships as a standalone Hono app in
 * `@scalar/void-server`. The plan called for that package, but
 * `@scalar/void-server` exports a Hono app rather than an Express
 * middleware; bridging Web `Request`/`Response` into Express's
 * imperative `(req, res)` model is more glue than this 30-line echo
 * handler. Re-implemented inline.
 */
export function registerVoidRoutes(app: INestApplication): void {
  app.use("/void", (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "OPTIONS") {
      res
        .status(204)
        .header("access-control-allow-origin", "*")
        .header("access-control-allow-methods", "*")
        .header("access-control-allow-headers", "*")
        .end()
      return
    }
    if (typeof req.url !== "string") {
      next()
      return
    }
    const safeHeaders: Record<string, string | string[] | undefined> = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (k.toLowerCase() === "authorization") continue
      if (k.toLowerCase() === "cookie") continue
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
