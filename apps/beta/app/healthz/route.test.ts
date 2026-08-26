import { describe, expect, it } from "vitest"

import { GET } from "./route"

describe("GET /healthz", () => {
  it("answers 200 with a JSON liveness body", async () => {
    const response = GET()
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    await expect(response.json()).resolves.toEqual({ ok: true })
  })
})
