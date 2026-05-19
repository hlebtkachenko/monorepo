/**
 * Login-flow server helpers — cookie read/write and magic-link dispatch.
 *
 * Framework-neutral. Callers inject a `CookieStore` (the `next/headers`
 * `cookies()` return value in Next.js apps, the supertest cookie jar in
 * tests) so this module never imports `next/headers` and remains safe to
 * consume from NestJS / `apps/api`.
 *
 * The `sendMagicLinkAction` variant that needs `next/headers` request
 * headers is intentionally left in the Next.js apps as a thin "use server"
 * wrapper that calls `sendMagicLink` with the injected headers object.
 */

import {
  signLoginEmailToken,
  verifyLoginEmailToken,
} from "./tokens/login-email"
import { LoginEmailSchema } from "@workspace/shared/auth"

export type { CookieStore } from "./tokens/cookies"

const LOGIN_EMAIL_COOKIE = "app-login-email"
const COOKIE_PATH = "/auth/login"
const COOKIE_TTL_SECONDS = 60 * 10

export interface IdentifyEmailResult {
  ok: boolean
  errorKey?: string
}

/**
 * Step 1 submit. Validates the email shape, writes the login-email cookie
 * to the supplied store, and returns `{ ok: true }` on success. The user
 * identifier is never confirmed against the database here — that happens at
 * password submit via Better Auth so we don't leak account existence.
 */
export async function identifyEmail(
  input: { email: string },
  cookieStore: {
    set(opts: {
      name: string
      value: string
      path?: string
      httpOnly?: boolean
      secure?: boolean
      sameSite?: "lax" | "strict" | "none" | boolean
      maxAge?: number
    }): void
  },
): Promise<IdentifyEmailResult> {
  const parsed = LoginEmailSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      errorKey: parsed.error.issues[0]?.message ?? "email.invalid",
    }
  }

  const token = await signLoginEmailToken(parsed.data.email, COOKIE_TTL_SECONDS)
  cookieStore.set({
    name: LOGIN_EMAIL_COOKIE,
    value: token,
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
export async function readLoginEmailFromStore(cookieStore: {
  get(name: string): { name: string; value: string } | undefined
}): Promise<string | null> {
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
 * Clears the login-email cookie. Called after a successful password submit
 * (when no 2FA is required) or after MFA verification completes.
 */
export function clearLoginEmail(cookieStore: {
  delete(opts: { name: string; path?: string }): void
}): void {
  cookieStore.delete({ name: LOGIN_EMAIL_COOKIE, path: COOKIE_PATH })
}
