import { Injectable, type NestMiddleware } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import type { NextFunction, Request, Response } from "express"

/** Request carrying the per-request correlation id. */
export interface RequestWithId extends Request {
  requestId?: string
}

/**
 * Caller-supplied ids must be tame: they are interpolated into error logs,
 * echoed as a response header, and embedded in auto-filed Linear issue
 * bodies. Anything outside this shape is replaced with a fresh UUID.
 */
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Assigns a correlation id to every `/v1` request — echoed as the
 * `X-Request-Id` response header and embedded in the error envelope. Honors a
 * caller-supplied `X-Request-Id` only when it matches REQUEST_ID_RE.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const incoming = req.headers["x-request-id"]
    const id =
      typeof incoming === "string" && REQUEST_ID_RE.test(incoming)
        ? incoming
        : randomUUID()
    req.requestId = id
    res.setHeader("X-Request-Id", id)
    next()
  }
}
