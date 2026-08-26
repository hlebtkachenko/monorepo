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
 * MUST BE AT LEAST AS STRICT AS `inet`. Whatever this accepts is written into
 * `user_setup_token.issued_ip` / `consumed_ip`, which are `inet` columns — so a
 * value Postgres refuses is not a bad log line, it is an exception that takes
 * down the whole issue-a-link or consume-a-link transaction. A request header
 * is the one input an operator cannot sanitise, which makes this the wrong
 * place to be approximate.
 *
 * `203.0.113.7:80` is the shape that catches a loose validator out: a
 * plausible `host:port` that `inet` rejects outright. An "any hex and colons"
 * check accepted it — split on `:` gives `["203.0.113.7", "80"]`, the first
 * passing as an embedded IPv4 and the second as a hex group. So the rule below
 * is the actual grammar: an embedded IPv4 is legal only as the LAST group, and
 * the group count has to add up.
 *
 * IT MUST NOT BE MUCH STRICTER EITHER. Better Auth applies its own validity
 * test before keying its limiter — `getIp` in 1.6.13 falls through to `null`
 * when the header does not parse — after which it SKIPS the limit entirely. If
 * this function disagreed in the other direction, the no-IP floor in
 * `authRateLimitKey` would fail to engage in exactly the case Better Auth
 * dropped.
 *
 * Shape, not semantics: no reserved-range checks, no canonicalization, and
 * deliberately no CIDR — `1.2.3.4/24` is a network, not a connecting address.
 */
const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
const HEX_GROUP = /^[0-9a-fA-F]{1,4}$/

export function isIpAddress(value: string): boolean {
  if (IPV4.test(value)) return true
  if (!value.includes(":")) return false
  return isIpv6(value)
}

function isIpv6(value: string): boolean {
  // A zone id (`fe80::1%eth0`) is legal in text, never appears in
  // `cf-connecting-ip`, and is rejected by `inet`. Refused, not stripped.
  if (value.includes("%") || value.includes("/")) return false

  const halves = value.split("::")
  if (halves.length > 2) return false
  const compressed = halves.length === 2

  // A stray `:` at either end that is not part of `::` leaves an empty group.
  const parse = (half: string): string[] | null => {
    if (half === "") return []
    const groups = half.split(":")
    return groups.some((group) => group === "") ? null : groups
  }

  const head = parse(halves[0] ?? "")
  const tail = parse(compressed ? (halves[1] ?? "") : "")
  if (head === null || tail === null) return false

  const groups = [...head, ...tail]
  let size = groups.length

  for (const [index, group] of groups.entries()) {
    if (HEX_GROUP.test(group)) continue
    // An embedded IPv4 (`::ffff:203.0.113.7`) is legal ONLY as the final group
    // and occupies two of the eight. Anywhere else it is the host:port shape.
    if (index === groups.length - 1 && IPV4.test(group)) {
      size += 1
      continue
    }
    return false
  }

  return compressed ? size <= 7 : size === 8
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
