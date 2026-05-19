"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies"
import { auth } from "@workspace/auth/server"
import { consumeLoginEmail, clearLoginEmail } from "@workspace/auth/login-flow"

/**
 * Default landing route used when the caller does not supply a `next`.
 * Mirrors the form block's `defaultNext` for the web app.
 */
const DEFAULT_NEXT = "/workspace"

/**
 * Sign-in result shape returned to the client form. Mirrors the structure
 * the form block already understands from the previous `authClient.signIn.email`
 * call. The success-with-redirect path never returns: the action throws
 * `NEXT_REDIRECT` via `next/navigation.redirect()` so the browser sees one
 * response carrying both the session cookie and the 303 Location.
 */
export interface SignInPasswordResult {
  data: { twoFactorRedirect: true } | null
  error: { message: string } | null
}

export interface SignInPasswordInput {
  email: string
  password: string
  rememberMe: boolean
  next?: string
}

/**
 * Server-side login submit. Collapses sign-in + navigation into a single
 * atomic `NEXT_REDIRECT` so the browser cannot race a `router.push` ahead
 * of the session cookie write.
 *
 * - Calls Better Auth `signInEmail` with `asResponse: true` so we can read
 *   Set-Cookie from the response and forward each cookie onto Next's
 *   `cookies()` store explicitly. The `nextCookies()` plugin also forwards
 *   the same cookies; the manual forward keeps the contract explicit and
 *   independent of plugin order.
 * - On the 2FA branch (response body carries `twoFactorRedirect: true`)
 *   the action does NOT redirect: the client still routes to
 *   `/auth/login/mfa` so the existing MFA form can take over.
 * - On a non-2FA success: consumes the `afkey-lem` cookie + redirects to
 *   `next` (sanitized at the form boundary). The atomic 303 carries the
 *   freshly-set session cookie in the same response.
 * - On error: returns `{ error: { message } }` matching the form's existing
 *   handler shape.
 */
export async function signInPasswordAction(
  input: SignInPasswordInput,
): Promise<SignInPasswordResult> {
  const next = sanitizeNext(input.next, DEFAULT_NEXT)

  let response: Response
  try {
    response = await auth.api.signInEmail({
      body: {
        email: input.email,
        password: input.password,
        rememberMe: input.rememberMe,
      },
      headers: await headers(),
      asResponse: true,
    })
  } catch (err) {
    return {
      data: null,
      error: { message: (err as Error).message },
    }
  }

  if (!response.ok) {
    // Read the error message from the JSON body if present, otherwise fall
    // back to a generic credentials message handled by the form block.
    let message = "Invalid email or password"
    try {
      const body = (await response.clone().json()) as
        | { message?: string }
        | undefined
      if (body && typeof body.message === "string" && body.message.length > 0) {
        message = body.message
      }
    } catch {
      // Body not JSON or unreadable: keep the fallback.
    }
    return { data: null, error: { message } }
  }

  // Forward every Set-Cookie BA emitted onto Next's cookies() store so the
  // session cookie ships with this server action response (and the
  // subsequent NEXT_REDIRECT).
  forwardSetCookies(response, await cookies())

  // 2FA branch: body carries `twoFactorRedirect: true`. Hand control back
  // to the client form so it can route to /auth/login/mfa.
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

  // Non-2FA success: burn the lem token and atomically redirect.
  const store = await cookies()
  try {
    await consumeLoginEmail(store)
  } catch {
    // Best-effort: a missing/already-consumed token must not block the
    // user from reaching their destination.
  }
  clearLoginEmail(store)

  // `redirect()` throws NEXT_REDIRECT. Set-Cookie and the 303 Location
  // are delivered in the same response.
  redirect(next)
}

/**
 * Copy each cookie from a Better Auth Response's Set-Cookie header onto
 * Next's `cookies()` store via the BA cookie-utils parser.
 */
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
      // cookies().set can throw if called outside a Server Action /
      // Route Handler. This module is "use server" so it shouldn't, but
      // a defensive swallow keeps any edge case from breaking the flow.
    }
  })
}

/**
 * Mirror of the block-side `sanitizeNext` to keep the redirect target safe.
 * Strips off-site protocols, leading double slashes, and other escape
 * patterns. Kept inline so the action does not depend on `@workspace/ui`.
 */
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
