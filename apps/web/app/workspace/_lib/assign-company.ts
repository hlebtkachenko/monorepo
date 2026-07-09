import "server-only"

import { and, eq, inArray } from "drizzle-orm"
import { withAdminBypass, type AdminBypassDb } from "@workspace/db"
import {
  app_user,
  organization,
  workspace_membership,
} from "@workspace/db/schema"

import type { CompanyAssignee } from "../../_components/workspace/companies/data"
import type { WorkspaceRole } from "./workspace-context"

export type AssignErrorKey = "notFound" | "invalidAssignee"
export type AssignResult =
  { ok: true } | { ok: false; errorKey: AssignErrorKey }

/**
 * Pure gate: only a workspace owner or admin may (re)assign a company's
 * responsible accountant. Extracted so it is unit-testable without a Next.js
 * request/session (mirrors `apps/web/app/onboarding/actions.test.ts`'s
 * approach to gates that live inside a "use server" action).
 */
export function canAssignCompanies(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin"
}

/**
 * Set (or clear, `userId: null`) the responsible accountant for the company
 * identified by `orgSlug`, scoped to `workspaceId`. Validates:
 *   - the org belongs to `workspaceId` (the composite `(workspace_id, slug)`
 *     unique index is the tenant fence for the slug lookup);
 *   - a non-null `userId` is an ACTIVE `workspace_membership` user of the
 *     SAME workspace (never trust a client-supplied user id blindly).
 *
 * `organization` has no workspace-scoped write policy (RLS is keyed on
 * `app.organization_id`), so `withAdminBypass` is required — same reasoning
 * as every other workspace-tier write (`setOrgArchived` in `manage-orgs.ts`).
 */
export async function setCompanyAssignee(
  workspaceId: string,
  orgSlug: string,
  userId: string | null,
): Promise<AssignResult> {
  return await withAdminBypass(async (db) => {
    const [org] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(
        and(
          eq(organization.workspace_id, workspaceId),
          eq(organization.slug, orgSlug),
        ),
      )
      .limit(1)
    if (!org) return { ok: false, errorKey: "notFound" }

    if (userId !== null) {
      const [member] = await db
        .select({ id: workspace_membership.id })
        .from(workspace_membership)
        .where(
          and(
            eq(workspace_membership.workspace_id, workspaceId),
            eq(workspace_membership.user_id, userId),
            eq(workspace_membership.active, true),
          ),
        )
        .limit(1)
      if (!member) return { ok: false, errorKey: "invalidAssignee" }
    }

    await db
      .update(organization)
      .set({ responsible_user_id: userId })
      .where(eq(organization.id, org.id))

    return { ok: true }
  })
}

/**
 * Batch-load the responsible-accountant display info for a set of org ids —
 * used by both the Companies list (Part C) and the Legislation board (Part
 * E) so neither reimplements the join. Only orgs with a `responsible_user_id`
 * set appear in the returned map; absence means unassigned.
 */
export async function loadOrgAssignees(
  db: AdminBypassDb,
  orgIds: string[],
): Promise<Map<string, CompanyAssignee>> {
  const map = new Map<string, CompanyAssignee>()
  if (orgIds.length === 0) return map

  const rows = await db
    .select({
      organizationId: organization.id,
      userId: app_user.id,
      name: app_user.name,
      displayName: app_user.display_name,
      image: app_user.image,
    })
    .from(organization)
    .innerJoin(app_user, eq(app_user.id, organization.responsible_user_id))
    .where(inArray(organization.id, orgIds))

  for (const r of rows) {
    map.set(r.organizationId, {
      userId: r.userId,
      name: r.displayName || r.name || "Member",
      image: r.image ?? undefined,
    })
  }
  return map
}

/** Active `workspace_membership` users of `workspaceId` — assignment candidates. */
export async function loadAssignableMembers(
  db: AdminBypassDb,
  workspaceId: string,
): Promise<CompanyAssignee[]> {
  const rows = await db
    .select({
      userId: app_user.id,
      name: app_user.name,
      displayName: app_user.display_name,
      image: app_user.image,
    })
    .from(workspace_membership)
    .innerJoin(app_user, eq(app_user.id, workspace_membership.user_id))
    .where(
      and(
        eq(workspace_membership.workspace_id, workspaceId),
        eq(workspace_membership.active, true),
      ),
    )
    .orderBy(app_user.name)

  return rows.map((r) => ({
    userId: r.userId,
    name: r.displayName || r.name || "Member",
    image: r.image ?? undefined,
  }))
}
