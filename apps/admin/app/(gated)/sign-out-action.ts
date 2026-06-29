"use server"

import { clearStepUpCookie } from "@/lib/step-up"

/**
 * Best-effort clear of HttpOnly admin-only cookies on sign-out. Better
 * Auth's own cookies are cleared by `authClient.signOut`; this server
 * action covers ours (step-up token).
 */
export async function clearAdminCookies(): Promise<void> {
  await clearStepUpCookie()
}
