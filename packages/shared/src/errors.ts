/**
 * Typed domain errors. Domain functions throw these; transport adapters (the
 * api's DomainExceptionFilter, web Server Actions) map them to HTTP / action
 * results. Domain code never throws HTTP exceptions or framework errors.
 *
 * `code` is a stable, machine-readable string that appears verbatim in the
 * public API error envelope.
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

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError
}
