/**
 * The beta portal's own absolute origin, for the links a notification email
 * builds (`lib/notifications/events.ts`).
 *
 * ENV-FIRST, NEVER REQUEST-DERIVED — same rule `lib/auth/server.ts`'s
 * `readBaseUrl` states for Better Auth's own base URL, and ADR-0008 amendment
 * 2 states for the main app's redirects: behind the Cloudflare Tunnel a
 * request's own URL is the container listener (`0.0.0.0:3000`), not
 * `beta.afframe.com`, and a notification is built and sent with no HTTP
 * request in flight at all (it fires after a write commits) — there is no
 * request to derive an origin from even if that were safe.
 *
 * `BETTER_AUTH_URL` IS THE RIGHT VARIABLE, not a new one: it is already "set
 * by the CDK app stack to `https://<beta domain>`" (`lib/auth/server.ts`'s own
 * comment) and `lib/http/same-origin.ts`'s `appOrigins` already reads it as
 * "the origin this app answers on". A notification link and a same-origin
 * check are asking the identical question.
 */
const DEV_FALLBACK_ORIGIN = "http://localhost:3200"

export function betaPortalOrigin(): string {
  const raw = process.env["BETTER_AUTH_URL"]?.trim()
  if (!raw) return DEV_FALLBACK_ORIGIN
  try {
    return new URL(raw).origin
  } catch {
    return DEV_FALLBACK_ORIGIN
  }
}

/** An absolute link into this organization's portal, e.g. `/acme-sro/dokumenty`. */
export function betaPortalUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`
  return `${betaPortalOrigin()}${normalized}`
}
