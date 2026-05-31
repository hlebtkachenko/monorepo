import { and, eq } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import {
  admin_workspace_allowlist,
  workspace_membership,
} from "@workspace/db/schema"

export interface AllowlistResult {
  allowed: boolean
  /** The first allowlisted workspace_id for the user, if any. Used for audit. */
  workspaceId: string | null
}

/**
 * Load allowlisted workspace IDs from the database table, falling back to
 * the legacy `ADMIN_WORKSPACE_ALLOWLIST` env var when the table is empty.
 * This lets the migration roll out in one deploy: the table starts empty,
 * and the env var keeps working until rows are seeded. Once rows exist in
 * the table, the env var is ignored.
 */
async function loadAllowlist(): Promise<Set<string>> {
  const rows = await withAdminBypass((db) =>
    db
      .select({ workspaceId: admin_workspace_allowlist.workspace_id })
      .from(admin_workspace_allowlist),
  )

  if (rows.length > 0) {
    return new Set(rows.map((r) => r.workspaceId))
  }

  // Fallback: legacy env var (comma-separated workspace UUIDs).
  const env = process.env.ADMIN_WORKSPACE_ALLOWLIST ?? ""
  const ids = env
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
  return new Set(ids)
}

/**
 * Check whether the user is an active member of an allowlisted workspace.
 * Returns both the boolean result and the matched workspace_id (for audit
 * writes). Runs under `withAdminBypass` because `workspace_membership` is
 * FORCE-RLS and the GUCs are not bound here.
 */
export async function checkAllowlist(userId: string): Promise<AllowlistResult> {
  const allowlist = await loadAllowlist()
  if (allowlist.size === 0) {
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

  const matchedId =
    rows.find((r) => allowlist.has(r.workspaceId))?.workspaceId ?? null

  return { allowed: matchedId !== null, workspaceId: matchedId }
}

/**
 * True when the user is an active member of at least one allowlisted
 * workspace. Convenience wrapper for callers that only need the boolean.
 */
export async function userIsAllowlisted(userId: string): Promise<boolean> {
  return (await checkAllowlist(userId)).allowed
}
