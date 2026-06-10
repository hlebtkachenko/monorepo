import { Injectable, type ExecutionContext } from "@nestjs/common"
import { ThrottlerGuard, type ThrottlerLimitDetail } from "@nestjs/throttler"
import type { Request, Response } from "express"
import { hashApiKey } from "@workspace/auth/tokens"

/**
 * Resolve the rate-limit bucket key for a request.
 *
 * Keying on `sha256(bearer token)` gives each API key its own quota.
 * Unauthenticated requests (no bearer) fall back to IP — that covers the
 * public endpoints (/v1/status, /v1/feedback), where per-client buckets only
 * work because main.ts sets `trust proxy` to resolve the real client IP
 * through the Cloudflare Tunnel hop (otherwise every caller would collapse
 * into the sidecar's loopback bucket).
 *
 * The token is hashed, never used raw, so a tracker key cannot leak a usable
 * credential into throttler storage or logs.
 */
export function resolveThrottleKey(
  authHeader: string | undefined,
  ip: string | undefined,
): string {
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const raw = authHeader.slice("Bearer ".length).trim()
    if (raw) return `key:${hashApiKey(raw)}`
  }
  return `ip:${ip ?? "unknown"}`
}

/**
 * Throttler guard that rate-limits per API key (see {@link resolveThrottleKey})
 * and emits the IETF `RateLimit-*` response headers (per
 * `draft-ietf-httpapi-ratelimit-headers`) instead of the older `X-RateLimit-*`
 * names. `Retry-After` on 429 is set by the parent class.
 *
 * The override happens via the property initializer — subclass fields run
 * AFTER the parent constructor body, so reassigning `headerPrefix` here wins
 * over the parent's default `"X-RateLimit"`. See docs/api/RATE-LIMITS.md.
 */
@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  protected override headerPrefix = "RateLimit"

  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const request = req as unknown as Request
    return resolveThrottleKey(request.headers?.authorization, request.ip)
  }

  /**
   * The parent class sets the `RateLimit-*` quota headers only on ALLOWED
   * responses and bare `Retry-After` on the 429 — but the published
   * contract (docs/api/RATE-LIMITS.md §2 + the OpenAPI 429 response)
   * promises the IETF quota headers on the 429 itself. Set them before
   * the parent throws; the DomainExceptionFilter then renders the
   * `rate_limited` envelope body.
   */
  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context) as unknown as {
      res: Response
    }
    res.header(`${this.headerPrefix}-Limit`, String(detail.limit))
    res.header(`${this.headerPrefix}-Remaining`, "0")
    res.header(`${this.headerPrefix}-Reset`, String(detail.timeToBlockExpire))
    await super.throwThrottlingException(context, detail)
  }
}
