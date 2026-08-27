/**
 * Fixed-window in-memory rate limiter for the Server Action paths that Better
 * Auth's own limiter never sees (the setup-link and password-reset consumes).
 *
 * In-memory is the right storage here for the same reason Better Auth's own
 * limiter uses it in this environment: the beta service runs a single Fargate
 * task (`desiredCount: 1`, plan Part 1), so one process holds the whole
 * counter. A restart clears it — acceptable for a budget whose job is to stop
 * automated grinding, not to be a durable ledger.
 *
 * The clock is injectable so the window behaviour is testable without waiting.
 */

export type RateLimitRule = { readonly window: number; readonly max: number }

export type RateLimitVerdict =
  { allowed: true } | { allowed: false; retryAfterSeconds: number }

type Bucket = { count: number; resetAt: number }

export type RateLimiter = ((
  key: string,
  rule: RateLimitRule,
) => RateLimitVerdict) & {
  /** Drop every bucket. Test-only — go through `resetRateLimitersForTests`. */
  reset(): void
}

/** Exported only so a test can start from a clean slate. */
export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, Bucket>()

  const consume = function consume(
    key: string,
    rule: RateLimitRule,
  ): RateLimitVerdict {
    const t = now()
    const bucket = buckets.get(key)

    if (!bucket || t >= bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: t + rule.window * 1000 })
      // Opportunistic sweep: without it a long-lived process accumulates one
      // entry per distinct key forever.
      if (buckets.size > 1000) {
        for (const [k, v] of buckets) if (t >= v.resetAt) buckets.delete(k)
      }
      return { allowed: true }
    }

    if (bucket.count >= rule.max) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - t) / 1000)),
      }
    }

    bucket.count += 1
    return { allowed: true }
  } as RateLimiter

  consume.reset = (): void => buckets.clear()
  return consume
}

/** Process-wide limiter shared by the consume actions. */
export const consumeRateLimiter = createRateLimiter()

/**
 * Separate instances rather than one limiter with prefixed keys.
 *
 * The budgets protect different things and are read by different reviewers: a
 * shared instance means one surface's traffic can evict another's bucket
 * through the opportunistic sweep, and it makes "what is the limit on X" a
 * question about key formatting rather than about a named constant.
 */

/** GET on the one-time-link screens (`peekSetupToken`). */
export const peekRateLimiter = createRateLimiter()

/**
 * The floor under Better Auth's own limiter, for requests it would skip because
 * no client IP could be determined. See `BETA_AUTH_NO_IP_RATE_LIMIT`.
 */
export const authNoIpRateLimiter = createRateLimiter()

/** Setup-link issuance from /admin. A cap on a stolen office session. */
export const officeIssueRateLimiter = createRateLimiter()

/**
 * Setup-link issuance from Nastavení › Lidé — a SEPARATE instance from the
 * office one above, deliberately.
 *
 * Both are blast-radius caps on a stolen session rather than anti-guessing
 * budgets, but they cap different blasts: /admin can mint into every book in the
 * database, Lidé into exactly one. Sharing a limiter would let a busy office
 * afternoon exhaust a client company's budget (and the reverse), and the
 * opportunistic sweep in `createRateLimiter` would let one surface's traffic
 * evict the other's buckets.
 */
export const orgInviteRateLimiter = createRateLimiter()

/**
 * The agent ingestion API's two budgets (`lib/agent/auth.ts`).
 *
 * Separate instances, and separate from every limiter above: the IP bucket is
 * spent by unauthenticated traffic before a key is hashed, the key bucket only
 * by a credential that already resolved. Folding either into a shared limiter
 * would let one surface's traffic evict the other's bucket through the
 * opportunistic sweep.
 */
export const agentIpRateLimiter = createRateLimiter()
export const agentKeyRateLimiter = createRateLimiter()

/**
 * EVERY LIMITER ABOVE IS PROCESS-WIDE STATE THAT A TEST CAN SPEND, AND UNTIL NOW
 * THERE WAS NO WAY TO GET IT BACK.
 *
 * `createRateLimiter`'s doc says it is "exported only so a test can start from a
 * clean slate", which works for testing the ALGORITHM and not at all for testing
 * the WIRING: `lib/agent/auth.ts` reaches for `agentKeyRateLimiter` by name, so a
 * test of the agent API spends the real singleton and every later test in the
 * file inherits a partly-spent minute. Three different suites had already grown
 * three different workarounds for this — an ordering rule ("LAST IN THE FILE ON
 * PURPOSE"), a per-describe credential so blocks cannot starve each other, and a
 * counter that hands every caller a synthetic IP — and each one makes test order
 * load-bearing, which is the property that turns a real failure into a 429 on
 * whichever assertion happened to run last.
 *
 * Cross-FILE, Vitest's default `isolate: true` re-imports the module and hands
 * each file fresh singletons, so the damage is contained today. That containment
 * is an unasserted side effect of a performance setting: `vitest.config.ts`
 * already documents shared-container coupling as the reason for
 * `fileParallelism: false`, and the next person tuning that block for speed can
 * reach `isolate: false` without ever learning that seven limiters depend on it.
 *
 * So the reset is explicit and callable. A suite that touches a shared limiter
 * calls it in `beforeEach` and stops caring what ran before it.
 */
const ALL_RATE_LIMITERS: readonly RateLimiter[] = [
  consumeRateLimiter,
  peekRateLimiter,
  authNoIpRateLimiter,
  officeIssueRateLimiter,
  orgInviteRateLimiter,
  agentIpRateLimiter,
  agentKeyRateLimiter,
]

export function resetRateLimitersForTests(): void {
  // Same guard as `setDocumentStoreForTests`: a reachable "forget every budget"
  // switch is a rate limiter with an off button, and the one caller that wants
  // it never runs in production.
  if (process.env.NODE_ENV === "production") {
    throw new Error("resetRateLimitersForTests is not callable in production")
  }
  for (const limiter of ALL_RATE_LIMITERS) limiter.reset()
}
