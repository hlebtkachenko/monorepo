import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

import { publicOrigin } from "./lib/request-origin"
import { safeNext } from "./lib/safe-next"

/**
 * Edge-runtime proxy (Next.js 16 — formerly `middleware.ts`).
 *
 * Performs an OPTIMISTIC cookie-presence check on protected routes only.
 * It does NOT validate the session against the database — that happens
 * in route layouts (e.g. `app/workspace/layout.tsx`,
 * `app/[orgSlug]/layout.tsx`) which run in the Node runtime and can
 * hit Postgres.
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
  const sessionCookie = getSessionCookie(request)
  if (!sessionCookie) {
    const loginUrl = new URL("/auth/login", publicOrigin(request))
    // Pass ONLY the pathname through `safeNext`. We deliberately drop
    // the original query string so a sensitive deep link
    // (`/auth/reset-password?token=…`) never round-trips through the
    // login URL as `?next=`. Sanitization defends the consumer side
    // even though the matcher excludes `/auth/*`.
    const intended = safeNext(request.nextUrl.pathname, "/")
    if (intended !== "/") {
      loginUrl.searchParams.set("next", intended)
    }
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

/**
 * Matcher: gate everything EXCEPT:
 *   /api/*           — Better Auth catchall + future route handlers
 *   /auth/*          — anon flows (login, signup, invite, password reset)
 *   /onboarding/*    — wizard flows; steps 1-2 run pre-account-creation
 *                      (no session yet) and per-page guards handle authn
 *                      for steps that need it. Gating here would bounce
 *                      every fresh signup invitee back to /auth/login.
 *   /_next/static    — built assets
 *   /_next/image     — image optimizer
 *   /favicon.ico
 *   /                — public landing page
 */
export const config = {
  matcher: [
    "/((?!api|auth|onboarding|_next/static|_next/image|favicon\\.ico|$).*)",
  ],
}
