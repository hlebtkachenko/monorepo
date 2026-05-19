"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies"
import { auth } from "@workspace/auth/server"
import { consumeLoginEmail, clearLoginEmail } from "@workspace/auth/login-flow"
import { writeAuditEventGlobal } from "@workspace/db"

import { checkAllowlist } from "../../../(gated)/check-allowlist"

const DEFAULT_NEXT = "/"

export interface AdminSignInResult {
  data: { twoFactorRedirect: true } | null
  error: { message: string } | null
}

export interface AdminSignInInput {
  email: string
  password: string
  rememberMe: boolean
  next?: string
}

/**
 * Admin login submit (Server Action). Mirrors the web app's
 * `signInPasswordAction` but interposes the admin allowlist check between a
 * successful Better Auth sign-in and the atomic redirect.
 *
 * - Calls `auth.api.signInEmail` with `asResponse: true`, forwards Set-Cookie
 *   onto Next's `cookies()` store.
 * - 2FA branch: returns `{ data: { twoFactorRedirect: true } }`; the client
 *   form still routes to `/auth/login/mfa`. The allowlist re-checks inside
 *   the MFA action / gated layout.
 * - Allowlist denied: writes the audit row, calls `auth.api.signOut` to
 *   shred the just-created session, returns `{ error }` so the form
 *   surfaces an invalid-credentials banner.
 * - Allowlist allowed: consumes the `afkey-lem` token then `redirect(next)`.
 */
export async function signInPasswordAction(
  input: AdminSignInInput,
): Promise<AdminSignInResult> {
  const next = sanitizeNext(input.next, DEFAULT_NEXT)
  const h = await headers()

  let response: Response
  try {
    response = await auth.api.signInEmail({
      body: {
        email: input.email,
        password: input.password,
        rememberMe: input.rememberMe,
      },
      headers: h,
      asResponse: true,
    })
  } catch (err) {
    return { data: null, error: { message: (err as Error).message } }
  }

  if (!response.ok) {
    let message = "Invalid email or password"
    try {
      const body = (await response.clone().json()) as
        | { message?: string }
        | undefined
      if (body && typeof body.message === "string" && body.message.length > 0) {
        message = body.message
      }
    } catch {
      // Fallback retained.
    }
    return { data: null, error: { message } }
  }

  forwardSetCookies(response, await cookies())

  // 2FA branch: hand back to the client form so it can route to MFA.
  let body: { twoFactorRedirect?: boolean } | null
  try {
    body = (await response.clone().json()) as {
      twoFactorRedirect?: boolean
    } | null
  } catch {
    body = null
  }
  if (body?.twoFactorRedirect) {
    return { data: { twoFactorRedirect: true }, error: null }
  }

  // Non-2FA success: allowlist gate before redirect.
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return {
      data: null,
      error: { message: "Invalid email or password" },
    }
  }
  const { allowed, workspaceId } = await checkAllowlist(session.user.id)
  if (!allowed) {
    void writeAuditEventGlobal({
      workspaceId: workspaceId ?? undefined,
      actorUserId: session.user.id,
      action: "auth.admin.allowlist_denied",
      payload: { user_id: session.user.id },
    })
    try {
      await auth.api.signOut({ headers: await headers() })
    } catch {
      // Best-effort: even if sign-out fails, we surface the denial banner.
    }
    return {
      data: null,
      error: { message: "Invalid email or password" },
    }
  }

  const store = await cookies()
  try {
    await consumeLoginEmail(store)
  } catch {
    // Best-effort token consume.
  }
  clearLoginEmail(store)

  redirect(next)
}

function forwardSetCookies(
  response: Response,
  store: Awaited<ReturnType<typeof cookies>>,
): void {
  const setCookie = response.headers.get("set-cookie")
  if (!setCookie) return
  const parsed = parseSetCookieHeader(setCookie)
  parsed.forEach((attrs, name) => {
    if (!name) return
    try {
      store.set(name, attrs.value, toCookieOptions(attrs))
    } catch {
      // Defensive swallow: see web action.
    }
  })
}

function sanitizeNext(
  raw: string | null | undefined,
  fallback: string,
): string {
  if (!raw) return fallback
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback
  }
  if (/^\/[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) {
    return fallback
  }
  return raw
}
