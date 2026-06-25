import "server-only"

import { and, asc, count, eq, ne } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import { organization, organization_membership } from "@workspace/db/schema"

/**
 * Org-switcher header data — the active org's member count plus the other
 * organizations the signed-in user can switch to.
 *
 * Runs under `withAdminBypass`: the "other orgs" list spans organizations (and
 * workspaces), so it cannot run under `withOrganization` — FORCE RLS would
 * scope it to the current org and silently drop every sibling. This is the
 * sanctioned org-switcher-bootstrap use of the admin bypass, the same path
 * `resolveMembership` / `getHeaderUser` already take in the layout.
 */
export interface HeaderOrgData {
  /** Active member count for the current org (drives "· N Members"). */
  memberCount: number
  /**
   * Up to 3 other orgs the user actively belongs to, across every workspace,
   * excluding the current one. There is no `last_accessed_at` column, so the
   * order is deterministic-by-name, not true recency.
   */
  otherOrgs: { id: string; slug: string; name: string }[]
}

export async function getHeaderOrgData(input: {
  organizationId: string
  userId: string
}): Promise<HeaderOrgData> {
  return await withAdminBypass(async (db) => {
    const [counted] = await db
      .select({ count: count() })
      .from(organization_membership)
      .where(
        and(
          eq(organization_membership.organization_id, input.organizationId),
          eq(organization_membership.active, true),
        ),
      )

    const others = await db
      .select({
        id: organization.id,
        slug: organization.slug,
        name: organization.legal_name,
      })
      .from(organization_membership)
      .innerJoin(
        organization,
        eq(organization.id, organization_membership.organization_id),
      )
      .where(
        and(
          eq(organization_membership.user_id, input.userId),
          eq(organization_membership.active, true),
          ne(organization.id, input.organizationId),
        ),
      )
      .orderBy(asc(organization.legal_name))
      .limit(3)

    return {
      memberCount: counted?.count ?? 0,
      otherOrgs: others,
    }
  })
}
