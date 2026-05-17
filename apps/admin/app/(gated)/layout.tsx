import type { ReactNode } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { and, eq } from "drizzle-orm"

import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { workspace_membership } from "@workspace/db/schema"
import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"

import { SignOutButton } from "./sign-out-button"

/**
 * Admin gate — wraps every real admin page.
 *
 * Two checks:
 *   1. A valid Better Auth session (durable Node-runtime check). No session →
 *      redirect to the admin login.
 *   2. The user belongs to at least one workspace whose id is in
 *      `ADMIN_WORKSPACE_ALLOWLIST`. Not allowlisted → render a plain
 *      "Not authorized" page (NOT a redirect — a redirect to /auth/login
 *      after a successful login would loop).
 *
 * Staff workspaces are created manually; the allowlist is an env var, so
 * changing staff access is a redeploy. There is no admin-specific role —
 * the existing workspace / workspace_membership tables are reused unchanged.
 */

/** Parse `ADMIN_WORKSPACE_ALLOWLIST` — comma-separated workspace ids. */
function adminWorkspaceAllowlist(): string[] {
  return (process.env.ADMIN_WORKSPACE_ALLOWLIST ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
}

/**
 * True when the user is an active member of an allowlisted workspace.
 *
 * Runs under `withAdminBypass`: workspace_membership is FORCE-RLS and the
 * GUCs are not bound here (same pattern as the web org-switcher bootstrap).
 */
async function userIsAllowlisted(userId: string): Promise<boolean> {
  const allowlist = adminWorkspaceAllowlist()
  if (allowlist.length === 0) return false

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

  const allowed = new Set(allowlist)
  return rows.some((row) => allowed.has(row.workspaceId))
}

export default async function GatedLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/auth/login")
  }

  if (!(await userIsAllowlisted(session.user.id))) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col gap-4">
          <Heading level={2} className="mt-0">
            Not authorized
          </Heading>
          <Text variant="muted">
            {session.user.email} is not a member of an admin workspace. Ask an
            administrator to add you.
          </Text>
          <SignOutButton />
        </div>
      </div>
    )
  }

  return <>{children}</>
}
