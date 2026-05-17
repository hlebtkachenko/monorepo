"use server"

import { auth } from "@workspace/auth/server"

/**
 * Request a password-reset email. Always resolves `{ ok: true }` — the
 * response must not reveal whether the address has an account.
 */
export async function requestPasswordResetAction(
  email: string,
): Promise<{ ok: true }> {
  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/auth/reset-password" },
    })
  } catch {
    // Swallow: enumeration-safe — same outcome whether the user exists or not.
  }
  return { ok: true }
}
