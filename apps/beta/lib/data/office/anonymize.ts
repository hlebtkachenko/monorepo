import "server-only"

import { and, eq, isNull, like, or } from "drizzle-orm"

import {
  app_user,
  auth_account,
  auth_session,
  auth_verification,
  organization_membership,
  two_factor,
  user_setup_token,
} from "@/db/schema"
import { isDeadlock } from "@/lib/pg-error"

import { recordAdminActivity } from "../activity-log"
import type { OfficeScope } from "../scope"

import { officeDb } from "./db"
import { anonymizedEmail, anonymizedUserPayload } from "./payloads"
import { translateUserRefusal, type OfficeUserWriteResult } from "./users"

/**
 * Erasure, the only way this deployment can perform it: ANONYMIZE, NEVER DELETE.
 *
 * THE DECISION (option A, migration 0021). A person's right to erasure meets an
 * accounting office's retention duty here, and the two are reconciled by
 * splitting the row in half. The AUDIT TRAIL — who booked what, in which book,
 * when — is retained: Czech accounting retention obliges the office to keep it,
 * and GDPR Art. 17(3)(b) ("processing is necessary for compliance with a legal
 * obligation") is the carve-out that makes retention lawful against an erasure
 * request. The IDENTITY — the address, the name, the credential, the second
 * factor — is destroyed. `activity_log.actor_user_id` is `ON DELETE RESTRICT`
 * and NOT NULL on both actor kinds, so the database itself now refuses the other
 * reading: an account that has acted in a book CANNOT be deleted, and there is
 * no code path in this application that tries.
 *
 * WHY NOT SIMPLY DEACTIVATE. `setUserDisabled` is offboarding, not erasure: it
 * stops the account and keeps every field, because a leaver still needs their
 * last payslip (spec §2.6.1). Anonymization is the terminal act AFTER that — it
 * is irreversible, it is what an Art. 17 request is answered with, and it is
 * deliberately a separate button with a separate typed confirmation.
 *
 * WHAT SURVIVES, AND WHY EACH ONE HAS TO
 *
 *   `app_user` row + id   Every `activity_log`, `import_batch`, `filing` and
 *                         `document` row that names this person points at the
 *                         id. Removing the row would either orphan them or,
 *                         with `SET NULL`, quietly erase the answerable human
 *                         from an audit trail — the exact lie migration 0021
 *                         closed.
 *   memberships           Deactivated, not deleted: "was a member of this book"
 *                         is part of the same record. `organization_membership`
 *                         holds no PII of its own — a role and two ids.
 *   activity_log          Untouched. It is append-only at the database and
 *                         carries no name or address, only ids.
 *
 * WHAT IS DESTROYED, IN ONE TRANSACTION
 *
 *   auth_account          The credential rows, including Better Auth's password
 *                         hash. This is the revocation that matters: no hash,
 *                         no sign-in, ever.
 *   auth_session          Every live session, so an already-signed-in browser
 *                         stops working on its next request rather than at the
 *                         end of its window.
 *   two_factor            The TOTP secret and the backup codes.
 *   auth_verification     Trusted devices and pending OTPs. Inert once the
 *                         account is disabled, but erasure should take them.
 *   user_setup_token      Every unconsumed link addressed to the OLD address is
 *                         revoked BEFORE the address is rewritten. This is not
 *                         belt-and-braces: the trigger
 *                         `app_user_offboarding_revokes_setup_tokens` fires only
 *                         on the `disabled_at` NULL → NOT NULL edge, so an
 *                         account that was already deactivated would have its
 *                         links silently left behind — and a live
 *                         `account_setup` link is a way to BECOME the identity
 *                         it was addressed to.
 *   app_user PII          email → tombstone, name, image, and the three
 *                         privileged flags (`anonymizedUserPayload`).
 *
 * ORDER IS LOAD-BEARING and the transaction is what makes it safe: memberships
 * go inactive first (so `beta_app_user_owner_guard` lets `is_staff` be cleared),
 * links are revoked while `app_user.email` still matches them, and the identity
 * is rewritten last. Any refusal from any guard rolls back the whole thing —
 * a half-anonymized account with a live credential is the one outcome worse
 * than not starting.
 */

export type AnonymizeUserResult =
  | {
      ok: true
      /** Already a tombstone; nothing was written. */
      alreadyAnonymized: boolean
      counts: AnonymizeCounts
    }
  | { ok: false; reason: AnonymizeRefusal }

export type AnonymizeRefusal =
  /** No such account. */
  | "not_found"
  /** The typed address is not this account's. */
  | "confirmation_mismatch"
  /** An office user may not anonymize their own account (see below). */
  | "self"
  /** The account still holds a book's only active owner membership. */
  | "last_owner"
  | "retry"
  | "rejected"

