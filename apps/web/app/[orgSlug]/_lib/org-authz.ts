/**
 * Owner/admin org write-gate + org-context resolution, shared by the settings
 * and closing/income-tax server actions (previously duplicated in each).
 *
 * `resolveOrgContext` recovers the org/workspace ids + membership role by
 * (slug, userId) — the same key the [orgSlug] layout uses — filtering to an
 * ACTIVE membership. `authorizeOrgAdmin` resolves the session, then that
 * context, and gates writes to owner/admin. Every write still runs inside
 * `withOrganization` (FORCE RLS) in the feature data module; this only recovers
 * the ids/role the RSC tree cannot pass down and enforces the role gate.
 */
import "server-only"
import { headers } from "next/headers"
import { sql } from "drizzle-orm"
import { executeRows, withAdminBypass } from "@workspace/db"
import { auth } from "@workspace/auth/server"

export interface OrgContext {
  organizationId: string
  workspaceId: string
  role: "owner" | "admin" | "member" | "agent" | "guest"
}

export async function resolveOrgContext(
  slug: string,
  userId: string,
): Promise<OrgContext | null> {
  return await withAdminBypass(async (db) => {
    const rows = await executeRows<{
      organization_id: string
      workspace_id: string
      role: OrgContext["role"]
    }>(
      db,
      sql`SELECT o.id AS organization_id, o.workspace_id, m.role
          FROM organization o
          JOIN organization_membership m
            ON m.organization_id = o.id AND m.user_id = ${userId}::uuid AND m.active = true
          WHERE o.slug = ${slug}
          LIMIT 1`,
    )
    const row = rows[0]
    if (!row) return null
    return {
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      role: row.role,
    }
  })
}

/**
 * Owner/admin write-gate: resolve the session, then the caller's org membership
 * role. Returns null when unauthenticated or the user is not an owner/admin of
 * the slug — the single check both settings and income-tax mutations run.
 */
export async function authorizeOrgAdmin(
  slug: string,
): Promise<{ userId: string; ctx: OrgContext } | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id
  if (!userId) return null
  const ctx = await resolveOrgContext(slug, userId)
  if (!ctx || (ctx.role !== "owner" && ctx.role !== "admin")) return null
  return { userId, ctx }
}
