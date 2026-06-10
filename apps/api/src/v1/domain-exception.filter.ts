import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common"
import { ThrottlerException } from "@nestjs/throttler"
import type { Response } from "express"
import {
  API_ERROR_CODES,
  type ApiErrorCode,
  isDomainError,
} from "@workspace/shared/errors"
import type { RequestWithId } from "./request-id.middleware"
import * as Sentry from "@sentry/node"
import { notifierFromEnv, sanitizeError } from "@workspace/notify"

// Built once; no-ops when BOT_INGEST_URL / NOTIFY_SHARED_SECRET are unset.
const notifier = notifierFromEnv()

/**
 * DomainError.code -> HTTP status. Unmapped codes fall back to 400.
 * Keys are constrained to `ApiErrorCode` so a typo'd or unregistered code
 * fails `pnpm --filter api typecheck` instead of leaking to the wire.
 */
const DOMAIN_CODE_STATUS: Partial<Record<ApiErrorCode, number>> = {
  not_found: HttpStatus.NOT_FOUND,
  forbidden: HttpStatus.FORBIDDEN,
  unauthorized: HttpStatus.UNAUTHORIZED,
  conflict: HttpStatus.CONFLICT,
  idempotency_conflict: HttpStatus.CONFLICT,
  stale_resource: HttpStatus.CONFLICT,
  feature_not_enabled: HttpStatus.FORBIDDEN,
  payload_too_large: HttpStatus.PAYLOAD_TOO_LARGE,
  validation_error: HttpStatus.UNPROCESSABLE_ENTITY,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
}

/** Plaid-shape error_type families. Registry in docs/api/ERRORS.md §2. */
const STATUS_FAMILY: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "INVALID_REQUEST",
  [HttpStatus.UNAUTHORIZED]: "UNAUTHORIZED",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT",
  [HttpStatus.PAYLOAD_TOO_LARGE]: "PAYLOAD_TOO_LARGE",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "VALIDATION",
  [HttpStatus.TOO_MANY_REQUESTS]: "RATE_LIMITED",
  [HttpStatus.INTERNAL_SERVER_ERROR]: "INTERNAL",
  [HttpStatus.SERVICE_UNAVAILABLE]: "SERVICE_UNAVAILABLE",
}

/**
 * HTTP status -> envelope `code`. Values are constrained to the
 * `API_ERROR_CODES` registry (`@workspace/shared/errors`) — the same
 * constant the OpenAPI `Error.code` enum and docs/api/ERRORS.md §4 derive
 * from. Unmapped statuses: `internal_error` (5xx) / `bad_request` (4xx).
 */
const STATUS_CODE: Record<number, ApiErrorCode> = {
  [HttpStatus.BAD_REQUEST]: "bad_request",
  [HttpStatus.UNAUTHORIZED]: "unauthorized",
  [HttpStatus.FORBIDDEN]: "forbidden",
  [HttpStatus.NOT_FOUND]: "not_found",
  [HttpStatus.CONFLICT]: "conflict",
  [HttpStatus.PAYLOAD_TOO_LARGE]: "payload_too_large",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "validation_error",
  [HttpStatus.TOO_MANY_REQUESTS]: "rate_limited",
}

function statusToCode(status: number): ApiErrorCode {
  return (
    STATUS_CODE[status] ?? (status >= 500 ? "internal_error" : "bad_request")
  )
}

function isRegisteredCode(code: string): code is ApiErrorCode {
  return (API_ERROR_CODES as readonly string[]).includes(code)
}

/**
 * Renders every `/v1` error as the Plaid-shape envelope:
 *
 *   {
 *     "error": {
 *       "code": "not_found",
 *       "error_type": "NOT_FOUND",
 *       "message": "Organization not found",
 *       "requestId": "..."
 *     }
 *   }
 *
 * Every emitted `code` belongs to `API_ERROR_CODES` — the OpenAPI
 * `Error.code` enum and docs/api/ERRORS.md derive from the same constant.
 * A DomainError carrying an unregistered code is coerced (and logged
 * loudly) instead of leaking an off-registry code to the wire.
 *
 * `documentation_url` stays optional in the schema (consumers may parse it
 * on inbound responses) but is not emitted today — the developer hub it
 * pointed to was archived to `.context/archive/apps-docs-2026-05-21/`.
 *
 * Maps DomainError (`@workspace/shared/errors`), the throttler's
 * ThrottlerException (`429 rate_limited`, pinned to the envelope — see
 * docs/api/RATE-LIMITS.md), and NestJS HttpException; unknown errors become
 * a generic 500 with the real cause sent to Sentry.
 *
 * Registered globally via `APP_FILTER` in `V1Module` — every
 * controller-routed response (including the version-neutral `/api/health`)
 * gets the envelope on error. The raw express routes (`docs.ts`,
 * `editor.ts`, `void.ts`) sit outside Nest's exception layer and are not
 * covered.
 *
 * Per docs/api/ERRORS.md.
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
    let code: ApiErrorCode = "internal_error"
    let message = "Internal server error"

    if (isDomainError(exception)) {
      if (isRegisteredCode(exception.code)) {
        code = exception.code
      } else {
        // Unregistered code — a DomainError was thrown with a code that is
        // not in API_ERROR_CODES. Register it there (and in
        // docs/api/ERRORS.md) instead of minting codes inline.
        this.logger.error(
          `DomainError with unregistered code "${exception.code}" [${requestId}] — coerced to bad_request`,
        )
        code = "bad_request"
      }
      message = exception.message
      status = DOMAIN_CODE_STATUS[code] ?? HttpStatus.BAD_REQUEST
    } else if (exception instanceof ThrottlerException) {
      // Pin the public 429 contract: envelope body + `rate_limited` code.
      // The guard's parent class already sets `Retry-After` and the IETF
      // `RateLimit-*` headers; without this branch the generic
      // HttpException path would leak the raw "ThrottlerException: Too
      // Many Requests" string as the message.
      status = HttpStatus.TOO_MANY_REQUESTS
      code = "rate_limited"
      message =
        "Too many requests. See the RateLimit-* headers for the reset window."
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
      Sentry.captureException(exception)
      const safe = sanitizeError(exception, requestId)
      // Fire-and-forget: a failed report must never alter the error response. Opens a deduped
      // Linear issue (with an Open button); the full stack goes to CloudWatch logs (and Sentry
      // when SENTRY_DSN is provisioned), not the issue body.
      void notifier?.reportIssue({
        source: "error",
        area: "api",
        risk: "high",
        title: `API 5xx: ${safe.message}`,
        body: `Unhandled API exception \`${safe.id}\` (requestId).\n\n${safe.message}`,
        fingerprintParts: ["api-5xx", safe.message],
      })
    }

    // Unmapped 5xx (502/504/etc.) must fall into the INTERNAL family,
    // not "INVALID_REQUEST" — emitting a server-error status with a
    // client-error family contradicts the envelope contract.
    const error_type =
      STATUS_FAMILY[status] ?? (status >= 500 ? "INTERNAL" : "INVALID_REQUEST")

    res.status(status).json({
      error: { code, error_type, message, requestId },
    })
  }
}
