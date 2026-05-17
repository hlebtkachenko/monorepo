"use server"

import { cookies } from "next/headers"
import { auth } from "@workspace/auth/server"
import {
  signLoginEmailToken,
  verifyLoginEmailToken,
} from "@workspace/auth/tokens"
import { LoginEmailSchema } from "@workspace/shared/auth"

/**
 * Cookie carrying the login-flow email between step 1 (`/auth/login`) and
 * step 2 (`/auth/login/password`). HttpOnly so client JS can't read it,
 * path-scoped to `/auth/login` so it never leaks to other routes, signed
 * (HS256 JWT) so a tampered or rolled-up value can't smuggle a different
 * identifier into step 2.
 */
const LOGIN_EMAIL_COOKIE = "app-login-email"
const COOKIE_PATH = "/auth/login"
const COOKIE_TTL_SECONDS = 60 * 10

export interface IdentifyEmailResult {
  ok: boolean
  errorKey?: string
}

/**
 * Step 1 submit. Validates the email shape, sets the login-email cookie,
 * and tells the client to proceed to step 2. The user identifier is never
 * confirmed against the database here — that happens at password submit
 * via Better Auth so we don't leak account existence.
 */
export async function identifyEmailAction(input: {
  email: string
}): Promise<IdentifyEmailResult> {
  const parsed = LoginEmailSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      errorKey: parsed.error.issues[0]?.message ?? "email.invalid",
    }
  }

  const token = await signLoginEmailToken(parsed.data.email, COOKIE_TTL_SECONDS)
  const cookieStore = await cookies()
  cookieStore.set(LOGIN_EMAIL_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: COOKIE_TTL_SECONDS,
  })
  return { ok: true }
}

/**
 * Server-side helper for the step-2 and step-3 pages. Returns the email
 * stored in the signed cookie, or null if absent / tampered / expired.
 * Pages call this to render the locked email; if it returns null they
 * redirect back to step 1.
 */
export async function readLoginEmail(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(LOGIN_EMAIL_COOKIE)?.value
  if (!token) return null
  try {
    const claims = await verifyLoginEmailToken(token)
    return claims.email
  } catch {
    return null
  }
}

/**
 * Clears the login-email cookie. Called from the client after a
 * successful password submit (when no 2FA is required) or after MFA
 * verification completes.
 */
export async function clearLoginEmailAction(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete({ name: LOGIN_EMAIL_COOKIE, path: COOKIE_PATH })
}

export async function sendMagicLinkAction(
  email: string,
  callbackURL: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { headers } = await import("next/headers")
    const h = await headers()
    await auth.api.signInMagicLink({
      body: { email, callbackURL },
      headers: h,
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
