import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { publicOrigin } from "./request-origin"

function mkRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers })
}

describe("publicOrigin", () => {
  const originalEnv = process.env.BETTER_AUTH_URL

  beforeEach(() => {
    delete process.env.BETTER_AUTH_URL
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BETTER_AUTH_URL
    } else {
      process.env.BETTER_AUTH_URL = originalEnv
    }
  })

  it("uses x-forwarded-host + x-forwarded-proto when set", () => {
    const req = mkRequest("http://0.0.0.0:3000/auth/signup/start", {
      "x-forwarded-host": "app-staging.afframe.com",
      "x-forwarded-proto": "https",
    })
    expect(publicOrigin(req)).toBe("https://app-staging.afframe.com")
  })

  it("defaults proto to https when x-forwarded-proto missing", () => {
    const req = mkRequest("http://0.0.0.0:3000/auth/signup/start", {
      "x-forwarded-host": "app-staging.afframe.com",
    })
    expect(publicOrigin(req)).toBe("https://app-staging.afframe.com")
  })

  it("falls back to BETTER_AUTH_URL when no forwarded host", () => {
    process.env.BETTER_AUTH_URL = "https://app-staging.afframe.com"
    const req = mkRequest("http://0.0.0.0:3000/auth/signup/start")
    expect(publicOrigin(req)).toBe("https://app-staging.afframe.com")
  })

  it("falls back to request origin when no header and no env", () => {
    const req = mkRequest("http://localhost:3010/auth/signup/start?token=x")
    expect(publicOrigin(req)).toBe("http://localhost:3010")
  })

  it("prefers x-forwarded-host over BETTER_AUTH_URL", () => {
    process.env.BETTER_AUTH_URL = "https://wrong.example.com"
    const req = mkRequest("http://0.0.0.0:3000/x", {
      "x-forwarded-host": "right.example.com",
    })
    expect(publicOrigin(req)).toBe("https://right.example.com")
  })
})
