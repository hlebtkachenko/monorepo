/**
 * Resolve the public origin (scheme + host) for redirects built from a
 * `Request` / `NextRequest`.
 *
 * Behind Cloudflare Tunnel → Fargate the container listens on
 * `http://0.0.0.0:3000`, so `request.url` reflects the listener, not the
 * user-visible origin. A redirect built with `new URL(path, request.url)`
 * emits `Location: https://0.0.0.0:3000/...`, which the browser refuses.
 *
 * Priority:
 *   1. `x-forwarded-host` (+ `x-forwarded-proto`) — set by Cloudflare Tunnel
 *      on every request. Works in both Edge and Node runtimes.
 *   2. `BETTER_AUTH_URL` — same env Better Auth uses for cookies + email
 *      links; keeps redirects in sync with the canonical public origin.
 *   3. `request.url` — local dev / direct hits with no proxy.
 */
export function publicOrigin(request: Request): string {
  const fwdHost = request.headers.get("x-forwarded-host")
  if (fwdHost) {
    const fwdProto = request.headers.get("x-forwarded-proto") ?? "https"
    return `${fwdProto}://${fwdHost}`
  }
  const explicit = process.env.BETTER_AUTH_URL?.trim()
  if (explicit) return explicit
  return new URL(request.url).origin
}
