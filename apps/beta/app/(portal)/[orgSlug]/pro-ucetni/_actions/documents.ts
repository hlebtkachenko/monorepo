"use server"

import { revalidatePath } from "next/cache"

import { saveDocumentOffice } from "@/lib/data/documents-office"
import { requireOwner, requireScope } from "@/lib/data/scope"

import {
  formChecked,
  formClientDocType,
  formDocumentStatus,
  formOptionalText,
  formString,
  formUuid,
} from "./input"
import type { ProUcetniActionState } from "./state"

/**
 * Zpracování's one write: the edit-mode document sheet (spec §3.1 — "the ONLY
 * place document fields are edited"). Every field the sheet renders is posted
 * on every save, status included, so this is a single combined save rather
 * than one action per field — see `DocumentOfficePatch`'s own header in
 * `lib/data/documents-office.ts` for why that is still safe for the fields
 * the office did NOT touch on a given save (there are none, here).
 *
 * `requireOwner(await requireScope(orgSlug))` IS THE FIRST STATEMENT, not
 * something the page did on the way in — same reasoning as every /admin
 * action: a Server Action is a public POST endpoint with a generated name,
 * reachable without ever rendering the page that contains its form or the
 * `pro-ucetni/layout.tsx` gate above it. `orgSlug` therefore travels as a
 * hidden field, the same way /admin's actions take `organizationId` as one.
 */
export async function saveDocumentOfficeAction(
  _previous: ProUcetniActionState,
  formData: FormData,
): Promise<ProUcetniActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const documentId = formUuid(formData, "documentId")
  const status = formDocumentStatus(formData, "status")
  const docType = formClientDocType(formData, "docType")
  if (documentId === null || status === null || docType === null) {
    return { status: "error", error: "ucetni.errorInvalidInput" }
  }

  const result = await saveDocumentOffice(owner, documentId, {
    status,
    officeMessage: formOptionalText(formData, "officeMessage"),
    internalNote: formOptionalText(formData, "internalNote"),
    clientVisible: formChecked(formData, "clientVisible"),
    docType,
    documentDate: formOptionalText(formData, "documentDate"),
    amount: formOptionalText(formData, "amount"),
    siteRef: formOptionalText(formData, "siteRef"),
  })

  if (!result.ok) {
    switch (result.reason) {
      case "not_found":
        return { status: "error", error: "ucetni.errorNotFound" }
      case "illegal_transition":
        return { status: "error", error: "ucetni.errorIllegalTransition" }
      case "message_required":
        return { status: "error", error: "ucetni.errorMessageRequired" }
      case "invalid_date":
        return { status: "error", error: "ucetni.errorInvalidDate" }
      case "invalid_amount":
        return { status: "error", error: "ucetni.errorInvalidAmount" }
      case "conflict":
        return { status: "error", error: "ucetni.errorConflict" }
    }
  }

  revalidatePath(`/${orgSlug}/pro-ucetni/zpracovani`)
  return { status: "ok", message: "ucetni.okSaved" }
}
