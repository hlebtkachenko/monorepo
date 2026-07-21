import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"
import { devCookiePrefix } from "@workspace/auth/dev-cookie-prefix"

import { publicOrigin } from "./lib/request-origin"
import { pathWithScrubbedQuery } from "./lib/scrub-query"
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
 *    - Credential log scrubbing (#4) — injects `x-scrubbed-path` so upstream
 *      loggers (Sentry, Next.js telemetry) record the path with credential
 *      params (`token`, `code`, `state`, …) stripped (see `scrub-query.ts`).
 *      The original URL stays intact so route handlers can still read
 *      searchParams.
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
    // Log scrubbing (#4): if any credential-bearing param is present, publish a
    // scrubbed path so upstream loggers record `?token=` / `?code=` / `?state=`
    // etc. stripped. The original URL stays intact for route handlers.
    const scrubbedPath = pathWithScrubbedQuery(
      pathname,
      request.nextUrl.searchParams,
    )
    if (scrubbedPath !== pathname + request.nextUrl.search) {
      response.headers.set("x-scrubbed-path", scrubbedPath)
    }
    return response
  }

  // Recovery pages must remain reachable when the session itself is missing
  // or invalid. Their actions route back through the normal auth guards.
  if (pathname.startsWith("/utility/")) {
    return NextResponse.next()
  }

  // Výkazy builder: a standalone, login-free tool. It is fully client-side
  // (localStorage + in-browser parsing/print), imports no app data, and nothing
  // in the app depends on it — so it runs public, with zero interaction with the
  // auth/org surface.
  if (pathname === "/vykazy" || pathname.startsWith("/vykazy/")) {
    return NextResponse.next()
  }

  // Optimistic auth check on every other matched route. Pass the dev cookie
  // prefix so the presence check reads the SAME cookie name the server set
  // (per-Conductor-workspace namespacing) — without it, every dev request with
  // CONDUCTOR_PORT set looks for the default name, misses the prefixed cookie,
  // and redirect-loops to /auth/login. Prod returns undefined → default name.
  const prefix = devCookiePrefix()
  const sessionCookie = getSessionCookie(
    request,
    prefix ? { cookiePrefix: prefix } : undefined,
  )
  if (!sessionCookie) {
    const loginUrl = new URL("/auth/login", publicOrigin(request))
    // Preserve the requested path AND its benign query through login so a deep
    // link like `/o/acme/…/normal-table?inspect=<uuid>` returns to the exact
    // view. Credential-bearing keys (`token`, `code`, `state`, …) are stripped
    // first so a sensitive deep link never round-trips as `?next=`, and
    // `safeNext` still defends the consumer side against off-origin targets.
    const intended = safeNext(
      pathWithScrubbedQuery(pathname, request.nextUrl.searchParams),
      "/",
    )
    if (intended !== "/") {
      loginUrl.searchParams.set("next", intended)
    }
    return NextResponse.redirect(loginUrl)
  }
  // Forward the requested path (+ benign query) to Node-runtime layouts. The
  // optimistic gate above only checks cookie presence; a layout that runs the
  // real session check (e.g. `app/[orgSlug]/layout.tsx`) needs the full path to
  // bounce a stale-cookie visitor back to the exact deep link after re-login.
  // Credential-bearing query keys are scrubbed so they never reach the header.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(
    "x-pathname",
    pathWithScrubbedQuery(pathname, request.nextUrl.searchParams),
  )
  return NextResponse.next({ request: { headers: requestHeaders } })
}

/**
 * Matcher includes BOTH the auth-flow paths (so the hygiene headers
 * land) AND the protected paths (so the session-cookie check fires).
 * Internal Next assets, the public landing page, and /api/* are excluded.
 *
 *   /auth/*          — hygiene headers
 *   /onboarding/*    — hygiene headers; wizard flows include pre-account
 *                      steps so no session-cookie gate fires here
 *   /utility/*       — public recovery and error-state pages
 *   /vykazy, /vykazy/* — standalone login-free client-side výkazy tool
 *   everything else — optimistic session-cookie gate, redirect to /auth/login
 *
 * Excluded:
 *   /api/*           — Better Auth catchall + future route handlers
 *   /_next/static    — built assets
 *   /_next/image     — image optimizer
 *   /favicon.ico, /icon.svg, /apple-icon.png, /manifest.webmanifest
 *                    — Next.js metadata file conventions (served from app/)
 *   /favicon-{16,32,48}-{light,dark}.png  — adaptive tab favicon rasters
 *   /icon-{192,512}.png, /maskable-512.png — PWA install icons
 *                    (all served from public/)
 *   /robots.txt      — metadata route, must stay anonymous-readable
 *   /.well-known/*   — security.txt etc. (served from public/)
 *   /                — public landing page
 */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon\\.png|manifest\\.webmanifest|robots\\.txt|\\.well-known/.*|favicon-(?:16|32|48)-(?:light|dark)\\.png|icon-(?:192|512)\\.png|maskable-512\\.png|$).*)",
  ],
}
