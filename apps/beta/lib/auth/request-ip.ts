/**
 * Client identity for rate limiting and for the setup-link forensics
 * (`user_setup_token.issued_ip` / `consumed_ip`).
 *
 * `cf-connecting-ip` ONLY. Beta is reachable exclusively through its own
 * Cloudflare Tunnel (`infra/cdk/lib/beta-app-stack.ts` — the Fargate task has
 * no public ingress), and Cloudflare always overwrites that header with the
 * true connecting address. `x-forwarded-for` is deliberately not consulted:
 * Cloudflare APPENDS to any inbound XFF list, so its first hop is attacker-
 * controlled and would let one client rotate fake IPs past the limiter.
 *
 * Absent header = a direct hit, which in this environment means local dev. The
 * value is null then, and every caller must treat null as "no IP": the token
 * columns stay NULL (`inet` would reject a placeholder anyway) and the limiter
 * falls back to a single shared bucket rather than failing open.
 */

const FALLBACK_KEY = "unknown-ip"

/**
 * A value that is not address-SHAPED is treated as no address at all.
 *
 * Two reasons, and the second is the security one. `issued_ip` / `consumed_ip`
 * are `inet` columns, so a junk value turns a link issuance into a 500 rather
 * than a stored row. And Better Auth applies its own validity test before
 * keying its limiter — `getIp` in 1.6.13 falls through to `null` when the
 * header does not parse as an IP — after which it SKIPS the limit entirely. If
 * this function disagreed with that verdict, the no-IP floor in
 * `authRateLimitKey` would not engage in exactly the case Better Auth dropped.
 *
 * Shape, not semantics: no reserved-range checks, no canonicalization. The
 * value is written by Cloudflare, not by the client.
 */
const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
const IPV6_CHARS = /^[0-9a-fA-F:.]+$/

export function isIpAddress(value: string): boolean {
  if (IPV4.test(value)) return true
  // IPv6, including the IPv4-mapped `::ffff:203.0.113.7` form: hex groups and
  // colons only, at most one `::`, and never more than eight groups.
  if (!value.includes(":")) return false
  if (!IPV6_CHARS.test(value)) return false
  if (value.split("::").length > 2) return false
  const groups = value.split(":").filter((group) => group.length > 0)
  if (groups.length > 8) return false
  return groups.every(
    (group) => /^[0-9a-fA-F]{1,4}$/.test(group) || IPV4.test(group),
  )
}

export function clientIp(headers: Headers): string | null {
  const value = headers.get("cf-connecting-ip")?.trim()
  if (!value) return null
  return isIpAddress(value) ? value : null
}

/**
 * Rate-limit bucket key. Without a client IP every caller shares one bucket —
 * strictly safer than skipping the limit, and unreachable in the deployed
 * environment.
 */
export function rateLimitKey(headers: Headers, scope: string): string {
  return `${scope}:${clientIp(headers) ?? FALLBACK_KEY}`
}

/**
 * The key for the no-IP floor under Better Auth's limiter, or `null` when
 * Better Auth will key its own limiter normally and this floor must stay out of
 * the way.
 *
 * Per PATH rather than one bucket for the whole auth surface: the interesting
 * budget is `/sign-in/email`, and folding it in with `/sign-out` and everything
 * else would let cheap traffic spend the credential-guessing allowance.
 */
export function authRateLimitKey(
  headers: Headers,
  pathname: string,
): string | null {
  if (clientIp(headers) !== null) return null
  return `auth-no-ip:${pathname}`
}

/** Truncated so a hostile UA string cannot bloat the row. */
export function clientUserAgent(headers: Headers): string | null {
  const value = headers.get("user-agent")?.trim()
  if (!value) return null
  return value.slice(0, 512)
}
