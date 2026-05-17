import { createParamDecorator, type ExecutionContext } from "@nestjs/common"
import type { OrgPrincipal } from "@workspace/domain"
import type { AuthedRequest } from "./api-key.guard.js"

/**
 * Injects the {@link OrgPrincipal} resolved by {@link ApiKeyGuard}. Only valid
 * on routes guarded by `ApiKeyGuard`; throws otherwise (a wiring bug, not a
 * client error).
 */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrgPrincipal => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>()
    if (!req.principal) {
      throw new Error("CurrentPrincipal used on a route without ApiKeyGuard")
    }
    return req.principal
  },
)
