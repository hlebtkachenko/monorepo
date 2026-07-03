/**
 * Admission caps — concurrent-run limiter + kill-switch (ADR-0028 §Decision.1).
 *
 * The marshrutizátor's first layer. Before a Brain run is admitted to the
 * accounting write path it must pass:
 *
 *   1. A kill-switch (`BRAIN_RUNTIME_ACTIVE`) — fails admission CLOSED when unset
 *      or not truthy, so a fresh/misconfigured deploy admits nothing until the
 *      runtime is explicitly turned on.
 *   2. A **global** concurrent-run cap — the whole API admits at most N runs at
 *      once, so no single spike (or all orgs together) can exhaust the pool.
 *   3. A **per-key** concurrent-run cap — each principal (per-org, via a
 *      `resolveThrottleKey`-style key) admits at most M runs at once, so one org
 *      cannot monopolize global capacity (starvation resistance, ADR-0028
 *      §Consequences).
 *
 * Policy: **reject over-cap** (not queue). A rejected caller gets an explicit
 * `AdmissionRejected` with a machine-readable `reason`; the API front door maps
 * that to 429/503. Queueing was rejected here: it adds unbounded in-memory state
 * and hidden latency, and the throttler already models back-pressure as an
 * immediate rejection the client retries. Serialization of the SAME (org, period)
 * is handled downstream by `withPeriodLock`, NOT by this limiter — admission is
 * about *how many* runs, the lock is about *ordering* same-key writes.
 *
 * This module is PURE / in-memory (no DB, no I/O) so it unit-tests without a
 * container. It is process-local: it caps concurrency within a single API
 * instance. Cross-instance global capacity would need shared state (Redis / a DB
 * counter) and is deferred with the rest of the #395 wiring; document, don't
 * over-build (ADR-0028 "compose, don't build").
 */

/** Why an admission attempt was rejected. Machine-readable for the API mapping. */
export type AdmissionRejectReason =
  | "kill_switch_inactive"
  | "global_cap_exceeded"
  | "per_key_cap_exceeded"

/** Thrown by {@link AdmissionController.acquire} when a run is not admitted. */
export class AdmissionRejected extends Error {
  readonly reason: AdmissionRejectReason
  constructor(reason: AdmissionRejectReason) {
    super(`admission rejected: ${reason}`)
    this.name = "AdmissionRejected"
    this.reason = reason
  }
}

export interface AdmissionCaps {
  /** Max concurrent admitted runs across the whole process. */
  readonly global: number
  /** Max concurrent admitted runs per key (per-org). */
  readonly perKey: number
}

/**
 * A handle returned by a successful {@link AdmissionController.acquire}. Call
 * `release()` exactly once when the run finishes (success OR failure) to free
 * its slot. Idempotent: a second `release()` is a no-op, so `try/finally` at the
 * call site is safe even on double-invocation.
 */
export interface AdmissionSlot {
  release(): void
}

/**
 * Read the `BRAIN_RUNTIME_ACTIVE` kill-switch. Fails CLOSED: only the exact
 * truthy strings `"true"` / `"1"` (case-insensitive, trimmed) admit; anything
 * else — unset, empty, `"false"`, `"0"`, garbage — denies.
 */
export function isBrainRuntimeActive(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env["BRAIN_RUNTIME_ACTIVE"]
  if (raw == null) return false
  const v = raw.trim().toLowerCase()
  return v === "true" || v === "1"
}

/**
 * In-memory concurrent-run admission controller: a global cap + a per-key cap +
 * the kill-switch. Construct one per process (a module singleton at the API
 * front door). Pure and synchronous — no DB, no timers.
 */
export class AdmissionController {
  private readonly caps: AdmissionCaps
  private readonly isActive: () => boolean
  private globalActive = 0
  private readonly perKeyActive = new Map<string, number>()

  constructor(caps: AdmissionCaps, options?: { isActive?: () => boolean }) {
    if (!Number.isInteger(caps.global) || caps.global < 0) {
      throw new Error(`AdmissionController: invalid global cap ${caps.global}`)
    }
    if (!Number.isInteger(caps.perKey) || caps.perKey < 0) {
      throw new Error(`AdmissionController: invalid perKey cap ${caps.perKey}`)
    }
    this.caps = caps
    this.isActive = options?.isActive ?? (() => isBrainRuntimeActive())
  }

  /** Current global in-flight count. Exposed for observability / tests. */
  get inFlight(): number {
    return this.globalActive
  }

  /** Current in-flight count for a key. Exposed for observability / tests. */
  inFlightFor(key: string): number {
    return this.perKeyActive.get(key) ?? 0
  }

  /**
   * Try to admit a run for `key` (the per-org throttle key). Returns a slot on
   * success; THROWS {@link AdmissionRejected} when the kill-switch is inactive
   * or a cap is exceeded. Checks are ordered kill-switch → global → per-key so
   * the reject reason is the most fundamental one.
   */
  acquire(key: string): AdmissionSlot {
    if (!this.isActive()) {
      throw new AdmissionRejected("kill_switch_inactive")
    }
    if (this.globalActive >= this.caps.global) {
      throw new AdmissionRejected("global_cap_exceeded")
    }
    const keyActive = this.perKeyActive.get(key) ?? 0
    if (keyActive >= this.caps.perKey) {
      throw new AdmissionRejected("per_key_cap_exceeded")
    }

    this.globalActive += 1
    this.perKeyActive.set(key, keyActive + 1)

    let released = false
    return {
      release: () => {
        if (released) return
        released = true
        this.globalActive -= 1
        const remaining = (this.perKeyActive.get(key) ?? 1) - 1
        if (remaining <= 0) {
          this.perKeyActive.delete(key)
        } else {
          this.perKeyActive.set(key, remaining)
        }
      },
    }
  }
}
