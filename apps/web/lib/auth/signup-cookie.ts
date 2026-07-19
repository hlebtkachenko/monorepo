import { cookies } from "next/headers"
import { readAuthCookie } from "@workspace/auth/tokens"

/**
 * Signup-token cookie reader for the owner onboarding wizard.
 *
 * The opaque auth-token cookie (`__Host-afkey-sig`) carries only the raw
 * token; the consume route writes a sibling `app-signup-payload` cookie
 * holding JSON-encoded claims (email + workspace) so downstream reads
 * don't need a DB round-trip. The auth_token row is already 'consumed'
 * by the time this reader is called (the consume route flipped it
 * before redirecting to `/auth/signup`); the payload cookie is the
 * authoritative source of claims from this point on.
 */

export interface SignupClaims {
  kind: "signup"
  email: string
  workspace: string
}

/**
 * Written by the consume route alongside the opaque cookie. Contains
 * JSON-encoded SignupClaims so downstream reads avoid a DB lookup.
 */
const SIGNUP_PAYLOAD_COOKIE = "app-signup-payload"

export async function readSignupClaims(): Promise<SignupClaims | null> {
  const cookieStore = await cookies()

  // The opaque auth cookie is the gate: if it isn't present, treat the
  // payload as absent too. This avoids stale payload cookies surviving
  // beyond the auth cookie's TTL.
  const rawAfkey = readAuthCookie(cookieStore, "sig")
  if (!rawAfkey) return null

  const payloadRaw = cookieStore.get(SIGNUP_PAYLOAD_COOKIE)?.value
  if (!payloadRaw) return null

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
    // Corrupt payload cookie — treat as missing.
  }
  return null
}

export async function clearSignupCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete({ name: SIGNUP_PAYLOAD_COOKIE, path: "/" })
  cookieStore.delete({ name: "__Host-afkey-sig", path: "/" })
}
