import { cookies } from "next/headers"
import { readInviteByRawToken } from "@workspace/auth/invite-issuer"
import type { InviteRecord } from "@workspace/auth/tokens"

/**
 * Invite-token cookie reader for the member onboarding wizard.
 *
 * The cookie is minted by `/auth/invite/start/route.ts` (path "/", 24h
 * TTL, HttpOnly). Carries a 32-byte random base64url token — no
 * claims. Claims (email, organizationId, role) live in the
 * `auth_invite` row, looked up by SHA-256(rawToken).
 */
export const INVITE_TOKEN_COOKIE = "app-invite-token"

/**
 * Reads the invite cookie's raw token, looks up the DB row, returns
 * the still-usable record. Returns null when the cookie is missing,
 * the row is gone, or the status is no longer 'pending'.
 *
 * Callers that need to know WHY the invite is unusable (so they can
 * render a distinct error UI) should call `readInviteByRawToken`
 * directly and inspect `status`.
 */
export async function readInviteClaims(): Promise<InviteRecord | null> {
  const cookieStore = await cookies()
  const rawToken = cookieStore.get(INVITE_TOKEN_COOKIE)?.value
  if (!rawToken) return null
  const record = await readInviteByRawToken(rawToken)
  if (!record) return null
  if (record.status !== "pending") return null
  return record
}

/** Returns the raw token without a DB lookup — used by accept actions. */
export async function readRawInviteToken(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(INVITE_TOKEN_COOKIE)?.value ?? null
}

export async function clearInviteCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete({ name: INVITE_TOKEN_COOKIE, path: "/" })
}
