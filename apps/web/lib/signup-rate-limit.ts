/**
 * In-memory sliding-window rate limiter for the signup entry points.
 *
 * Covers /auth/signup/start (legacy path) and /auth/signup/landing (POST).
 * Better Auth's internal limiter does NOT guard our custom route handlers
 * (BA issue #3264), so we hand-roll a minimal one here.
 *
 * Two independent windows per request:
 *   - Per-IP:    60s window, 10 attempts
 *   - Per-email: 60s window,  5 attempts
 *
 * The store is process-local (Map). This is intentional:
 *   - In-process store is zero-dependency and safe for single-instance dev.
 *   - Under horizontal scale (Fargate multi-task), each task tracks its own
 *     window. The effective per-email limit across N tasks is N * 5, which
 *     is acceptable given the 60s TTL and that the same task handles most
 *     retries from the same client due to sticky routing via Cloudflare Tunnel.
 *     A distributed store (Redis/Upstash) can replace the Map without changing
 *     callers — just swap the implementation below.
 *
 * Usage:
 *   const blocked = checkSignupRateLimit({ ip, email })
 *   if (blocked) return INVALID_RESPONSE
 */

interface WindowEntry {
  attempts: number
  windowStart: number
}

const WINDOW_MS = 60_000
const IP_LIMIT = 10
const EMAIL_LIMIT = 5

const ipStore = new Map<string, WindowEntry>()
const emailStore = new Map<string, WindowEntry>()

function check(
  store: Map<string, WindowEntry>,
  key: string,
  limit: number,
): boolean {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    // New or expired window — start fresh, first attempt is always allowed.
    store.set(key, { attempts: 1, windowStart: now })
    return false
  }

  if (entry.attempts >= limit) {
    return true
  }

  entry.attempts++
  return false
}

export interface RateLimitInput {
  /** Truncated client IP (IPv4 /24 or IPv6 /48). Null skips IP check. */
  ip: string | null
  /** Normalized email. Null skips email check. */
  email: string | null
}

/**
 * Returns true if the request should be blocked (rate limit exceeded),
 * false if it should proceed. Both checks run independently — either
 * exceeding the IP or the email limit blocks the request.
 */
export function checkSignupRateLimit(input: RateLimitInput): boolean {
  let blocked = false

  if (input.ip) {
    blocked = check(ipStore, input.ip, IP_LIMIT) || blocked
  }

  if (input.email) {
    const normalizedEmail = input.email.trim().toLowerCase()
    blocked = check(emailStore, normalizedEmail, EMAIL_LIMIT) || blocked
  }

  return blocked
}

/** Reset stores — test helper only. */
export function _resetRateLimitStoresForTesting(): void {
  ipStore.clear()
  emailStore.clear()
}
