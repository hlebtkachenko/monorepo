"use server"

import { revalidatePath } from "next/cache"

import { lookupOrganizationAres } from "@/lib/ares/lookup"
import {
  partnerAcceptedPatch,
  partnerAresSuggestions,
  type PartnerAresField,
} from "@/lib/ares/partner-suggestions"
import { normalizeIco } from "@/lib/ares/suggestions"
import {
  createPartner,
  stampPartnerAresFetched,
  updatePartner,
  updatePartnerNotes,
  type PartnerWriteInput,
} from "@/lib/data/partners"
import { requireOwner, requireScope } from "@/lib/data/scope"
import { isCheckViolation } from "@/lib/pg-error"

import {
  formOptionalText,
  formPartnerRole,
  formString,
  formUuid,
} from "./input"
import type { PartnerActionState } from "./partner-state"

/**
 * Zadávání dat › Partneři (spec §2.4, §3.3) — the ONE form, reused for "Nový
 * partner" and for each existing row's edit disclosure, that
 * `zadavani/_components/partners-section.tsx` renders. `partnerId` present in
 * the posted `FormData` is what tells `savePartnerAction` an edit from a
 * create — there is no separate create/save pair of components the way
 * liabilities has one, because a partner's field set is wide enough that a
 * SECOND form would just be this one with an id.
 *
 * THE ARES SUB-FLOW NEVER TRUSTS A POSTED VALUE. `lookupPartnerAresAction`
 * returns suggestions to RENDER; `savePartnerAction` re-derives them itself
 * from the SAME (cache-hit, near-free) ARES call before folding any into the
 * write — the browser can only ever say WHICH field to accept, the same
 * discipline `nastaveni/_actions/company.ts`'s `acceptAresAction` uses.
 *
 * `requireOwner(await requireScope(orgSlug))` opens every export — a Server
 * Action is reachable without the `zadavani/page.tsx` gate ever having run.
 */

async function ownerFor(formData: FormData) {
  const orgSlug = formString(formData, "orgSlug")
  return { orgSlug, owner: requireOwner(await requireScope(orgSlug)) }
}

function revalidatePartners(orgSlug: string, partnerId?: string): void {
  revalidatePath(`/${orgSlug}/pro-ucetni/zadavani`)
  revalidatePath(`/${orgSlug}/pro-ucetni/zpracovani`)
  revalidatePath(`/${orgSlug}/finance/partneri`)
  if (partnerId) revalidatePath(`/${orgSlug}/finance/partneri/${partnerId}`)
}

const INVALID: PartnerActionState = {
  status: "error",
  error: "zadavani.errorInvalidInput",
}

async function guarded(
  write: () => Promise<PartnerActionState>,
): Promise<PartnerActionState> {
  try {
    return await write()
  } catch (error) {
    if (isCheckViolation(error)) {
      return { status: "error", error: "zadavani.errorRejected" }
    }
    throw error
  }
}

/**
 * The ARES-reachable fields' CURRENT values, read straight off the form —
 * never off a stored row. For an existing partner the visible inputs already
 * carry its stored values as `defaultValue`, so whatever the office has (or
 * has not) since retyped IS the current state to diff against. The two
 * fields with no visible input (`legalFormCsuCode`, `registryFileNumber`)
 * travel as hidden fields the row pre-fills from the stored partner, empty
 * for a fresh create.
 */
function currentFromForm(
  formData: FormData,
): Record<PartnerAresField, string | null> {
  const get = (key: string): string | null => formOptionalText(formData, key)
  return {
    name: get("name"),
    dic: get("dic"),
    street: get("street"),
    houseNumber: get("houseNumber"),
    orientationNumber: get("orientationNumber"),
    city: get("city"),
    postalCode: get("postalCode"),
    countryCode: get("countryCode"),
    legalFormCsuCode: get("currentLegalFormCsuCode"),
    registryFileNumber: get("currentRegistryFileNumber"),
  }
}

/**
 * "Načíst z ARES" — ask the registry and RETURN what it would change,
 * writing nothing but (for an already-saved partner) the §2.10 cache stamp.
 * See `nastaveni/_actions/company.ts`'s `lookupAresAction` for the full
 * reasoning; this is its partner-shaped twin, minus the identity write
 * (there is no `partner` row yet when this runs from the create form).
 */
