import "server-only"

import { notFound } from "next/navigation"
import { and, eq, isNull } from "drizzle-orm"

import { betaDb } from "@/db/client"
import { organization } from "@/db/schema"

import { organizationSummary, type OrganizationSummary } from "./projections"
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
