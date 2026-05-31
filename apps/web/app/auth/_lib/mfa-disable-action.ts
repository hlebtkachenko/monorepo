"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"
import { isFreshSession } from "@workspace/auth/fresh-age"

/**
 * Disable two-factor authentication for the signed-in user.
 *
 * Requires the user to supply their current password for confirmation.
 * Also requires a fresh session (session.updatedAt within the last 24 hours).
 * A stale session is redirected to /auth/revalidate so the user can
 * re-authenticate before proceeding.
 */
export async function disableMfaAction(
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const h = await headers()
  const session = await auth.api.getSession({ headers: h })
  if (!session || !isFreshSession(session.session.updatedAt)) {
    redirect(
      "/auth/revalidate?next=" + encodeURIComponent("/workspace/profile"),
    )
  }
  try {
    await auth.api.disableTwoFactor({
      body: { password },
      headers: h,
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
