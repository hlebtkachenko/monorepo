import type { ApiError } from "@workspace/shared/api"

/**
 * Base SDK error. Every typed `Error` subclass thrown by the client extends
 * this. Carries the public envelope verbatim so callers can read `code`,
 * `error_type`, `documentation_url`, `requestId` for support tickets.
 *
 * Registry: docs/api/ERRORS.md.
 */
export class AfframeApiError extends Error {
  readonly code: string
  readonly errorType: string | undefined
  readonly status: number
  readonly requestId: string
  readonly documentationUrl: string | undefined
  readonly displayMessage: string | undefined

  constructor(envelope: ApiError["error"], status: number) {
    super(envelope.message)
    this.name = "AfframeApiError"
    this.code = envelope.code
    this.errorType = envelope.error_type
    this.status = status
    this.requestId = envelope.requestId
    this.documentationUrl = envelope.documentation_url
    this.displayMessage = envelope.display_message
  }
}

export class UnauthorizedError extends AfframeApiError {
  constructor(envelope: ApiError["error"]) {
    super(envelope, 401)
    this.name = "UnauthorizedError"
  }
}

export class ForbiddenError extends AfframeApiError {
  constructor(envelope: ApiError["error"]) {
    super(envelope, 403)
    this.name = "ForbiddenError"
  }
}

export class NotFoundError extends AfframeApiError {
  constructor(envelope: ApiError["error"]) {
    super(envelope, 404)
    this.name = "NotFoundError"
  }
}

export class ConflictError extends AfframeApiError {
  constructor(envelope: ApiError["error"]) {
    super(envelope, 409)
    this.name = "ConflictError"
  }
}

export class ValidationError extends AfframeApiError {
  constructor(envelope: ApiError["error"]) {
    super(envelope, 422)
    this.name = "ValidationError"
  }
}

export class RateLimitError extends AfframeApiError {
  /** Seconds until the bucket refills, parsed from `Retry-After`. */
  readonly retryAfter: number | undefined

  constructor(envelope: ApiError["error"], retryAfter: number | undefined) {
    super(envelope, 429)
    this.name = "RateLimitError"
    this.retryAfter = retryAfter
  }
}

export class ServerError extends AfframeApiError {
  constructor(envelope: ApiError["error"], status: number) {
    super(envelope, status)
    this.name = "ServerError"
  }
}

/**
 * Parse an HTTP `Retry-After` header value into milliseconds. Supports both
 * formats accepted by the spec:
 *   - delta-seconds: a non-negative integer (`"120"` → 120 000 ms).
 *   - HTTP-date: an RFC 7231 date (`"Wed, 21 Oct 2026 07:28:00 GMT"`) — the
 *     return value is `max(0, target - Date.now())`.
 *
 * Returns `null` when the input is absent or unparseable. Shared by the
 * client's retry-loop and the `RateLimitError` factory below so the two
 * agree on what "retry after" means.
 */
export function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const dateMs = Date.parse(value)
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now())
  return null
}

/** Map an envelope + HTTP status to the concrete typed Error subclass. */
export function errorFromResponse(
  envelope: ApiError["error"],
  status: number,
  headers: Headers,
): AfframeApiError {
  switch (status) {
    case 401:
      return new UnauthorizedError(envelope)
    case 403:
      return new ForbiddenError(envelope)
    case 404:
      return new NotFoundError(envelope)
    case 409:
      return new ConflictError(envelope)
    case 422:
      return new ValidationError(envelope)
    case 429: {
      const ms = parseRetryAfterMs(headers.get("retry-after"))
      return new RateLimitError(
        envelope,
        ms === null ? undefined : Math.ceil(ms / 1000),
      )
    }
    default:
      if (status >= 500) return new ServerError(envelope, status)
      return new AfframeApiError(envelope, status)
  }
}
