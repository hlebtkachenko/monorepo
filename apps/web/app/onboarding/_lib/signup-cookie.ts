import { cookies } from "next/headers"
import {
  readAuthCookie,
  verifySignupToken,
  type SignupClaims,
} from "@workspace/auth/tokens"

/**
 * Signup-token cookie reader for the owner onboarding wizard.
 *
 * Dual-path: during the USE_AUTH_TOKEN_FOR_SIG dual-path window, both
 * the legacy HS256 JWT cookie (app-signup-token) and the new opaque
 * afkey cookie (__Host-afkey-sig) may be present. The new cookie wins
 * when present; the legacy cookie is the fallback.
 *
 * The new cookie carries its payload in the DB row (not in the cookie
 * value itself). We read the payload out of the already-consumed token
 * row — note: by the time readSignupClaims() is called the token was
 * already consumed by the landing-page POST. The payload is persisted
 * in the cookie name/value for downstream reads via a JSON payload
 * cookie (app-signup-payload) written by the landing-page route alongside
 * the auth cookie. That keeps the onboarding wizard stateless w.r.t. DB.
 *
 * Legacy path: verifySignupToken(jwt) returns SignupClaims directly.
 */

export const SIGNUP_TOKEN_COOKIE = "app-signup-token"

/**
 * Written by the landing-page POST handler alongside the opaque cookie.
 * Contains JSON-encoded SignupClaims so downstream reads don't need a
 * DB lookup.
 */
export const SIGNUP_PAYLOAD_COOKIE = "app-signup-payload"

export async function readSignupClaims(): Promise<SignupClaims | null> {
  const cookieStore = await cookies()

  // New path: check if the opaque auth cookie is present. If so, read
  // claims from the sibling payload cookie (set by the landing-page POST).
  const rawAfkey = readAuthCookie(cookieStore, "sig")
  if (rawAfkey) {
    const payloadRaw = cookieStore.get(SIGNUP_PAYLOAD_COOKIE)?.value
    if (payloadRaw) {
      try {
        const parsed = JSON.parse(payloadRaw) as unknown
        if (
          parsed !== null &&
          typeof parsed === "object" &&
          "kind" in parsed &&
          "email" in parsed &&
          "workspace" in parsed &&
          (parsed as Record<string, unknown>).kind === "signup" &&
          typeof (parsed as Record<string, unknown>).email === "string" &&
          typeof (parsed as Record<string, unknown>).workspace === "string"
        ) {
          return parsed as SignupClaims
        }
      } catch {
        // Corrupt payload cookie — fall through to legacy path.
      }
    }
  }

  // Legacy path: JWT in app-signup-token.
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
  cookieStore.delete({ name: SIGNUP_PAYLOAD_COOKIE, path: "/" })
  // The opaque afkey cookie is cleared via clearAuthCookie but we cannot
  // call that here because it imports DEFAULT_TTL_SECONDS which is server-only
  // and already imported via @workspace/auth/tokens. Clear by name directly.
  cookieStore.delete({ name: "__Host-afkey-sig", path: "/" })
}
