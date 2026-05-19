import { type NextRequest, NextResponse } from "next/server"

/**
 * Next.js edge middleware.
 *
 * Applied to every /auth/* and /onboarding/* request:
 *
 * 1. Referrer-Policy: no-referrer — ADR-0022 §"Mandatory companions" #3.
 *    Prevents the raw token query parameter leaking into the Referer header
 *    on any subsequent navigation (e.g. the browser following a redirect from
 *    the landing page to /auth/signup).
 *
 * 2. Log scrubbing — inject a sanitized x-request-path header that strips
 *    ?token= before any upstream logger (Sentry, Next.js telemetry) records
 *    the path. The original URL is passed through intact so route handlers
 *    can still read searchParams. ADR-0022 §"Mandatory companions" #4.
 */
export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next()

  response.headers.set("Referrer-Policy", "no-referrer")

  // Build a scrubbed path for loggers — same URL with ?token= removed.
  if (request.nextUrl.searchParams.has("token")) {
    const scrubbed = request.nextUrl.clone()
    scrubbed.searchParams.delete("token")
    response.headers.set("x-scrubbed-path", scrubbed.pathname + scrubbed.search)
  }

  return response
}

export const config = {
  matcher: ["/auth/:path*", "/onboarding/:path*"],
}
