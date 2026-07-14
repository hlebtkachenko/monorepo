import { describe, expect, it } from "vitest"

import { devCookiePrefix } from "./dev-cookie-prefix"

describe("devCookiePrefix", () => {
  it("namespaces the cookie by CONDUCTOR_PORT in dev", () => {
    expect(
      devCookiePrefix({ NODE_ENV: "development", CONDUCTOR_PORT: "55080" }),
    ).toBe("better-auth-55080")
  })

  it("gives a different prefix per workspace port", () => {
    const a = devCookiePrefix({
      NODE_ENV: "development",
      CONDUCTOR_PORT: "55080",
    })
    const b = devCookiePrefix({
      NODE_ENV: "development",
      CONDUCTOR_PORT: "55090",
    })
    expect(a).not.toBe(b)
  })

  it("returns undefined (default cookie name) in production, even with a port", () => {
    expect(
      devCookiePrefix({ NODE_ENV: "production", CONDUCTOR_PORT: "55080" }),
    ).toBeUndefined()
  })

  it("returns undefined when CONDUCTOR_PORT is unset", () => {
    expect(devCookiePrefix({ NODE_ENV: "development" })).toBeUndefined()
  })

  it("treats a non-production NODE_ENV (test) as dev", () => {
    expect(devCookiePrefix({ NODE_ENV: "test", CONDUCTOR_PORT: "40000" })).toBe(
      "better-auth-40000",
    )
  })
})
