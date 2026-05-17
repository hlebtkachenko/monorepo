"use server"

import { auth } from "@workspace/auth/server"

export async function resetPasswordAction(
  token: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await auth.api.resetPassword({
      body: { token, newPassword },
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