/** Not exported: nothing outside this module names it, only reads it off the
 * result. */
type AnonymizeCounts = {
  membershipsDeactivated: number
  sessionsRevoked: number
  credentialsRevoked: number
  secondFactorsRevoked: number
  /** Trusted devices and pending OTPs (`auth_verification`). */
  verificationsRevoked: number
  setupLinksRevoked: number
  /** One `activity_log` row per book the account was ever a member of. */
  booksLogged: number
}

/**
 * Anonymize an account.
 *
 * SELF-ANONYMIZATION IS REFUSED, and not out of politeness. The act writes an
 * `activity_log` row naming the office user who performed it; if that user were
 * the target, the row would name a tombstone and the trail would answer "who
 * erased this person" with "nobody you can identify". It would also strip the
 * caller's own `is_staff` mid-request, leaving /admin in a state whose next
 * action 404s for reasons the operator cannot see. Erasing an office account is
 * another office user's act.
 *
 * IDEMPOTENT. Re-running against a row that is already a tombstone writes
 * nothing and reports `alreadyAnonymized`. The tombstone address is derived from
 * the id, so "is this row already anonymized" is answered by comparing the
 * address to what this function would write — no flag column, nothing that can
 * disagree with the data.
 *
 * `confirmEmail` IS CHECKED HERE, INSIDE THE TRANSACTION, against the address
 * the row actually holds — not in the action against a second form field. The
 * check belongs next to the `FOR UPDATE` that froze the row: anywhere earlier
 * and it would be confirming a row that could still change before the write.
 */
