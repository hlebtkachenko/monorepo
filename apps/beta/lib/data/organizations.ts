import "server-only"

import { notFound } from "next/navigation"
import { and, eq, isNull } from "drizzle-orm"

import { betaDb } from "@/db/client"
import { organization } from "@/db/schema"

import {
  organizationCard,
  organizationSummary,
  type OrganizationCard,
  type OrganizationSummary,
} from "./projections"
import type { OrgScope } from "./scope"

/**
 * Organization reads.
 *
 * This is the shape every org-scoped data module in this app follows, and the
 * reason the seam exists at all:
 *
 *   1. the FIRST parameter is an `OrgScope` — the caller cannot invent one, so
 *      the function is unreachable without a resolved membership;
 *   2. the WHERE clause filters on `scope.organizationId`, never on a value
 *      that came from the request;
 *   3. the return value is a projection, never a row.
 *
 * There is no `organizationBySlug(slug)` and there will not be one. A slug is
 * request input; the only place it is ever turned into an organization id is
 * `requireScope`, which does it together with the membership check in one
 * statement.
 */
export async function organizationForScope(
  scope: OrgScope,
): Promise<OrganizationSummary> {
  const [row] = await betaDb()
    .select({
      id: organization.id,
      slug: organization.slug,
      legal_name: organization.legal_name,
      vat_regime: organization.vat_regime,
      vat_registered_from: organization.vat_registered_from,
      is_demo: organization.is_demo,
    })
    .from(organization)
    .where(
      and(
        eq(organization.id, scope.organizationId),
        // The scope proved the book was live when the request started. It can
        // be archived by the office while the page renders, and a page that
        // renders an archived book would be a stale read of data the office has
        // deliberately withdrawn.
        isNull(organization.archived_at),
      ),
    )
    .limit(1)

  if (!row) notFound()
  return organizationSummary(row)
}

/**
 * The identity card (spec §2.1 item 5 "Karta společnosti", §2.10 Společnost).
 *
 * READABLE BY EVERY ROLE. §5 makes guest an external viewer of client-visible
 * data, and a company's own name, IČO, sídlo and datová schránka are the least
 * private thing in this application — every one of them is in a public register.
 * What §2.10 restricts to the owner is EDITING them, and there is no write here.
 *
 * Same three seam properties as `organizationForScope`, for the same reasons —
 * scope first, `scope.organizationId` in the WHERE clause, a projection out —
 * plus the same `archived_at IS NULL` re-check: a book the office withdraws
 * mid-render must not print its address.
 */
export async function organizationCardForScope(
  scope: OrgScope,
): Promise<OrganizationCard> {
  const [row] = await betaDb()
    .select({
      id: organization.id,
      slug: organization.slug,
      legal_name: organization.legal_name,
      vat_regime: organization.vat_regime,
      vat_registered_from: organization.vat_registered_from,
      is_demo: organization.is_demo,
      ico: organization.ico,
      dic: organization.dic,
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
      ares_fetched_at: organization.ares_fetched_at,
    })
    .from(organization)
    .where(
      and(
        eq(organization.id, scope.organizationId),
        isNull(organization.archived_at),
      ),
    )
    .limit(1)

  if (!row) notFound()
  return organizationCard(row)
}
