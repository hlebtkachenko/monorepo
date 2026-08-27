import "server-only"

import { asc, eq, sql } from "drizzle-orm"

import { organization, organization_membership } from "@/db/schema"
import type { BetaVatRegime } from "@/db/schema"
import { isUniqueViolation } from "@/lib/pg-error"

import { isReservedOrgSlug, isValidOrgSlugFormat } from "../org-slug"
import {
  officeOrganizationRow,
  type OfficeOrganizationRow,
} from "../projections"
import type { OfficeScope } from "../scope"

import { officeDb } from "./db"
import { organizationVatPayload } from "./payloads"

/**
 * Organizace — the office's cross-org view of the client books (spec §3.5:
 * "create/archive, vat_regime, is_demo").
 *
 * Every function here takes an `OfficeScope`, which only `requireOffice()` can
 * produce; see `db.ts` for why that is the whole authorization story of this
 * layer, and why there is no organization filter anywhere in the file.
 *
 * NO DELETE. Deleting an organization is an owner act inside the book itself
 * (Nastavení › Společnost, danger zone, multistep typed confirm — plan Part 4,
 * spec §2.10) and it has to purge S3 including noncurrent versions. The STORAGE
 * half of that now exists — `purgeOrganization` in
 * `lib/storage/document-store.ts`, which deletes every object version and
 * delete marker under the org's prefix by id — and the product surface does
 * not. /admin ARCHIVES: `archived_at` withdraws the book from every member at
 * once (`requireScope` refuses an archived organization) and is reversible,
 * which is what an office actually wants when a client leaves.
 */

/**
 * How many active members / active owners each organization has.
 *
 * The outer column is written as the literal `organization.id` rather than
 * interpolated from the Drizzle table object. Interpolation emits a BARE
 * `"id"` — Drizzle drops the qualifier in a select-list expression — and a bare
 * `id` inside a correlated subquery resolves against the SUBQUERY's own tables
 * first. Here that is a loud "column reference id is ambiguous"; in the
 * single-table variants in `users.ts` it silently binds to the inner table's
 * own `id` and the predicate quietly becomes false. Qualify, always.
 */
const ACTIVE_MEMBER_COUNT = sql<number>`(
  SELECT count(*)::int FROM organization_membership m
   WHERE m.organization_id = organization.id AND m.active
)`

const ACTIVE_OWNER_COUNT = sql<number>`(
  SELECT count(*)::int FROM organization_membership m
   JOIN app_user u ON u.id = m.user_id
   WHERE m.organization_id = organization.id
     AND m.active AND m.role = 'owner' AND u.disabled_at IS NULL
)`

const ORGANIZATION_COLUMNS = {
  id: organization.id,
  slug: organization.slug,
  legal_name: organization.legal_name,
  ico: organization.ico,
  vat_regime: organization.vat_regime,
  // Selected because the settings form has to re-post it. See the note on
  // `OfficeOrganizationRow.vatRegisteredFrom`: without it every save nulls the
  // registration date of a plátce.
  vat_registered_from: organization.vat_registered_from,
  is_demo: organization.is_demo,
  archived_at: organization.archived_at,
  memberCount: ACTIVE_MEMBER_COUNT,
  ownerCount: ACTIVE_OWNER_COUNT,
}

export async function listOfficeOrganizations(
  office: OfficeScope,
): Promise<OfficeOrganizationRow[]> {
  const rows = await officeDb(office)
    .select(ORGANIZATION_COLUMNS)
    .from(organization)
    .orderBy(asc(organization.legal_name))

  return rows.map((row) => officeOrganizationRow(row))
}

export async function officeOrganization(
  office: OfficeScope,
  organizationId: string,
): Promise<OfficeOrganizationRow | null> {
  const [row] = await officeDb(office)
    .select(ORGANIZATION_COLUMNS)
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)

  return row ? officeOrganizationRow(row) : null
}

export type CreateOrganizationInput = {
  readonly slug: string
  readonly legalName: string
  readonly ico: string | null
  readonly vatRegime: BetaVatRegime
  readonly isDemo: boolean
}

export type CreateOrganizationResult =
  | { ok: true; organizationId: string; slug: string }
  | {
      ok: false
      reason:
        | "name_required"
        | "slug_invalid"
        | "slug_reserved"
        | "slug_taken"
        | "ico_invalid"
    }

const ICO_PATTERN = /^[0-9]{8}$/

/**
 * Create a book, and seat its first owner in the same transaction.
 *
 * THE OWNER IS NOT OPTIONAL. Advisor blocker B4-8 asks for the invariant "every
 * organization always has at least one owner, seeded at creation", and the
 * last-owner trigger only defends an org that HAS one — it has nothing to say
 * about an org created empty. An empty organization is also a dead end in
 * practice: nobody can invite into it, because the issuance guard requires an
 * active owner|admin membership there or office staff, and staff would first
 * have to grant themselves the membership /admin is meant to grant.
 *
 * So the creating office user becomes the owner. That is the break-glass seat
 * the plan calls for, it is transferable (grant-owner then self-demote), and it
 * is honest: the accountant who set the book up is its accountant.
 *
 * The uniqueness check is the UNIQUE INDEX, caught as `23505`, not a
 * SELECT-then-INSERT. Two office users creating the same slug at the same
 * moment is rare and the read-then-write version is wrong every time it happens.
 */
export async function createOfficeOrganization(
  office: OfficeScope,
  input: CreateOrganizationInput,
): Promise<CreateOrganizationResult> {
  const legalName = input.legalName.trim()
  if (legalName.length === 0) return { ok: false, reason: "name_required" }

  const slug = input.slug.trim().toLowerCase()
  if (!isValidOrgSlugFormat(slug)) return { ok: false, reason: "slug_invalid" }
  if (isReservedOrgSlug(slug)) return { ok: false, reason: "slug_reserved" }

  const ico = input.ico?.trim() ? input.ico.trim() : null
  if (ico !== null && !ICO_PATTERN.test(ico)) {
    return { ok: false, reason: "ico_invalid" }
  }

  const db = officeDb(office)

  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(organization)
        .values({
          slug,
          legal_name: legalName,
          ico,
          is_demo: input.isDemo,
          ...organizationVatPayload(input.vatRegime, null),
        })
        .returning({ id: organization.id, slug: organization.slug })

      if (!created) throw new Error("organization insert returned no row")

      await tx.insert(organization_membership).values({
        organization_id: created.id,
        user_id: office.userId,
        role: "owner",
        invited_by_user_id: office.userId,
      })

      return {
        ok: true as const,
        organizationId: created.id,
        slug: created.slug,
      }
    })
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "slug_taken" }
    throw error
  }
}

export async function setOrganizationArchived(
  office: OfficeScope,
  organizationId: string,
  archived: boolean,
): Promise<void> {
  await officeDb(office)
    .update(organization)
    .set({ archived_at: archived ? new Date() : null })
    .where(eq(organization.id, organizationId))
}

export async function setOrganizationVatRegime(
  office: OfficeScope,
  organizationId: string,
  regime: BetaVatRegime,
  registeredFrom: string | null,
): Promise<void> {
  await officeDb(office)
    .update(organization)
    .set(organizationVatPayload(regime, registeredFrom))
    .where(eq(organization.id, organizationId))
}

export async function setOrganizationDemo(
  office: OfficeScope,
  organizationId: string,
  isDemo: boolean,
): Promise<void> {
  await officeDb(office)
    .update(organization)
    .set({ is_demo: isDemo })
    .where(eq(organization.id, organizationId))
}
