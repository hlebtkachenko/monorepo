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
  "last_owner" | "owner_requires_staff" | "staff_holds_owner" | "other"

export function guardRefusal(error: unknown): GuardRefusal | null {
  const pg = pgError(error)
  if (!pg || pg.code !== PG_CHECK_VIOLATION) return null
  if (/last owner/i.test(pg.message)) return "last_owner"
  if (/requires app_user\.is_staff/i.test(pg.message)) {
    return "owner_requires_staff"
  }
  if (/cannot clear is_staff/i.test(pg.message)) return "staff_holds_owner"
  return "other"
}
