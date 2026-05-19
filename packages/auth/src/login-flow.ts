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
 * Storage: opaque `auth_token` row with `kind='lem'` carrying the email
 * in its JSON payload. The `afkey-lem` cookie holds the raw token; reads
 * are non-destructive peeks (so step 2 → step 3 don't burn the token);
 * an explicit `consumeLoginEmail` flips status to 'consumed' after a
 * successful password submit.
 */

import { sql } from "drizzle-orm"

import {
  AUTH_COOKIE_DESCRIPTORS,
  consumeToken,
  hashRawToken,
  mintToken,
  readAuthCookie,
  resolveAuthTokenEnv,
  setAuthCookie,
  verifyChecksum,
} from "./tokens"
import { LoginEmailSchema } from "@workspace/shared/auth"

export type { CookieStore } from "./tokens/cookies"

const COOKIE_TTL_SECONDS = 60 * 10

export interface IdentifyEmailResult {
  ok: boolean
  errorKey?: string
}

/**
 * Step 1 submit. Validates the email shape, mints a `lem` auth_token,
 * writes the `afkey-lem` cookie. The user identifier is never confirmed
 * against the database here — that happens at password submit via Better
 * Auth so we don't leak account existence.
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

/**
 * Server-side helper for the step-2 and step-3 pages. Returns the email
 * stored in the cookie, or null if absent / tampered / expired.
 * Pages call this to render the locked email; if it returns null they
 * redirect back to step 1.
 *
 * Non-destructive: peeks at the auth_token row WITHOUT flipping status
 * so the step 2 → step 3 progression doesn't burn the token. The
 * single-use guarantee is preserved by the explicit `consumeLoginEmail`
 * helper that step 3 (password submit) calls after a successful login.
 */
export async function readLoginEmailFromStore(cookieStore: {
  get(name: string): { name: string; value: string } | undefined
}): Promise<string | null> {
  const raw = readAuthCookie(
    cookieStore as Parameters<typeof readAuthCookie>[0],
    "lem",
  )
  if (!raw) return null
  const peeked = await peekLemToken(raw)
  return peeked?.email ?? null
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
  const env = resolveAuthTokenEnv()
  if (!verifyChecksum(rawToken, "lem", env)) return null

  const tokenHash = hashRawToken(rawToken)
  const { withAdminBypass, auth_token } = await import("@workspace/db")
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
 * cookie is missing, this is a no-op.
 */
export async function consumeLoginEmail(cookieStore: {
  get(name: string): { name: string; value: string } | undefined
}): Promise<void> {
  const raw = readAuthCookie(
    cookieStore as Parameters<typeof readAuthCookie>[0],
    "lem",
  )
  if (!raw) return
  await consumeToken({ rawToken: raw, expectedKind: "lem" })
}

/**
 * Clears the `afkey-lem` cookie. Called after a successful password
 * submit (when no 2FA is required) or after MFA verification completes.
 */
export function clearLoginEmail(cookieStore: {
  delete(opts: { name: string; path?: string }): void
}): void {
  const desc = AUTH_COOKIE_DESCRIPTORS.lem
  cookieStore.delete({ name: desc.name, path: desc.path })
}
