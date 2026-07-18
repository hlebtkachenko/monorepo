"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"

import {
  readInviteClaims,
  clearInviteCookie,
  readRawInviteToken,
} from "@/lib/auth/invite-cookie"
import { materializeInvite } from "@/lib/auth/materialize-invite"

/**
 * Server action invoked when a signed-in user lands on /auth/invite with
 * a session whose email does not match the invite token. Calls Better
 * Auth `signOut` to clear the auth_session cookie, then redirects back
 * to /auth/invite so the welcome card re-renders as anonymous.
 */
export async function signOutForInviteAction(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() })
  } catch {
    // even if signOut fails, fall through so the user sees the page
    // re-render with whatever session state is left.
  }
  redirect("/auth/invite")
}

export interface InviteResult {
  ok: boolean
  error?: string
  /** Slug of the organization the user just joined; used for redirect. */
  orgSlug?: string
}

/**
 * Accept the invite for the user already signed in. Caller must ensure
 * the session user's email matches the invite token email (the welcome
 * page does the check before rendering this button).
 */
export async function acceptInviteAction(): Promise<InviteResult> {
  const claims = await readInviteClaims()
  if (!claims) {
    return { ok: false, error: "Invite session expired." }
  }

  const rawToken = await readRawInviteToken()
  if (!rawToken) {
    await clearInviteCookie()
    return { ok: false, error: "Invite session expired." }
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return { ok: false, error: "Sign in first." }
  }
  if (session.user.email.toLowerCase() !== claims.email.toLowerCase()) {
    return {
      ok: false,
      error: "This invite is for a different email address.",
    }
  }

  try {
    const slug = await materializeInvite({
      userId: session.user.id,
      inviteRawToken: rawToken,
    })
    await clearInviteCookie()
    return { ok: true, orgSlug: slug }
  } catch (err) {
    // Log the original InviteAcceptError code server-side for ops, but
    // never return the distinguishing message to the client — different
    // codes (revoked / accepted / expired / not-found) let a caller probe
    // for known token hashes.
    console.error("[auth/invite] acceptInviteAction failed", err)
    return {
      ok: false,
      error: "Could not accept invitation.",
    }
  }
}