export async function lookupPartnerAresAction(
  _previous: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { owner } = await ownerFor(formData)
  const partnerId = formUuid(formData, "partnerId")

  const ico = normalizeIco(formString(formData, "ico"))
  if (!ico.ok) return { status: "error", error: "zadavani.errorIcoInvalid" }
  if (ico.ico === null) {
    return { status: "error", error: "zadavani.errorIcoRequired" }
  }

  const result = await lookupOrganizationAres(ico.ico)
  if (!result.ok) {
    return {
      status: "error",
      error:
        result.reason === "not_found"
          ? "zadavani.errorAresNotFound"
          : "zadavani.errorAresUnavailable",
    }
  }

  const fetchedAt = new Date()
  // Only an EXISTING partner has a row to stamp; a draft create has none yet.
  if (partnerId) await stampPartnerAresFetched(owner, partnerId, fetchedAt)

  return {
    status: "suggestions",
    partnerId,
    suggestions: partnerAresSuggestions(
      currentFromForm(formData),
      result.profile,
    ),
    fetchedAt: fetchedAt.toISOString(),
    cached: result.cached,
  }
}

/**
 * Create a partner, or save an existing one — `partnerId` in the form picks
 * which. Every manually typed field is read as-is; any ticked ARES
 * suggestions are re-derived from a fresh (cache-hit) lookup and overlaid on
 * top, so an accepted field's WRITTEN value is always the one the server
 * itself computed from a registry answer.
 */
export async function savePartnerAction(
  _previous: PartnerActionState,
  formData: FormData,
): Promise<PartnerActionState> {
  const { orgSlug, owner } = await ownerFor(formData)
  const partnerId = formUuid(formData, "partnerId")

  const name = formString(formData, "name")
  if (name.length === 0) {
    return { status: "error", error: "zadavani.errorPartnerNameRequired" }
  }

  const ico = normalizeIco(formString(formData, "ico"))
  if (!ico.ok) return { status: "error", error: "zadavani.errorIcoInvalid" }

  const role = formPartnerRole(formData, "role")
  if (role === null) return INVALID

  let manual: PartnerWriteInput = {
    name,
    ico: ico.ico,
    role,
    email: formOptionalText(formData, "email"),
    phone: formOptionalText(formData, "phone"),
    dic: formOptionalText(formData, "dic"),
    street: formOptionalText(formData, "street"),
    houseNumber: formOptionalText(formData, "houseNumber"),
    orientationNumber: formOptionalText(formData, "orientationNumber"),
    city: formOptionalText(formData, "city"),
    postalCode: formOptionalText(formData, "postalCode"),
    countryCode: formString(formData, "countryCode") || "CZ",
    legalFormCsuCode: formOptionalText(formData, "currentLegalFormCsuCode"),
    registryFileNumber: formOptionalText(formData, "currentRegistryFileNumber"),
  }

  const acceptedFields = formData
    .getAll("accept")
    .filter((v): v is string => typeof v === "string")

  let aresFetchedAt: Date | null = null
  if (acceptedFields.length > 0) {
    if (ico.ico === null) {
      return { status: "error", error: "zadavani.errorIcoRequired" }
    }
    const result = await lookupOrganizationAres(ico.ico)
    if (!result.ok) {
      return {
        status: "error",
        error:
          result.reason === "not_found"
            ? "zadavani.errorAresNotFound"
            : "zadavani.errorAresUnavailable",
      }
    }
    const suggestions = partnerAresSuggestions(
      currentFromForm(formData),
      result.profile,
    )
    const accepted = partnerAcceptedPatch(suggestions, acceptedFields)
    // `accepted.name` / `accepted.countryCode` are typed `string | null` (the
    // ARES patch's general shape) but are never actually null —
    // `PartnerAresSuggestion.suggested` is always a non-empty string. The
    // `?? manual.*` fallbacks keep both fields the non-nullable shape
    // `PartnerWriteInput` declares, without a cast.
    manual = {
      ...manual,
      ...accepted,
      name: accepted.name ?? manual.name,
      countryCode: accepted.countryCode ?? manual.countryCode,
    }
    aresFetchedAt = new Date()
  }

  const notes = {
    noteClient: formOptionalText(formData, "noteClient"),
    noteInternal: formOptionalText(formData, "noteInternal"),
  }

  return guarded(async () => {
    let id: string
    if (partnerId) {
      const saved = await updatePartner(owner, partnerId, manual)
      if (!saved) return { status: "error", error: "zadavani.errorNotFound" }
      id = partnerId
    } else {
      const created = await createPartner(owner, {
        ...manual,
        source: "manual",
      })
      id = created.id
    }

    await updatePartnerNotes(owner, id, notes)
    if (aresFetchedAt) await stampPartnerAresFetched(owner, id, aresFetchedAt)

    revalidatePartners(orgSlug, id)
    return {
      status: "ok",
      message: partnerId ? "zadavani.okSaved" : "zadavani.okCreated",
    }
  })
}
