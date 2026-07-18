import { describe, expect, it } from "vitest"
import { buildClient } from "./client"

describe("buildClient", () => {
  it("returns a usable openapi-fetch client", () => {
    const client = buildClient("affk_test_fixture")
    expect(typeof client.GET).toBe("function")
    expect(typeof client.POST).toBe("function")
  })

  it("returns a fresh client per call (request-scoped, no shared singleton)", () => {
    // The hosted Worker builds one client per request from the caller's bearer;
    // two calls must never hand back the same instance (no cross-request principal).
    const a = buildClient("affk_test_a")
    const b = buildClient("affk_test_b")
    expect(a).not.toBe(b)
  })
})
