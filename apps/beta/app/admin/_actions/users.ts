"use server"

import { revalidatePath } from "next/cache"

import type { BetaMessageKey } from "@/i18n/messages"
import {
  anonymizeAppUser,
  type AnonymizeRefusal,
} from "@/lib/data/office/anonymize"
import {
  createOfficeUser,
  setUserDisabled,
  setUserStaff,
  type OfficeUserRefusal,
} from "@/lib/data/office/users"
import { requireOffice } from "@/lib/data/scope"

import { issueLinkAction } from "./issue"
import { formChecked, formFlag, formString, formUuid } from "./input"
import type { AdminActionState } from "./state"

/**
 * Uživatelé — provision an identity, set the staff flag, deactivate.
 *
 * `requireOffice()` first in every one, for the reason spelled out in
 * `organizations.ts`. `is_staff` is written here and in no other action in the
 * app (spec §3.5), through the audited payload builder that the AST fence in
 * `lib/auth/app-user-writes.boundary.test.ts` requires.
 */

/**
 * Create an account and hand out its first link in one go.
 *
 * Two writes, deliberately not one transaction. The identity is real the moment
 * it exists — it can be seen, granted memberships, made staff — and the link is
 * a separate, re-issuable artifact. If the issuance fails (a rate limit, a bad
 * address caught late), the office is left with an account and no link, which
 * is recoverable from the same screen. Rolling the account back instead would
 * lose the more valuable half.
 */
export async function createUserAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()

  const created = await createOfficeUser(office, {
    email: formString(formData, "email"),
    name: formString(formData, "name"),
    isStaff: formChecked(formData, "isStaff"),
  })

  if (!created.ok) {
    return { status: "error", error: userErrorKey(created.reason) }
  }

  revalidatePath("/admin/uzivatele")

  const state = await issueLinkAction({
    office,
    purpose: "account_setup",
    email: created.email,
    organizationId: null,
    grantedRole: null,
  })
  if (state.status === "issued") revalidatePath("/admin/odkazy")
  return state
}

/**
 * Issue a link for an account that already exists: `account_setup` for one that
 * has never been activated, `password_reset` for one that has.
 *
 * The purpose is decided HERE from the account's own state, not taken from the
 * form. A `password_reset` for a credential-less identity is refused by the
 * consume path anyway, and an `account_setup` for a live account is refused
 * too — but choosing server-side means the office cannot accidentally hand out
 * a link that will only ever fail, and it keeps the form from carrying a field
 * whose values have different privilege.
 */
export async function issueUserLinkAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()

  const email = formString(formData, "email")
  const activated = formFlag(formData, "activated")
  if (email.length === 0 || activated === null) {
    return { status: "error", error: "admin.errorInvalidInput" }
  }

  const state = await issueLinkAction({
    office,
    purpose: activated ? "password_reset" : "account_setup",
    email,
    organizationId: null,
    grantedRole: null,
  })
  if (state.status === "issued") revalidatePath("/admin/odkazy")
  return state
}

export async function setUserStaffAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()

  const targetUserId = formUuid(formData, "userId")
  const staff = formFlag(formData, "staff")
  if (targetUserId === null || staff === null) {
    return { status: "error", error: "admin.errorInvalidInput" }
  }

  const result = await setUserStaff(office, targetUserId, staff)
  if (!result.ok) {
    return { status: "error", error: userErrorKey(result.reason) }
  }

  revalidatePath("/admin/uzivatele")
  return {
    status: "ok",
    message: staff ? "admin.okStaffGranted" : "admin.okStaffRevoked",
  }
}

export async function setUserDisabledAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()

  const targetUserId = formUuid(formData, "userId")
  const disabled = formFlag(formData, "disabled")
  if (targetUserId === null || disabled === null) {
    return { status: "error", error: "admin.errorInvalidInput" }
  }

  const result = await setUserDisabled(office, targetUserId, disabled)
  if (!result.ok) {
    return { status: "error", error: userErrorKey(result.reason) }
  }

  revalidatePath("/admin/uzivatele")
  // Deactivation revokes every live link addressed to that account (SF-6,
  // migration 0002), so the registry the office is looking at is stale.
  revalidatePath("/admin/odkazy")
  return {
    status: "ok",
    message: disabled ? "admin.okUserDisabled" : "admin.okUserEnabled",
  }
}

/**
 * Anonymize an account — the terminal, irreversible act (migration 0021).
 *
 * BEHIND A TYPED CONFIRMATION, which is the repo's established shape for an
 * irreversible act (see the note about organization deletion in
 * `organizations.ts`). The operator types the account's own address; the action
 * compares it against the address the DATABASE holds, not against a value the
 * form also supplied. A confirmation checked against another form field is a
 * confirmation of nothing — both halves come from the same POST.
 *
 * The comparison is case-insensitive and trimmed because `app_user.email` is
 * lowercased by a DB trigger and the operator is copying from a grid, not typing
 * a password. It is a "did you mean this row", not a secret.
 */
export async function anonymizeUserAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()

  const targetUserId = formUuid(formData, "userId")
  const confirmEmail = formString(formData, "confirmEmail").toLowerCase()
  if (targetUserId === null || confirmEmail.length === 0) {
    return { status: "error", error: "admin.errorInvalidInput" }
  }

  const result = await anonymizeAppUser(office, targetUserId, confirmEmail)
  if (!result.ok) {
    return { status: "error", error: anonymizeErrorKey(result.reason) }
  }

  revalidatePath("/admin/uzivatele")
  // Anonymization deactivates every membership and revokes every live link
  // addressed to the old address, so both registries the office might be
  // looking at are stale.
  revalidatePath("/admin/odkazy")
  revalidatePath("/admin")
  return {
    status: "ok",
    message: result.alreadyAnonymized
      ? "admin.okUserAlreadyAnonymized"
      : "admin.okUserAnonymized",
  }
}

function anonymizeErrorKey(reason: AnonymizeRefusal): BetaMessageKey {
  switch (reason) {
    case "not_found":
      return "admin.errorNotFound"
    case "confirmation_mismatch":
      return "admin.errorConfirmationMismatch"
    case "self":
      return "admin.errorAnonymizeSelf"
    case "last_owner":
      return "admin.errorLastOwner"
    case "retry":
      return "admin.errorRetry"
    case "rejected":
      return "admin.errorRejected"
  }
}

function userErrorKey(reason: OfficeUserRefusal): BetaMessageKey {
  switch (reason) {
    case "not_found":
      return "admin.errorNotFound"
    case "invalid_email":
      return "admin.errorInvalidEmail"
    case "reserved_email":
      return "admin.errorReservedEmail"
    case "email_taken":
      return "admin.errorEmailTaken"
    case "last_owner":
      return "admin.errorLastOwner"
    case "staff_holds_owner":
      return "admin.errorStaffHoldsOwner"
    case "retry":
      return "admin.errorRetry"
    case "rejected":
      return "admin.errorRejected"
  }
}
