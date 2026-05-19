import { cookies } from "next/headers"
import {
  signActiveWorkspaceToken,
  verifyActiveWorkspaceToken,
  AUTH_COOKIE_DESCRIPTORS,
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
 * helper + by future workspace-scoped server actions to know which
 * workspace the user is operating in without an ORDER BY-based DB
 * fallback. Path "/" so it's available everywhere in-app.
 *
 * Dual-path during AFF-198 Phase 2 (D5):
 *   USE_AUTH_TOKEN_FOR_WKS=false → legacy HS256 JWT in `app-active-workspace`
 *   USE_AUTH_TOKEN_FOR_WKS=true  → opaque auth_token row + `__Host-afkey-wks`
 *
 * The new cookie is a long-lived carrier (90 d, per ADR-0022 §"Kind
 * taxonomy"). It is NOT redeemed on every read; the read path peeks at
 * the row (status=pending) and returns the payload. The single-use
 * contract is bypassed for `wks` by design — workspace switches
 * issue a fresh token and revoke the previous one.
 */
export const ACTIVE_WORKSPACE_COOKIE = "app-active-workspace"
const COOKIE_PATH = "/"
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 90

function useNewWksPath(): boolean {
  return process.env.USE_AUTH_TOKEN_FOR_WKS === "true"
}

export async function setActiveWorkspaceCookie(
  workspaceId: string,
): Promise<void> {
  const cookieStore = await cookies()

  if (useNewWksPath()) {
    const { rawToken } = await mintToken({
      kind: "wks",
      payload: { workspaceId },
      ttlSeconds: COOKIE_TTL_SECONDS,
    })
    // The __Host- prefix requires Secure. In local dev (non-HTTPS) the
    // cookie will be rejected by the browser; the new path is only meant
    // to be enabled in staging+. Toggle insecureLocalDev for non-prod.
    setAuthCookie(cookieStore, "wks", rawToken, {
      ttlSecondsOverride: COOKIE_TTL_SECONDS,
      insecureLocalDev: process.env.NODE_ENV !== "production",
    })
    return
  }

  const token = await signActiveWorkspaceToken(workspaceId, COOKIE_TTL_SECONDS)
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: COOKIE_TTL_SECONDS,
  })
}

export async function readActiveWorkspaceCookie(): Promise<string | null> {
  const cookieStore = await cookies()

  if (useNewWksPath()) {
    const raw = readAuthCookie(cookieStore, "wks")
    if (raw) {
      const peeked = await peekWksToken(raw)
      if (peeked) return peeked.workspaceId
    }
  }

  // Legacy fallback: JWT in app-active-workspace.
  const token = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value
  if (!token) return null
  try {
    const claims = await verifyActiveWorkspaceToken(token)
    return claims.workspaceId
  } catch {
    return null
  }
}

export async function clearActiveWorkspaceCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete({ name: ACTIVE_WORKSPACE_COOKIE, path: COOKIE_PATH })
  const desc = AUTH_COOKIE_DESCRIPTORS.wks
  clearAuthCookie(
    {
      get: (name: string) => {
        const c = cookieStore.get(name)
        return c ? { name: c.name, value: c.value } : undefined
      },
      set: () => {},
      delete: (opts: { name: string; path?: string }) =>
        cookieStore.delete({ name: opts.name, path: opts.path ?? desc.path }),
    },
    "wks",
  )
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
