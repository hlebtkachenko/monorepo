/**
 * `safeNext` — sanitize a user-supplied `next` redirect target.
 *
 * Accepts a value from a query string or cookie and returns either:
 *   - the value, when it is a same-origin relative path, OR
 *   - the `fallback` (default `"/"`) when the value is missing, empty,
 *     or could redirect off-origin.
 *
 * Rejected shapes:
 *   - `null` / `undefined` / empty string
 *   - protocol-absolute URLs (`https://evil.com`)
 *   - scheme URLs (`javascript:`, `data:`, `mailto:`)
 *   - protocol-relative URLs (`//evil.com`, `/\\evil.com`)
 *   - paths that don't start with a single `/`
 *
 * Open redirects via `?next=` are exactly this category of bug — the
 * matcher in `apps/web/proxy.ts` excludes `/auth/*` so the login form
 * consumer-side guard is load-bearing alongside the proxy-side strip.
 */
export function safeNext(
  raw: string | null | undefined,
  fallback = "/",
): string {
  if (!raw) return fallback
  // Must start with exactly one slash. `//x` is protocol-relative.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback
  }
  // `/scheme:rest` is treated as opaque by browsers but `URL` resolution
  // can promote scheme-looking prefixes into absolute URLs in some
  // serializers. Reject any scheme-shaped prefix to be safe.
  if (/^\/[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) {
    return fallback
  }
  return raw
}
