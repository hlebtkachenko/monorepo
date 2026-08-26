/**
 * The ARES reconciliation rules of spec §2.10, as a pure function.
 *
 * "ARES navrhuje: X → přijmout" is a diff, not an import. Everything that makes
 * that true — which columns ARES may speak about at all, what counts as a
 * suggestion, and what must never be touched — lives here, with no fetch, no
 * database and no `server-only`, so the rules can be exhausted in a unit test
 * instead of inferred from a form.
 *
 * THE FOUR RULES, and where each one is enforced:
 *
 *   1. NEVER SILENTLY OVERWRITE. This module only ever RETURNS suggestions. The
 *      writing side (`lib/data/organization-identity.ts`) takes a list of field
 *      names the human ticked and writes those; a suggestion nobody accepted is
 *      a rendered sentence and nothing more.
 *
 *   2. `dic: null` NEVER SETS `vat_regime`. Structural, twice over:
 *      `vat_regime` is not in `ARES_FIELDS` and not in `IDENTITY_FIELDS` at all
 *      (it belongs to /admin, spec §3.5), so there is no code path from a
 *      registry answer to a VAT regime. And a null `dic` produces no suggestion
 *      for `dic` either — absence in ARES is not evidence of anything; a subject
 *      can be a plátce whose DIČ the registry has not published.
 *
 *   3. LEFT-PAD THE IČO. `normalizeIco` is the only way an IČO reaches either
 *      the lookup or the database: ARES keys on 8 digits and a Czech IČO is
 *      routinely written with the leading zeros dropped.
 *
 *   4. NO SUGGESTION WITHOUT A DIFFERENCE. A field ARES agrees with, or has
 *      nothing to say about, is not offered — a list of twelve "changes" that
 *      change nothing is how per-field consent turns back into "přijmout vše"
 *      by reflex.
 */
import type { AresProfile } from "@workspace/registries"

import type { OrganizationIdentityView } from "@/lib/data/projections"

/**
 * Every column of the identity card an OWNER may edit from Nastavení ›
 * Společnost — the single source both the form and the write path read, so a
 * field cannot be rendered without being writable or writable without being
 * rendered.
 *
 * DELIBERATELY ABSENT, each for its own reason:
 *   - `slug` — the address the office has already sent links to.
 *   - `vatRegime` / `vatRegisteredFrom` — /admin's (spec §3.5); they drive which
 *     Daně a podání families exist, which is an accounting decision, not a
 *     detail on a business card.
 *   - `isDemo` / `archived` — office bookkeeping about the book, not facts about
 *     the company.
 *   - `aresFetchedAt` — a stamp the server writes when it calls ARES; a form
 *     that could set it could forge the cache.
 */
export const IDENTITY_FIELDS = [
  "legalName",
  "ico",
  "dic",
  "registeredStreet",
  "registeredHouseNumber",
  "registeredOrientationNumber",
  "registeredCity",
  "registeredPostalCode",
  "registeredCountryCode",
  "dataBoxId",
  "courtFileNumber",
  "taxOfficeCode",
  "bankAccountPrefix",
  "bankAccountNumber",
  "bankCode",
  "iban",
  "bic",
  "contactEmail",
  "contactPhone",
] as const

export type IdentityField = (typeof IDENTITY_FIELDS)[number]

/** A partial edit of the identity card. `null` clears a column. */
export type OrganizationIdentityPatch = Partial<
  Record<IdentityField, string | null>
>

/**
 * The subset ARES can speak about, and the only fields a suggestion may ever
 * name.
 *
 * `ico` is absent because it is the LOOKUP KEY: ARES was asked about this IČO,
 * so echoing it back as a suggestion is circular. The bank and contact fields
 * are absent because the register does not hold them (a VAT payer's published
 * accounts come from CRPDPH, which is a different registry and out of scope
 * here). `vat_regime` is absent for rule 2.
 */
