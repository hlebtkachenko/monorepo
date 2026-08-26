"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import type { BetaMessageKey } from "@/i18n/messages"
import { managesPeople } from "@/lib/auth/invite-policy"
import { BETA_ORG_INVITE_RATE_LIMIT } from "@/lib/auth/policy"
import { orgInviteRateLimiter } from "@/lib/auth/rate-limit"
import { clientIp, clientUserAgent, rateLimitKey } from "@/lib/auth/request-ip"
import {
  issueSetupToken,
  setupLinkUrl,
  type IssueSetupTokenRejection,
} from "@/lib/auth/setup-token"
import type { MembershipRefusal } from "@/lib/data/membership-writes"
import { changeMemberRole, setMemberActive } from "@/lib/data/people"
import { requireScope } from "@/lib/data/scope"

import { formFlag, formRole, formString, formUuid } from "./input"
import type { NastaveniActionState } from "./state"

/**
 * Nastavení › Lidé's three writes — invite, change a role, deactivate a seat
 * (spec §2.10, §5).
 *
 * `requireScope(orgSlug)` IS THE FIRST STATEMENT OF EVERY ONE, and the slug comes
 * from the form rather than from a closure. A Server Action is a POST endpoint
 * with a generated name: it does not inherit its page's gate, it is not
 * re-entered through the layout that rendered the form, and the `orgSlug` in the
 * payload is request input like any other. So the tenancy resolution happens
 * here, from scratch, on every call — which is also where the forced-TOTP
 * mandate now bites (PR 22 folded it into the seam, precisely because actions
 * skip layouts).
 *
 * THE CEILING IS NOT IN THIS FILE. `lib/auth/invite-policy.ts` holds the matrix
 * and `lib/data/people.ts` applies it against the role AS STORED; these
 * functions read a form, call one of them, and translate the answer into a Czech
 * sentence. A second copy of "admin may never reach owner" living in an action
 * is the version that goes stale — /admin's own action layer says the same thing
 * for the same reason.
 *
 * WHAT IS NOT HERE. There is no "remove member": memberships are deactivated,
 * never deleted (`active = false` is what `requireScope` reads, it survives the
 * person coming back, and it keeps `invited_by_user_id` as the record of who let
 * them in). There is no organization delete either — spec §2.10 puts that on
 * Společnost, owner-only, behind a typed confirm.
 */

export async function inviteMemberAction(
  _previous: NastaveniActionState,
  formData: FormData,
): Promise<NastaveniActionState> {
  const scope = await requireScope(formString(formData, "orgSlug"))

  // Cheap and first: `member` and `guest` never invite, so there is nothing to
  // rate-limit, validate or look up for them. `issueSetupToken` refuses them
  // again from the same matrix, and `beta_setup_token_issuer_guard` a third
  // time from the database.
  if (!managesPeople({ kind: "organization", role: scope.role })) {
    return { status: "error", error: "nastaveni.errorNotAllowed" }
  }

  const role = formRole(formData, "role")
  if (role === null) {
    return { status: "error", error: "nastaveni.errorInvalidInput" }
  }

  const requestHeaders = await headers()
  const verdict = orgInviteRateLimiter(
    rateLimitKey(requestHeaders, "org-invite"),
    BETA_ORG_INVITE_RATE_LIMIT,
  )
  if (!verdict.allowed) {
    return { status: "error", error: "nastaveni.errorTooManyRequests" }
  }

  const result = await issueSetupToken({
    purpose: "org_invite",
    email: formString(formData, "email"),
    // FROM THE RESOLVED SCOPE, never from the form. A posted organization id
    // would be the whole tenancy boundary expressed as a hidden input;
    // `issueSetupToken` also refuses an organization issuer aiming anywhere but
    // their own book, so this is one of two independent statements of the same
    // rule rather than the only one.
    organizationId: scope.organizationId,
    grantedRole: role,
    issuer: {
      kind: "organization",
      userId: scope.userId,
      organizationId: scope.organizationId,
      role: scope.role,
    },
    ip: clientIp(requestHeaders),
    userAgent: clientUserAgent(requestHeaders),
  })

  if (!result.ok) {
    return { status: "error", error: issueErrorKey(result.reason) }
  }

  revalidatePath(`/${scope.organizationSlug}/nastaveni/lide`)
  return {
    status: "issued",
    url: setupLinkUrl(result.link),
    email: result.link.email,
    expiresAt: result.link.expiresAt.toISOString(),
  }
}

