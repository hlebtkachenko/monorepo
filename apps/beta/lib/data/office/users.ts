import "server-only"

import { asc, eq, sql } from "drizzle-orm"

import { app_user } from "@/db/schema"
import { guardRefusal, isDeadlock, isUniqueViolation } from "@/lib/pg-error"

import { officeUserRow, type OfficeUserRow } from "../projections"
import type { OfficeScope } from "../scope"

import { officeDb } from "./db"
import {
  accountDisabledPayload,
  isReservedAnonymizedEmail,
  officeUserPayload,
  staffFlagPayload,
} from "./payloads"

/**
 * Uživatelé — the cross-org account list (spec §3.5: "create, is_staff set here
 * only, memberships grid + owner ve všech, deactivate").
 *
 * THE ONLY PLACE `is_staff` AND `disabled_at` ARE WRITTEN. Both go through the
 * audited builders in `payloads.ts`, and
 * `lib/auth/app-user-writes.boundary.test.ts` fails the build if any other
 * module in this app writes them — through Drizzle, through Better Auth's
 * internal adapter, or through raw SQL.
 *
 * CREATING A USER DOES NOT CREATE A LOGIN. Public sign-up is off and Better
 * Auth's `disableSignUp` blocks the server-side `signUpEmail` too (Advisor
 * blocker B4-1), so an account comes into existence in two halves: /admin
 * writes the IDENTITY (address, name, staff flag), and consuming an
 * `account_setup` link writes the CREDENTIAL. Between the two the row exists
 * and nobody can sign in as it — which is why `officeUserRow` carries
 * `activated` and why `setup-token.ts` is careful about who may claim a
 * credential-less identity.
 */

export type OfficeUserRefusal =
  | "not_found"
  | "invalid_email"
  /** The address is inside the reserved anonymization namespace. */
  | "reserved_email"
  | "email_taken"
  /** Deactivating would leave an organization with no owner (DB trigger). */
  | "last_owner"
  /** Clearing is_staff while the account still owns a book (DB trigger). */
  | "staff_holds_owner"
  /** Lock-cycle victim. Nothing was wrong with the request; try again. */
  | "retry"
  | "rejected"

export type OfficeUserWriteResult =
  { ok: true } | { ok: false; reason: OfficeUserRefusal }

export type CreateOfficeUserResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: OfficeUserRefusal }

/** Deliberately loose — see the same constant in `lib/auth/setup-token.ts`. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/
const EMAIL_MAX_LENGTH = 320

/**
 * The outer column is the literal `app_user.id`, never an interpolated Drizzle
 * column. Interpolation emits a BARE `"id"`, and a bare `id` inside these
 * subqueries resolves against `auth_account` / `organization_membership` —
 * which BOTH have an `id` — so `a.user_id = a.id` is valid SQL that is simply
 * always false. No error, no test failure, and `activated` reads false for
 * every account forever. Qualify, always.
 */

/** Has this identity a credential yet, i.e. can anyone actually sign in as it? */
const HAS_CREDENTIAL = sql<boolean>`EXISTS (
  SELECT 1 FROM auth_account a
   WHERE a.user_id = app_user.id AND a.provider_id = 'credential'
)`

const ACTIVE_MEMBERSHIP_COUNT = sql<number>`(
  SELECT count(*)::int FROM organization_membership m
   WHERE m.user_id = app_user.id AND m.active
)`

const ACTIVE_OWNER_OF_COUNT = sql<number>`(
  SELECT count(*)::int FROM organization_membership m
   WHERE m.user_id = app_user.id AND m.active AND m.role = 'owner'
)`

export async function listOfficeUsers(
  office: OfficeScope,
): Promise<OfficeUserRow[]> {
  const rows = await officeDb(office)
    .select({
      id: app_user.id,
      name: app_user.name,
      email: app_user.email,
      is_staff: app_user.is_staff,
      disabled_at: app_user.disabled_at,
      activated: HAS_CREDENTIAL,
      membershipCount: ACTIVE_MEMBERSHIP_COUNT,
      ownerOfCount: ACTIVE_OWNER_OF_COUNT,
    })
    .from(app_user)
    .orderBy(asc(app_user.email))

  return rows.map((row) => officeUserRow(row))
}

