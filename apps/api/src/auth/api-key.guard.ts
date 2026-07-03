import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import type { Request } from "express"
import {
  verifyApiKey,
  type ApiKeyPrincipal,
} from "@workspace/auth/api-key-verifier"

import { REQUIRED_SCOPES_KEY } from "./require-scopes.decorator"

/** Express request after a successful ApiKeyGuard pass. */
export interface AuthedRequest extends Request {
  principal?: ApiKeyPrincipal
}

/**
 * Guards `/v1/*` routes. Resolves `Authorization: Bearer affk_...` into an
 * ApiKeyPrincipal via `verifyApiKey` (@workspace/auth) and attaches it to the
 * request. Rejections surface as 401 through the DomainExceptionFilter.
 *
 * Applied per-controller (`@UseGuards(ApiKeyGuard)`) — never globally — so the
 * version-neutral `/api/health` route stays open.
 *
 * After the key resolves, routes decorated with `@RequireScopes(...)` are
 * additionally checked against `api_key.scopes`: every required scope must be
 * present, else 403. A legacy key with an EMPTY scopes array passes with a
 * logged warning (see require-scopes.decorator.ts for the back-compat rule).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name)

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>()
    const header = req.headers.authorization
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing API key")
    }
    const rawKey = header.slice("Bearer ".length).trim()
    const principal = await verifyApiKey(rawKey)
    if (!principal) {
      throw new UnauthorizedException("Invalid or expired API key")
    }
    this.enforceScopes(context, principal)
    req.principal = principal
    return true
  }

  private enforceScopes(
    context: ExecutionContext,
    principal: ApiKeyPrincipal,
  ): void {
    const required = this.reflector.getAllAndMerge<string[]>(
      REQUIRED_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (required.length === 0) return

    if (principal.scopes.length === 0) {
      // Back-compat: an empty scopes array marks a legacy full-access key.
      // Allowed for now; flips to deny once issued keys carry scopes.
      this.logger.warn(
        `Legacy API key with empty scopes granted [${required.join(", ")}] ` +
          `(organization ${principal.organizationId})`,
      )
      return
    }

    const missing = required.filter((s) => !principal.scopes.includes(s))
    if (missing.length > 0) {
      throw new ForbiddenException(
        `API key is missing required scope(s): ${missing.join(", ")}`,
      )
    }
  }
}
