import "server-only"

import { and, eq, isNull } from "drizzle-orm"

import { betaDb } from "@/db/client"
import { organization } from "@/db/schema"
import type { OrganizationIdentityPatch } from "@/lib/ares/suggestions"

import {
  organizationIdentityView,
  type OrganizationIdentityView,
} from "./projections"
import type { OrgScope, OwnerScope } from "./scope"

/**
 * The identity card behind Nastavení › Společnost (spec §2.10).
 *
 * READ takes an `OrgScope` — every role sees the card (§2.10: "owner edit;
 * others view"). WRITE takes an `OwnerScope`, so "only the accountant edits the
 * legal identity" is a COMPILE error to get wrong rather than a check someone
 * remembers to write: a bare `OrgScope` does not satisfy the parameter, and the
 * brand cannot be minted outside `scope.ts`.
 *
 * Every statement filters on `scope.organizationId` — a value `requireScope`
 * produced from a resolved membership — and never on anything from the request.
 * There is no `organizationId` parameter on any function here for the same
 * reason there is no `organizationBySlug`: an id a caller could pass is an id a
 * caller could choose.
 */

const IDENTITY_COLUMNS = {
  slug: organization.slug,
  legal_name: organization.legal_name,
  ico: organization.ico,
  dic: organization.dic,
  vat_regime: organization.vat_regime,
  vat_registered_from: organization.vat_registered_from,
  registered_street: organization.registered_street,
  registered_house_number: organization.registered_house_number,
  registered_orientation_number: organization.registered_orientation_number,
  registered_city: organization.registered_city,
  registered_postal_code: organization.registered_postal_code,
  registered_country_code: organization.registered_country_code,
  data_box_id: organization.data_box_id,
  court_file_number: organization.court_file_number,
  tax_office_code: organization.tax_office_code,
  bank_account_prefix: organization.bank_account_prefix,
  bank_account_number: organization.bank_account_number,
  bank_code: organization.bank_code,
  iban: organization.iban,
  bic: organization.bic,
  contact_email: organization.contact_email,
  contact_phone: organization.contact_phone,
  ares_fetched_at: organization.ares_fetched_at,
}

export async function organizationIdentity(
  scope: OrgScope,
): Promise<OrganizationIdentityView | null> {
  const [row] = await betaDb()
    .select(IDENTITY_COLUMNS)
    .from(organization)
    .where(
      and(
        eq(organization.id, scope.organizationId),
        // The scope proved the book was live when the request started; the
        // office can archive it while the page renders, and an archived book is
        // data deliberately withdrawn.
        isNull(organization.archived_at),
      ),
    )
    .limit(1)

  return row ? organizationIdentityView(row) : null
}

/**
 * The column each writable field maps to.
 *
 * An explicit map, not a camelCase→snake_case transform. A transform would
 * happily route a field name nobody declared onto a column nobody meant to
 * expose — `vatRegime` → `vat_regime` is one keystroke away — whereas a missing
 * entry here is a TypeScript error at the point the field is added.
 */
const COLUMN_OF = {
  legalName: "legal_name",
  ico: "ico",
  dic: "dic",
  registeredStreet: "registered_street",
  registeredHouseNumber: "registered_house_number",
  registeredOrientationNumber: "registered_orientation_number",
  registeredCity: "registered_city",
  registeredPostalCode: "registered_postal_code",
  registeredCountryCode: "registered_country_code",
  dataBoxId: "data_box_id",
  courtFileNumber: "court_file_number",
  taxOfficeCode: "tax_office_code",
  bankAccountPrefix: "bank_account_prefix",
  bankAccountNumber: "bank_account_number",
  bankCode: "bank_code",
  iban: "iban",
  bic: "bic",
  contactEmail: "contact_email",
  contactPhone: "contact_phone",
} as const satisfies Record<keyof Required<OrganizationIdentityPatch>, string>

type IdentityRowUpdate = Partial<typeof organization.$inferInsert>

/**
 * Apply a partial edit of the identity card.
 *
 * `patch` carries ONLY the fields the caller decided to write — a save posts the
 * whole form, an ARES acceptance posts the ticked suggestions and nothing else,
 * and both land here. A key that is absent is not touched, which is what makes
 * "per-field accept writes only the accepted fields" true at the database rather
 * than in the UI.
 *
 * `registered_country_code` is the one NOT NULL column in the set, so a cleared
 * value falls back to `CZ` (the column's own default) rather than failing the
 * write. Every other column is nullable and an empty field genuinely means
 * "unknown".
 *
 * Returns `false` when the row did not match — an organization archived between
 * the render and the submit — so the caller can say so instead of reporting a
 * save that wrote nothing.
 */
export async function updateOrganizationIdentity(
  owner: OwnerScope,
  patch: OrganizationIdentityPatch,
): Promise<boolean> {
  const update: IdentityRowUpdate = {}
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const column = COLUMN_OF[field as keyof typeof COLUMN_OF]
    if (column === "registered_country_code") {
      update.registered_country_code = value ?? "CZ"
      continue
    }
    Object.assign(update, { [column]: value })
  }

  if (Object.keys(update).length === 0) return true

  update.updated_at = new Date()

  const rows = await betaDb()
    .update(organization)
    .set(update)
    .where(
      and(
        eq(organization.id, owner.organizationId),
        isNull(organization.archived_at),
      ),
    )
    .returning({ id: organization.id })

  return rows.length > 0
}

/**
 * Record that ARES was consulted for this book, now (spec §2.10's 24h stamp).
 *
 * Written on a SUCCESSFUL lookup only, and separately from any identity edit: a
 * failed call has told the office nothing, and stamping it would make the card
 * claim a reconciliation that never happened. It is also written when the
 * office accepts NOTHING — "we asked ARES and the book already agreed" is a
 * useful thing for the card to be able to say.
 */
export async function stampAresFetched(
  owner: OwnerScope,
  at: Date = new Date(),
): Promise<void> {
  await betaDb()
    .update(organization)
    .set({ ares_fetched_at: at, updated_at: at })
    .where(
      and(
        eq(organization.id, owner.organizationId),
        isNull(organization.archived_at),
      ),
    )
}
