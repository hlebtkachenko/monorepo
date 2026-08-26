import { describe, expect, it } from "vitest"

import { createRateLimiter } from "./rate-limit"
import { clientIp, clientUserAgent, rateLimitKey } from "./request-ip"

describe("fixed-window limiter", () => {
  it("allows up to max in a window and refuses the next", () => {
    const limiter = createRateLimiter(() => 1_000)
    const rule = { window: 60, max: 3 }

    expect(limiter("k", rule).allowed).toBe(true)
    expect(limiter("k", rule).allowed).toBe(true)
    expect(limiter("k", rule).allowed).toBe(true)

    const denied = limiter("k", rule)
    expect(denied.allowed).toBe(false)
    if (!denied.allowed) expect(denied.retryAfterSeconds).toBe(60)
  })

  it("keys are independent", () => {
    const limiter = createRateLimiter(() => 1_000)
    const rule = { window: 60, max: 1 }
    expect(limiter("a", rule).allowed).toBe(true)
    expect(limiter("b", rule).allowed).toBe(true)
    expect(limiter("a", rule).allowed).toBe(false)
  })

  it("starts a fresh window once the old one has passed", () => {
    let now = 1_000
    const limiter = createRateLimiter(() => now)
    const rule = { window: 60, max: 1 }

    expect(limiter("k", rule).allowed).toBe(true)
    expect(limiter("k", rule).allowed).toBe(false)
    now += 60_001
    expect(limiter("k", rule).allowed).toBe(true)
  })
})

describe("client identity", () => {
  it("reads cf-connecting-ip and nothing else", () => {
    // Cloudflare APPENDS to an inbound x-forwarded-for, so its first hop is
    // attacker-controlled: trusting it would let one client rotate fake IPs
    // past the limiter.
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "10.0.0.1, 203.0.113.7",
    })
    expect(clientIp(headers)).toBe("203.0.113.7")

    const spoofed = new Headers({ "x-forwarded-for": "10.0.0.1" })
    expect(clientIp(spoofed)).toBeNull()
  })

  it("falls back to one shared bucket rather than skipping the limit", () => {
    expect(rateLimitKey(new Headers(), "consume")).toBe("consume:unknown-ip")
    expect(
      rateLimitKey(
        new Headers({ "cf-connecting-ip": "203.0.113.7" }),
        "consume",
      ),
    ).toBe("consume:203.0.113.7")
  })

  it("truncates the user agent", () => {
    const headers = new Headers({ "user-agent": "a".repeat(900) })
    expect(clientUserAgent(headers)).toHaveLength(512)
    expect(clientUserAgent(new Headers())).toBeNull()
  })
})
