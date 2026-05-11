import { NextResponse, type NextRequest } from "next/server"
import { verifySignupToken, TokenError } from "@workspace/auth/tokens"

const SIGNUP_TOKEN_COOKIE = "app-signup-token"

/**
 * GET /auth/signup/start?token=<jwt>
 *
 * Route handler entry-point for signup invitations. Verifies the JWT,
 * stashes it in an HttpOnly cookie scoped to `/auth/signup`, then 302s to
 * `/auth/signup` (the Welcome card). Setting cookies must happen in a
 * Route Handler or Server Action under Next 16; Server Components are
 * read-only for cookies, so the welcome page itself cannot do the write.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  if (!token) {
    return NextResponse.redirect(
      new URL("/auth/login?error=missing-signup-token", request.url),
    )
  }
  try {
    await verifySignupToken(token)
  } catch (err) {
    if (err instanceof TokenError) {
      return NextResponse.redirect(
        new URL(`/auth/login?error=${err.code.toLowerCase()}`, request.url),
      )
    }
    throw err
  }
  const res = NextResponse.redirect(new URL("/auth/signup", request.url))
  res.cookies.set(SIGNUP_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth/signup",
    maxAge: 60 * 60 * 24,
  })
  return res
}
