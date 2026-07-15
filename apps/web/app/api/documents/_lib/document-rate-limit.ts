/**
 * In-memory sliding-window rate limiter for the authenticated document routes
 * (presign-upload, confirm, mint-url). These are the cost-bearing ingest/egress
 * paths — a flood of presigns mints S3 objects (storage bill) and a flood of
 * url mints signs egress URLs. Bytes never touch our compute (direct-to-S3), so
 * the risk is the S3 bill, not our memory: this limiter caps issuance velocity
 * to bound how fast that bill can grow and to buy reaction time. The absolute
 * bill ceiling is the per-workspace storage quota (follow-up, GH #729).
 *
 * Three independent windows per request — exceeding ANY one blocks:
 *   - Per-user:      60s window,  90 requests
 *   - Per-workspace: 1h window,  900 requests
 *   - Per-IP:        60s window, 180 requests
 *
 * Mirrors the signup limiter (`apps/web/lib/signup-rate-limit.ts`): Better
 * Auth's internal limiter does not guard our custom route handlers, so we
 * hand-roll a minimal one. The store is process-local (Map) — under horizontal
 * scale each Fargate task tracks its own window (effective limit N * cap),
 * acceptable given the short TTLs and Cloudflare Tunnel's sticky routing. Swap
 * the Map for a distributed store (Redis/Upstash) without changing callers.
 */

const USER_WINDOW_MS = 60_000
const USER_LIMIT = 90
const WORKSPACE_WINDOW_MS = 3_600_000
const WORKSPACE_LIMIT = 900
const IP_WINDOW_MS = 60_000
const IP_LIMIT = 180

interface WindowEntry {
  attempts: number
  windowStart: number
}

interface Bucket {
  store: Map<string, WindowEntry>
  windowMs: number
  limit: number
}

const userBucket: Bucket = {
  store: new Map(),
  windowMs: USER_WINDOW_MS,
  limit: USER_LIMIT,
}
const workspaceBucket: Bucket = {
  store: new Map(),
  windowMs: WORKSPACE_WINDOW_MS,
  limit: WORKSPACE_LIMIT,
}
const ipBucket: Bucket = {
  store: new Map(),
  windowMs: IP_WINDOW_MS,
  limit: IP_LIMIT,
}

/**
 * Consumes one token from `bucket` for `key`. Returns the seconds until the
 * window resets if the limit is already exhausted, or `null` if allowed.
 */
function consume(bucket: Bucket, key: string, now: number): number | null {
  const entry = bucket.store.get(key)

  if (!entry || now - entry.windowStart >= bucket.windowMs) {
    // New or expired window — start fresh, first attempt always allowed.
    bucket.store.set(key, { attempts: 1, windowStart: now })
    return null
  }

  if (entry.attempts >= bucket.limit) {
    const retryAfterMs = bucket.windowMs - (now - entry.windowStart)
    return Math.max(1, Math.ceil(retryAfterMs / 1000))
  }

  entry.attempts++
  return null
}

export interface DocumentRateLimitInput {
  userId: string
  workspaceId: string
  /** Truncated client IP. Null skips the per-IP window. */
  ip: string | null
  /** Injected clock for deterministic tests; defaults to `Date.now()`. */
  now?: number
}

export interface DocumentRateLimitDecision {
  blocked: boolean
  /** Which window tripped (most-constraining first): for the 429 body. */
  scope?: "user" | "workspace" | "ip"
  /** Seconds until the tripped window resets — for the `Retry-After` header. */
  retryAfterSeconds?: number
}

/**
 * Charges one request against all three windows. All are consumed (so a
 * blocked request still counts, keeping an attacker throttled), and the first
 * window that trips determines the reported scope.
 */
export function checkDocumentRateLimit(
  input: DocumentRateLimitInput,
): DocumentRateLimitDecision {
  const now = input.now ?? Date.now()

  const userRetry = consume(userBucket, input.userId, now)
  const workspaceRetry = consume(workspaceBucket, input.workspaceId, now)
  const ipRetry = input.ip ? consume(ipBucket, input.ip, now) : null

  if (userRetry !== null) {
    return { blocked: true, scope: "user", retryAfterSeconds: userRetry }
  }
  if (workspaceRetry !== null) {
    return {
      blocked: true,
      scope: "workspace",
      retryAfterSeconds: workspaceRetry,
    }
  }
  if (ipRetry !== null) {
    return { blocked: true, scope: "ip", retryAfterSeconds: ipRetry }
  }
  return { blocked: false }
}

/** Reset every window — test helper only. */
export function _resetDocumentRateLimitForTesting(): void {
  userBucket.store.clear()
  workspaceBucket.store.clear()
  ipBucket.store.clear()
}
