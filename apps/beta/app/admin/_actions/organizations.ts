"use server"

import { revalidatePath } from "next/cache"

import {
  createOfficeOrganization,
  setOrganizationArchived,
  setOrganizationDemo,
  setOrganizationVatRegime,
} from "@/lib/data/office/organizations"
import { requireOffice } from "@/lib/data/scope"

import {
  formChecked,
  formDate,
  formFlag,
  formString,
  formUuid,
  formVatRegime,
} from "./input"
import type { AdminActionState } from "./state"

/**
 * Organizace — create, archive, and the two flags /admin owns.
 *
 * EVERY ACTION RE-CHECKS. `requireOffice()` is the first statement of each one,
 * not something the page did on the way in: a Server Action is a public POST
 * endpoint with a generated name, reachable without ever rendering the page
 * that contains its form. The layout's gate stops a browser from SEEING /admin;
 * only this call stops one from POSTING to it.
 *
 * There is NO delete here. Deleting an organization is an owner act inside the
 * book, behind a multistep typed confirmation, and it has to purge S3 including
 * noncurrent versions (plan Part 4 / B4-5, spec §2.10 danger zone). The storage
 * half landed with item 38 (`purgeOrganization`); the product surface has not.
 * Archiving is the office-side act, and it is reversible.
 */

export async function createOrganizationAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()

  // No `?? "neplatce"` default. A silent fallback turns an unrecognised value —
  // a stale form, a hand-built POST, a future enum member — into a book quietly
  // marked as a non-payer, and the VAT regime is the fact the whole Daně module
  // keys off. An unknown value is a refusal, like every other enum here.
  const vatRegime = formVatRegime(formData, "vatRegime")
  if (vatRegime === null) {
    return { status: "error", error: "admin.errorInvalidInput" }
  }

  const result = await createOfficeOrganization(office, {
    slug: formString(formData, "slug"),
    legalName: formString(formData, "legalName"),
    ico: formString(formData, "ico") || null,
    vatRegime,
    isDemo: formChecked(formData, "isDemo"),
  })

  if (!result.ok) {
    switch (result.reason) {
      case "name_required":
        return { status: "error", error: "admin.errorNameRequired" }
      case "slug_invalid":
        return { status: "error", error: "admin.errorSlugInvalid" }
      case "slug_reserved":
        return { status: "error", error: "admin.errorSlugReserved" }
      case "slug_taken":
        return { status: "error", error: "admin.errorSlugTaken" }
      case "ico_invalid":
        return { status: "error", error: "admin.errorIcoInvalid" }
    }
  }

  revalidatePath("/admin")
  return { status: "ok", message: "admin.okOrganizationCreated" }
}

export async function setOrganizationArchivedAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()

  const organizationId = formUuid(formData, "organizationId")
  const archived = formFlag(formData, "archived")
  if (organizationId === null || archived === null) {
    return { status: "error", error: "admin.errorInvalidInput" }
  }

  await setOrganizationArchived(office, organizationId, archived)

  revalidatePath("/admin")
  revalidatePath(`/admin/organizace/${organizationId}`)
  return {
    status: "ok",
    message: archived ? "admin.okArchived" : "admin.okUnarchived",
  }
}

/**
 * VAT regime and the demo flag, saved together because they are one form.
 *
 * `vat_registered_from` travels with the regime rather than as an independent
 * field — see `organizationVatPayload`. A `neplátce` with a registration date
 * left over from a previous regime is an identity card that lies, and the
 * identity card is the one surface a client reads as authoritative.
 */
export async function updateOrganizationSettingsAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const office = await requireOffice()

  const organizationId = formUuid(formData, "organizationId")
  const vatRegime = formVatRegime(formData, "vatRegime")
  if (organizationId === null || vatRegime === null) {
    return { status: "error", error: "admin.errorInvalidInput" }
  }

  await setOrganizationVatRegime(
    office,
    organizationId,
    vatRegime,
    formDate(formData, "vatRegisteredFrom"),
  )
  await setOrganizationDemo(
    office,
    organizationId,
    formChecked(formData, "isDemo"),
  )

  revalidatePath("/admin")
  revalidatePath(`/admin/organizace/${organizationId}`)
  return { status: "ok", message: "admin.okSaved" }
}
