import { and, eq } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { workspace_membership } from "@workspace/db/schema"

import { isWorkspaceAllowed, parseAdminWorkspaceAllowlist } from "./allowlist"

/**
 * True when the user is an active member of an at-least-one allowlisted
 * workspace. Runs under `withAdminBypass` because `workspace_membership`
 * is FORCE-RLS and the GUCs are not bound here.
 *
 * Used by both the `(gated)/layout.tsx` post-login gate AND the pre-login
 * gate in the admin login forms — so a user who lands on the admin UI
 * without going through the form (e.g. existing session from another tab)
 * still gets blocked, AND a user signing in via the form gets a clean
 * "not authorized" error on the form instead of being redirected to a
 * "Not authorized" page.
 */
export async function userIsAllowlisted(userId: string): Promise<boolean> {
  const allowlistEnv = process.env.ADMIN_WORKSPACE_ALLOWLIST
  // Empty allowlist denies everyone — skip the DB round-trip entirely.
  if (parseAdminWorkspaceAllowlist(allowlistEnv).length === 0) return false

  const rows = await withAdminBypass((db) =>
    db
      .select({ workspaceId: workspace_membership.workspace_id })
      .from(workspace_membership)
      .where(
        and(
          eq(workspace_membership.user_id, userId),
          eq(workspace_membership.active, true),
        ),
      ),
  )

  return isWorkspaceAllowed(
    rows.map((row) => row.workspaceId),
    allowlistEnv,
  )
}
