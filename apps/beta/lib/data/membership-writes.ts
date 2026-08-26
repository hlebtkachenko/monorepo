import "server-only"

import { guardRefusal, isDeadlock } from "@/lib/pg-error"

/**
 * What a membership write can be refused WITH, and the one translation of a
 * database guard into it.
 *
 * TWO DOORS WRITE MEMBERSHIPS. `lib/data/office/memberships.ts` is /admin's,
 * gated by `OfficeScope`; `lib/data/people.ts` is Nastavení › Lidé's, gated by
 * `OrgScope`. The invite matrix already lives in one module for them
 * (`lib/auth/invite-policy.ts`) and the ownership invariants already live in one
 * place (the triggers in migration 0002). This is the third thing they must not
 * disagree about: WHICH refusals exist and how a `check_violation` maps onto
 * one. A second copy would drift the moment a trigger gains an arm, and the
 * symptom would be a 500 on one surface and a Czech sentence on the other for
 * the identical database answer.
 *
 * It deliberately holds no query and no scope. Both callers pass a thunk that
 * already carries their own tenancy filter, so nothing here can widen one.
 */

export type MembershipRefusal =
  /** No such membership in that organization. */
  | "not_found"
  /** The invite matrix says no — an admin reaching for owner is the live case. */
  | "role_not_allowed"
  /** Would leave the organization with no owner (DB trigger). */
  | "last_owner"
  /** The target is not office staff, so cannot hold owner (DB trigger). */
  | "owner_requires_staff"
  /** The target IS office staff but the account is deactivated (0003). */
  | "owner_requires_active"
  /**
   * Postgres broke a lock cycle and picked this transaction as the victim.
   * Nothing was wrong with the request; the next attempt is expected to work.
   */
  | "retry"
  /** Some other guard refused. */
  | "rejected"

export type MembershipWriteResult =
  { ok: true } | { ok: false; reason: MembershipRefusal }

/**
 * Run a membership write and turn a guard's refusal into a named reason.
 *
 * Only `check_violation` is translated. Anything else is a real fault and is
 * re-thrown: swallowing it would turn a broken database into a polite Czech
 * sentence, which is the worst possible way to learn about one.
 */
export async function writeMembership(
  write: () => PromiseLike<unknown>,
): Promise<MembershipWriteResult> {
  try {
    await write()
    return { ok: true }
  } catch (error) {
    // A deadlock is not a refusal and not a fault — the database picked this
    // transaction as the victim of a lock cycle. Answering it as a 500 would
    // tell the caller the server is broken when the next click would succeed.
    if (isDeadlock(error)) return { ok: false, reason: "retry" }

    const refusal = guardRefusal(error)
    if (refusal === "last_owner") return { ok: false, reason: "last_owner" }
    if (refusal === "owner_requires_staff") {
      return { ok: false, reason: "owner_requires_staff" }
    }
    if (refusal === "owner_requires_active") {
      return { ok: false, reason: "owner_requires_active" }
    }
    if (refusal !== null) return { ok: false, reason: "rejected" }
    throw error
  }
}
