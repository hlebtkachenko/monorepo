/**
 * In-memory token-bucket throttle, keyed by client IP. Suitable for the
 * single-container Phase C deploy; move to Redis (Upstash) when the docs
 * service horizontally scales — until then, an in-process Map keeps the
 * dependency surface minimal.
 *
 * Bucket = 30 tokens, refill 1 token / 6 s (= 10 / minute). Each Ask AI
 * call costs 1 token. A burst of 30 calls drains the bucket, then the
 * caller waits ~6 s per question.
 */

const CAPACITY = 30
const REFILL_INTERVAL_MS = 6_000
const MAX_BUCKETS = 10_000

interface Bucket {
  tokens: number
  lastRefillMs: number
}

const buckets = new Map<string, Bucket>()

export interface ConsumeResult {
  ok: boolean
  remaining: number
  retryAfterMs: number
}

export function consume(key: string, cost = 1): ConsumeResult {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { tokens: CAPACITY, lastRefillMs: now }
    if (buckets.size >= MAX_BUCKETS)
      buckets.delete(buckets.keys().next().value!)
    buckets.set(key, bucket)
  }
  const elapsed = now - bucket.lastRefillMs
  if (elapsed > 0) {
    bucket.tokens = Math.min(
      CAPACITY,
      bucket.tokens + elapsed / REFILL_INTERVAL_MS,
    )
    bucket.lastRefillMs = now
  }
  if (bucket.tokens >= cost) {
    bucket.tokens -= cost
    return {
      ok: true,
      remaining: Math.floor(bucket.tokens),
      retryAfterMs: 0,
    }
  }
  const deficit = cost - bucket.tokens
  return {
    ok: false,
    remaining: 0,
    retryAfterMs: Math.ceil(deficit * REFILL_INTERVAL_MS),
  }
}

export function resetForTests(): void {
  buckets.clear()
}
