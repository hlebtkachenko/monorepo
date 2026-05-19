import { NextResponse, type NextRequest } from "next/server"
import { readInviteByRawToken } from "@workspace/auth/invite-issuer"
import { AFKEY_REGEX, truncateIp } from "@workspace/auth/tokens"

import { publicOrigin } from "@/lib/request-origin"
import { checkSignupRateLimit } from "@/lib/signup-rate-limit"

const INVITE_TOKEN_COOKIE = "app-invite-token"

/**
 * GET /auth/invite/start?token=<raw>
 *
 * Route handler entry-point for organization invites. Behavior depends on
 * USE_AUTH_TOKEN_FOR_INV:
 *
 *   false (default, legacy path):
 *     Hashes the raw token, looks up auth_invite by token_hash, validates
 *     status='pending' + not expired, stashes the raw token in an HttpOnly
 *     cookie, 302s to /auth/invite (the welcome card).
 *
 *   true (new opaque-token path):
 *     Does NOT consume the token (consuming on GET burns it for email
 *     prefetch scanners). Redirects to /auth/invite/landing?token=<raw>
 *     so the human can click "Continue" and the POST handler consumes.
 *
 * Per-IP rate limit applies to both paths. Per-email is skipped here
 * because decoding the token to extract email would require a DB
 * round-trip on the GET — the landing POST handles per-email instead.
 *
 * The token in the URL is the same opaque value sent in the recipient's
 * email — no claims to decode. All claims live on the DB row.
 *
 * ADR-0022 §"Mandatory companions".
 */
export async function GET(request: NextRequest) {
  const base = publicOrigin(request)
  const rawToken = request.nextUrl.searchParams.get("token")
  if (!rawToken) {
    return NextResponse.redirect(
      new URL("/auth/login?error=missing-invite-token", base),
    )
  }

  // Per-IP rate limit (per-email not applied here to avoid decoding).
  const rawIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const ip = truncateIp(rawIp)
  const blocked = checkSignupRateLimit({ ip, email: null })
  if (blocked) {
    return NextResponse.redirect(new URL("/auth/login?error=invalid", base))
  }

  const useNewPath = process.env.USE_AUTH_TOKEN_FOR_INV === "true"

  // Route based on flag AND token format. After flag-flip, in-flight
  // pre-flag invites are still base64url (legacy format) and must use the
  // legacy validate-then-cookie path; new invites are afkey- and route
  // through the landing page. Format-detect via AFKEY_REGEX.
  if (useNewPath && AFKEY_REGEX.test(rawToken)) {
    return NextResponse.redirect(
      new URL(
        `/auth/invite/landing?token=${encodeURIComponent(rawToken)}`,
        base,
      ),
    )
  }

  const record = await readInviteByRawToken(rawToken)
  if (!record) {
    return NextResponse.redirect(new URL("/auth/login?error=invalid", base))
  }
  if (record.status === "expired") {
    return NextResponse.redirect(new URL("/auth/login?error=expired", base))
  }
  if (record.status === "revoked") {
    return NextResponse.redirect(new URL("/auth/login?error=disabled", base))
  }
  if (record.status === "accepted") {
    return NextResponse.redirect(
      new URL("/auth/login?error=invite-already-accepted", base),
    )
  }

  const res = NextResponse.redirect(new URL("/auth/invite", base))
  res.cookies.set(INVITE_TOKEN_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // Path "/" so the cookie survives the handoff into /onboarding/*
    // for new-account members. Random opaque token; carries no claims.
    path: "/",
    maxAge: 60 * 60 * 24,
  })
  return res
}
