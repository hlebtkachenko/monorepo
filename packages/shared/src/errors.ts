/**
 * Typed domain errors. Domain functions throw these; transport adapters (the
 * api's DomainExceptionFilter, web Server Actions) map them to HTTP / action
 * results. Domain code never throws HTTP exceptions or framework errors.
 *
 * `code` is a stable, machine-readable string that appears verbatim in the
 * public API error envelope. The SDK maps the same codes back into typed
 * error classes on the client.
 *
 * Reachable as `@workspace/shared/errors`.
 */
export class DomainError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "DomainError"
    this.code = code
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Resource not found") {
    super("not_found", message)
    this.name = "NotFoundError"
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Forbidden") {
    super("forbidden", message)
    this.name = "ForbiddenError"
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Unauthorized") {
    super("unauthorized", message)
    this.name = "UnauthorizedError"
  }
}

export class ConflictError extends DomainError {
  constructor(message = "Conflict") {
    super("conflict", message)
    this.name = "ConflictError"
  }
}

export class ValidationError extends DomainError {
  constructor(message = "Validation failed") {
    super("validation_error", message)
    this.name = "ValidationError"
  }
}

/**
 * Public API rate-limit breach. Surfaces as `429 rate_limited` with IETF
 * `RateLimit-*` headers. The throttler guard throws this; the
 * DomainExceptionFilter maps the code straight through.
 */
export class RateLimitedError extends DomainError {
  constructor(message = "Too many requests") {
    super("rate_limited", message)
    this.name = "RateLimitedError"
  }
}

/**
 * Idempotency conflict — a previous request with the same `Idempotency-Key`
 * was processed and returned a different result for the same body. SDK
 * documents the safe retry path.
 */
export class IdempotencyConflictError extends DomainError {
  constructor(message = "Idempotency-Key reuse with mismatched request") {
    super("idempotency_conflict", message)
    this.name = "IdempotencyConflictError"
  }
}

/**
 * Optimistic-concurrency mismatch on an update — caller's `If-Match` /
 * `version` is stale. SDK retries by re-reading + re-applying the mutation.
 */
export class StaleResourceError extends DomainError {
  constructor(message = "Resource version is stale") {
    super("stale_resource", message)
    this.name = "StaleResourceError"
  }
}

/**
 * Caller asked for a feature that's gated to an entitlement, plan, or
 * environment the current API key doesn't have access to.
 */
export class FeatureNotEnabledError extends DomainError {
  constructor(message = "Feature is not enabled for this organization") {
    super("feature_not_enabled", message)
    this.name = "FeatureNotEnabledError"
  }
}

/**
 * Request payload exceeded the per-endpoint size cap. The DomainExceptionFilter
 * maps this to `413 payload_too_large`.
 */
export class PayloadTooLargeError extends DomainError {
  constructor(message = "Request payload exceeds the per-endpoint limit") {
    super("payload_too_large", message)
    this.name = "PayloadTooLargeError"
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError
}

/**
 * Every public-API error code emitted by the platform. The Plaid envelope
 * carries one of these in `error.code`; the SDK maps each back to a class.
 * Keep this in sync with `docs/api/ERRORS.md`.
 */
export const API_ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "idempotency_conflict",
  "stale_resource",
  "feature_not_enabled",
  "payload_too_large",
  "validation_error",
  "rate_limited",
  "internal_error",
] as const
export type ApiErrorCode = (typeof API_ERROR_CODES)[number]
