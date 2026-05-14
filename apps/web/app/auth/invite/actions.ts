"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"
import { verifyInviteToken, TokenError } from "@workspace/auth/tokens"

import { materializeInvite } from "../_lib/materialize-invite"

const INVITE_TOKEN_COOKIE = "app-invite-token"

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
 * page in `/auth/invite/page.tsx` does the check before rendering this
 * button).
 */
export async function acceptInviteAction(): Promise<InviteResult> {
  const cookieStore = await cookies()
  const token = cookieStore.get(INVITE_TOKEN_COOKIE)?.value
  if (!token) {
    return { ok: false, error: "Invite session expired." }
  }

  let claims
  try {
    claims = await verifyInviteToken(token)
  } catch (err) {
    cookieStore.delete(INVITE_TOKEN_COOKIE)
    return {
      ok: false,
      error:
        err instanceof TokenError
          ? `Invite token ${err.code.toLowerCase()}.`
          : "Invalid invite token.",
    }
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
      organizationId: claims.organizationId,
      role: claims.role,
      userId: session.user.id,
      inviteJwt: token,
      email: claims.email,
    })
    cookieStore.delete(INVITE_TOKEN_COOKIE)
    return { ok: true, orgSlug: slug }
  } catch (err) {
    console.error("[auth/invite] acceptInviteAction failed", err)
    return {
      ok: false,
      error: (err as Error).message ?? "Could not accept invitation.",
    }
  }
}