export async function changeMemberRoleAction(
  _previous: NastaveniActionState,
  formData: FormData,
): Promise<NastaveniActionState> {
  const scope = await requireScope(formString(formData, "orgSlug"))

  const targetUserId = formUuid(formData, "userId")
  const nextRole = formRole(formData, "role")
  if (targetUserId === null || nextRole === null) {
    return { status: "error", error: "nastaveni.errorInvalidInput" }
  }

  const result = await changeMemberRole(scope, { targetUserId, nextRole })
  if (!result.ok) {
    return { status: "error", error: membershipErrorKey(result.reason) }
  }

  revalidatePath(`/${scope.organizationSlug}/nastaveni/lide`)
  return { status: "ok", message: "nastaveni.okRoleChanged" }
}

export async function setMemberActiveAction(
  _previous: NastaveniActionState,
  formData: FormData,
): Promise<NastaveniActionState> {
  const scope = await requireScope(formString(formData, "orgSlug"))

  const targetUserId = formUuid(formData, "userId")
  const active = formFlag(formData, "active")
  if (targetUserId === null || active === null) {
    return { status: "error", error: "nastaveni.errorInvalidInput" }
  }

  const result = await setMemberActive(scope, { targetUserId, active })
  if (!result.ok) {
    return { status: "error", error: membershipErrorKey(result.reason) }
  }

  revalidatePath(`/${scope.organizationSlug}/nastaveni/lide`)
  return {
    status: "ok",
    message: active
      ? "nastaveni.okMemberActivated"
      : "nastaveni.okMemberDeactivated",
  }
}

/**
 * Every refusal reaches the admin as a Czech sentence they can act on.
 *
 * `last_owner` is the one worth naming rather than folding into a generic
 * refusal: it is the trigger the spec asks to have SURFACED (§2.10), the page
 * already renders a badge explaining it, and an admin who raced two windows
 * needs to be told which invariant stopped them rather than that "something went
 * wrong".
 */
function membershipErrorKey(reason: MembershipRefusal): BetaMessageKey {
  switch (reason) {
    case "not_found":
      return "nastaveni.errorMemberNotFound"
    case "role_not_allowed":
      return "nastaveni.errorNotAllowed"
    case "last_owner":
      return "nastaveni.errorLastOwner"
    case "owner_requires_staff":
    case "owner_requires_active":
      // Both mean "owner is the accountant's seat and this account is not one".
      // A company admin cannot reach either state anyway (they may not grant
      // owner at all), so the distinction /admin draws — "not staff" vs "staff
      // but deactivated" — describes a fix only the office can apply.
      return "nastaveni.errorOwnerIsOffice"
    case "retry":
      return "nastaveni.errorRetry"
    case "rejected":
      return "nastaveni.errorRejected"
  }
}

function issueErrorKey(reason: IssueSetupTokenRejection): BetaMessageKey {
  switch (reason) {
    case "invalid_email":
      return "nastaveni.errorInvalidEmail"
    case "role_not_allowed":
      return "nastaveni.errorNotAllowed"
    case "organization_archived":
      return "nastaveni.errorOrganizationArchived"
    case "purpose_not_allowed":
    case "scope_mismatch":
    // Unreachable from THIS form — Lidé never sends a `payrollEmployeeId`, and
    // the seat invite lives in Mzdy › Zaměstnanci (spec §2.10). Mapped rather
    // than left to the exhaustiveness error, because the honest answer for a
    // shape this form cannot produce is the same generic "invalid input" the
    // other two structural refusals get.
    case "employee_binding_not_allowed":
      return "nastaveni.errorInvalidInput"
    case "rejected":
      return "nastaveni.errorRejected"
  }
}
