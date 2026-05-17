import { and, eq } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import { organization, organization_membership } from "@workspace/db/schema"
import type { OrganizationSummary } from "@workspace/shared/api"
import type { OrgPrincipal } from "../principal"

/**
 * List the organizations the principal's user can access within the
 * principal's workspace.
 *
 * Shared single source of truth: the web org-switcher bootstrap and the public
 * `GET /v1/organizations` endpoint both call this — no duplicated logic.
 *
 * Runs under `withAdminBypass` because the membership join spans organizations
 * before any single organization context is bound (same pattern as the web
 * org-switcher). Returns `[]` when the credential has no creating user.
 */
export async function listOrganizationsForUser(
  principal: OrgPrincipal,
): Promise<OrganizationSummary[]> {
  const { userId, workspaceId } = principal
  if (!userId) return []

  return await withAdminBypass(async (db) => {
    return await db
      .select({
        id: organization.id,
        slug: organization.slug,
        legalName: organization.legal_name,
        fiscalYearStartMonth: organization.fiscal_year_start_month,
      })
      .from(organization_membership)
      .innerJoin(
        organization,
        eq(organization.id, organization_membership.organization_id),
      )
      .where(
        and(
          eq(organization_membership.user_id, userId),
          eq(organization_membership.workspace_id, workspaceId),
          eq(organization_membership.active, true),
        ),
      )
  })
}
