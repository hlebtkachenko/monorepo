import { Test, type TestingModule } from "@nestjs/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { StatusController } from "./status.controller"

/**
 * `GET /v1/status` proxies status.afframe.com (OpenStatus) with a graceful
 * fallback. Tests pin the three documented paths:
 *
 *   1. OpenStatus returns a well-formed payload → `source: "openstatus"`,
 *      status + components mirrored.
 *   2. OpenStatus returns garbage (bad shape, wrong types) → coercion
 *      collapses unknowns to `"operational"` and drops invalid components.
 *   3. OpenStatus is unreachable / times out / non-2xx → synthesized
 *      `source: "fallback"`, status `"operational"`, empty components.
 *
 * Network is mocked via the global `fetch`; no real HTTP is issued.
 */

describe("StatusController", () => {
  let controller: StatusController
  const realFetch = globalThis.fetch

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatusController],
    }).compile()
    controller = module.get(StatusController)
  })

  afterEach(() => {
    globalThis.fetch = realFetch
    vi.restoreAllMocks()
  })

  function mockFetch(impl: (input: RequestInfo | URL) => Promise<Response>) {
    globalThis.fetch = vi.fn(impl) as unknown as typeof fetch
  }

  it("returns source=openstatus when status.afframe.com responds 200", async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            status: "degraded_performance",
            components: [
              { name: "Public API", status: "operational" },
              { name: "Web", status: "degraded_performance" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const result = await controller.getStatus()
    expect(result.source).toBe("openstatus")
    expect(result.status).toBe("degraded_performance")
    expect(result.components).toHaveLength(2)
    expect(result.components[0]).toEqual({
      name: "Public API",
      status: "operational",
    })
    expect(result.statusPageUrl).toBe("https://status.afframe.com")
    expect(typeof result.fetchedAt).toBe("string")
  })

  it("coerces unknown status values to operational + drops invalid components", async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            status: "something-the-spec-doesnt-define",
            components: [
              { name: "Public API", status: "completely-broken" },
              "not-an-object",
              { name: 42, status: "operational" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const result = await controller.getStatus()
    expect(result.source).toBe("openstatus")
    // Unknown top-level status -> "operational".
    expect(result.status).toBe("operational")
    // String entry dropped by Array.isArray check + type guard; object
    // entries kept with coerced fields.
    expect(result.components).toHaveLength(2)
    expect(result.components[0]).toEqual({
      name: "Public API",
      // Component status coerced from unknown -> operational.
      status: "operational",
    })
    // Non-string name coerced to "Unknown" by the guard.
    expect(result.components[1]).toEqual({
      name: "Unknown",
      status: "operational",
    })
  })

  it("falls back to synthesized operational when status.afframe.com is unreachable", async () => {
    mockFetch(async () => {
      throw new Error("ENETUNREACH")
    })
    const result = await controller.getStatus()
    expect(result.source).toBe("fallback")
    expect(result.status).toBe("operational")
    expect(result.components).toEqual([])
    expect(result.statusPageUrl).toBe("https://status.afframe.com")
  })

  it("falls back to synthesized operational on non-2xx upstream", async () => {
    mockFetch(async () => new Response("nope", { status: 503 }))
    const result = await controller.getStatus()
    expect(result.source).toBe("fallback")
    expect(result.status).toBe("operational")
  })
})
