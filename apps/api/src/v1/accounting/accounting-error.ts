import {
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
} from "@workspace/shared/errors"

/**
 * Translate a `@workspace/accounting` domain failure or a Postgres trigger/
 * constraint error into a `DomainError` the global `DomainExceptionFilter` can
 * render. Without this seam every accounting write failure becomes a 500.
 *
 * Error shapes seen at this seam:
 *   1. TS `Error("accounting: …")` from the domain, and the `one()` guard's
 *      `Error("expected exactly one row, got none")`.
 *   2. A raw driver `PostgresError` (`.code` SQLSTATE + `.message` trigger text)
 *      — happens for COMMIT-time DEFERRABLE constraint triggers.
 *   3. drizzle 0.45's `DrizzleQueryError` — statement-time errors get wrapped
 *      (`message = "Failed query: …"`, NO `.code`); the real `PostgresError`
 *      hangs off `.cause`. We MUST unwrap it or nothing matches → 500.
 *
 * Wrap the WHOLE `withOrganization` call — the R4 balance trigger is DEFERRABLE
 * and fires at COMMIT, outside the domain fn.
 */
interface DriverErrorish {
  code?: string
  message?: string
  constraint_name?: string
  cause?: unknown
}

/** Walk `.cause` to the innermost error that carries a SQLSTATE `.code`. */
function unwrap(e: unknown): DriverErrorish {
  let cur: unknown = e
  for (let i = 0; i < 6 && cur && typeof cur === "object"; i++) {
    const c = cur as DriverErrorish
    if (c.code) return c
    if (c.cause) {
      cur = c.cause
      continue
    }
    break
  }
  return (e ?? {}) as DriverErrorish
}

export function translateAccountingError(e: unknown): never {
  // Already a mapped domain error (e.g. thrown by the gate) — pass through.
  if (e instanceof DomainError) throw e

  const inner = unwrap(e)
  const code = inner.code
  const constraint = inner.constraint_name ?? ""
  // Prefer the innermost (driver) message; fall back to the outer TS message.
  const msg = inner.message || (e as { message?: string })?.message || ""

  // SQLSTATE-based (survive any wrapping once unwrapped).
  if (code === "23503") {
    throw new NotFoundError("Referenced resource not found")
  }
  if (code === "23505") {
    if (constraint.includes("idemp")) {
      throw new ConflictError(
        "A request with this idempotency key is already in progress",
      )
    }
    throw new ConflictError("Duplicate resource")
  }

  // Message-based (robust across P0001 RAISE and 23514 CHECK triggers).
  if (
    msg.includes("expected exactly one row, got none") ||
    /not visible for this tenant/i.test(msg)
  ) {
    // RLS-hidden foreign period/series/account — never leak existence.
    throw new NotFoundError("Referenced accounting resource not found")
  }
  if (/is CLOSED/i.test(msg)) {
    throw new ConflictError("The accounting period is closed")
  }
  if (/outside its period/i.test(msg)) {
    throw new ValidationError("Posting date is outside its period")
  }
  if (
    /unbalanced|must touch both|má dáti|dal side|both a m|single-sided/i.test(
      msg,
    )
  ) {
    throw new ValidationError("The posting is unbalanced")
  }
  if (/append-only/i.test(msg)) {
    throw new ConflictError("Append-only violation")
  }
  if (/fx rate is set|accounting_currency|fx rate.*required/i.test(msg)) {
    throw new ValidationError("Foreign-exchange rate is inconsistent")
  }
  if (/^accounting:/.test(msg)) {
    throw new ValidationError(msg.replace(/^accounting:\s*/, ""))
  }

  // Unmapped → rethrow (500 + Sentry).
  throw e
}
