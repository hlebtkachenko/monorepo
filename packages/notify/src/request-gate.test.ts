import { describe, it, expect } from "vitest"

import { clientIp, isSameOrigin, createRateLimiter } from "./request-gate"

function req(headers: Record<string, string>): Request {
  return new Request("https://app.afframe.com/api/client-error", {
    method: "POST",
    headers,
  })
}

describe("clientIp", () => {
  it("prefers cf-connecting-ip", () => {
    expect(
      clientIp(
        req({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }),
      ),
    ).toBe("1.1.1.1")
  })

  it("falls back to the LAST x-forwarded-for hop", () => {
    expect(
      clientIp(req({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 7.7.7.7" })),
    ).toBe("7.7.7.7")
  })

  it("returns 'unknown' when no client headers are present", () => {
    expect(clientIp(req({}))).toBe("unknown")
  })
})

describe("isSameOrigin", () => {
  it("accepts Sec-Fetch-Site: same-origin", () => {
    expect(isSameOrigin(req({ "sec-fetch-site": "same-origin" }))).toBe(true)
  })

  it("rejects a cross-site fetch", () => {
    expect(isSameOrigin(req({ "sec-fetch-site": "cross-site" }))).toBe(false)
  })

  it("falls back to Origin vs x-forwarded-host when fetch metadata is absent", () => {
    expect(
      isSameOrigin(
        req({
          origin: "https://app.afframe.com",
          "x-forwarded-host": "app.afframe.com",
        }),
      ),
    ).toBe(true)
  })

  it("rejects a mismatched Origin host", () => {
    expect(
      isSameOrigin(
        req({
          origin: "https://evil.example",
          "x-forwarded-host": "app.afframe.com",
        }),
      ),
    ).toBe(false)
  })

  it("rejects when neither fetch metadata nor Origin is present", () => {
    expect(isSameOrigin(req({}))).toBe(false)
  })
})

describe("createRateLimiter", () => {
  it("allows up to capacity, then denies", () => {
    const allow = createRateLimiter({
      capacity: 3,
      refillPerMs: 0,
      maxTrackedIps: 100,
    })
    expect(allow("1.1.1.1")).toBe(true)
    expect(allow("1.1.1.1")).toBe(true)
    expect(allow("1.1.1.1")).toBe(true)
    expect(allow("1.1.1.1")).toBe(false)
  })

  it("tracks buckets per IP independently", () => {
    const allow = createRateLimiter({
      capacity: 1,
      refillPerMs: 0,
      maxTrackedIps: 100,
    })
    expect(allow("1.1.1.1")).toBe(true)
    expect(allow("2.2.2.2")).toBe(true)
    expect(allow("1.1.1.1")).toBe(false)
  })

  it("keeps independent state across limiter instances", () => {
    const a = createRateLimiter({
      capacity: 1,
      refillPerMs: 0,
      maxTrackedIps: 100,
    })
    const b = createRateLimiter({
      capacity: 1,
      refillPerMs: 0,
      maxTrackedIps: 100,
    })
    expect(a("1.1.1.1")).toBe(true)
    expect(a("1.1.1.1")).toBe(false)
    // b has its own bucket map — unaffected by a.
    expect(b("1.1.1.1")).toBe(true)
  })
})
