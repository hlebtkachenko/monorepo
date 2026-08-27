/**
 * Reading a PostgreSQL error through Drizzle's wrapper.
 *
 * Drizzle raises a `DrizzleQueryError` that carries no `code` of its own and
 * hangs the driver error off `cause`, so `error.code === "23514"` on the top
 * level is always false and a legitimate refusal escapes as a 500. Every caller
 * that wants to tell "a guard said no" from "the database is broken" has to
 * walk the chain, and this is the one place that walk lives.
 *
 * The DEPTH CAP is not decoration: a cause chain can be cyclic (an error whose
 * cause is itself is a two-line mistake), and an uncapped walk on the error
 * path is a hang in the handler that was already failing.
 *
 * PURE MODULE — no `server-only`, no driver import. The shape is structural
 * because `postgres` and `pg` both produce it and neither exports a class worth
 * `instanceof`-ing across a workspace boundary.
 */

const MAX_CAUSE_DEPTH = 5

/** `check_violation` — every RAISE in beta's migrations uses this SQLSTATE. */
const PG_CHECK_VIOLATION = "23514"
/** `unique_violation` — a taken slug, a duplicate email. */
const PG_UNIQUE_VIOLATION = "23505"
/**
 * `foreign_key_violation` — a referenced row does not exist, or (for the
 * composite, tenancy-carrying FKs this schema uses) does not exist IN THE
 * ORGANIZATION the referencing row names.
 *
 * Beta's composite FKs are load-bearing authorization, not just referential
 * hygiene: `user_setup_token → payroll_employee (id, organization_id)`
 * (migration 0019) is what refuses an employee row from another book. So 23503
 * has to be tellable from a genuine fault, the same way 23514 is — a caller that
 * cannot tell them apart answers a legitimate refusal with a 500.
 */
const PG_FOREIGN_KEY_VIOLATION = "23503"
/** `deadlock_detected` — see `isDeadlock`. */
const PG_DEADLOCK_DETECTED = "40P01"

type PgErrorLike = { code: string; message: string }

/** The first link in the chain that looks like a driver error, or null. */
function pgError(error: unknown): PgErrorLike | null {
  let current: unknown = error
  for (
    let depth = 0;
    current !== null && current !== undefined && depth < MAX_CAUSE_DEPTH;
    depth++
  ) {
    if (typeof current === "object" && "code" in current) {
      const candidate = current as { code?: unknown; message?: unknown }
      if (typeof candidate.code === "string") {
        return {
          code: candidate.code,
          message:
            typeof candidate.message === "string" ? candidate.message : "",
        }
      }
    }
    current = (current as { cause?: unknown }).cause
  }
  return null
}

export function isCheckViolation(error: unknown): boolean {
  return pgError(error)?.code === PG_CHECK_VIOLATION
}

export function isUniqueViolation(error: unknown): boolean {
  return pgError(error)?.code === PG_UNIQUE_VIOLATION
}

export function isForeignKeyViolation(error: unknown): boolean {
  return pgError(error)?.code === PG_FOREIGN_KEY_VIOLATION
}

/**
 * `deadlock_detected` — Postgres broke a lock cycle by aborting THIS
 * transaction.
 *
 * It is not a bug in the caller and it is not a refusal: nothing about the
 * request was wrong, the database simply picked this transaction as the victim.
 * The correct answer is "try again", and the correct thing NOT to do is return
 * a 500 — a 500 says the server is broken when the next click would work.
 *
 * Beta takes locks in three classes (`app_user`, then `organization`, then
 * `user_setup_token` — see the header of migration 0003), and every write path
 * in the app takes them in that order, so a cycle should be unreachable. This
 * is the honest floor under "should be": ordering is a convention enforced by
 * review, and the day a future write path inverts it, the symptom must be a
 * retryable message rather than an opaque failure the office cannot act on.
 *
 * Deliberately NOT an automatic retry loop. A retry here would re-run a
 * transaction whose side effects the caller has not seen, inside a request that
 * is already holding a connection; surfacing it and letting the operator click
 * again is both simpler and safer.
 */
export function isDeadlock(error: unknown): boolean {
  return pgError(error)?.code === PG_DEADLOCK_DETECTED
}

/**
 * Which of beta's guards refused, so the UI can say something true instead of
 * "something went wrong".
 *
 * Matching on the message text is a real coupling to the migrations, and it is
 * the lesser evil: PostgreSQL gives a trigger's RAISE one SQLSTATE and no
 * subtype, so the alternatives are a bespoke SQLSTATE per guard (which stops
 * being `check_violation` and breaks every generic handler) or telling the
 * office user nothing. The phrases matched here are asserted in
 * `db/invariants.test.ts` and `db/ownership-locks.test.ts`, so a reworded
 * exception fails a test rather than silently degrading a message.
 */
export type GuardRefusal =
  | "last_owner"
  | "owner_requires_staff"
  | "owner_requires_active"
  | "staff_holds_owner"
  | "other"

export function guardRefusal(error: unknown): GuardRefusal | null {
  const pg = pgError(error)
  if (!pg || pg.code !== PG_CHECK_VIOLATION) return null
  if (/last owner/i.test(pg.message)) return "last_owner"
  if (/requires app_user\.is_staff/i.test(pg.message)) {
    return "owner_requires_staff"
  }
  // Distinct from the staff refusal on purpose (migration 0003, section 3):
  // "this account is not office staff" and "this office account is
  // deactivated" call for different next actions from whoever reads it.
  if (/requires an active account/i.test(pg.message)) {
    return "owner_requires_active"
  }
  if (/cannot clear is_staff/i.test(pg.message)) return "staff_holds_owner"
  return "other"
}
