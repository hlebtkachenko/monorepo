import { authNoIpFloor } from "@/lib/auth/no-ip-floor"
import { betaAuth } from "@/lib/auth/server"

/**
 * Better Auth's HTTP surface. This is the only place beta's auth endpoints are
 * exposed, and the only path on which Better Auth's rate limiter runs.
 *
 * `betaAuth()` is resolved per request rather than at module scope: Next
 * evaluates route modules during `next build`, where DATABASE_URL and
 * BETTER_AUTH_SECRET are placeholders.
 *
 * `authNoIpFloor` runs first and, in the deployed environment, does nothing:
 * it engages only for a request Better Auth's own limiter would SKIP because it
 * could not determine a client IP (Advisor carry-in, PR 06 gate — the full
 * argument and the verified 1.6.13 behaviour are in `lib/auth/no-ip-floor.ts`).
 */
export async function GET(request: Request): Promise<Response> {
  return authNoIpFloor(request) ?? betaAuth().handler(request)
}

export async function POST(request: Request): Promise<Response> {
  return authNoIpFloor(request) ?? betaAuth().handler(request)
}
