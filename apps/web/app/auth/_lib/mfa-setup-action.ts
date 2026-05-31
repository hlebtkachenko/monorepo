"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"
import { isFreshSession } from "@workspace/auth/fresh-age"

/**
 * Assert session freshness before MFA enrollment begins.
 *
 * The actual enrollment flow is handled client-side via `authClient.twoFactor.enable`.
 * Call this action as the first step in the MFA setup wizard to ensure the
 * session is fresh before any credential changes are made.
 *
 * Requires a fresh session (session.updatedAt within the last 24 hours).
 * A stale session is redirected to /auth/revalidate so the user can
 * re-authenticate before proceeding.
 *
 * Returns the user's email address for display in the authenticator app issuer
 * label, or redirects if the session is absent/stale.
 */
export async function assertMfaSetupFreshnessAction(): Promise<{
  email: string
}> {
  const h = await headers()
  const session = await auth.api.getSession({ headers: h })
  if (!session || !isFreshSession(session.session.updatedAt)) {
    redirect("/auth/revalidate?next=" + encodeURIComponent("/auth/mfa/setup"))
  }
  return { email: session.user.email }
}
