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
const { RequireHumanActor } = await import("./require-human-actor.decorator")

const verifyApiKeyMock = vi.mocked(verifyApiKey)

/** Routes the fake ExecutionContext can point at. */
class FakeController {
  @RequireScopes("accounting:write")
  scopedWrite() {}

  plainRead() {}

  @RequireHumanActor()
  humanOnlyRoute() {}
}

@RequireHumanActor()
class FakeHumanOnlyController {
  anyRoute() {}
}

/** Fake ExecutionContext carrying the given request headers + target route. */
function makeContext(
  headers: Record<string, string>,
  handler: (...args: never[]) => unknown = FakeController.prototype.plainRead,
  controllerClass: unknown = FakeController,
) {
  const req: { headers: Record<string, string>; principal?: unknown } = {
    headers,
  }
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => controllerClass,
  } as unknown as ExecutionContext
  return { ctx, req }
}

function principalWithScopes(
  scopes: string[],
  actorKind: "human" | "agent" = "human",
) {
  return {
    userId: "user-1",
    organizationId: "org-1",
    workspaceId: "ws-1",
    scopes,
    actorKind,
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

  describe("[I7 / #517] human-actor enforcement (@RequireHumanActor)", () => {
    const humanOnlyRoute = FakeController.prototype.humanOnlyRoute

    it("rejects an agent-actor key with 403, naming the reason", async () => {
      verifyApiKeyMock.mockResolvedValue(principalWithScopes(["read"], "agent"))
      const { ctx, req } = makeContext(
        { authorization: "Bearer affk_live_agent" },
        humanOnlyRoute,
      )
      const err: unknown = await guard.canActivate(ctx).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ForbiddenException)
      expect((err as ForbiddenException).message).toMatch(/human reviewer/i)
      expect(req.principal).toBeUndefined()
    })

    it("admits a human-actor key on the same route", async () => {
      const principal = principalWithScopes(["read"], "human")
      verifyApiKeyMock.mockResolvedValue(principal)
      const { ctx, req } = makeContext(
        { authorization: "Bearer affk_live_ok" },
        humanOnlyRoute,
      )
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.principal).toEqual(principal)
    })

    it("leaves an undecorated route unaffected by an agent-actor key", async () => {
      verifyApiKeyMock.mockResolvedValue(principalWithScopes(["read"], "agent"))
      const { ctx } = makeContext({ authorization: "Bearer affk_live_agent" })
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
    })

    it("enforces a CLASS-level @RequireHumanActor() the same way a method-level one does", async () => {
      // Mirrors the real HeldWritesController, which decorates the whole class
      // so every current AND future route inherits the deny by default.
      verifyApiKeyMock.mockResolvedValue(principalWithScopes(["read"], "agent"))
      const { ctx } = makeContext(
        { authorization: "Bearer affk_live_agent" },
        FakeHumanOnlyController.prototype.anyRoute,
        FakeHumanOnlyController,
      )
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
        ForbiddenException,
      )
    })
  })
})
