import { NextResponse, type NextRequest } from "next/server"

/**
 * Edge-runtime proxy (Next.js 16 — formerly `middleware.ts`).
 *
 * The admin app runs its REAL authorization in the Node runtime
 * (`app/(gated)/layout.tsx` and `lib/admin-session.ts`) where Better Auth +
 * Postgres are reachable. This proxy deliberately does NOT gate — it only
 * forwards the requested path as an `x-pathname` request header so those
 * Node-runtime guards can bounce a signed-out visitor back to the exact deep
 * link after re-login, instead of dropping them on the admin root.
 *
 * Cookie-presence gating lives in the Node layer on purpose: the admin
 * allowlist check needs the DB, and an optimistic edge gate would duplicate
 * (and could diverge from) that logic.
 */
export function proxy(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-pathname", request.nextUrl.pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

/**
 * Excludes Next internals, metadata files, and `/api/*` (Better Auth
 * catchall) — everything else gets the `x-pathname` header so any Node-layer
 * guard on the path can read the original request path.
 */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon\\.png|manifest\\.webmanifest|robots\\.txt|\\.well-known/.*|$).*)",
  ],
}
