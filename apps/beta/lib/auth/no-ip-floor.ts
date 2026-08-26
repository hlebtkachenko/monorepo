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
 * KEYED PER PATH FROM A CLOSED LIST, plus one shared bucket for everything
 * else.
 *
 * Per path, because the budget that matters is `/sign-in/email` and folding it
 * in with `/sign-out` would let cheap traffic spend the credential-guessing
 * allowance. From a CLOSED LIST, because the path is attacker-controlled: with
 * a bucket minted per distinct path, one client with no usable IP gets a fresh
 * budget for every URL it invents — `/api/auth/sign-in/email?x=1`,
 * `/api/auth/aaaa`, and so on forever — which both defeats the limit and grows
 * the in-memory map without bound (`createRateLimiter` only sweeps EXPIRED
 * entries, so a fast attacker outruns the sweep). Anything not on the list
 * shares `other`, so the key space is exactly `ALLOWLIST.size + 1`.
 *
 * A SEPARATE MODULE from the route handler so it can be exercised without
 * constructing the Better Auth instance — which would need a database and a
 * secret to test one `if`.
 */

/**
 * The paths worth their own budget. Deliberately the two that
 * `BETA_RATE_LIMIT_RULES` singles out for Better Auth's own limiter — the ones
 * with a credential or a session behind them. Everything else on beta's tiny
 * auth surface is a read.
 */
const BUDGETED_PATHS: ReadonlySet<string> = new Set([
  "/api/auth/sign-in/email",
  "/api/auth/sign-out",
])

const OTHER_BUCKET = "other"

export function authNoIpFloor(request: Request): Response | null {
  const path = pathOf(request.url)
  const bucket = BUDGETED_PATHS.has(path) ? path : OTHER_BUCKET
  const key = authRateLimitKey(request.headers, bucket)
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