export async function anonymizeAppUser(
  office: OfficeScope,
  targetUserId: string,
  confirmEmail: string,
): Promise<AnonymizeUserResult> {
  if (targetUserId === office.userId) return { ok: false, reason: "self" }

  const db = officeDb(office)

  try {
    return await db.transaction(async (tx) => {
      // FOR UPDATE: the guards below (last owner, staff-holds-owner) read state
      // this same transaction is about to change, and a concurrent
      // deactivation of the same account would otherwise interleave between the
      // read and the write.
      const [target] = await tx
        .select({
          id: app_user.id,
          email: app_user.email,
          disabledAt: app_user.disabled_at,
        })
        .from(app_user)
        .where(eq(app_user.id, targetUserId))
        .limit(1)
        .for("update")

      if (!target) return { ok: false as const, reason: "not_found" as const }

      const previousEmail = target.email
      // Against the address the row holds RIGHT NOW, which for an
      // already-anonymized row is the tombstone — the same string the /admin
      // grid is showing the operator. So the confirmation stays "type what you
      // see", and the old address stops being an accepted answer the moment it
      // stops identifying anybody.
      if (previousEmail !== confirmEmail.trim().toLowerCase()) {
        return {
          ok: false as const,
          reason: "confirmation_mismatch" as const,
        }
      }

      if (previousEmail === anonymizedEmail(target.id)) {
        return {
          ok: true as const,
          alreadyAnonymized: true,
          counts: EMPTY_COUNTS,
        }
      }

      // Every book this person was ever a member of, active or not — the log
      // rows below are addressed to all of them, because a deactivated
      // membership is still a book whose history names this id.
      const books = await tx
        .select({ organizationId: organization_membership.organization_id })
        .from(organization_membership)
        .where(eq(organization_membership.user_id, targetUserId))

      // 1. Memberships go inactive. Before the identity write, so
      //    `beta_app_user_owner_guard` sees no active owner membership when
      //    `is_staff` is cleared. `beta_prevent_last_owner_removal` refuses here
      //    if this is a book's only owner — the correct answer: hand the book
      //    over first.
      const deactivated = await tx
        .update(organization_membership)
        .set({ active: false })
        .where(
          and(
            eq(organization_membership.user_id, targetUserId),
            eq(organization_membership.active, true),
          ),
        )
        .returning({ id: organization_membership.id })

      // 2. Live links addressed to the OLD address, while it still matches.
      const links = await tx
        .update(user_setup_token)
        .set({ revoked_at: new Date() })
        .where(
          and(
            eq(user_setup_token.email, previousEmail),
            isNull(user_setup_token.consumed_at),
            isNull(user_setup_token.revoked_at),
          ),
        )
        .returning({ id: user_setup_token.id })

      // 3. The credential, the sessions and the second factor.
      const sessions = await tx
        .delete(auth_session)
        .where(eq(auth_session.user_id, targetUserId))
        .returning({ id: auth_session.id })

      const credentials = await tx
        .delete(auth_account)
        .where(eq(auth_account.user_id, targetUserId))
        .returning({ id: auth_account.id })

      const secondFactors = await tx
        .delete(two_factor)
        .where(eq(two_factor.user_id, targetUserId))
        .returning({ id: two_factor.id })

      // `auth_verification` holds Better Auth's short-lived grants — trusted
      // devices from the 2FA plugin, pending e-mail-verification and
      // reset-password OTPs. All are inert once `disabled_at` is set, but
      // erasure should take them rather than leave a trusted-device grant
      // sitting next to a scrubbed identity.
      //
      // MATCHED ON BOTH COLUMNS BECAUSE THE TABLE HAS NO `user_id`, and Better
      // Auth encodes the subject in whichever column suits the flow: the
      // e-mail flows put the ADDRESS in `identifier`
      // (`toOTPIdentifier("email-verification", email)`), while the token flows
      // put an opaque token there (`trust-device-<random>`,
      // `reset-password:<token>`) and the USER ID in `value`. Matching all four
      // pairings is the only way to be complete without depending on the
      // library's internal string shapes, and over-matching here is harmless —
      // these are one-time artifacts with an expiry, and under-deleting is the
      // failure erasure must not have.
      const verifications = await tx
        .delete(auth_verification)
        .where(
          or(
            like(auth_verification.identifier, `%${targetUserId}%`),
            like(auth_verification.value, `%${targetUserId}%`),
            like(auth_verification.identifier, `%${previousEmail}%`),
            like(auth_verification.value, `%${previousEmail}%`),
          ),
        )
        .returning({ id: auth_verification.id })

      // 4. The identity itself. The builder call is INLINE at `.set()` — see the
      //    note in `setUserStaff`: the AST fence reads this argument and has to
      //    see an audited builder named here, not a variable holding one.
      //
      //    `disabled_at` is the value already on the row when there was one:
      //    anonymizing an account that was offboarded in March must not restamp
      //    the offboarding as today.
      await tx
        .update(app_user)
        .set(
          anonymizedUserPayload(targetUserId, target.disabledAt ?? new Date()),
        )
        .where(eq(app_user.id, targetUserId))

      // 5. The act itself, in every book that holds this person's history.
      const booksLogged = await recordAdminActivity(
        tx,
        office,
        books.map((book) => book.organizationId),
        {
          action: "app_user.anonymize",
          entityKind: "app_user",
          entityId: targetUserId,
          // Counts and nothing else. The address that was erased must not be
          // written into the log that outlives it — that would put the PII back
          // in an append-only table.
          summary: {
            memberships_deactivated: deactivated.length,
            sessions_revoked: sessions.length,
            credentials_revoked: credentials.length,
            second_factors_revoked: secondFactors.length,
            verifications_revoked: verifications.length,
            setup_links_revoked: links.length,
          },
        },
      )

      return {
        ok: true as const,
        alreadyAnonymized: false,
        counts: {
          membershipsDeactivated: deactivated.length,
          sessionsRevoked: sessions.length,
          credentialsRevoked: credentials.length,
          secondFactorsRevoked: secondFactors.length,
          verificationsRevoked: verifications.length,
          setupLinksRevoked: links.length,
          booksLogged,
        },
      }
    })
  } catch (error) {
    return translateAnonymizeRefusal(error)
  }
}

const EMPTY_COUNTS: AnonymizeCounts = {
  membershipsDeactivated: 0,
  sessionsRevoked: 0,
  credentialsRevoked: 0,
  secondFactorsRevoked: 0,
  verificationsRevoked: 0,
  setupLinksRevoked: 0,
  booksLogged: 0,
}

/**
 * The same translation `users.ts` performs, narrowed to the reasons this act can
 * actually produce. `staff_holds_owner` is not among them: memberships are
 * deactivated in the same transaction, one statement before `is_staff` is
 * cleared, so the guard that raises it has nothing left to object to. If it ever
 * fires anyway, that is a real fault and it arrives as `rejected` rather than as
 * a reason the /admin screen would explain wrongly.
 */
function translateAnonymizeRefusal(error: unknown): AnonymizeUserResult {
  if (isDeadlock(error)) return { ok: false, reason: "retry" }

  const translated: OfficeUserWriteResult = translateUserRefusal(error)
  if (translated.ok) throw error
  if (translated.reason === "last_owner") {
    return { ok: false, reason: "last_owner" }
  }
  if (translated.reason === "retry") return { ok: false, reason: "retry" }
  return { ok: false, reason: "rejected" }
}
