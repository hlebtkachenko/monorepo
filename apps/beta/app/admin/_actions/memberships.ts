"use server"

import { revalidatePath } from "next/cache"

import type { BetaMessageKey } from "@/i18n/messages"
import {
  changeMembershipRole,
  grantOwnerInAllOrganizations,
  setMembershipActive,
  type MembershipRefusal,
} from "@/lib/data/office/memberships"
import { requireOffice } from "@/lib/data/scope"

import { issueLinkAction } from "./issue"
import { formFlag, formRole, formString, formUuid } from "./input"
import type { AdminActionState } from "./state"

/**
 * Memberships: invite into an organization, change a role, deactivate a seat.
 *
 * `requireOffice()` first in every one, for the reason spelled out in
 * `organizations.ts`.
 *
 * THE ROLE CONSTRAINT IS NOT HERE, ON PURPOSE. "Admin may never grant owner"
 * lives in `lib/auth/invite-policy.ts`, which the data layer consults and which
 * Nastavení › Lidé (PR 22) will consult from the organization side. A copy of
 * the rule in this file would be a second version of the answer, and the second
 * version is the one that goes stale. Underneath both, the database refuses an
 * owner grant from a non-staff issuer and an owner membership for a non-staff
 * account regardless of what any TypeScript said.
 */

export async function inviteToOrganizationAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()

  const organizationId = formUuid(formData, "organizationId")
  const role = formRole(formData, "role")
  if (organizationId === null || role === null) {
    return { status: "error", error: "admin.errorInvalidInput" }
  }

  const state = await issueLinkAction({
    office,
    purpose: "org_invite",
    email: formString(formData, "email"),
    organizationId,
    grantedRole: role,
  })

  if (state.status === "issued") {
    revalidatePath(`/admin/organizace/${organizationId}`)
    revalidatePath("/admin/odkazy")
  }
  return state
}

export async function changeMemberRoleAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()

  const organizationId = formUuid(formData, "organizationId")
  const targetUserId = formUuid(formData, "userId")
  const nextRole = formRole(formData, "role")
  if (organizationId === null || targetUserId === null || nextRole === null) {
    return { status: "error", error: "admin.errorInvalidInput" }
  }

  const result = await changeMembershipRole(office, {
    organizationId,
    targetUserId,
    nextRole,
  })
  if (!result.ok) {
    return { status: "error", error: membershipErrorKey(result.reason) }
  }

  revalidatePath(`/admin/organizace/${organizationId}`)
  return { status: "ok", message: "admin.okRoleChanged" }
}

export async function setMemberActiveAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()

  const organizationId = formUuid(formData, "organizationId")
  const targetUserId = formUuid(formData, "userId")
  const active = formFlag(formData, "active")
  if (organizationId === null || targetUserId === null || active === null) {
    return { status: "error", error: "admin.errorInvalidInput" }
  }

  const result = await setMembershipActive(office, {
    organizationId,
    targetUserId,
    active,
  })
  if (!result.ok) {
    return { status: "error", error: membershipErrorKey(result.reason) }
  }

  revalidatePath(`/admin/organizace/${organizationId}`)
  // Deactivating revokes that person's live links into this organization
  // (SF-6, migration 0002), so the registry the office is looking at is stale.
  revalidatePath("/admin/odkazy")
  return {
    status: "ok",
    message: active ? "admin.okMemberActivated" : "admin.okMemberDeactivated",
  }
}

/** "Owner ve všech" — spec §3.5. */
export async function grantOwnerEverywhereAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()

  const targetUserId = formUuid(formData, "userId")
  if (targetUserId === null) {
    return { status: "error", error: "admin.errorInvalidInput" }
  }

  const result = await grantOwnerInAllOrganizations(office, targetUserId)
  if (!result.ok) {
    return { status: "error", error: membershipErrorKey(result.reason) }
  }

  revalidatePath("/admin")
  revalidatePath("/admin/uzivatele")
  return { status: "ok", message: "admin.okOwnerEverywhere" }
}

function membershipErrorKey(reason: MembershipRefusal): BetaMessageKey {
  switch (reason) {
    case "not_found":
      return "admin.errorNotFound"
    case "role_not_allowed":
      return "admin.errorRoleNotAllowed"
    case "last_owner":
      return "admin.errorLastOwner"
    case "owner_requires_staff":
      return "admin.errorOwnerRequiresStaff"
    case "owner_requires_active":
      return "admin.errorOwnerRequiresActive"
    case "retry":
      return "admin.errorRetry"
    case "rejected":
      return "admin.errorRejected"
  }
}
