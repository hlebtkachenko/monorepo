import { Injectable, type NestMiddleware } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import type { NextFunction, Request, Response } from "express"

/** Request carrying the per-request correlation id. */
export interface RequestWithId extends Request {
  requestId?: string
}

/**
 * Assigns a correlation id to every `/v1` request — echoed as the
 * `X-Request-Id` response header and embedded in the error envelope. Honors a
 * caller-supplied `X-Request-Id` when present.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const incoming = req.headers["x-request-id"]
    const id =
      typeof incoming === "string" && incoming.length > 0
        ? incoming
        : randomUUID()
    req.requestId = id
    res.setHeader("X-Request-Id", id)
    next()
  }
}