export async function createOfficeUser(
  office: OfficeScope,
  input: { email: string; name: string; isStaff: boolean },
): Promise<CreateOfficeUserResult> {
  const email = input.email.trim().toLowerCase()
  if (
    email.length === 0 ||
    email.length > EMAIL_MAX_LENGTH ||
    !EMAIL_PATTERN.test(email)
  ) {
    return { ok: false, reason: "invalid_email" }
  }
  // Before the INSERT, so the operator is told WHY rather than being handed the
  // trigger's refusal as a generic "the database refused it". The trigger
  // (`app_user_tombstone_guard`, 0021) is the floor; this is the message.
  if (isReservedAnonymizedEmail(email)) {
    return { ok: false, reason: "reserved_email" }
  }

  try {
    const [created] = await officeDb(office)
      .insert(app_user)
      .values(
        officeUserPayload({
          email,
          // An empty name would render as a blank row in every people grid; the
          // address is the honest placeholder until the invitee types theirs.
          name: input.name.trim() || email,
          isStaff: input.isStaff,
        }),
      )
      .returning({ id: app_user.id, email: app_user.email })

    if (!created) return { ok: false, reason: "rejected" }
    return { ok: true, userId: created.id, email: created.email }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "email_taken" }
    throw error
  }
}

/**
 * Grant or revoke office staff.
 *
 * Revocation is floored by `beta_app_user_owner_guard`: it refuses while the
 * account still holds an active owner membership anywhere, because the pair
 * "owner membership + not staff" is the state the whole role model is built to
 * make unreachable. Demote the memberships first — the office user is told so
 * rather than shown a 500.
 */
export async function setUserStaff(
  office: OfficeScope,
  targetUserId: string,
  isStaff: boolean,
): Promise<OfficeUserWriteResult> {
  // The builder call is INLINE at the `.set()` here and in `setUserDisabled`,
  // rather than factored into one shared writer taking a payload variable. The
  // AST fence reads the argument of `.set()` and has to see the audited builder
  // named there; a variable — however it was built — is exactly the shape it
  // must keep refusing, because the next one might not be audited.
  try {
    const updated = await officeDb(office)
      .update(app_user)
      .set(staffFlagPayload(isStaff))
      .where(eq(app_user.id, targetUserId))
      .returning({ id: app_user.id })

    return updated.length > 0
      ? { ok: true }
      : { ok: false, reason: "not_found" }
  } catch (error) {
    return translateUserRefusal(error)
  }
}

/**
 * Deactivate or reactivate an account.
 *
 * Deactivation also revokes every live one-time link addressed to it — Advisor
 * carry-in SF-6 — in the database trigger
 * `app_user_offboarding_revokes_setup_tokens` (migration 0002). An unclicked
 * `account_setup` link for a provisioned staff identity is the sharpest of
 * them: whoever consumes it BECOMES that identity.
 */
export async function setUserDisabled(
  office: OfficeScope,
  targetUserId: string,
  disabled: boolean,
): Promise<OfficeUserWriteResult> {
  try {
    const updated = await officeDb(office)
      .update(app_user)
      .set(accountDisabledPayload(disabled))
      .where(eq(app_user.id, targetUserId))
      .returning({ id: app_user.id })

    return updated.length > 0
      ? { ok: true }
      : { ok: false, reason: "not_found" }
  } catch (error) {
    return translateUserRefusal(error)
  }
}

/**
 * A guard's refusal becomes a named reason; anything else is re-thrown. A real
 * database fault must not be dressed up as a polite Czech sentence — that is
 * the worst possible way to find out about one.
 *
 * Exported for `anonymize.ts`, which fires the same three guards from a
 * transaction of its own and must not grow a second, drifting copy of the
 * message-to-reason mapping.
 */
export function translateUserRefusal(error: unknown): OfficeUserWriteResult {
  // See `writeMembership`: a lock-cycle victim is retryable, not broken.
  if (isDeadlock(error)) return { ok: false, reason: "retry" }

  const refusal = guardRefusal(error)
  if (refusal === "last_owner") return { ok: false, reason: "last_owner" }
  if (refusal === "staff_holds_owner") {
    return { ok: false, reason: "staff_holds_owner" }
  }
  if (refusal !== null) return { ok: false, reason: "rejected" }
  throw error
}
