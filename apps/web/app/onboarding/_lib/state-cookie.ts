import { cookies } from "next/headers"
import {
  signOnboardingStateToken,
  verifyOnboardingStateToken,
  type OnboardingStateClaims,
  mintToken,
  readAuthCookie,
  setAuthCookie,
  clearAuthCookie,
  revokeToken,
  extendAuthTokenExpiry,
  verifyChecksum,
  hashRawToken,
  resolveAuthTokenEnv,
} from "@workspace/auth/tokens"
import { withAdminBypass, auth_token } from "@workspace/db"
import { sql } from "drizzle-orm"

/**
 * Per-step state cookie for owner onboarding.
 *
 * Steps 1 (Profile) + 2 (Experience) collect data BEFORE the Better Auth
 * user is created (step 3). To avoid touching the database in those steps
 * — there's no app_user row yet — the inputs are stashed in this signed
 * HttpOnly cookie. Step 3 reads everything, creates the BA user, applies
 * the merged data to the new `app_user` row, then clears the cookie.
 *
 * Note: this reader intentionally does NOT consult the dev-preview cookie.
 * dev-preview relaxes auth-guards at the LAYOUT level (so designers can
 * render screens without a session); it must never fake "the user already
 * filled step 1+2", because that pollutes `decideNextStep` and routes
 * fresh signups straight to /password.
 *
 * Dual-path during AFF-198 Phase 2 (D4):
 *   USE_AUTH_TOKEN_FOR_ONS=false → legacy HS256 JWT in `app-onboarding-state`
 *   USE_AUTH_TOKEN_FOR_ONS=true  → opaque auth_token row + `__Host-afkey-ons`
 *
 * Sliding renewal: under the new path, each write extends the row's
 * `expires_at` by 24 h, capped at `issued_at + 7 d`. Atomic via
 * `extendAuthTokenExpiry`. On a fresh state (no cookie), a new row is
 * minted. On an existing state, the previous row is revoked and a fresh
 * row is minted with the merged payload — this preserves the audit trail
 * (each step's state has its own row) and avoids unbounded sliding by
 * always anchoring `issued_at` to the most recent step.
 */
export const ONBOARDING_STATE_COOKIE = "app-onboarding-state"
const COOKIE_PATH = "/"
const COOKIE_TTL_SECONDS = 60 * 60 * 24
const HARD_CAP_SECONDS = 60 * 60 * 24 * 7

type State = Omit<OnboardingStateClaims, "kind">

function useNewOnsPath(): boolean {
  return process.env.USE_AUTH_TOKEN_FOR_ONS === "true"
}

export async function readOnboardingState(): Promise<State> {
  const cookieStore = await cookies()

  if (useNewOnsPath()) {
    const raw = readAuthCookie(cookieStore, "ons")
    if (raw) {
      const payload = await peekOnsToken(raw)
      if (payload) {
        // Sliding renewal on read: extend by 24h up to the 7-day cap.
        // Atomic in SQL — the new expires_at is LEAST(now+24h, issued_at+7d).
        const newExpiresAt = await extendAuthTokenExpiry({
          rawToken: raw,
          expectedKind: "ons",
          extendBySeconds: COOKIE_TTL_SECONDS,
          maxLifetimeSeconds: HARD_CAP_SECONDS,
        })
        if (newExpiresAt) {
          // Re-write the cookie with the new maxAge so the browser keeps it
          // in sync. Best-effort: if the request is a no-mutation read
          // (Server Component render), Next will accept the Set-Cookie.
          const remainingSeconds = Math.max(
            1,
            Math.floor((newExpiresAt.getTime() - Date.now()) / 1000),
          )
          try {
            setAuthCookie(cookieStore, "ons", raw, {
              ttlSecondsOverride: remainingSeconds,
              insecureLocalDev: process.env.NODE_ENV !== "production",
            })
          } catch {
            // Server components cannot always set cookies; ignore the error.
            // The row was still extended on the DB.
          }
        }
        return payload
      }
    }
  }

  // Legacy fallback: JWT in app-onboarding-state.
  const token = cookieStore.get(ONBOARDING_STATE_COOKIE)?.value
  if (!token) return {}
  try {
    const claims = await verifyOnboardingStateToken(token)
    const next: State = {}
    if (claims.profile) next.profile = claims.profile
    if (claims.experience) next.experience = claims.experience
    return next
  } catch {
    return {}
  }
}

export async function writeOnboardingState(partial: State): Promise<void> {
  const current = await readOnboardingState()
  const merged: State = { ...current, ...partial }
  const cookieStore = await cookies()

  if (useNewOnsPath()) {
    // Revoke the previous row (if any) so the audit trail captures each
    // step independently. The new row carries the merged state and resets
    // the 7-day hard-cap anchor (`issued_at`).
    const previousRaw = readAuthCookie(cookieStore, "ons")
    if (previousRaw) {
      await revokeToken(previousRaw)
    }

    const { rawToken } = await mintToken({
      kind: "ons",
      payload: merged as Record<string, unknown>,
      ttlSeconds: COOKIE_TTL_SECONDS,
    })
    setAuthCookie(cookieStore, "ons", rawToken, {
      ttlSecondsOverride: COOKIE_TTL_SECONDS,
      insecureLocalDev: process.env.NODE_ENV !== "production",
    })
    return
  }

  const token = await signOnboardingStateToken(merged, COOKIE_TTL_SECONDS)
  cookieStore.set(ONBOARDING_STATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: COOKIE_TTL_SECONDS,
  })
}

export async function clearOnboardingState(): Promise<void> {
  const cookieStore = await cookies()
  // Best-effort revoke of the pending row so it leaves an audit trail.
  if (useNewOnsPath()) {
    const raw = readAuthCookie(cookieStore, "ons")
    if (raw) {
      await revokeToken(raw)
    }
    clearAuthCookie(cookieStore, "ons")
  }
  cookieStore.delete({ name: ONBOARDING_STATE_COOKIE, path: COOKIE_PATH })
}

/**
 * Non-destructive read of the ons row payload. Validates format + checksum,
 * loads the row by hash, returns the payload if pending + not expired.
 */
async function peekOnsToken(rawToken: string): Promise<State | null> {
  const env = resolveAuthTokenEnv()
  if (!verifyChecksum(rawToken, "ons", env)) return null

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
            AND ${auth_token.kind} = 'ons'`,
      )
      .limit(1)
  })
  const row = rows[0]
  if (!row) return null
  const next: State = {}
  const payload = row.payload as Record<string, unknown>
  if (payload["profile"] && typeof payload["profile"] === "object") {
    next.profile = payload["profile"] as State["profile"]
  }
  if (typeof payload["experience"] === "string") {
    next.experience = payload["experience"] as State["experience"]
  }
  return next
}
