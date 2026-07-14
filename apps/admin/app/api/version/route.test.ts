import { afterEach, describe, expect, it, vi } from "vitest"

import { GET } from "./route"

const SHA = "a".repeat(40)

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/version", () => {
  it("returns uncached build metadata", async () => {
    vi.stubEnv("BUILD_SHA", SHA)
    vi.stubEnv("BUILD_VERSION", "0.18.0-aaaaaaa")
    vi.stubEnv("BUILD_TIME", "2026-07-14T00:00:00Z")

    const response = GET()
    const payload = (await response.json()) as Record<string, unknown>

    expect(response.headers.get("Cache-Control")).toContain("no-store")
    expect(payload).toMatchObject({
      sha: SHA,
      version: "0.18.0-aaaaaaa",
      time: "2026-07-14T00:00:00Z",
    })
  })
})
