"use server"

import { auth } from "@workspace/auth/server"

export async function requestPasswordResetAction(email: string) {
  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/auth/reset-password" },
    })
    return { ok: true }
  } catch {
    return { ok: true }
  }
}
