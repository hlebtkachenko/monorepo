import {
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
} from "@workspace/shared/errors"

/**
 * Translate a `@workspace/accounting` domain failure or a Postgres trigger/
 * constraint error into a `DomainError` the global `DomainExceptionFilter` can
 * render. Without this seam every accounting write failure becomes a 500 (the
 * domain throws plain `Error("accounting: …")` and the triggers `RAISE
 * EXCEPTION` P0001). Wrap the WHOLE `withOrganization` call — the R4 balance
 * trigger is DEFERRABLE and fires at COMMIT, outside the domain fn.
 *
 * Cross-tenant note: an RLS-hidden `periodId`/`seriesId`/`accountId` surfaces as
 * "expected exactly one row, got none" from the domain's `one()` helper, or as a
 * 23503 FK violation — both map to 404 so existence is never leaked across
 * tenants.
 */
export function translateAccountingError(e: unknown): never {
  // Already a mapped domain error (e.g. thrown by the gate) — pass through.
  if (e instanceof DomainError) throw e

  const err = e as {
    code?: string
    message?: string
    constraint_name?: string
  }
  const msg = err?.message ?? ""
  const code = err?.code

  if (msg.includes("expected exactly one row, got none")) {
    throw new NotFoundError("Referenced accounting resource not found")
  }
  if (code === "23503") {
    throw new NotFoundError("Referenced resource not found")
  }
  if (code === "23505") {
    if ((err.constraint_name ?? "").includes("idemp")) {
      throw new ConflictError(
        "A request with this idempotency key is already in progress",
      )
    }
    throw new ConflictError("Duplicate resource")
  }

  if (/is CLOSED/i.test(msg)) {
    throw new ConflictError("The accounting period is closed")
  }
  if (/not visible for this tenant/i.test(msg)) {
    throw new NotFoundError("Accounting period not found")
  }
  if (/outside its period/i.test(msg)) {
    throw new ValidationError("Posting date is outside its period")
  }
  if (/unbalanced|single-sided|at least two|only one side/i.test(msg)) {
    throw new ValidationError("The posting is unbalanced")
  }
  if (/append-only/i.test(msg)) {
    throw new ConflictError("Append-only violation")
  }
  if (/^accounting:/.test(msg)) {
    throw new ValidationError(msg.replace(/^accounting:\s*/, ""))
  }

  // Unmapped → rethrow (500 + Sentry).
  throw e
}
