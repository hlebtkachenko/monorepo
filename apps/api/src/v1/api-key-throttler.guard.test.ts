import { describe, expect, it } from "vitest"

import { hashApiKey } from "@workspace/auth/tokens"
import { resolveThrottleKey } from "./api-key-throttler.guard"

describe("resolveThrottleKey", () => {
  it("keys on the hashed bearer token when one is present", () => {
    const raw = "affk_live_sometoken"
    expect(resolveThrottleKey(`Bearer ${raw}`, "203.0.113.1")).toBe(
      `key:${hashApiKey(raw)}`,
    )
  })

  it("never puts the raw token in the bucket key", () => {
    const key = resolveThrottleKey("Bearer affk_live_secret", undefined)
    expect(key).not.toContain("affk_live_secret")
  })

  it("falls back to the client IP when there is no bearer token", () => {
    expect(resolveThrottleKey(undefined, "203.0.113.9")).toBe("ip:203.0.113.9")
    expect(resolveThrottleKey("Basic abc", "203.0.113.9")).toBe(
      "ip:203.0.113.9",
    )
  })

  it("falls back to a stable sentinel when neither token nor IP is known", () => {
    expect(resolveThrottleKey(undefined, undefined)).toBe("ip:unknown")
  })
})
