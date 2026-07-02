"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { workspace_membership } from "@workspace/db/schema"

import { setActiveWorkspaceCookie } from "../../onboarding/_lib/active-workspace-cookie"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Switch the active workspace. Validates the target against the caller's active
 * `workspace_membership` BEFORE minting the cookie — the cookie carrier
 * (`setActiveWorkspaceCookie`) is trusted downstream, so an unvalidated id would
 * let a user pin a workspace they don't belong to. On success the layout
 * re-resolves via `getWorkspaceContext` on the next render.
 */
export async function switchWorkspaceAction(
  workspaceId: string,
): Promise<void> {
  if (!UUID_RE.test(workspaceId)) throw new Error("invalid workspace id")

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error("unauthenticated")

  const isMember = await withAdminBypass(async (db) => {
    const [row] = await db
      .select({ id: workspace_membership.id })
      .from(workspace_membership)
      .where(
        and(
          eq(workspace_membership.user_id, session.user.id),
          eq(workspace_membership.workspace_id, workspaceId),
          eq(workspace_membership.active, true),
        ),
      )
      .limit(1)
    return Boolean(row)
  })
  if (!isMember) throw new Error("not a member of that workspace")

  await setActiveWorkspaceCookie(workspaceId)
  revalidatePath("/workspace", "layout")
}
