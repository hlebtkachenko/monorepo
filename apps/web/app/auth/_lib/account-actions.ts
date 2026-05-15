"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"

import { clearActiveWorkspaceCookie } from "../../onboarding/_lib/active-workspace-cookie"

/**
 * Global sign-out — clears the Better Auth session cookie + the
 * `app-active-workspace` cookie, then routes to /auth/login.
 *
 * Exposed as the action for the "Sign out" button in the workspace
 * + org chrome. Safe to invoke via `<form action={signOutAction}>`.
 */
export async function signOutAction(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() })
  } catch {
    // Even if BA signOut fails (e.g. session already invalid), still
    // clear our own cookies + route the user away.
  }
  await clearActiveWorkspaceCookie()
  redirect("/auth/login")
}

/**
 * Send a password-reset email to the currently signed-in user's
 * email address. The user clicks the link in the email to set a new
 * password. Renders idempotently — no-op if the user is somehow not
 * signed in.
 */
export async function requestOwnPasswordResetAction(): Promise<{
  ok: boolean
  email?: string
}> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) {
    return { ok: false }
  }
  try {
    await auth.api.requestPasswordReset({
      body: {
        email: session.user.email,
        redirectTo: "/auth/reset-password",
      },
    })
  } catch (err) {
    console.error("[account] requestPasswordReset failed", err)
    return { ok: false, email: session.user.email }
  }
  return { ok: true, email: session.user.email }
}
