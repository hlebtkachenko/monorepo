/**
 * The cookie policy is the one part of beta's auth that a reviewer cannot check
 * by reading Better Auth's config alone — the emitted name is assembled from a
 * prefix, a name override and a secure flag. These assertions pin the result.
 *
 * `lib/auth/server.test.ts` asserts the same thing end-to-end, from a real
 * `Set-Cookie`. This file pins the intent so a rename cannot pass silently.
 */
import { describe, expect, it } from "vitest"

import {
  BETA_CONSUME_RATE_LIMIT,
  BETA_COOKIE_ATTRIBUTES,
  BETA_COOKIE_NAMES,
  BETA_COOKIE_PREFIX,
  BETA_RATE_LIMIT_RULES,
  BETA_SESSION_COOKIE_NAME,
} from "./policy"

describe("beta cookie policy", () => {
  it("names the session cookie with the __Host- prefix", () => {
    expect(BETA_SESSION_COOKIE_NAME).toBe("__Host-beta-auth.session_token")
  })

  it("uses a cookie prefix that cannot collide with the main product's", () => {
    // The main app signs its cookie for `.afframe.com`, which reaches this host.
    // Same prefix would mean beta reading a prod session token.
    expect(BETA_COOKIE_PREFIX).toBe("beta-auth")
    expect(BETA_COOKIE_PREFIX).not.toBe("better-auth")
  })

  it("prefixes every auth cookie, not just the session one", () => {
    for (const name of Object.values(BETA_COOKIE_NAMES)) {
      expect(name.startsWith("__Host-beta-auth.")).toBe(true)
    }
  })

  it("carries the attributes the __Host- prefix requires", () => {
    // A browser refuses to store a `__Host-` cookie without all three.
    expect(BETA_COOKIE_ATTRIBUTES.secure).toBe(true)
    expect(BETA_COOKIE_ATTRIBUTES.path).toBe("/")
    expect(BETA_COOKIE_ATTRIBUTES).not.toHaveProperty("domain")
    expect(BETA_COOKIE_ATTRIBUTES.httpOnly).toBe(true)
  })
})

describe("beta rate-limit policy", () => {
  it("keeps sign-in tighter than the built-in rule it replaces", () => {
    // A custom rule REPLACES Better Auth's 3-per-10s special rule rather than
    // stacking with it; 3/10s allows 18/minute, so the replacement has to be
    // below that to be an improvement.
    const rule = BETA_RATE_LIMIT_RULES["/sign-in/email"]
    expect((rule.max / rule.window) * 60).toBeLessThan(18)
  })

  it("gives the setup-link consume its own budget", () => {
    expect(BETA_CONSUME_RATE_LIMIT.max).toBeLessThanOrEqual(10)
    expect(BETA_CONSUME_RATE_LIMIT.window).toBeGreaterThanOrEqual(300)
  })
})
