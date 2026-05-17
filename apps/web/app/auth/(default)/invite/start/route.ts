import { NextResponse, type NextRequest } from "next/server"
import { readInviteByRawToken } from "@workspace/auth/invite-issuer"

const INVITE_TOKEN_COOKIE = "app-invite-token"

/**
 * GET /auth/invite/start?token=<raw>
 *
 * Route handler entry-point for organization invites. Hashes the raw
 * token, looks up the `auth_invite` row by `token_hash`, validates it's
 * still pending + not expired, then stashes the raw token in an
 * HttpOnly cookie and 302s to /auth/invite (the welcome card).
 *
 * The token in the URL is the same 32-byte random value sent in the
 * recipient's email — opaque, no claims to decode. All claims live on
 * the DB row.
 */
export async function GET(request: NextRequest) {
  const rawToken = request.nextUrl.searchParams.get("token")
  if (!rawToken) {
    return NextResponse.redirect(
      new URL("/auth/login?error=missing-invite-token", request.url),
    )
  }

  const record = await readInviteByRawToken(rawToken)
  if (!record) {
    return NextResponse.redirect(
      new URL("/auth/login?error=invalid", request.url),
    )
  }
  if (record.status === "expired") {
    return NextResponse.redirect(
      new URL("/auth/login?error=expired", request.url),
    )
  }
  if (record.status === "revoked") {
    return NextResponse.redirect(
      new URL("/auth/login?error=disabled", request.url),
    )
  }
  if (record.status === "accepted") {
    return NextResponse.redirect(
      new URL("/auth/login?error=invite-already-accepted", request.url),
    )
  }

  const res = NextResponse.redirect(new URL("/auth/invite", request.url))
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
