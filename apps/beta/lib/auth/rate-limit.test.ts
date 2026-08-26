import { describe, expect, it } from "vitest"

import { authNoIpFloor } from "./no-ip-floor"
import { BETA_AUTH_NO_IP_RATE_LIMIT } from "./policy"
import { createRateLimiter } from "./rate-limit"
import {
  authRateLimitKey,
  clientIp,
  clientUserAgent,
  isIpAddress,
  rateLimitKey,
} from "./request-ip"

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

  /**
   * A value that is not address-shaped is no address. Two reasons: `issued_ip`
   * and `consumed_ip` are `inet` columns, and Better Auth applies its own
   * validity test before keying its limiter — so disagreeing with that verdict
   * would leave the no-IP floor asleep in exactly the case Better Auth dropped.
   */
  it("accepts real addresses and rejects everything else", () => {
    for (const good of [
      "203.0.113.7",
      "0.0.0.0",
      "255.255.255.255",
      "2001:db8::1",
      "::1",
      "::ffff:203.0.113.7",
      "fe80::1ff:fe23:4567:890a",
    ]) {
      expect(isIpAddress(good), good).toBe(true)
    }

    for (const bad of [
      "",
      "not-an-ip",
      "256.0.0.1",
      "203.0.113",
      "203.0.113.7; DROP TABLE",
      "<script>",
      "2001:db8::1::2",
      "1:2:3:4:5:6:7:8:9",
    ]) {
      expect(isIpAddress(bad), bad || "<empty>").toBe(false)
    }
  })

  it("treats a junk cf-connecting-ip as no address at all", () => {
    const junk = new Headers({ "cf-connecting-ip": "not-an-ip" })
    expect(clientIp(junk)).toBeNull()
    expect(rateLimitKey(junk, "consume")).toBe("consume:unknown-ip")
  })
})

/**
 * Advisor carry-in from the PR 06 gate: Better Auth SKIPS its rate limit when
 * it cannot determine a client IP. That is fail-open on the sign-in endpoint,
 * and this floor is what closes it.
 */
describe("the no-IP floor under Better Auth's limiter", () => {
  const request = (path: string, ip?: string): Request =>
    new Request(`https://beta.example.com${path}`, {
      headers: ip ? { "cf-connecting-ip": ip } : {},
    })

  it("stays out of the way whenever there IS a usable client IP", () => {
    // In the deployed environment this is every request, so the floor never
    // double-counts against Better Auth's own budget.
    expect(
      authRateLimitKey(
        new Headers({ "cf-connecting-ip": "203.0.113.7" }),
        "/x",
      ),
    ).toBeNull()

    for (let i = 0; i < BETA_AUTH_NO_IP_RATE_LIMIT.max + 5; i++) {
      expect(
        authNoIpFloor(request("/api/auth/sign-in/email", "203.0.113.7")),
      ).toBeNull()
    }
  })

  it("limits a request that arrives with no client IP", () => {
    const path = "/api/auth/sign-in/email"

    for (let i = 0; i < BETA_AUTH_NO_IP_RATE_LIMIT.max; i++) {
      expect(authNoIpFloor(request(path)), `request ${i + 1}`).toBeNull()
    }

    const refused = authNoIpFloor(request(path))
    expect(refused).not.toBeNull()
    expect(refused?.status).toBe(429)
    expect(Number(refused?.headers.get("retry-after"))).toBeGreaterThan(0)
  })

  it("budgets each auth path separately", () => {
    // The previous case spent /sign-in/email's whole budget on the shared
    // process-wide limiter. A different path must still have its own.
    expect(authNoIpFloor(request("/api/auth/sign-out"))).toBeNull()
  })

  it("keys on the path only, never on the request's origin", () => {
    // Behind the tunnel `request.url` is the container listener, so the origin
    // is worthless — but two spellings of the same path must share one bucket.
    const key = (url: string) =>
      authRateLimitKey(new Headers(), new URL(url).pathname.toLowerCase())

    expect(key("https://beta.afframe.com/api/auth/sign-in/email")).toBe(
      key("http://0.0.0.0:3000/api/auth/sign-in/email"),
    )
  })
})
