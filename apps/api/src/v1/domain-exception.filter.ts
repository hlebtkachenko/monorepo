import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common"
import type { Response } from "express"
import { isDomainError } from "@workspace/shared/errors"
import type { RequestWithId } from "./request-id.middleware"

/** DomainError.code -> HTTP status. Unmapped codes fall back to 400. */
const DOMAIN_CODE_STATUS: Record<string, number> = {
  not_found: HttpStatus.NOT_FOUND,
  forbidden: HttpStatus.FORBIDDEN,
  unauthorized: HttpStatus.UNAUTHORIZED,
  conflict: HttpStatus.CONFLICT,
  validation_error: HttpStatus.UNPROCESSABLE_ENTITY,
}

function statusToCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "bad_request"
    case HttpStatus.UNAUTHORIZED:
      return "unauthorized"
    case HttpStatus.FORBIDDEN:
      return "forbidden"
    case HttpStatus.NOT_FOUND:
      return "not_found"
    case HttpStatus.CONFLICT:
      return "conflict"
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return "validation_error"
    case HttpStatus.TOO_MANY_REQUESTS:
      return "rate_limited"
    default:
      return status >= 500 ? "internal_error" : "error"
  }
}

/**
 * Renders every `/v1` error as the standard envelope:
 *   { "error": { "code", "message", "requestId" } }
 *
 * Maps DomainError (`@workspace/shared/errors`) and NestJS HttpException; unknown
 * errors become a generic 500 with the real cause sent to Sentry. Applied
 * per-controller via `@UseFilters` — `/v1`-scoped, BFF/health responses are
 * untouched.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()
    const req = ctx.getRequest<RequestWithId>()
    const requestId = req.requestId ?? "unknown"

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR
    let code = "internal_error"
    let message = "Internal server error"

    if (isDomainError(exception)) {
      code = exception.code
      message = exception.message
      status = DOMAIN_CODE_STATUS[exception.code] ?? HttpStatus.BAD_REQUEST
    } else if (exception instanceof HttpException) {
      status = exception.getStatus()
      code = statusToCode(status)
      const payload = exception.getResponse()
      if (typeof payload === "string") {
        message = payload
      } else if (
        payload &&
        typeof payload === "object" &&
        "message" in payload
      ) {
        const m = (payload as { message: unknown }).message
        message = Array.isArray(m) ? m.join(", ") : String(m)
      } else {
        message = exception.message
      }
    } else {
      this.logger.error(
        `Unhandled exception [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      )
    }

    res.status(status).json({ error: { code, message, requestId } })
  }
}
