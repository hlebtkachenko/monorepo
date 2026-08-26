import { betaAuth } from "@/lib/auth/server"

/**
 * Better Auth's HTTP surface. This is the only place beta's auth endpoints are
 * exposed, and the only path on which Better Auth's rate limiter runs.
 *
 * `betaAuth()` is resolved per request rather than at module scope: Next
 * evaluates route modules during `next build`, where DATABASE_URL and
 * BETTER_AUTH_SECRET are placeholders.
 */
export async function GET(request: Request): Promise<Response> {
  return betaAuth().handler(request)
}

export async function POST(request: Request): Promise<Response> {
  return betaAuth().handler(request)
}
