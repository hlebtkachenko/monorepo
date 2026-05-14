import { cookies } from "next/headers"
import { verifySignupToken, type SignupClaims } from "@workspace/auth/tokens"

/**
 * Signup-token cookie reader for the owner onboarding wizard.
 *
 * The cookie is minted by `/auth/signup/start/route.ts` (path "/", 24h
 * TTL, HttpOnly, signed HS256 JWT). It carries the invitee's email and
 * suggested workspace name. The /onboarding/* routes read it during
 * steps 1 - 3 to know who the user is BEFORE the BA account exists.
 */
export const SIGNUP_TOKEN_COOKIE = "app-signup-token"

export async function readSignupClaims(): Promise<SignupClaims | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SIGNUP_TOKEN_COOKIE)?.value
  if (!token) return null
  try {
    return await verifySignupToken(token)
  } catch {
    return null
  }
}

export async function clearSignupCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete({ name: SIGNUP_TOKEN_COOKIE, path: "/" })
}
