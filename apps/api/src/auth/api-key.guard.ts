import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import type { Request } from "express"
import { verifyApiKey, type OrgPrincipal } from "@workspace/domain"

/** Express request after a successful ApiKeyGuard pass. */
export interface AuthedRequest extends Request {
  principal?: OrgPrincipal
}

/**
 * Guards `/v1/*` routes. Resolves `Authorization: Bearer affk_...` into an
 * OrgPrincipal via the `verifyApiKey` domain function and attaches it to the
 * request. Rejections surface as 401 through the DomainExceptionFilter.
 *
 * Applied per-controller (`@UseGuards(ApiKeyGuard)`) — never globally — so the
 * version-neutral `/api/health` route stays open.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
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
    req.principal = principal
    return true
  }
}
