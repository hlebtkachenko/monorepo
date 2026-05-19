import { and, eq } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { workspace_membership } from "@workspace/db/schema"

import { isWorkspaceAllowed, parseAdminWorkspaceAllowlist } from "./allowlist"

export interface AllowlistResult {
  allowed: boolean
  /** The first allowlisted workspace_id for the user, if any. Used for audit. */
  workspaceId: string | null
}

/**
 * Check whether the user is an active member of an allowlisted workspace.
 * Returns both the boolean result and the matched workspace_id (for audit
 * writes). Runs under `withAdminBypass` because `workspace_membership` is
 * FORCE-RLS and the GUCs are not bound here.
 *
 * Used by both the `(gated)/layout.tsx` post-login gate AND the pre-login
 * gate in the admin login forms — so a user who lands on the admin UI
 * without going through the form (e.g. existing session from another tab)
 * still gets blocked, AND a user signing in via the form gets a clean
 * "not authorized" error on the form instead of being redirected to a
 * "Not authorized" page.
 */
export async function checkAllowlist(userId: string): Promise<AllowlistResult> {
  const allowlistEnv = process.env.ADMIN_WORKSPACE_ALLOWLIST
  if (parseAdminWorkspaceAllowlist(allowlistEnv).length === 0) {
    return { allowed: false, workspaceId: null }
  }

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

  const workspaceIds = rows.map((row) => row.workspaceId)
  const allowed = isWorkspaceAllowed(workspaceIds, allowlistEnv)
  const allowlist = parseAdminWorkspaceAllowlist(allowlistEnv)
  const matchedId = workspaceIds.find((id) => allowlist.includes(id)) ?? null

  return { allowed, workspaceId: allowed ? matchedId : null }
}

/**
 * True when the user is an active member of an at-least-one allowlisted
 * workspace. Convenience wrapper around `checkAllowlist` for callers that
 * only need the boolean.
 */
export async function userIsAllowlisted(userId: string): Promise<boolean> {
  return (await checkAllowlist(userId)).allowed
}