export const ARES_FIELDS = [
  "legalName",
  "dic",
  "registeredStreet",
  "registeredHouseNumber",
  "registeredOrientationNumber",
  "registeredCity",
  "registeredPostalCode",
  "registeredCountryCode",
  "courtFileNumber",
  "taxOfficeCode",
] as const satisfies readonly IdentityField[]

export type AresField = (typeof ARES_FIELDS)[number]

export type AresSuggestion = {
  readonly field: AresField
  /** What the book says today. `null` when the column is empty. */
  readonly current: string | null
  /** What ARES says. Never empty — an empty answer is not a suggestion. */
  readonly suggested: string
}

export function isAresField(value: string): value is AresField {
  return (ARES_FIELDS as readonly string[]).includes(value)
}

/**
 * The IČO as ARES and the database both require it: exactly 8 digits.
 *
 * Returns `null` for "no IČO given" (an empty field is legitimate — a book can
 * be created before the company is registered) and `"invalid"` for a value that
 * cannot be one, so a typo is refused rather than silently padded into a
 * different company's identifier.
 */
export type NormalizedIco =
  { ok: true; ico: string | null } | { ok: false; reason: "invalid" }

export function normalizeIco(raw: string | null | undefined): NormalizedIco {
  const trimmed = (raw ?? "").trim()
  if (trimmed === "") return { ok: true, ico: null }

  // Czech IČO is written with spaces as often as without ("250 12 345"), and a
  // pasted one carries whatever the source used as a separator.
  const digits = trimmed.replace(/\D/g, "")
  if (digits.length === 0 || digits.length > 8)
    return { ok: false, reason: "invalid" }
  // Anything non-numeric in the input that was not a separator means this was
  // not an IČO at all.
  if (!/^[0-9\s.\-/]+$/.test(trimmed)) return { ok: false, reason: "invalid" }

  return { ok: true, ico: digits.padStart(8, "0") }
}

/** The ARES value for each field it can speak about, before any filtering. */
function aresValues(profile: AresProfile): Record<AresField, string | null> {
  const { address } = profile
  return {
    legalName: profile.legalName,
    // Rule 2: a null DIČ stays null here and is dropped below. It NEVER reaches
    // `vat_regime`, which is not a field this module can name.
    dic: profile.dic,
    registeredStreet: address.street,
    registeredHouseNumber: address.houseNumber,
    registeredOrientationNumber: address.orientationNumber,
    registeredCity: address.city,
    registeredPostalCode: address.postalCode,
    registeredCountryCode: address.countryCode,
    courtFileNumber: profile.registryFileNumber,
    taxOfficeCode: profile.taxOfficeCode,
  }
}

const normalize = (value: string | null): string => (value ?? "").trim()

/**
 * What ARES would change about this book, one entry per field, never a write.
 *
 * A field is offered only when ARES has a non-empty answer AND that answer
 * differs from what is stored (rule 4). Comparison is on the trimmed strings:
 * a stored `" Praha "` and an ARES `"Praha"` are the same fact, and offering
 * that as a change trains people to accept everything.
 */
export function aresSuggestions(
  current: Pick<OrganizationIdentityView, AresField>,
  profile: AresProfile,
): AresSuggestion[] {
  const values = aresValues(profile)

  return ARES_FIELDS.flatMap((field) => {
    const suggested = normalize(values[field])
    if (suggested === "") return []
    if (suggested === normalize(current[field])) return []
    return [{ field, current: current[field], suggested }]
  })
}

/**
 * The patch for the fields the human actually ticked.
 *
 * Takes the SUGGESTIONS (which the server just derived from a registry answer),
 * never values from the request: the browser posts field NAMES only, so a
 * hand-built POST can at most accept a suggestion the server itself computed —
 * it can never smuggle a value ARES did not say.
 */
export function acceptedPatch(
  suggestions: readonly AresSuggestion[],
  accepted: readonly string[],
): OrganizationIdentityPatch {
  const wanted = new Set(accepted)
  const patch: OrganizationIdentityPatch = {}
  for (const suggestion of suggestions) {
    if (wanted.has(suggestion.field))
      patch[suggestion.field] = suggestion.suggested
  }
  return patch
}
