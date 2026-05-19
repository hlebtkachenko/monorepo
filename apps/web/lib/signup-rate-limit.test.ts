/**
 * Unit tests for the signup rate limiter.
 *
 * AFF-198 D1 — per-IP and per-email sliding-window rate limit.
 *
 * These run in Node (no DB, no Next.js runtime). The store is process-local
 * Map; reset between each test via _resetRateLimitStoresForTesting.
 */

import { afterEach, describe, expect, it } from "vitest"
import {
  checkSignupRateLimit,
  _resetRateLimitStoresForTesting,
} from "./signup-rate-limit"

afterEach(() => {
  _resetRateLimitStoresForTesting()
})

describe("checkSignupRateLimit", () => {
  it("allows requests up to the IP limit", () => {
    const ip = "1.2.3.0/24"
    for (let i = 0; i < 10; i++) {
      expect(checkSignupRateLimit({ ip, email: null })).toBe(false)
    }
  })

  it("blocks on the 11th IP attempt within the window", () => {
    const ip = "1.2.3.0/24"
    for (let i = 0; i < 10; i++) {
      checkSignupRateLimit({ ip, email: null })
    }
    expect(checkSignupRateLimit({ ip, email: null })).toBe(true)
  })

  it("allows requests up to the email limit", () => {
    const email = "user@example.com"
    for (let i = 0; i < 5; i++) {
      expect(checkSignupRateLimit({ ip: null, email })).toBe(false)
    }
  })

  it("blocks on the 6th email attempt within the window", () => {
    const email = "user@example.com"
    for (let i = 0; i < 5; i++) {
      checkSignupRateLimit({ ip: null, email })
    }
    expect(checkSignupRateLimit({ ip: null, email })).toBe(true)
  })

  it("different IPs do not share the window", () => {
    const ip1 = "1.0.0.0/24"
    const ip2 = "2.0.0.0/24"
    for (let i = 0; i < 10; i++) {
      checkSignupRateLimit({ ip: ip1, email: null })
    }
    // ip2 window is independent — should still allow
    expect(checkSignupRateLimit({ ip: ip2, email: null })).toBe(false)
  })

  it("different emails do not share the window", () => {
    const email1 = "a@example.com"
    const email2 = "b@example.com"
    for (let i = 0; i < 5; i++) {
      checkSignupRateLimit({ ip: null, email: email1 })
    }
    expect(checkSignupRateLimit({ ip: null, email: email2 })).toBe(false)
  })

  it("null ip and null email never block", () => {
    for (let i = 0; i < 100; i++) {
      expect(checkSignupRateLimit({ ip: null, email: null })).toBe(false)
    }
  })

  it("email check is case-insensitive", () => {
    const email = "User@Example.COM"
    for (let i = 0; i < 5; i++) {
      checkSignupRateLimit({ ip: null, email })
    }
    // Same email in different case hits the same bucket.
    expect(checkSignupRateLimit({ ip: null, email: "user@example.com" })).toBe(
      true,
    )
  })
})
