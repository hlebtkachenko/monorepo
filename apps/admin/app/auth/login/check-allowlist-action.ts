"use server"

import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"
import { writeAuditEventGlobal } from "@workspace/db"

import { checkAllowlist } from "../../(gated)/check-allowlist"

/**
 * Pre-login allowlist check called by the password + MFA forms immediately
 * after Better Auth reports a successful sign-in / 2FA verification, before
 * navigating to admin home.
 *
 * Returns false when:
 *   - There is no session (shouldn't happen at this point, but defensive)
 *   - The user belongs to no workspace in `ADMIN_WORKSPACE_ALLOWLIST`
 *
 * On false, the form signs the user out and shows a "not authorized" error.
 * This keeps the credentials in-form rather than redirecting to the
 * post-login "Not authorized" page rendered by `(gated)/layout.tsx`.
 *
 * The post-login gate in `(gated)/layout.tsx` is the fail-safe — it stays
 * untouched and catches any path that bypasses the form (existing session
 * from another tab, future signup flow, etc.). Same allowlist source of
 * truth (`checkAllowlist` from `(gated)/check-allowlist`).
 */
export async function checkAdminAllowlistAction(): Promise<boolean> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return false
  const { allowed, workspaceId } = await checkAllowlist(session.user.id)
  if (!allowed) {
    void writeAuditEventGlobal({
      // workspaceId is null for denied users (no allowlisted workspace matched).
      // writeAuditEventGlobal inserts with workspace_id = NULL in that case
      // (nullable since migration 0021), so the denial IS persisted.
      workspaceId: workspaceId ?? undefined,
      actorUserId: session.user.id,
      action: "auth.admin.allowlist_denied",
      payload: { user_id: session.user.id },
    })
  }
  return allowed
}
