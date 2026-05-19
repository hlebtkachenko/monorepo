import { NextResponse, type NextRequest } from "next/server"
import { verifySignupToken, TokenError } from "@workspace/auth/tokens"

import { publicOrigin } from "@/lib/request-origin"
import { checkSignupRateLimit } from "@/lib/signup-rate-limit"
import { truncateIp } from "@workspace/auth/tokens"

const SIGNUP_TOKEN_COOKIE = "app-signup-token"

/**
 * GET /auth/signup/start?token=<value>
 *
 * Signup invitation entry point. Behavior depends on USE_AUTH_TOKEN_FOR_SIG:
 *
 *   false (default, legacy path):
 *     Verifies the HS256 JWT, stashes it in an HttpOnly cookie, 302s to
 *     /auth/signup (the welcome card).
 *
 *   true (new opaque-token path):
 *     Does NOT consume the token (consuming on GET burns the token for
 *     email prefetch scanners). Redirects to /auth/signup/landing?token=<raw>
 *     so the human can click "Continue" and the POST handler consumes.
 *
 * The rate limiter guards both paths. Per-email rate limiting is skipped on
 * the start route because we don't decode the token here (we'd need the JWT
 * or DB round-trip). The per-IP limit still applies.
 *
 * ADR-0022 §"Mandatory companions".
 */
export async function GET(request: NextRequest) {
  const base = publicOrigin(request)
  const token = request.nextUrl.searchParams.get("token")

  if (!token) {
    return NextResponse.redirect(
      new URL("/auth/login?error=missing-signup-token", base),
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

  const useNewPath = process.env.USE_AUTH_TOKEN_FOR_SIG === "true"

  if (useNewPath) {
    // New path: hand off to the landing page. The token is the raw afkey-...
    // string. The landing page POST will consume it.
    return NextResponse.redirect(
      new URL(`/auth/signup/landing?token=${encodeURIComponent(token)}`, base),
    )
  }

  // Legacy path: verify the JWT, stash it in a cookie, redirect to welcome.
  try {
    await verifySignupToken(token)
  } catch (err) {
    if (err instanceof TokenError) {
      return NextResponse.redirect(new URL("/auth/login?error=invalid", base))
    }
    throw err
  }

  const res = NextResponse.redirect(new URL("/auth/signup", base))
  res.cookies.set(SIGNUP_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  })
  return res
}
