import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

/**
 * Edge-runtime proxy (Next.js 16 — formerly `middleware.ts`).
 *
 * Performs an OPTIMISTIC cookie-presence check on protected routes only.
 * It does NOT validate the session against the database — that happens in
 * route layouts (`(app)/workspace/layout.tsx`,
 * `(app)/[orgSlug]/layout.tsx`) which run in the Node runtime and can hit
 * Postgres.
 *
 * The optimistic check is the right shape for two reasons:
 *   1. Edge runtime cannot use `postgres-js` / `pg`. Calling the DB here
 *      would force `runtime = 'nodejs'` and slow every request.
 *   2. Better Auth signs the session cookie; an attacker cannot forge one
 *      without `BETTER_AUTH_SECRET`. Cookie presence is a strong signal,
 *      not a strong proof.
 *
 * Real authorization (workspace + organization membership, onboarding
 * completion, MFA state) is checked in layouts where the data lives.
 */
export function proxy(request: NextRequest): NextResponse {
  const sessionCookie = getSessionCookie(request)
  if (!sessionCookie) {
    const loginUrl = new URL("/auth/login", request.url)
    const intended = request.nextUrl.pathname + request.nextUrl.search
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
