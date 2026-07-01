import "server-only"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@workspace/auth/server"

import {
  checkAllowlist,
  type AllowlistResult,
} from "@/app/(gated)/check-allowlist"

import { getStaffRole, type StaffRole } from "./staff-role"

/**
 * Authenticated staff session context for every admin server action /
 * server component. Built by `requireAdminSession()`.
 *
 * `workspaceId` is the matched allowlist workspace from `checkAllowlist` —
 * the workspace under which every admin audit row is written.
 * `effectiveRole` is the typed staff role from `admin_staff_role` (defaults
 * to `"guest"` for users not yet assigned).
 */
export interface AdminSessionContext {
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>
  userId: string
  email: string
  workspaceId: string
  effectiveRole: StaffRole
}

/**
 * Server-only entry point used by every admin action / page. Returns the
 * authed staff context, or redirects / throws when denied.
 *
 *   1. No session → redirect to `/auth/login`.
 *   2. Session present, not allowlisted → throw. The `(gated)/layout.tsx`
 *      already renders a friendly "Not authorized" page when reached from
 *      a page load; server actions hit this throw and surface as a form
 *      error.
 */
export async function requireAdminSession(): Promise<AdminSessionContext> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/auth/login")
  }

  const result: AllowlistResult = await checkAllowlist(session.user.id)
  if (!result.allowed || !result.workspaceId) {
    throw new Error("forbidden: not in admin workspace allowlist")
  }

  const effectiveRole = await getStaffRole(session.user.id)

  return {
    session,
    userId: session.user.id,
    email: session.user.email,
    workspaceId: result.workspaceId,
    effectiveRole,
  }
}
