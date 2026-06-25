/**
 * In-memory rate limiter for step-up re-auth attempts. Defends against a
 * leaked-password + TOTP brute-force: 10^6 codes ÷ 1 attempt/sec ≈ tractable.
 * With 5 attempts / 5 min ≈ 2 years to exhaust, well past any session.
 *
 * Per-instance memory: NOT cluster-safe. Acceptable today because the admin
 * surface runs a single Fargate task per environment; if we scale horizontally
 * later, swap the backing Map for a Redis sorted-set or a Postgres TTL row.
 */

const WINDOW_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 5

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitDecision {
  allowed: boolean
  remaining: number
  retryInSec: number
}

/**
 * Increment + check. Returns `allowed: false` after the 5th failed attempt
 * inside a 5-minute window. The window resets on the first failure AFTER
 * `resetAt`, not on each call — predictable for incident review.
 */
export function recordAttempt(key: string): RateLimitDecision {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryInSec: 0 }
  }
  if (b.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryInSec: Math.ceil((b.resetAt - now) / 1000),
    }
  }
  b.count += 1
  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - b.count,
    retryInSec: 0,
  }
}

/** Reset on successful verification so good attempts don't share the budget. */
export function clearAttempts(key: string): void {
  buckets.delete(key)
}

/** Test helper. Do not call from app code. */
export function _resetForTest(): void {
  buckets.clear()
}
