import { describe, expect, it, vi } from "vitest"
import { Afframe, RateLimitError } from "./index"

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  })
}

function client(fetchImpl: typeof fetch) {
  return new Afframe({
    apiKey: "affk_test_fixture",
    baseUrl: "https://api.test.local",
    fetch: fetchImpl,
  })
}

describe("Afframe SDK", () => {
  it("ping returns the typed envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        principal: {
          organizationId: "00000000-0000-4000-8000-000000000001",
          workspaceId: "00000000-0000-4000-8000-000000000002",
        },
      }),
    )
    const afframe = client(fetchImpl as unknown as typeof fetch)
    const res = await afframe.meta.ping()
    expect(res.ok).toBe(true)
    expect(res.principal.organizationId).toMatch(/^[0-9a-f-]{36}$/)

    const call = fetchImpl.mock.calls[0]!
    expect(call[0]).toBe("https://api.test.local/v1/ping")
    expect((call[1] as RequestInit).headers).toMatchObject({
      authorization: "Bearer affk_test_fixture",
      accept: "application/json",
    })
  })

  it("throws UnauthorizedError on 401 with the Plaid envelope intact", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "unauthorized",
            error_type: "UNAUTHORIZED",
            message: "Missing API key",
            documentation_url:
              "https://api.afframe.com/docs/errors#unauthorized",
            requestId: "req-123",
          },
        },
        { status: 401 },
      ),
    )
    const afframe = client(fetchImpl as unknown as typeof fetch)
    await expect(afframe.meta.ping()).rejects.toMatchObject({
      name: "UnauthorizedError",
      code: "unauthorized",
      errorType: "UNAUTHORIZED",
      requestId: "req-123",
      documentationUrl: "https://api.afframe.com/docs/errors#unauthorized",
    })
  })

  it("throws RateLimitError with retryAfter parsed from Retry-After", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "rate_limited",
            error_type: "RATE_LIMITED",
            message: "Rate limit exceeded",
            documentation_url:
              "https://api.afframe.com/docs/errors#rate_limited",
            requestId: "req-456",
          },
        },
        { status: 429, headers: { "retry-after": "42" } },
      ),
    )
    const afframe = client(fetchImpl as unknown as typeof fetch)
    let caught: unknown
    try {
      await afframe.organization.get()
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(RateLimitError)
    expect((caught as RateLimitError).retryAfter).toBe(42)
  })

  it("rejects construction without an API key", () => {
    expect(
      () => new Afframe({ apiKey: "" } as unknown as { apiKey: string }),
    ).toThrow(/apiKey is required/)
  })
})
