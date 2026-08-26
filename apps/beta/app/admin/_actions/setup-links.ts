"use server"

import { revalidatePath } from "next/cache"

import { revokeSetupLink } from "@/lib/data/office/setup-links"
import { requireOffice } from "@/lib/data/scope"

import { formUuid } from "./input"
import type { AdminActionState } from "./state"

/**
 * Setup-linky — the registry's one write.
 *
 * `requireOffice()` first, for the reason spelled out in `organizations.ts`.
 *
 * There is no "show the link again" action and there will not be one. The table
 * holds `sha256(secret)`; the secret existed once, in the response to the
 * action that minted it. A lost link is re-issued.
 */
export async function revokeSetupLinkAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()

  const tokenId = formUuid(formData, "tokenId")
  if (tokenId === null) {
    return { status: "error", error: "admin.errorInvalidInput" }
  }

  const { revoked } = await revokeSetupLink(office, tokenId)

  revalidatePath("/admin/odkazy")
  return revoked
    ? { status: "ok", message: "admin.okLinkRevoked" }
    : { status: "error", error: "admin.errorNothingToRevoke" }
}
