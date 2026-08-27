/**
 * The ARES reconciliation rules of spec §2.10, applied to a `partner` row.
 *
 * A parallel of `lib/ares/suggestions.ts`, not a generalisation of it: the two
 * modules diff against different projections (`PartnerView` vs
 * `OrganizationIdentityView`) and speak about a different field set (a
 * partner has no `vat_regime`, `dataBoxId` or bank columns to protect — it has
 * none of them at all), so a shared `Record<string, ...>` core would need a
 * type parameter wide enough to defeat the exhaustiveness checks both callers
 * rely on. `normalizeIco` IS shared (it is pure and IČO-shape has nothing to
 * do with which table is being reconciled) and imported from there.
 *
 * THE SAME FOUR RULES apply, for the same reasons: never silently overwrite
 * (this module only ever returns suggestions, never writes), no field ARES
 * cannot speak about (there is no `dic → vat_regime` path here either — a
 * partner has no `vat_regime` column at all), left-pad the IČO, no suggestion
 * without a difference.
 */
import type { AresProfile } from "@workspace/registries"

import type { PartnerView } from "@/lib/data/projections"

/**
 * Every field ARES can speak about for a partner. Deliberately narrower than
 * `PartnerWriteInput`: `role`, `email` and `phone` are the office's own
 * classification and contact details, not facts the business register holds,
 * and `ico` is the lookup key so echoing it back would be circular.
 */
export const PARTNER_ARES_FIELDS = [
  "name",
  "dic",
  "street",
  "houseNumber",
  "orientationNumber",
  "city",
  "postalCode",
  "countryCode",
  "legalFormCsuCode",
  "registryFileNumber",
] as const

export type PartnerAresField = (typeof PARTNER_ARES_FIELDS)[number]

export function isPartnerAresField(value: string): value is PartnerAresField {
  return (PARTNER_ARES_FIELDS as readonly string[]).includes(value)
}

export type PartnerAresSuggestion = {
  readonly field: PartnerAresField
  /** What the form/row currently states. `null` when the field is empty. */
  readonly current: string | null
  /** What ARES says. Never empty — an empty answer is not a suggestion. */
  readonly suggested: string
}

/** A partial edit of a partner's ARES-reachable fields. `null` clears a column. */
export type PartnerIdentityPatch = Partial<
  Record<PartnerAresField, string | null>
>

function partnerAresValues(
  profile: AresProfile,
): Record<PartnerAresField, string | null> {
  const { address } = profile
  return {
    name: profile.legalName,
    dic: profile.dic,
    street: address.street,
    houseNumber: address.houseNumber,
    orientationNumber: address.orientationNumber,
    city: address.city,
    postalCode: address.postalCode,
    countryCode: address.countryCode,
    legalFormCsuCode: profile.legalFormCsuCode,
    registryFileNumber: profile.registryFileNumber,
  }
}

const normalize = (value: string | null): string => (value ?? "").trim()

/**
 * What ARES would change about this partner, one entry per field, never a
 * write.
 *
 * `current` is whatever the CALLER supplies — a stored `PartnerView` for an
 * existing partner being re-synced, or the values already typed into a blank
 * create form. Either way a field is offered only when ARES has a non-empty
 * answer AND it differs from `current` (rule 4): a create form's untyped
 * fields are empty strings, so every ARES field with an answer is offered,
 * exactly as "prefilling a blank form" should behave.
 */
export function partnerAresSuggestions(
  current:
    | Pick<PartnerView, PartnerAresField>
    | Record<PartnerAresField, string | null>,
  profile: AresProfile,
): PartnerAresSuggestion[] {
  const values = partnerAresValues(profile)

  return PARTNER_ARES_FIELDS.flatMap((field) => {
    const suggested = normalize(values[field])
    if (suggested === "") return []
    if (suggested === normalize(current[field])) return []
    return [{ field, current: current[field], suggested }]
  })
}

/**
 * The patch for the fields the human actually ticked — re-derived from the
 * SUGGESTIONS the server just computed, never from values in the request. See
 * `lib/ares/suggestions.ts`'s `acceptedPatch` for the full reasoning; this is
 * its partner-shaped twin.
 */
export function partnerAcceptedPatch(
  suggestions: readonly PartnerAresSuggestion[],
  accepted: readonly string[],
): PartnerIdentityPatch {
  const wanted = new Set(accepted)
  const patch: PartnerIdentityPatch = {}
  for (const suggestion of suggestions) {
    if (wanted.has(suggestion.field))
      patch[suggestion.field] = suggestion.suggested
  }
  return patch
}
