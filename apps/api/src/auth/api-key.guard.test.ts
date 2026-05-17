import type { ExecutionContext } from "@nestjs/common"
import { UnauthorizedException } from "@nestjs/common"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@workspace/auth/api-key-verifier", () => ({
  verifyApiKey: vi.fn(),
}))

const { verifyApiKey } = await import("@workspace/auth/api-key-verifier")
const { ApiKeyGuard } = await import("./api-key.guard")

const verifyApiKeyMock = vi.mocked(verifyApiKey)

/** Fake ExecutionContext carrying the given request headers. */
function makeContext(headers: Record<string, string>) {
  const req: { headers: Record<string, string>; principal?: unknown } = {
    headers,
  }
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext
  return { ctx, req }
}

describe("ApiKeyGuard", () => {
  const guard = new ApiKeyGuard()

  beforeEach(() => {
    verifyApiKeyMock.mockReset()
  })

  it("rejects a request with no Authorization header", async () => {
    const { ctx } = makeContext({})
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    expect(verifyApiKeyMock).not.toHaveBeenCalled()
  })

  it("rejects an Authorization header that is not a Bearer token", async () => {
    const { ctx } = makeContext({ authorization: "Basic abc" })
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it("rejects a Bearer token the verifier does not recognise", async () => {
    verifyApiKeyMock.mockResolvedValue(null)
    const { ctx } = makeContext({ authorization: "Bearer affk_live_bad" })
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    expect(verifyApiKeyMock).toHaveBeenCalledWith("affk_live_bad")
  })

  it("admits a valid key and attaches the principal to the request", async () => {
    const principal = {
      userId: "user-1",
      organizationId: "org-1",
      workspaceId: "ws-1",
      scopes: ["read"] as const,
    }
    verifyApiKeyMock.mockResolvedValue(principal)
    const { ctx, req } = makeContext({ authorization: "Bearer affk_live_ok" })
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(req.principal).toEqual(principal)
  })
})
