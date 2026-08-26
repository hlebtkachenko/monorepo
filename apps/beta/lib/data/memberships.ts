import "server-only"

import { and, asc, eq, isNull } from "drizzle-orm"

import { betaDb } from "@/db/client"
import { app_user, organization, organization_membership } from "@/db/schema"
import { requireBetaSession, type BetaSession } from "@/lib/auth/session"

import { membershipSummary, type MembershipSummary } from "./projections"

/**
 * The signed-in viewer's OWN active memberships — the one query that has to
 * work before any `OrgScope` exists.
 *
 * `requireScope` (`scope.ts`) resolves ONE organization from a slug the URL
 * already names; this resolves EVERY organization the viewer may open, which
 * is exactly the pre-scope surface: the root picker (spec §2.0, "`/` = 'Vaše
 * firmy' membership list") and the header org switcher both need "what can
 * this person open", not "is this specific slug theirs".
 *
 * SESSION-GATED, NOT SCOPE-GATED. There is no membership to require yet — that
 * is the whole question this function answers — so it cannot take an
 * `OrgScope`. What it can and does require is a REAL SESSION: it calls
 * `requireBetaSession()` itself rather than trusting a caller-supplied
 * `BetaSession` (an unbranded `ViewerProfile`, unlike `OrgScope` / `OfficeScope`,
 * so nothing stops a caller from building a look-alike object). A page that
 * already resolved a session earlier in the same request pays one extra DB
 * round trip for that fail-closed guarantee — the tenancy seam takes the same
 * trade everywhere else in this app (`requireOffice()` re-reads `is_staff` on
 * every call rather than accepting a boolean).
 *
 * SCOPED TO THE VIEWER BY CONSTRUCTION. The `WHERE` clause filters on
 * `organization_membership.user_id = viewer.userId` — a value this function
 * reads from the session it just verified, never from a request parameter —
 * so the result can never contain an organization the caller merely knows the
 * slug of. There is no code path here that could leak a foreign org into the
 * switcher's list.
 *
 * EXCLUDED, LIKE `requireScope`: an inactive membership, and an archived
 * organization. A deactivated seat or a withdrawn book must not appear as an
 * option to switch into, the same way it 404s if typed directly.
 */
export type ViewerMemberships = {
  viewer: BetaSession
  memberships: MembershipSummary[]
  /**
   * Office staff (`app_user.is_staff`). Read here purely for SERVER-SIDE
   * branching (the root page's "zero memberships → link to /admin" case) —
   * it is never handed to a Client Component and never appears in a rendered
   * projection, so `CLIENT_FORBIDDEN_COLUMNS` has nothing to catch: a boolean
   * that only decides which JSX a Server Component returns never crosses the
   * server/client boundary at all.
   */
  isStaff: boolean
}

export async function activeMembershipsForViewer(): Promise<ViewerMemberships> {
  const viewer = await requireBetaSession()

  const [rows, [staffRow]] = await Promise.all([
    betaDb()
      .select({
        id: organization.id,
        slug: organization.slug,
        legal_name: organization.legal_name,
        vat_regime: organization.vat_regime,
        vat_registered_from: organization.vat_registered_from,
        is_demo: organization.is_demo,
        role: organization_membership.role,
      })
      .from(organization_membership)
      .innerJoin(
        organization,
        eq(organization.id, organization_membership.organization_id),
      )
      .where(
        and(
          eq(organization_membership.user_id, viewer.userId),
          eq(organization_membership.active, true),
          isNull(organization.archived_at),
        ),
      )
      .orderBy(asc(organization.legal_name)),
    betaDb()
      .select({ is_staff: app_user.is_staff })
      .from(app_user)
      .where(eq(app_user.id, viewer.userId))
      .limit(1),
  ])

  return {
    viewer,
    memberships: rows.map(membershipSummary),
    isStaff: staffRow?.is_staff ?? false,
  }
}
