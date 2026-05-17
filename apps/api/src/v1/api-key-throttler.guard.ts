import { Injectable } from "@nestjs/common"
import { ThrottlerGuard } from "@nestjs/throttler"
import type { Request } from "express"
import { hashApiKey } from "@workspace/auth/tokens"

/**
 * Resolve the rate-limit bucket key for a request.
 *
 * Behind the Cloudflare Tunnel every request reaches the api from the
 * cloudflared sidecar on 127.0.0.1, so an IP tracker collapses every caller
 * into one bucket. Keying on `sha256(bearer token)` gives each API key its
 * own quota. Unauthenticated requests (no bearer) fall back to IP — they are
 * 401'd by ApiKeyGuard anyway.
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

/** Throttler guard that rate-limits per API key (see {@link resolveThrottleKey}). */
@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const request = req as unknown as Request
    return resolveThrottleKey(request.headers?.authorization, request.ip)
  }
}
