import "server-only"

import { and, eq, inArray, sql } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  organization,
  workspace,
  workspace_membership,
} from "@workspace/db/schema"

import { presignAvatarRead } from "../../_lib/avatar-storage"
import { readActiveWorkspaceCookie } from "../../onboarding/_lib/active-workspace-cookie"

export type WorkspaceRole = "owner" | "admin" | "member"

interface WorkspaceSummary {
  id: string
  name: string
  role: WorkspaceRole
  /** Number of companies (organizations) under this workspace. */
  companyCount: number
}

export interface WorkspaceContext {
  /**
   * The workspace the user is operating in. `null` only when the user has no
   * active workspace membership at all (the empty-state branch).
   */
  activeWorkspaceId: string | null
  current: WorkspaceSummary | null
  hasNoWorkspace: boolean
}

/**
 * Resolve the workspace context for the signed-in user.
 *
 * Reads go through `withAdminBypass`: the `organization` table's RLS is keyed on
 * `app.organization_id` (there is NO workspace-scoped SELECT policy on it), so a
 * `withWorkspace` frame — which clears `app.organization_id` — would make the
 * client-count query match zero rows. `withAdminBypass` skips RLS; the explicit
 * `workspace_id` predicate is the tenant fence. This mirrors how the existing
 * `listWorkspacesForUser` (workspace chooser) and `resolveMembership` (org
 * layout) already query across the tenant boundary.
 *
 * The active workspace = the `wks` cookie's workspace IF the user is still an
 * active member of it (validated here — the cookie is never trusted blindly),
 * else the first membership by workspace name. Because the reads bypass RLS, the
 * membership validation is the only thing preventing a stale/forged cookie from
 * selecting a workspace the user has no access to.
 */
export async function getWorkspaceContext(
  userId: string,
): Promise<WorkspaceContext> {
  const memberships = await withAdminBypass(async (db) => {
    const rows = await db
      .select({
        id: workspace.id,
        name: workspace.display_name,
        role: workspace_membership.role,
      })
      .from(workspace_membership)
      .innerJoin(workspace, eq(workspace.id, workspace_membership.workspace_id))
      .where(
        and(
          eq(workspace_membership.user_id, userId),
          eq(workspace_membership.active, true),
        ),
      )
      .orderBy(workspace.display_name)

    if (rows.length === 0) return []

    // Client (organization) counts for exactly the user's workspaces, grouped
    // in one round-trip.
    const counts = await db
      .select({
        workspaceId: organization.workspace_id,
        count: sql<number>`count(*)::int`,
      })
      .from(organization)
      .where(
        inArray(
          organization.workspace_id,
          rows.map((r) => r.id),
        ),
      )
      .groupBy(organization.workspace_id)

    const countByWorkspace = new Map(
      counts.map((c) => [c.workspaceId, c.count]),
    )
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      companyCount: countByWorkspace.get(r.id) ?? 0,
    }))
  })

  if (memberships.length === 0) {
    return {
      activeWorkspaceId: null,
      current: null,
      hasNoWorkspace: true,
    }
  }

  // The user operates one office (no switcher). The `wks` cookie set at
  // onboarding names it; fall back to the first active membership, validated
  // (never trust the raw cookie — reads bypass RLS).
  const cookieWorkspaceId = await readActiveWorkspaceCookie()
  const current =
    (cookieWorkspaceId &&
      memberships.find((m) => m.id === cookieWorkspaceId)) ||
    memberships[0]!

  return {
    activeWorkspaceId: current.id,
    current,
    hasNoWorkspace: false,
  }
}

/**
 * Resolve the signed-in user's display name + avatar for the header — the
 * workspace-tier twin of the org layout's private `getHeaderUser`. The uploaded
 * avatar (`avatar_url`) is a private-bucket S3 key resolved to a presigned GET
 * URL; falls back to the Better Auth `image`. Initials derive client-side when
 * both are absent.
 */
export async function getWorkspaceHeaderUser(
  userId: string,
  email: string,
): Promise<{ userName?: string; userImage?: string }> {
  const row = await withAdminBypass(async (db) => {
    const [r] = await db
      .select({
        name: app_user.name,
        display_name: app_user.display_name,
        image: app_user.image,
        avatar_url: app_user.avatar_url,
      })
      .from(app_user)
      .where(eq(app_user.id, userId))
      .limit(1)
    return r ?? null
  })
  const presigned = await presignAvatarRead(row?.avatar_url ?? null)
  return {
    userName: row?.display_name || row?.name || email,
    userImage: presigned ?? row?.image ?? undefined,
  }
}
