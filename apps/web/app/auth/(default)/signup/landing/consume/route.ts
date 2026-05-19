import { NextResponse, type NextRequest } from "next/server"
import {
  consumeToken,
  AUTH_COOKIE_DESCRIPTORS,
  truncateIp,
} from "@workspace/auth/tokens"

import { publicOrigin } from "@/lib/request-origin"
import { checkSignupRateLimit } from "@/lib/signup-rate-limit"

const SIGNUP_PAYLOAD_COOKIE = "app-signup-payload"

/**
 * Generic INVALID response — same status, body, and redirect for every
 * failure mode (expired, revoked, wrong kind, malformed, not found, rate
 * limited). No enumeration channel. ADR-0022 §"Mandatory companions" #5.
 */
function invalidResponse(base: string): NextResponse {
  return NextResponse.redirect(new URL("/auth/signup/landing?invalid=1", base))
}

/**
 * POST /auth/signup/landing
 *
 * Consumes the opaque sig token from the form body. On success:
 *   1. Writes the __Host-afkey-sig cookie.
 *   2. Writes a companion app-signup-payload cookie (JSON SignupClaims
 *      shape) so the onboarding wizard can read email + workspace without
 *      a DB round-trip.
 *   3. Redirects to /auth/signup (the welcome card).
 *
 * On any failure: redirect to /auth/signup/landing?invalid=1 (the same
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

  // Consume the token. Returns null on any failure.
  const consumed = await consumeToken<{ email?: string; workspace?: string }>({
    rawToken,
    expectedKind: "sig",
    ctx: {
      ip: rawIp,
      userAgent: request.headers.get("user-agent"),
    },
  })

  if (!consumed) {
    return invalidResponse(base)
  }

  const email = consumed.payload.email
  const workspace = consumed.payload.workspace

  if (typeof email !== "string" || !email) {
    return invalidResponse(base)
  }

  // Per-email rate limit after we know the email.
  const emailBlocked = checkSignupRateLimit({ ip: null, email })
  if (emailBlocked) {
    return invalidResponse(base)
  }

  const res = NextResponse.redirect(new URL("/auth/signup", base))

  // Write the __Host-afkey-sig cookie. The __Host- prefix requires Secure.
  // In local dev (non-HTTPS) this cookie will be rejected by the browser
  // but that is intentional: the new path is only active when
  // USE_AUTH_TOKEN_FOR_SIG=true, which should never be set in plaintext
  // local dev. Developers test the new path against staging (HTTPS).
  const sigDesc = AUTH_COOKIE_DESCRIPTORS.sig
  res.cookies.set({
    name: sigDesc.name,
    value: rawToken,
    path: sigDesc.path,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: sigDesc.defaultTtlSeconds,
  })

  // Write a sibling payload cookie so downstream reads (readSignupClaims)
  // can return email + workspace without a DB round-trip. HttpOnly, path "/",
  // same TTL as the auth cookie (48h).
  const payloadJson = JSON.stringify({
    kind: "signup",
    email,
    workspace: typeof workspace === "string" ? workspace : "",
  })
  res.cookies.set({
    name: SIGNUP_PAYLOAD_COOKIE,
    value: payloadJson,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sigDesc.defaultTtlSeconds,
  })

  return res
}
