import { cookies } from "next/headers"
import {
  mintToken,
  readAuthCookie,
  setAuthCookie,
  clearAuthCookie,
  verifyChecksum,
  hashRawToken,
  resolveAuthTokenEnv,
} from "@workspace/auth/tokens"
import { withAdminBypass, auth_token } from "@workspace/db"
import { sql } from "drizzle-orm"

/**
 * Active-workspace cookie helpers. Read by the onboarding resume
 * helper + by workspace-scoped server actions to know which workspace
 * the user is operating in without an ORDER BY-based DB fallback.
 *
 * Storage: `__Host-afkey-wks` cookie carrying the raw token for a
 * `wks`-kind `auth_token` row. The row carries the workspaceId in its
 * payload. 90-day TTL (parity with the previous JWT carrier, ADR-0022
 * §"Kind taxonomy").
 *
 * The wks row is NOT redeemed on every read; reads peek at the row
 * (status='pending') and return the payload. The single-use contract
 * is bypassed for `wks` by design — workspace switches issue a fresh
 * token and revoke the previous one.
 */

const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 90

export async function setActiveWorkspaceCookie(
  workspaceId: string,
): Promise<void> {
  const cookieStore = await cookies()

  const { rawToken } = await mintToken({
    kind: "wks",
    payload: { workspaceId },
    ttlSeconds: COOKIE_TTL_SECONDS,
  })
  // The __Host- prefix requires Secure, and setAuthCookie throws on the
  // insecureLocalDev + __Host- combination — never pass the flag for this
  // kind. Browsers accept Secure cookies on http://localhost, so plain
  // `pnpm dev` works without any workaround.
  setAuthCookie(cookieStore, "wks", rawToken, {
    ttlSecondsOverride: COOKIE_TTL_SECONDS,
  })
}

export async function readActiveWorkspaceCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  const raw = readAuthCookie(cookieStore, "wks")
  if (!raw) return null
  const peeked = await peekWksToken(raw)
  return peeked?.workspaceId ?? null
}

export async function clearActiveWorkspaceCookie(): Promise<void> {
  const cookieStore = await cookies()
  clearAuthCookie(cookieStore, "wks")
}

/**
 * Non-destructive peek for the `wks` cookie. Loads the row by hash and
 * returns the workspaceId if pending + not expired. `wks` tokens are
 * long-lived carriers (90 d); they aren't single-use, so we do not
 * trip the consume contract on every read.
 */
async function peekWksToken(
  rawToken: string,
): Promise<{ workspaceId: string } | null> {
  const env = resolveAuthTokenEnv()
  if (!verifyChecksum(rawToken, "wks", env)) return null

  const tokenHash = hashRawToken(rawToken)
  const rows = await withAdminBypass(async (db) => {
    return await db
      .select({
        payload: auth_token.payload,
        status: auth_token.status,
        expires_at: auth_token.expires_at,
      })
      .from(auth_token)
      .where(
        sql`${auth_token.token_hash} = ${tokenHash}
            AND ${auth_token.status} = 'pending'
            AND ${auth_token.expires_at} > now()
            AND ${auth_token.kind} = 'wks'`,
      )
      .limit(1)
  })
  const row = rows[0]
  if (!row) return null
  const workspaceId = (row.payload as Record<string, unknown>)["workspaceId"]
  if (typeof workspaceId !== "string" || !workspaceId) return null
  return { workspaceId }
}
