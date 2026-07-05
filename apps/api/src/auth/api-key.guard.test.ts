import type { ExecutionContext } from "@nestjs/common"
import { ForbiddenException, UnauthorizedException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@workspace/auth/api-key-verifier", () => ({
  verifyApiKey: vi.fn(),
}))

const { verifyApiKey } = await import("@workspace/auth/api-key-verifier")
const { ApiKeyGuard } = await import("./api-key.guard")
const { RequireScopes } = await import("./require-scopes.decorator")

const verifyApiKeyMock = vi.mocked(verifyApiKey)

/** Routes the fake ExecutionContext can point at. */
class FakeController {
  @RequireScopes("accounting:write")
  scopedWrite() {}

  plainRead() {}
}

/** Fake ExecutionContext carrying the given request headers + target route. */
function makeContext(
  headers: Record<string, string>,
  handler: (...args: never[]) => unknown = FakeController.prototype.plainRead,
) {
  const req: { headers: Record<string, string>; principal?: unknown } = {
    headers,
  }
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => FakeController,
  } as unknown as ExecutionContext
  return { ctx, req }
}

function principalWithScopes(scopes: string[]) {
  return {
    userId: "user-1",
    organizationId: "org-1",
    workspaceId: "ws-1",
    scopes,
    actorKind: "human" as const,
  }
}

describe("ApiKeyGuard", () => {
  const guard = new ApiKeyGuard(new Reflector())

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
    const principal = principalWithScopes(["read"])
    verifyApiKeyMock.mockResolvedValue(principal)
    const { ctx, req } = makeContext({ authorization: "Bearer affk_live_ok" })
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(req.principal).toEqual(principal)
  })

  describe("scope enforcement (@RequireScopes)", () => {
    const scopedRoute = FakeController.prototype.scopedWrite

    it("rejects with 403 when the key lacks a required scope, naming it", async () => {
      verifyApiKeyMock.mockResolvedValue(principalWithScopes(["read"]))
      const { ctx, req } = makeContext(
        { authorization: "Bearer affk_live_ok" },
        scopedRoute,
      )
      const err: unknown = await guard.canActivate(ctx).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ForbiddenException)
      expect((err as ForbiddenException).message).toContain("accounting:write")
      expect(req.principal).toBeUndefined()
    })

    it("admits a key that carries the required scope", async () => {
      const principal = principalWithScopes(["read", "accounting:write"])
      verifyApiKeyMock.mockResolvedValue(principal)
      const { ctx, req } = makeContext(
        { authorization: "Bearer affk_live_ok" },
        scopedRoute,
      )
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.principal).toEqual(principal)
    })

    it("admits a legacy key with an EMPTY scopes array (back-compat)", async () => {
      const principal = principalWithScopes([])
      verifyApiKeyMock.mockResolvedValue(principal)
      const { ctx, req } = makeContext(
        { authorization: "Bearer affk_live_ok" },
        scopedRoute,
      )
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.principal).toEqual(principal)
    })

    it("leaves undecorated routes unaffected regardless of key scopes", async () => {
      const principal = principalWithScopes(["something:else"])
      verifyApiKeyMock.mockResolvedValue(principal)
      const { ctx } = makeContext({ authorization: "Bearer affk_live_ok" })
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
    })
  })
})
