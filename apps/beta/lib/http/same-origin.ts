/**
 * Cross-site write guard.
 *
 * The primary CSRF defence is the session cookie's `SameSite=Lax`
 * (`lib/auth/policy.ts`): a cross-site POST — form or fetch — does not carry a
 * Lax cookie, so it arrives unauthenticated and dies at the scope seam. This is
 * the second layer, and it earns its place because the upload endpoint takes a
 * RAW BODY. A cross-site `<form enctype="text/plain">` can post a body whose
 * first bytes are `%PDF-`, which is precisely the shape that would pass the
 * magic-byte allowlist — so if the cookie rule ever changes (a `SameSite=None`
 * needed for an embed, a browser quirk, a future proxy that rewrites cookies)
 * the upload route must not be the thing that discovers it.
 *
 * TWO SIGNALS, EITHER OF WHICH IS ENOUGH TO REFUSE:
 *   - `Sec-Fetch-Site` — set by every current browser, not settable by script.
 *     Anything other than `same-origin` on a write is a write we did not start.
 *   - `Origin` — present on every cross-origin request and on same-origin
 *     `fetch` writes. Compared against the app's own origin.
 *
 * A request with NEITHER header is allowed: that is a non-browser client (curl,
 * a test, a future office agent), which cannot be a CSRF victim because it
 * carries no ambient cookie jar.
 *
 * PURE MODULE — headers in, boolean out.
 */

/** Origins this app answers on: `BETTER_AUTH_URL` plus any trusted extras. */
export function appOrigins(
  env: Record<string, string | undefined> = process.env,
): readonly string[] {
  const raw = [
    env["BETTER_AUTH_URL"],
    ...(env["BETTER_AUTH_TRUSTED_ORIGINS"]?.split(",") ?? []),
  ]
  const origins = new Set<string>()
  for (const value of raw) {
    const trimmed = value?.trim()
    if (!trimmed) continue
    try {
      origins.add(new URL(trimmed).origin)
    } catch {
      // A malformed entry is ignored rather than fatal: this guard is the
      // second layer, and taking the app down over a typo in a list of extra
      // origins would be a worse outcome than falling back to the cookie rule.
    }
  }
  return [...origins]
}

/** True when the request must be refused as cross-site. */
export function isCrossSiteWrite(
  headers: Headers,
  origins: readonly string[] = appOrigins(),
): boolean {
  const site = headers.get("sec-fetch-site")
  if (site !== null && site !== "same-origin" && site !== "none") return true

  const origin = headers.get("origin")
  if (origin === null) return false
  // With no configured origin there is nothing to compare against — a local dev
  // server with no `BETTER_AUTH_URL`. Fall back to the cookie rule rather than
  // refusing every request.
  if (origins.length === 0) return false
  return !origins.includes(origin)
}
