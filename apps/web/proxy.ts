import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

import { publicOrigin } from "./lib/request-origin"
import { safeNext } from "./lib/safe-next"

/**
 * Edge-runtime proxy (Next.js 16 — formerly `middleware.ts`).
 *
 * Two concerns, one function (Next.js 16 allows only one proxy entry per app):
 *
 * 1. Optimistic auth check on protected routes. Cookie presence only — does
 *    NOT validate the session against the database. Real authorization runs
 *    in route layouts (e.g. `app/workspace/layout.tsx`,
 *    `app/[orgSlug]/layout.tsx`) in the Node runtime where Postgres is
 *    reachable.
 *
 * 2. Auth-flow request hygiene on `/auth/*` and `/onboarding/*` per
 *    ADR-0022 §"Mandatory companions":
 *    - `Referrer-Policy: no-referrer` (#3) — prevents the raw token query
 *      parameter leaking into the Referer header on any subsequent
 *      navigation.
 *    - Token log scrubbing (#4) — injects `x-scrubbed-path` so upstream
 *      loggers (Sentry, Next.js telemetry) record the path with `?token=`
 *      stripped. The original URL stays intact so route handlers can still
 *      read searchParams.
 *
 * IMPORTANT: cookie presence is a check, not a proof. Better Auth signs
 * the session cookie, but `getSessionCookie` here only confirms the
 * cookie exists — it does NOT verify the signature. Real authorization
 * (workspace + organization membership, onboarding completion, MFA
 * state) MUST be enforced in layouts where the data lives.
 *
 * The optimistic check is the right shape because edge runtime cannot
 * use postgres-js / pg — calling the DB here would force runtime =
 * 'nodejs' and slow every request.
 */
export function proxy(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname

  // Auth-flow request hygiene: applies to /auth/* and /onboarding/*.
  if (pathname.startsWith("/auth/") || pathname.startsWith("/onboarding/")) {
    const response = NextResponse.next()
    response.headers.set("Referrer-Policy", "no-referrer")
    if (request.nextUrl.searchParams.has("token")) {
      const scrubbed = request.nextUrl.clone()
      scrubbed.searchParams.delete("token")
      response.headers.set(
        "x-scrubbed-path",
        scrubbed.pathname + scrubbed.search,
      )
    }
    return response
  }

  // Optimistic auth check on every other matched route.
  const sessionCookie = getSessionCookie(request)
  if (!sessionCookie) {
    const loginUrl = new URL("/auth/login", publicOrigin(request))
    // Pass ONLY the pathname through `safeNext`. We deliberately drop
    // the original query string so a sensitive deep link
    // (`/auth/reset-password?token=…`) never round-trips through the
    // login URL as `?next=`. Sanitization defends the consumer side
    // even though the matcher excludes `/auth/*` from the protected set.
    const intended = safeNext(pathname, "/")
    if (intended !== "/") {
      loginUrl.searchParams.set("next", intended)
    }
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

/**
 * Matcher includes BOTH the auth-flow paths (so the hygiene headers
 * land) AND the protected paths (so the session-cookie check fires).
 * Internal Next assets, the public landing page, and /api/* are excluded.
 *
 *   /auth/*          — hygiene headers
 *   /onboarding/*    — hygiene headers; wizard flows include pre-account
 *                      steps so no session-cookie gate fires here
 *   everything else  — optimistic session-cookie gate, redirect to /auth/login
 *
 * Excluded:
 *   /api/*           — Better Auth catchall + future route handlers
 *   /_next/static    — built assets
 *   /_next/image     — image optimizer
 *   /favicon.ico
 *   /                — public landing page
 */
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|$).*)"],
}
