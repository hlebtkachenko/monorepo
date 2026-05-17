"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"

/**
 * Server action invoked when a signed-in user lands on /auth/signup with
 * a session whose email does not match the signup token. Calls Better
 * Auth `signOut` to clear the auth_session cookie, then redirects back
 * to /auth/signup so the welcome card re-renders as anonymous and the
 * user can proceed through the wizard with the correct identity.
 */
export async function signOutForSignupAction(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() })
  } catch {
    // Even if signOut fails (e.g. session already invalid), fall through
    // so the user sees the page re-render with whatever state is left.
  }
  redirect("/auth/signup")
}
