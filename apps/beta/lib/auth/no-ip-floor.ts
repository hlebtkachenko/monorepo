import { BETA_AUTH_NO_IP_RATE_LIMIT } from "./policy"
import { authNoIpRateLimiter } from "./rate-limit"
import { authRateLimitKey } from "./request-ip"

/**
 * The floor under Better Auth's rate limiter (Advisor carry-in, PR 06 gate).
 *
 * Better Auth keys its limiter on the client IP and, when it cannot determine
 * one, SKIPS the limit rather than falling back — verified in 1.6.13,
 * `dist/api/rate-limiter/index.mjs`: `resolveRateLimitConfig` logs "Rate
 * limiting skipped: could not determine client IP address" and returns `null`,
 * and both `onRequestRateLimit` and `onResponseRateLimit` return early on a
 * null config. Beta declares exactly one header (`cf-connecting-ip`), so a
 * request arriving without a usable one would reach `/sign-in/email` unlimited.
 *
 * That should be unreachable — the Fargate task has no public ingress and
 * Cloudflare always sets the header — but "should be unreachable" is not a rate
 * limit. This function applies a budget in precisely the case Better Auth
 * drops, and returns `null` (stay out of the way) otherwise, so nothing is
 * double-counted in the deployed environment.
 *
 * KEYED PER PATH, not one bucket for the whole auth surface: the budget that
 * matters is `/sign-in/email`, and folding it in with `/sign-out` and the rest
 * would let cheap traffic spend the credential-guessing allowance.
 *
 * A SEPARATE MODULE from the route handler so it can be exercised without
 * constructing the Better Auth instance — which would need a database and a
 * secret to test one `if`.
 */
export function authNoIpFloor(request: Request): Response | null {
  const key = authRateLimitKey(request.headers, pathOf(request.url))
  if (key === null) return null

  const verdict = authNoIpRateLimiter(key, BETA_AUTH_NO_IP_RATE_LIMIT)
  if (verdict.allowed) return null

  return new Response(
    JSON.stringify({ message: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(verdict.retryAfterSeconds),
      },
    },
  )
}

/**
 * Only the PATH is taken from the request URL. Behind the tunnel its origin is
 * the container listener (ADR-0008 amendment 2) — worthless, and never used
 * here — but the path is the real one.
 */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase()
  } catch {
    // A malformed URL cannot be attributed to a path, so it shares the widest
    // bucket rather than escaping the budget.
    return "/"
  }
}
