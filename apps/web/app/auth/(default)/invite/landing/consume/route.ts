import { NextResponse, type NextRequest } from "next/server"
import { consumeToken, truncateIp } from "@workspace/auth/tokens"

import { publicOrigin } from "@/lib/request-origin"
import { checkSignupRateLimit } from "@/lib/signup-rate-limit"

const INVITE_TOKEN_COOKIE = "app-invite-token"

/**
 * Generic INVALID response — same status, body, and redirect for every
 * failure mode (expired, revoked, wrong kind, malformed, not found, rate
 * limited). No enumeration channel. ADR-0022 §"Mandatory companions" #5.
 */
function invalidResponse(base: string): NextResponse {
  return NextResponse.redirect(new URL("/auth/invite/landing?invalid=1", base))
}

/**
 * POST /auth/invite/landing/consume
 *
 * Consumes the opaque inv token from the form body. On success:
 *   1. Writes the existing `app-invite-token` cookie carrying the raw
 *      token so the downstream accept flow (welcome card +
 *      materializeInvite) keeps working unchanged. Both readInviteByRawToken
 *      and materializeInvite resolve via SHA-256(rawToken), so the same
 *      cookie value still locates the auth_invite row.
 *   2. Redirects to /auth/invite (the welcome card).
 *
 * On any failure: redirect to /auth/invite/landing?invalid=1 (the same
 * page renders an error state). Generic — no failure-mode enumeration.
 *
 * ADR-0022 §"Mandatory companions" #1 (prefetch-scanner mitigation).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const base = publicOrigin(request)

  // Parse form body. The landing page submits application/x-www-form-urlencoded.
  let rawToken: string | null = null
  try {
    const form = await request.formData()
    rawToken = form.get("token")?.toString() ?? null
  } catch {
    return invalidResponse(base)
  }

  if (!rawToken) {
    return invalidResponse(base)
  }

  // Per-IP rate limit. Per-email not applied yet (email not known pre-consume).
  const rawIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const ip = truncateIp(rawIp)
  const blocked = checkSignupRateLimit({ ip, email: null })
  if (blocked) {
    return invalidResponse(base)
  }

  // Consume the token. Returns null on any failure mode.
  const consumed = await consumeToken<{
    email?: string
    organizationId?: string
    workspaceId?: string
    role?: string
  }>({
    rawToken,
    expectedKind: "inv",
    ctx: {
      ip: rawIp,
      userAgent: request.headers.get("user-agent"),
    },
  })

  if (!consumed) {
    return invalidResponse(base)
  }

  const email = consumed.payload.email
  if (typeof email !== "string" || !email) {
    return invalidResponse(base)
  }

  // Per-email rate limit after we know the email.
  const emailBlocked = checkSignupRateLimit({ ip: null, email })
  if (emailBlocked) {
    return invalidResponse(base)
  }

  // Materialize the invite acceptance happens on the welcome card
  // (acceptInviteAction), not here. We re-stash the raw token in the
  // existing invite cookie so the rest of the flow stays unchanged.
  // NOTE: the auth_token row is already 'consumed' at this point — but
  // materializeInvite uses auth_invite (still 'pending'), so the
  // welcome-card UI + accept handler keep working. After the E1 cleanup
  // (auth_invite drop) this route will instead carry the payload to the
  // welcome card directly.
  const res = NextResponse.redirect(new URL("/auth/invite", base))
  res.cookies.set(INVITE_TOKEN_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  })
  return res
}
