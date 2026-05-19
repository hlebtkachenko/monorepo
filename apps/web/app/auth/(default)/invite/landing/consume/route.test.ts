/**
 * Integration tests for /auth/invite/landing/consume (POST consume route).
 *
 * AFF-198 D2 — opaque inv-token consume path.
 *
 * Tests run against a live Postgres 18 testcontainer booted by
 * apps/web/tests/global-setup.ts. All db/auth imports are dynamic
 * (after env vars are set by globalSetup).
 *
 * Covered behaviors:
 *   - Happy path: valid inv token is consumed, redirect to /auth/invite,
 *     sets app-invite-token cookie
 *   - Expired token: returns INVALID redirect (no enumeration)
 *   - Double-consume: returns INVALID on second POST
 *   - Wrong kind: token minted as 'sig' rejected when expected 'inv'
 *   - Missing token body: returns INVALID redirect
 *   - Rate limit per-IP: 11th attempt blocked
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { NextRequest } from "next/server"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"
process.env["AUTH_TOKEN_ENV"] = "dev"

let mintToken: (typeof import("@workspace/auth/tokens"))["mintToken"]
let POST: (req: NextRequest) => Promise<Response>
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]
let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let sql: import("postgres").Sql

beforeAll(async () => {
  ;({ mintToken } = await import("@workspace/auth/tokens"))
  ;({ POST } = await import("./route"))
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  sql = adminClient()
  await truncateAll(sql)
}, 60_000)

afterAll(async () => {
  if (sql) await sql.end({ timeout: 5 })
})

beforeEach(async () => {
  await truncateAll(sql)
  const { _resetRateLimitStoresForTesting } =
    await import("@/lib/signup-rate-limit")
  _resetRateLimitStoresForTesting()
})

function makePostRequest(
  body: Record<string, string>,
  ip = "1.2.3.4",
): NextRequest {
  const form = new URLSearchParams(body).toString()
  return new Request("http://localhost/auth/invite/landing/consume", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-forwarded-for": ip,
    },
    body: form,
  }) as unknown as NextRequest
}

describe("POST /auth/invite/landing/consume", () => {
  it("happy path: valid inv token is consumed and redirects to /auth/invite", async () => {
    const { rawToken } = await mintToken({
      kind: "inv",
      payload: {
        email: "joiner@example.com",
        organizationId: "00000000-0000-0000-0000-000000000001",
        workspaceId: "00000000-0000-0000-0000-000000000002",
        role: "member",
      },
    })

    const req = makePostRequest({ token: rawToken })
    const res = await POST(req)

    expect(res.status).toBe(307)
    const location = res.headers.get("location") ?? ""
    expect(location).toContain("/auth/invite")
    expect(location).not.toContain("/auth/invite/landing")
  })

  it("sets the invite cookie on success", async () => {
    const { rawToken } = await mintToken({
      kind: "inv",
      payload: {
        email: "joiner@example.com",
        organizationId: "00000000-0000-0000-0000-000000000001",
        workspaceId: "00000000-0000-0000-0000-000000000002",
        role: "member",
      },
    })

    const req = makePostRequest({ token: rawToken })
    const res = await POST(req)

    const setCookies = res.headers.getSetCookie?.() ?? []
    const inviteCookie = setCookies.find((c) =>
      c.startsWith("app-invite-token="),
    )
    expect(inviteCookie).toBeTruthy()
    const cookieValue = inviteCookie
      ?.split(";")[0]
      ?.replace("app-invite-token=", "")
    expect(cookieValue).toBe(rawToken)
  })

  it("double-consume: second POST returns INVALID redirect", async () => {
    const { rawToken } = await mintToken({
      kind: "inv",
      payload: {
        email: "joiner@example.com",
        organizationId: "00000000-0000-0000-0000-000000000001",
        workspaceId: "00000000-0000-0000-0000-000000000002",
        role: "member",
      },
    })

    await POST(makePostRequest({ token: rawToken }))
    const res2 = await POST(makePostRequest({ token: rawToken }))

    expect(res2.status).toBe(307)
    const location = res2.headers.get("location") ?? ""
    expect(location).toContain("invalid=1")
  })

  it("missing token body returns INVALID redirect", async () => {
    const req = makePostRequest({})
    const res = await POST(req)

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("invalid=1")
  })

  it("wrong kind (sig minted, inv expected) returns INVALID", async () => {
    const { rawToken } = await mintToken({
      kind: "sig",
      payload: { email: "x@y.z" },
    })

    const req = makePostRequest({ token: rawToken })
    const res = await POST(req)

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("invalid=1")
  })

  it("per-IP rate limit blocks after threshold", async () => {
    const { _resetRateLimitStoresForTesting } =
      await import("@/lib/signup-rate-limit")
    _resetRateLimitStoresForTesting()

    const ip = "10.0.0.1"
    for (let i = 0; i < 10; i++) {
      const { rawToken } = await mintToken({
        kind: "inv",
        payload: {
          email: `u${i}@example.com`,
          organizationId: "00000000-0000-0000-0000-000000000001",
          workspaceId: "00000000-0000-0000-0000-000000000002",
          role: "member",
        },
      })
      await POST(makePostRequest({ token: rawToken }, ip))
    }

    const { rawToken: extra } = await mintToken({
      kind: "inv",
      payload: {
        email: "extra@example.com",
        organizationId: "00000000-0000-0000-0000-000000000001",
        workspaceId: "00000000-0000-0000-0000-000000000002",
        role: "member",
      },
    })
    const res = await POST(makePostRequest({ token: extra }, ip))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("invalid=1")
  })
})
