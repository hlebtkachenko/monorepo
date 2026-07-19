/**
 * OAuth authorize continuation for the custom login pages.
 *
 * When an unauthenticated `GET /api/auth/oauth2/authorize` arrives, Better
 * Auth's oauth-provider redirects the browser to `loginPage` (`/auth/login`)
 * with the FULL signed authorize query appended
 * (`client_id, redirect_uri, scope, ..., exp, ba_iat, sig`). Our custom login
 * does not use BA's built-in page, so nothing carries the user back to the
 * authorize endpoint after sign-in — they land on `/workspace` and the consent
 * step then fails ("Something went wrong"). This helper turns those inbound
 * params into a `next` that the existing login `?next=` threading feeds back
 * into `/api/auth/oauth2/authorize` once the session exists.
 *
 * MANDATORY: strip Better Auth's own signing artifacts before forwarding.
 * `signParams` re-serializes `ctx.query` and *appends* a fresh `sig` without
 * deleting any pre-existing one, so a forwarded `sig` yields two `sig` params;
 * `verifyOAuthQueryParams` reads the first, recomputes over the rest, and
 * mismatches -> `invalid_signature` -> the consent POST returns no
 * `redirect_uri` -> the same "Something went wrong". The authorize GET has no
 * request body, so it never runs the sig-verifying before-hook: forwarding a
 * BARE (unsigned) authorize query is exactly what a real OAuth client sends,
 * and BA re-signs it for the login round-trip itself.
 */

const OAUTH_AUTHORIZE_PATH = "/api/auth/oauth2/authorize"

/**
 * The authorize params a standard OAuth 2.1 / OIDC + PKCE client sends. Better
 * Auth re-signs whatever it receives, so an allowlist keeps the forwarded query
 * to real request params and drops the login-round-trip artifacts (`sig`, `exp`,
 * `ba_iat`, `ba_pl`) that would double-sign.
 */
const FORWARDED_OAUTH_PARAMS = [
  "client_id",
  "redirect_uri",
  "scope",
  "code_challenge",
  "code_challenge_method",
  "response_type",
  "state",
  "nonce",
  "prompt",
  "resource",
] as const

/**
 * Build the `/api/auth/oauth2/authorize` continuation target from the login
 * page's own query params, or `null` when the request is not an OAuth authorize
 * hand-off (so normal / deep-link logins are untouched).
 *
 * Returns a relative, same-origin path — safe for the login `next` threading
 * and for `safeNext`/`sanitizeNext` (the leading `/api/...` never matches the
 * scheme-prefix guard; the inner `redirect_uri` sits deep in the query).
 */
export function oauthContinuationNext(search: URLSearchParams): string | null {
  // client_id + redirect_uri is the definitive authorize shape; without both
  // there is nothing valid to hand to the authorize endpoint.
  if (!search.has("client_id") || !search.has("redirect_uri")) return null

  const forwarded = new URLSearchParams()
  for (const key of FORWARDED_OAUTH_PARAMS) {
    const value = search.get(key)
    if (value != null && value !== "") forwarded.set(key, value)
  }

  return `${OAUTH_AUTHORIZE_PATH}?${forwarded.toString()}`
}
