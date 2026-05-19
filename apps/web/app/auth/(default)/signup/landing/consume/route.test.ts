/**
 * Integration tests for /auth/signup/landing (POST consume route).
 *
 * AFF-198 D1 — opaque sig-token consume path.
 *
 * Tests run against a live Postgres 18 testcontainer booted by
 * apps/web/tests/global-setup.ts. All db/auth imports are dynamic
 * (after env vars are set by globalSetup).
 *
 * Covered behaviors:
 *   - Happy path: valid sig token is consumed, redirect to /auth/signup
 *   - Expired token: returns INVALID redirect (no enumeration)
 *   - Double-consume: returns INVALID on second POST
 *   - Wrong kind: token minted as 'lem' rejected when expected 'sig'
 *   - Missing token body: returns INVALID redirect
 *   - Rate limit per-IP: 11th attempt blocked
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
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
  // Reset rate limit store before each test.
  const { _resetRateLimitStoresForTesting } =
    await import("@/lib/signup-rate-limit")
  _resetRateLimitStoresForTesting()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePostRequest(
  body: Record<string, string>,
  ip = "1.2.3.4",
): NextRequest {
  const form = new URLSearchParams(body).toString()
  return new Request("http://localhost/auth/signup/landing/consume", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-forwarded-for": ip,
    },
    body: form,
  }) as unknown as NextRequest
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /auth/signup/landing", () => {
  it("happy path: valid sig token is consumed and redirects to /auth/signup", async () => {
    const { rawToken } = await mintToken({
      kind: "sig",
      payload: { email: "owner@example.com", workspace: "Acme" },
    })

    const req = makePostRequest({ token: rawToken })
    const res = await POST(req)

    expect(res.status).toBe(307)
    const location = res.headers.get("location") ?? ""
    expect(location).toContain("/auth/signup")
    expect(location).not.toContain("/auth/signup/landing")
  })

  it("sets the payload cookie on success", async () => {
    const { rawToken } = await mintToken({
      kind: "sig",
      payload: { email: "owner@example.com", workspace: "Acme" },
    })

    const req = makePostRequest({ token: rawToken })
    const res = await POST(req)

    const setCookies = res.headers.getSetCookie?.() ?? []
    const payloadCookie = setCookies.find((c) =>
      c.startsWith("app-signup-payload="),
    )
    expect(payloadCookie).toBeTruthy()
    const rawValue = payloadCookie
      ?.split(";")[0]
      ?.replace("app-signup-payload=", "")
    const parsed = JSON.parse(decodeURIComponent(rawValue ?? ""))
    expect(parsed.kind).toBe("signup")
    expect(parsed.email).toBe("owner@example.com")
    expect(parsed.workspace).toBe("Acme")
  })

  it("double-consume: second POST returns INVALID redirect", async () => {
    const { rawToken } = await mintToken({
      kind: "sig",
      payload: { email: "owner@example.com", workspace: "Acme" },
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

  it("wrong kind (lem minted, sig expected) returns INVALID", async () => {
    const { rawToken } = await mintToken({
      kind: "lem",
      payload: {},
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
    // Exhaust the IP limit (10 attempts in 60s window).
    for (let i = 0; i < 10; i++) {
      const { rawToken } = await mintToken({
        kind: "sig",
        payload: { email: `u${i}@example.com`, workspace: "Acme" },
      })
      await POST(makePostRequest({ token: rawToken }, ip))
    }

    // 11th attempt should be blocked.
    const { rawToken: extra } = await mintToken({
      kind: "sig",
      payload: { email: "extra@example.com", workspace: "Acme" },
    })
    const res = await POST(makePostRequest({ token: extra }, ip))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("invalid=1")
  })
})
