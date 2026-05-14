import { signToken, verifyToken } from "./jwt"

/**
 * Login-email token — carries the identifier between step 1 (`/auth/login`)
 * and step 2 (`/auth/login/password`) of the two-step login flow without
 * exposing it in a query string. The token is set as an HttpOnly cookie
 * scoped to `/auth/login`, so step 2 reads it server-side via the route's
 * own cookie store. TTL is short (10 minutes) — long enough for a user to
 * complete the password step, short enough to bound risk if the cookie
 * leaks.
 */
export interface LoginEmailClaims {
  kind: "login-email"
  email: string
}

const DEFAULT_TTL_SECONDS = 60 * 10

export async function signLoginEmailToken(
  email: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  return await signToken<LoginEmailClaims>(
    { kind: "login-email", email },
    ttlSeconds,
  )
}

export async function verifyLoginEmailToken(
  token: string,
): Promise<LoginEmailClaims> {
  return await verifyToken<LoginEmailClaims>(token, "login-email")
}
