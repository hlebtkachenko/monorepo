import { cookies } from "next/headers"
import { verifyInviteToken, type InviteClaims } from "@workspace/auth/tokens"

/**
 * Invite-token cookie reader for the member onboarding wizard.
 *
 * The cookie is minted by `/auth/invite/start/route.ts` (path "/", 24h
 * TTL, HttpOnly, signed HS256 JWT). It carries email + organizationId +
 * role. The /onboarding/member/* steps read it through password to know
 * who the user is and which org to materialize on signup completion.
 */
export const INVITE_TOKEN_COOKIE = "app-invite-token"

export async function readInviteClaims(): Promise<InviteClaims | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(INVITE_TOKEN_COOKIE)?.value
  if (!token) return null
  try {
    return await verifyInviteToken(token)
  } catch {
    return null
  }
}

export async function clearInviteCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete({ name: INVITE_TOKEN_COOKIE, path: "/" })
}
