"use server"

import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"

/**
 * Re-authenticate the signed-in user with their current password.
 *
 * Better Auth's signInEmail call updates session.updatedAt, satisfying the
 * freshAge gate on sensitive actions. Called from the revalidate page when
 * a stale session needs to be refreshed before a sensitive operation.
 */
export async function revalidateSessionAction(
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const h = await headers()
  const session = await auth.api.getSession({ headers: h })
  if (!session?.user?.email) {
    return { ok: false, error: "noSession" }
  }
  try {
    await auth.api.signInEmail({
      body: {
        email: session.user.email,
        password,
        rememberMe: true,
      },
    })
    return { ok: true }
  } catch {
    return { ok: false, error: "invalidCredentials" }
  }
}
