import type { ReactNode } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@workspace/auth/server"
import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"

import { userIsAllowlisted } from "./check-allowlist"
import { SignOutButton } from "./sign-out-button"

/**
 * Admin gate — wraps every real admin page.
 *
 * Two checks (defense-in-depth):
 *   1. A valid Better Auth session (durable Node-runtime check). No session →
 *      redirect to the admin login.
 *   2. The user belongs to at least one workspace whose id is in
 *      `ADMIN_WORKSPACE_ALLOWLIST`. Not allowlisted → render a plain
 *      "Not authorized" page (NOT a redirect — a redirect to /auth/login
 *      after a successful login would loop).
 *
 * The login form itself ALSO runs `userIsAllowlisted` (see
 * `apps/admin/app/auth/login/check-allowlist-action.ts`) so a user signing
 * in via the form gets a clean error on the form instead of being bounced
 * here. This layout is the fail-safe for any other path (existing session
 * from another tab, future signup flow, etc.).
 *
 * Staff workspaces are created manually; the allowlist is an env var, so
 * changing staff access is a redeploy. There is no admin-specific role —
 * the existing workspace / workspace_membership tables are reused unchanged.
 */

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
