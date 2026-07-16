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
 * TWO controllers, one contract ({@link AdmissionController}):
 *
 *   - {@link InMemoryAdmissionController} — PURE / in-memory (no DB, no I/O), so
 *     it unit-tests without a container. Process-local: it caps concurrency
 *     within a SINGLE API instance. Behind the multi-task Fargate service each
 *     container has its own counter, so N containers admit N× the intended cap.
 *   - {@link DbAdmissionController} — the cross-instance form (#472). Every
 *     admitted run holds a `scope='global'` + a `scope='org'` row in
 *     `brain_admission_slot`; `acquire` counts live rows across ALL instances
 *     inside one advisory-locked transaction, so the caps are enforced fleet-wide.
 *
 * The singleton (`apps/api/.../admission.singleton.ts`) picks the DB controller
 * when `ACCOUNTING_ADMISSION_SHARED=1`, else the in-memory default (zero prod
 * behavior change until the env is flipped).
 */

import { randomUUID } from "node:crypto"
import { sql as drizzleSql, type SQL } from "drizzle-orm"
import type postgres from "postgres"
import { sqlClient } from "./client"

/** Why an admission attempt was rejected. Machine-readable for the API mapping. */
export type AdmissionRejectReason =
  "kill_switch_inactive" | "global_cap_exceeded" | "per_key_cap_exceeded"

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
  /** Max concurrent admitted runs across the whole process (in-memory) or fleet (DB). */
  readonly global: number
  /** Max concurrent admitted runs per key (per-org). */
  readonly perKey: number
}

/**
 * A handle returned by a successful {@link AdmissionController.acquire}. Call
 * `release()` exactly once when the run finishes (success OR failure) to free
 * its slot. Idempotent: a second `release()` is a no-op, so `try/finally` at the
 * call site is safe even on double-invocation. `release()` is synchronous by
 * contract — the DB controller fires its row-delete without awaiting and never
 * throws, so a run never blocks (or breaks) its exit path on slot cleanup.
 */
export interface AdmissionSlot {
  release(): void
}

/**
 * The admission contract both controllers implement. `acquire` may be
 * synchronous (in-memory) or async (DB round-trip), so the return type is the
 * union; the single production caller (`runGatedWriteWithSeams`) always
 * `await`s it, which is a no-op for the synchronous form.
 *
 * THROWS {@link AdmissionRejected} when the kill-switch is inactive or a cap is
 * exceeded — same reasons, same ordering, for both implementations.
 */
export interface AdmissionController {
  acquire(key: string): AdmissionSlot | Promise<AdmissionSlot>
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

function assertValidCaps(caps: AdmissionCaps): void {
  if (!Number.isInteger(caps.global) || caps.global < 0) {
    throw new Error(`AdmissionController: invalid global cap ${caps.global}`)
  }
  if (!Number.isInteger(caps.perKey) || caps.perKey < 0) {
    throw new Error(`AdmissionController: invalid perKey cap ${caps.perKey}`)
  }
}

/**
 * In-memory concurrent-run admission controller: a global cap + a per-key cap +
 * the kill-switch. Construct one per process (a module singleton at the API
 * front door). Pure and synchronous — no DB, no timers. Process-local only; use
 * {@link DbAdmissionController} for cross-instance caps.
 */
export class InMemoryAdmissionController implements AdmissionController {
  private readonly caps: AdmissionCaps
  private readonly isActive: () => boolean
  private globalActive = 0
  private readonly perKeyActive = new Map<string, number>()

