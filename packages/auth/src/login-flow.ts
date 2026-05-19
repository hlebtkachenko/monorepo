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
 *
 * Dual-path during AFF-198 Phase 2 (D3):
 *   USE_AUTH_TOKEN_FOR_LEM=false → legacy HS256 JWT in `app-login-email`
 *   USE_AUTH_TOKEN_FOR_LEM=true  → opaque auth_token row + `afkey-lem` cookie
 * `readLoginEmailFromStore` checks the new cookie first, falls back to the
 * legacy one. The new cookie is consumed (single-use); on success the
 * legacy cookie is also cleared so a stale JWT can't supersede.
 */

import {
  signLoginEmailToken,
  verifyLoginEmailToken,
} from "./tokens/login-email"
import {
  consumeToken,
  mintToken,
  setAuthCookie,
  readAuthCookie,
  clearAuthCookie,
  AUTH_COOKIE_DESCRIPTORS,
} from "./tokens"
import { LoginEmailSchema } from "@workspace/shared/auth"

export type { CookieStore } from "./tokens/cookies"

const LOGIN_EMAIL_COOKIE = "app-login-email"
const COOKIE_PATH = "/auth/login"
const COOKIE_TTL_SECONDS = 60 * 10

function useNewLemPath(): boolean {
  return process.env.USE_AUTH_TOKEN_FOR_LEM === "true"
}

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

  if (useNewLemPath()) {
    const { rawToken } = await mintToken({
      kind: "lem",
      payload: { email: parsed.data.email },
      ttlSeconds: COOKIE_TTL_SECONDS,
    })
    const desc = AUTH_COOKIE_DESCRIPTORS.lem
    cookieStore.set({
      name: desc.name,
      value: rawToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: desc.path,
      maxAge: COOKIE_TTL_SECONDS,
    })
    return { ok: true }
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
 * stored in the cookie, or null if absent / tampered / expired.
 * Pages call this to render the locked email; if it returns null they
 * redirect back to step 1.
 *
 * Dual-read: the new opaque-token cookie wins when present. Because
 * `lem` tokens are single-use under the consumeToken contract, a naive
 * read-then-consume here would burn the token on first read and break the
 * step 2 → step 3 progression. So this function instead does a
 * non-destructive read by hashing the cookie value and looking up the row
 * via a wrapper that returns the payload WITHOUT flipping status. The
 * single-use guarantee is preserved by the explicit `consumeLoginEmail`
 * helper that step 3 (password submit) calls after a successful login.
 */
export async function readLoginEmailFromStore(cookieStore: {
  get(name: string): { name: string; value: string } | undefined
}): Promise<string | null> {
  if (useNewLemPath()) {
    const raw = readAuthCookie(
      cookieStore as Parameters<typeof readAuthCookie>[0],
      "lem",
    )
    if (raw) {
      const peeked = await peekLemToken(raw)
      if (peeked) return peeked.email
    }
  }
  // Legacy fallback: JWT in app-login-email.
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
 * Non-destructive peek at a `lem` token: validates the format + checksum,
 * loads the row by hash, returns the payload if the row is still pending
 * and not expired. Does NOT flip status — that's what `consumeLoginEmail`
 * is for. Kept local because it pokes at the auth_token row directly with
 * a SELECT rather than the standard UPDATE-WHERE-pending consume contract.
 */
async function peekLemToken(
  rawToken: string,
): Promise<{ email: string } | null> {
  // Lazy imports to keep this module load-light when the flag is off.
  const { verifyChecksum, hashRawToken } = await import("./tokens/format")
  const { resolveAuthTokenEnv } = await import("./tokens/auth-token")
  const env = resolveAuthTokenEnv()
  if (!verifyChecksum(rawToken, "lem", env)) return null

  const tokenHash = hashRawToken(rawToken)
  const { withAdminBypass, auth_token } = await import("@workspace/db")
  const { sql } = await import("drizzle-orm")
  const rows = await withAdminBypass(async (db) => {
    return await db
      .select({
        payload: auth_token.payload,
        kind: auth_token.kind,
        status: auth_token.status,
        expires_at: auth_token.expires_at,
      })
      .from(auth_token)
      .where(
        sql`${auth_token.token_hash} = ${tokenHash}
            AND ${auth_token.status} = 'pending'
            AND ${auth_token.expires_at} > now()
            AND ${auth_token.kind} = 'lem'`,
      )
      .limit(1)
  })
  const row = rows[0]
  if (!row) return null
  const email = (row.payload as Record<string, unknown>)["email"]
  if (typeof email !== "string" || !email) return null
  return { email }
}

/**
 * Explicit consume helper for the `lem` cookie. Called by step 3 (password
 * submit) after Better Auth succeeds, so the row's status flips to
 * 'consumed' and the audit trail records redemption. Best-effort: if the
 * flag is off or the cookie missing, this is a no-op.
 */
export async function consumeLoginEmail(cookieStore: {
  get(name: string): { name: string; value: string } | undefined
}): Promise<void> {
  if (!useNewLemPath()) return
  const raw = readAuthCookie(
    cookieStore as Parameters<typeof readAuthCookie>[0],
    "lem",
  )
  if (!raw) return
  await consumeToken({ rawToken: raw, expectedKind: "lem" })
}

/**
 * Clears the login-email cookie. Called after a successful password submit
 * (when no 2FA is required) or after MFA verification completes.
 * Always deletes BOTH the legacy and the new cookie so a stale value
 * cannot resurrect a previously authenticated step 1.
 */
export function clearLoginEmail(cookieStore: {
  delete(opts: { name: string; path?: string }): void
}): void {
  cookieStore.delete({ name: LOGIN_EMAIL_COOKIE, path: COOKIE_PATH })
  clearAuthCookie(cookieStore as Parameters<typeof clearAuthCookie>[0], "lem")
}
