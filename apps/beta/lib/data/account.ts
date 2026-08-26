import "server-only"

import { redirect } from "next/navigation"
import { and, eq, isNull } from "drizzle-orm"

import { betaDb } from "@/db/client"
import { app_user, organization, organization_membership } from "@/db/schema"
import { requireBetaSession, type BetaSession } from "@/lib/auth/session"
import {
  requiresTotpEnrolment,
  totpMandatoryFor,
  TOTP_ENROLMENT_PATH,
  type TotpSubject,
} from "@/lib/auth/totp-enforcement"

import { viewerAccountView, type ViewerAccountView } from "./projections"

/**
 * The signed-in viewer's OWN account facts — the pre-scope surface Nastavení ›
 * Účet and the forced-TOTP gate both read.
 *
 * SESSION-GATED, NOT SCOPE-GATED, for the same reason
 * `activeMembershipsForViewer` is: the question is about the person, not about
 * one organization, so there is no `OrgScope` to take. It calls
 * `requireBetaSession()` itself rather than trusting a caller-supplied
 * `BetaSession` — that type is an unbranded `ViewerProfile`, so a look-alike
 * object would otherwise be accepted — and every WHERE clause filters on the id
 * that session just proved, never on a request value.
 *
 * `two_factor_enabled` and `is_staff` are read here and NEVER projected. Both
 * are on `CLIENT_FORBIDDEN_COLUMNS`; `ViewerAccountView` re-states the first as
 * `twoFactorEnabled` (a fact the account's own owner is entitled to see about
 * themselves — the Účet page has to render "zapnuto / vypnuto") and drops the
 * second entirely, because whether someone is office staff is not a fact their
 * own settings page has any use for.
 */

/** The raw booleans behind the forced-TOTP decision. Never leaves the server. */
async function readTotpSubject(userId: string): Promise<TotpSubject> {
  const [[userRow], ownerRows] = await Promise.all([
    betaDb()
      .select({
        is_staff: app_user.is_staff,
        two_factor_enabled: app_user.two_factor_enabled,
      })
      .from(app_user)
      .where(eq(app_user.id, userId))
      .limit(1),
    betaDb()
      .select({ id: organization_membership.id })
      .from(organization_membership)
      .innerJoin(
        organization,
        eq(organization.id, organization_membership.organization_id),
      )
      .where(
        and(
          eq(organization_membership.user_id, userId),
          eq(organization_membership.role, "owner"),
          // An owner seat that has been deactivated, or a book the office has
          // withdrawn, is not an owner membership any more — `requireScope`
          // refuses both, so neither may keep an account under the mandate
          // either.
          eq(organization_membership.active, true),
          isNull(organization.archived_at),
        ),
      )
      .limit(1),
  ])

  return {
    isStaff: userRow?.is_staff ?? false,
    hasOwnerMembership: ownerRows.length > 0,
    twoFactorEnabled: userRow?.two_factor_enabled ?? false,
  }
}

export type ViewerAccount = {
  viewer: BetaSession
  account: ViewerAccountView
  /** Whether this account is under the office mandate and has not enrolled. */
  totpEnrolmentRequired: boolean
}

export async function viewerAccount(): Promise<ViewerAccount> {
  const viewer = await requireBetaSession()
  const subject = await readTotpSubject(viewer.userId)

  return {
    viewer,
    account: viewerAccountView({
      name: viewer.name,
      email: viewer.email,
      totpEnabled: subject.twoFactorEnabled,
      /**
       * "Your office account must keep 2FA on" — the difference between a
       * toggle and an obligation, which the Účet page has to state before it
       * offers a Vypnout button that will immediately bounce the user back to
       * the enrolment screen. False for everyone while `BETA_TOTP_REQUIRED` is
       * off: with nothing to bounce them back, stating an obligation would be
       * stating a fiction.
       */
      totpMandatory: totpMandatoryFor(subject),
    }),
    totpEnrolmentRequired: requiresTotpEnrolment(subject),
  }
}

/**
 * The forced-enrolment gate (spec §2.0.1 / §2.10).
 *
 * Called from the two server layouts that own everything behind a session — the
 * portal group and /admin — so there is no authenticated surface an office
 * account can reach without a second factor. Not middleware: beta has no
 * middleware at all, deliberately (the only cheap cookie check available there
 * matches the MAIN product's cookie prefix — Advisor blocker B4-2).
 *
 * The enrolment screen itself lives in the `(auth)` group, which this gate does
 * not cover — otherwise complying with the mandate would require already having
 * complied with it.
 *
 * A NO-OP UNLESS `BETA_TOTP_REQUIRED` IS EXACTLY `"true"`. The switch is read
 * inside `requiresTotpEnrolment`, so every caller of the mandate — this gate,
 * the tenancy seam, the Účet notice — turns off together and none of them can
 * be left behind.
 */
export async function requireTotpEnrolment(): Promise<void> {
  const viewer = await requireBetaSession()
  const subject = await readTotpSubject(viewer.userId)
  if (requiresTotpEnrolment(subject)) redirect(TOTP_ENROLMENT_PATH)
}
