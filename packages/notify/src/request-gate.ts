// Request gating for the public client-error sinks (OBS-14). Extracted from the
// duplicated web + admin route handlers (DEV-81): a same-origin check plus an
// in-memory per-IP token bucket. Each importing app gets its own module
// instance, so the bucket is per-app and per-instance (limits multiply by task
// count and reset on restart) — accepted; the bot-side fingerprint dedup is the
// second line of defense.

/**
 * Resolve the client IP. Cloudflare always overwrites `cf-connecting-ip`;
 * behind the tunnel the LAST `x-forwarded-for` hop is the CF-appended real
 * client (earlier hops are spoofable).
 */
export function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")
  if (cf) return cf
  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    const last = xff.split(",").at(-1)?.trim()
    if (last) return last
  }
  return "unknown"
}

/**
 * True only when the request came from our own pages. Prefers the
 * `Sec-Fetch-Site` metadata; falls back to comparing the `Origin` host against
 * the public host (`x-forwarded-host` behind the Cloudflare Tunnel, since the
 * process-visible Host is the container listener — ADR-0008). A request with
 * neither header is not our reporter and is rejected.
 */
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site")
  if (site) return site === "same-origin"
  const origin = req.headers.get("origin")
  if (!origin) return false
  try {
    return (
      new URL(origin).host ===
      (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))
    )
  } catch {
    return false
  }
}

export interface RateLimiterOptions {
  /** Bucket size / burst ceiling. */
  capacity: number
  /** Tokens refilled per millisecond. */
  refillPerMs: number
  /** Clear the whole map once it exceeds this many IPs (memory bound). */
  maxTrackedIps: number
}

/**
 * In-memory per-IP token-bucket rate limiter. Returns an `allow(ip)` predicate
 * whose bucket map is closed over per call, so each route/app keeps its own
 * independent state.
 */
export function createRateLimiter(
  opts: RateLimiterOptions,
): (ip: string) => boolean {
  const buckets = new Map<string, { tokens: number; last: number }>()
  return function allow(ip: string): boolean {
    const now = Date.now()
    // Bound memory: a flood of distinct (spoofed) IPs would otherwise grow the
    // map without limit. Clearing resets everyone's bucket — acceptable trade.
    if (buckets.size > opts.maxTrackedIps) buckets.clear()
    const bucket = buckets.get(ip) ?? { tokens: opts.capacity, last: now }
    bucket.tokens = Math.min(
      opts.capacity,
      bucket.tokens + (now - bucket.last) * opts.refillPerMs,
    )
    bucket.last = now
    if (bucket.tokens < 1) {
      buckets.set(ip, bucket)
      return false
    }
    bucket.tokens -= 1
    buckets.set(ip, bucket)
    return true
  }
}
