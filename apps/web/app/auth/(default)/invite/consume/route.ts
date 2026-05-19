import { NextResponse, type NextRequest } from "next/server"
import { AUTH_COOKIE_DESCRIPTORS, truncateIp } from "@workspace/auth/tokens"
import { readInviteByRawToken } from "@workspace/auth/invite-issuer"

import { publicOrigin } from "@/lib/request-origin"
import { checkSignupRateLimit } from "@/lib/signup-rate-limit"

const INVITE_PAYLOAD_COOKIE = "app-invite-payload"

/**
 * Generic INVALID response — same status, body, and redirect for every
 * failure mode (expired, revoked, wrong kind, malformed, not found, rate
 * limited). No enumeration channel. ADR-0022 §"Mandatory companions" #5.
 */
function invalidResponse(base: string): NextResponse {
  return NextResponse.redirect(new URL("/auth/invite?invalid=1", base))
}

/**
 * POST /auth/invite/consume
 *
 * Peeks the opaque inv token from the form body and bridges it forward
 * to the welcome card. Unlike sig (where the consume route flips
 * status='consumed' immediately so the payload is captured in a cookie),
 * inv defers the actual auth_token row consume to `materializeInvite`
 * at accept time — that consume must be atomic with the membership
 * writes so concurrent redemptions can't race past the email check.
 *
 * On success:
 *   1. Reads the auth_token row via `readInviteByRawToken` (peek only).
 *   2. Writes the __Host-afkey-inv cookie carrying the raw token.
 *   3. Writes a sibling app-invite-payload cookie (JSON payload) so the
 *      welcome card renders email + role without a second DB read.
 *   4. Redirects to /auth/invite (welcome card).
 *
 * On any failure: redirects to /auth/invite?invalid=1. Generic, no
 * failure-mode enumeration.
 *
 * ADR-0022 §"Mandatory companions" #1 (prefetch-scanner mitigation).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const base = publicOrigin(request)

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

  // Per-IP rate limit. Per-email is enforced after the peek reveals
  // the email.
  const rawIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const ip = truncateIp(rawIp)
  const blocked = checkSignupRateLimit({ ip, email: null })
  if (blocked) {
    return invalidResponse(base)
  }

  const record = await readInviteByRawToken(rawToken)
  // Generic response on every non-pending state. We DO NOT branch on
  // status here — the welcome page renders a generic "invalid" UI in
  // every failure case (revoked, expired, accepted, unknown token).
  if (!record || record.status !== "pending") {
    return invalidResponse(base)
  }

  // Per-email rate limit after we know the email.
  const emailBlocked = checkSignupRateLimit({ ip: null, email: record.email })
  if (emailBlocked) {
    return invalidResponse(base)
  }

  const res = NextResponse.redirect(new URL("/auth/invite", base))

  // Write the __Host-afkey-inv cookie carrying the raw token so
  // materializeInvite can consume it atomically at accept time.
  const invDesc = AUTH_COOKIE_DESCRIPTORS.inv
  res.cookies.set({
    name: invDesc.name,
    value: rawToken,
    path: invDesc.path,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: invDesc.defaultTtlSeconds,
  })

  // Sibling payload cookie keeps the welcome card stateless w.r.t. DB.
  // expiresAt is NOT serialized (the auth_token row still owns that).
  const payloadJson = JSON.stringify({
    kind: "invite",
    id: record.id,
    email: record.email,
    organizationId: record.organizationId,
    workspaceId: record.workspaceId,
    role: record.role,
  })
  res.cookies.set({
    name: INVITE_PAYLOAD_COOKIE,
    value: payloadJson,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: invDesc.defaultTtlSeconds,
  })

  return res
}
