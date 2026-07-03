import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { app_user, workspace_membership } from "@workspace/db/schema"

import {
  TeamView,
  type TeamMember,
} from "../../_components/workspace/team/team-view"
import { getWorkspaceContext } from "../_lib/workspace-context"

export const metadata = { title: "Team" }

/**
 * Team — the accountant-office members. Real rows from
 * `workspace_membership ⋈ app_user` for the active workspace. Reads go through
 * `withAdminBypass` with an explicit `workspace_id` predicate (the tenant
 * fence), matching the rest of the workspace tier — RLS on these tables has no
 * cross-cutting listing path.
 */
export default async function TeamPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.activeWorkspaceId) redirect("/workspace")

  const activeWorkspaceId = ctx.activeWorkspaceId
  const rows = await withAdminBypass(async (db) =>
    db
      .select({
        userId: app_user.id,
        name: app_user.name,
        displayName: app_user.display_name,
        email: app_user.email,
        image: app_user.image,
        role: workspace_membership.role,
        active: workspace_membership.active,
      })
      .from(workspace_membership)
      .innerJoin(app_user, eq(app_user.id, workspace_membership.user_id))
      .where(eq(workspace_membership.workspace_id, activeWorkspaceId))
      .orderBy(app_user.name),
  )

  const members: TeamMember[] = rows.map((r) => ({
    userId: r.userId,
    name: r.displayName || r.name || r.email,
    email: r.email,
    image: r.image ?? undefined,
    role: r.role,
    active: r.active,
  }))

  return <TeamView members={members} />
}
