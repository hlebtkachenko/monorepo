import "server-only"

import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import { admin_workspace_allowlist } from "@workspace/db/schema"

import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

/**
 * Server-side gate for the dev/admin-only Debug module.
 *
 * Visible when EITHER:
 *   (a) this is a development build (`NODE_ENV === "development"`), or
 *   (b) the org's workspace is on the admin allowlist — the SAME
 *       `admin_workspace_allowlist` table the admin app gates on — so
 *       allowlisted operators can reach Debug on staging / production.
 *
 * Fails closed: a normal production user in a non-allowlisted workspace gets
 * `false`, so the Debug page 404s. Runs under `withAdminBypass` because
 * `admin_workspace_allowlist` is not tenant-scoped by the org GUC.
 */
export async function hasDebugModuleAccess(
  workspaceId: string,
): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true

  const [row] = await withAdminBypass((db) =>
    db
      .select({ workspaceId: admin_workspace_allowlist.workspace_id })
      .from(admin_workspace_allowlist)
      .where(eq(admin_workspace_allowlist.workspace_id, workspaceId))
      .limit(1),
  )
  return row != null
}

/**
 * The SINGLE fail-closed gate for every Debug-module page: requires an
 * authenticated session, an org membership for `orgSlug`, and Debug-module
 * access — `notFound()`s (404) on any missing/failing step. Do not re-inline
 * this per page: a security gate duplicated across pages drifts, and a page can
 * silently open up when one copy is edited and the others aren't. Returns the
 * resolved session + membership for the page to use.
 */
export async function requireDebugAccess(orgSlug: string) {
  const session = await getRequestSession()
  if (!session) notFound()
  const membership = await resolveMembership({
    slug: orgSlug,
    userId: session.user.id,
  })
  if (!membership || !(await hasDebugModuleAccess(membership.workspaceId))) {
    notFound()
  }
  return { session, membership }
}
