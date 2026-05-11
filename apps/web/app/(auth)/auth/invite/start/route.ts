import { NextResponse, type NextRequest } from "next/server"
import { verifyInviteToken, TokenError } from "@workspace/auth/tokens"

const INVITE_TOKEN_COOKIE = "app-invite-token"

/**
 * GET /auth/invite/start?token=<jwt>
 *
 * Route handler entry-point for organization invites. Same shape as
 * /auth/signup/start: verify, stash in HttpOnly cookie, 302 to
 * /auth/invite (the Welcome card).
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  if (!token) {
    return NextResponse.redirect(
      new URL("/auth/login?error=missing-invite-token", request.url),
    )
  }
  try {
    await verifyInviteToken(token)
  } catch (err) {
    if (err instanceof TokenError) {
      return NextResponse.redirect(
        new URL(`/auth/login?error=${err.code.toLowerCase()}`, request.url),
      )
    }
    throw err
  }
  const res = NextResponse.redirect(new URL("/auth/invite", request.url))
  res.cookies.set(INVITE_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth/invite",
    maxAge: 60 * 60 * 24,
  })
  return res
}
