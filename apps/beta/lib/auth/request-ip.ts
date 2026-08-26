/**
 * Client identity for rate limiting and for the setup-link consume forensics
 * (`user_setup_token.consumed_ip` / `consumed_user_agent`).
 *
 * `cf-connecting-ip` ONLY. Beta is reachable exclusively through its own
 * Cloudflare Tunnel (`infra/cdk/lib/beta-app-stack.ts` — the Fargate task has
 * no public ingress), and Cloudflare always overwrites that header with the
 * true connecting address. `x-forwarded-for` is deliberately not consulted:
 * Cloudflare APPENDS to any inbound XFF list, so its first hop is attacker-
 * controlled and would let one client rotate fake IPs past the limiter.
 *
 * Absent header = a direct hit, which in this environment means local dev. The
 * value is null then, and every caller must treat null as "no IP": the consume
 * columns stay NULL (`inet` would reject a placeholder anyway) and the limiter
 * falls back to a single shared bucket rather than failing open.
 */

const FALLBACK_KEY = "unknown-ip"

export function clientIp(headers: Headers): string | null {
  const value = headers.get("cf-connecting-ip")?.trim()
  return value ? value : null
}

/**
 * Rate-limit bucket key. Without a client IP every caller shares one bucket —
 * strictly safer than skipping the limit, and unreachable in the deployed
 * environment.
 */
export function rateLimitKey(headers: Headers, scope: string): string {
  return `${scope}:${clientIp(headers) ?? FALLBACK_KEY}`
}

/** Truncated so a hostile UA string cannot bloat the row. */
export function clientUserAgent(headers: Headers): string | null {
  const value = headers.get("user-agent")?.trim()
  if (!value) return null
  return value.slice(0, 512)
}