  constructor(caps: AdmissionCaps, options?: { isActive?: () => boolean }) {
    assertValidCaps(caps)
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

/** Sentinel `scope_key` for the whole-process cap rows (the count filters on `scope`). */
const GLOBAL_SCOPE_KEY = "global"
/** Dead-holder threshold for the inline reap: 3 missed 30s heartbeats. */
const INLINE_REAP_SECONDS = 90
/** Heartbeat cadence — must be well under {@link INLINE_REAP_SECONDS}. */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000

/**
 * Cross-instance concurrent-run admission controller (#472). Same contract +
 * same reject reasons as {@link InMemoryAdmissionController}, but the counter
 * lives in Postgres (`brain_admission_slot`) so the global + per-org caps are
 * enforced across every API container, not per-process.
 *
 * `acquire` runs ONE transaction: take a global advisory xact-lock (serialize
 * count-then-insert across instances) → inline-reap dead holders → count live
 * rows → reject over-cap → else insert a global + an org row and return a slot
 * handle. `release` deletes both rows (idempotent) and stops the heartbeat.
 *
 * pgbouncer safety (ADR-0028): every lock lives inside one transaction
 * (`pg_advisory_xact_lock`, auto-released at commit) — NO session state — so the
 * controller is correct behind transaction-mode pooling. Do not "optimize" the
 * xact-lock to a session lock; it would leak across pooled connections.
 */
export class DbAdmissionController implements AdmissionController {
  private readonly caps: AdmissionCaps
  private readonly sql: postgres.Sql
  private readonly isActive: () => boolean
  private readonly instanceId: string
  private readonly heartbeatIntervalMs: number

  constructor(
    caps: AdmissionCaps,
    options?: {
      /** Postgres client (defaults to the shared pooled `sqlClient`). */
      sql?: postgres.Sql
      isActive?: () => boolean
      /** Identifies this API instance in the slot rows. Defaults to a random uuid. */
      instanceId?: string
      heartbeatIntervalMs?: number
    },
  ) {
    assertValidCaps(caps)
    this.caps = caps
    this.sql = options?.sql ?? sqlClient
    this.isActive = options?.isActive ?? (() => isBrainRuntimeActive())
    this.instanceId = options?.instanceId ?? randomUUID()
    this.heartbeatIntervalMs =
      options?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS
  }

  async acquire(key: string): Promise<AdmissionSlot> {
    // Kill-switch first (no DB hit) — same fail-closed precedence as in-memory.
    if (!this.isActive()) {
      throw new AdmissionRejected("kill_switch_inactive")
    }

    const ids = (await this.sql.begin(async (tx) => {
      // Global critical-section lock: serialize count-then-insert across all
      // instances so check + reservation are atomic. Transaction-scoped (freed
      // at COMMIT/ROLLBACK/crash), pgbouncer-safe.
      await tx`SELECT pg_advisory_xact_lock(hashtext('brain_admission'))`
      // Inline reap of dead holders BEFORE counting, so a crashed instance's
      // slots never wedge the cap. Rolls back with the tx if this acquire is
      // rejected below — the backstop reaper is the durability net for that.
      await tx`
        DELETE FROM brain_admission_slot
        WHERE heartbeat_at < now() - make_interval(secs => ${INLINE_REAP_SECONDS})
      `
      const counts = (await tx`
        SELECT
          count(*) FILTER (WHERE scope = 'global')::int AS global_count,
          count(*) FILTER (WHERE scope = 'org' AND scope_key = ${key})::int
            AS key_count
        FROM brain_admission_slot
      `) as unknown as Array<{ global_count: number; key_count: number }>
      const globalCount = counts[0]?.global_count ?? 0
      const keyCount = counts[0]?.key_count ?? 0
      // Same ordering as in-memory: global then per-key.
      if (globalCount >= this.caps.global) {
        throw new AdmissionRejected("global_cap_exceeded")
      }
      if (keyCount >= this.caps.perKey) {
        throw new AdmissionRejected("per_key_cap_exceeded")
      }
      const inserted = (await tx`
        INSERT INTO brain_admission_slot (scope, scope_key, instance_id)
        VALUES ('global', ${GLOBAL_SCOPE_KEY}, ${this.instanceId}),
               ('org', ${key}, ${this.instanceId})
        RETURNING id
      `) as unknown as Array<{ id: string }>
      return inserted.map((r) => r.id)
    })) as string[]

    return this.makeSlot(ids)
  }

  private makeSlot(ids: string[]): AdmissionSlot {
    let released = false
    const timer = setInterval(() => {
      void this.heartbeat(ids)
    }, this.heartbeatIntervalMs)
    // Never keep the process alive for a heartbeat.
    timer.unref?.()
    return {
      release: () => {
        if (released) return
        released = true
        clearInterval(timer)
        // Fire-and-forget: release() is synchronous by contract and runs in a
        // finally. A failed delete leaves a row that the inline (90s) or
        // backstop (5min) reaper removes — never throw from here.
        void this.deleteSlots(ids)
      },
    }
  }

  private async heartbeat(ids: string[]): Promise<void> {
    try {
      await this.sql`
        UPDATE brain_admission_slot
        SET heartbeat_at = now()
        WHERE id = any(${ids}::uuid[])
      `
    } catch {
      // Best-effort: a missed heartbeat only risks a premature reap, and the
      // slot is re-counted honestly on the next acquire.
    }
  }

  private async deleteSlots(ids: string[]): Promise<void> {
    try {
      await this.sql`
        DELETE FROM brain_admission_slot
        WHERE id = any(${ids}::uuid[])
      `
    } catch {
      // Best-effort — leaked rows are reaped by the inline / backstop reaper.
    }
  }
}

/** A drizzle raw-SQL executor — any `withAdminBypass`-bound tx handle satisfies this. */
type SqlExecutor = { execute: (query: SQL) => Promise<unknown> }

/**
 * Backstop reaper: delete admission slots whose heartbeat has gone stale
 * (default 5 minutes — well past the 90s inline threshold). Belt-and-braces over
 * the inline reap for the case where `acquire` never runs again (traffic drains
 * to zero) and dead rows would otherwise linger. Runs on a `withAdminBypass` tx
 * (the table has NO RLS; the admin role is its access path). Returns nothing —
 * the delete is idempotent and its count is not load-bearing.
 */
export async function reapExpiredAdmissionSlots(
  db: SqlExecutor,
  olderThanSeconds = 300,
): Promise<void> {
  await db.execute(drizzleSql`
    DELETE FROM brain_admission_slot
    WHERE heartbeat_at < now() - make_interval(secs => ${olderThanSeconds})
  `)
}
