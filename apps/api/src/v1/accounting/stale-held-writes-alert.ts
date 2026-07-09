/**
 * Stale held-write queue alert (M0.8 / 11.11).
 *
 * `held-writes.controller.ts` exposes the per-organization review queue
 * (`tool_call_log` rows with `auto_applied = false` and
 * `approved_by_user_id IS NULL`) but nothing pages an operator when that
 * queue ages — and at the v1 cold-start posture (`evidence-gate.ts`) EVERY
 * accounting write is held, so the held queue is the ONLY place a real
 * booking ever gets applied. A row nobody reviews means real accounting work
 * is stuck.
 *
 * `checkStaleHeldWrites` is the pure decision: given the current stats
 * (fetched from wherever the caller wires `getStats`) it decides whether to
 * fire, and never touches the DB or `@workspace/notify` directly — so a unit
 * test drives it with a fake store + a fake notify, no Postgres needed.
 *
 * apps/api has no live scheduler today (`health.controller.ts` is a plain
 * liveness probe; there is no `@nestjs/schedule` / cron wiring in this app).
 * `runStaleHeldWritesAlertCheck` is the production wiring — INVOCABLE, not
 * yet bound to a recurring trigger. Wire it into a scheduler (a NestJS
 * `@Interval`/`@Cron` provider, a pg-boss lane, or an external cron hitting a
 * future admin-only endpoint) as follow-up; the check itself is complete and
 * safe to call from any of those today.
 */
import {
  getStaleHeldWriteQueueStats,
  withAdminBypass,
  type StaleHeldWriteQueueStats,
} from "@workspace/db"
import { notifierFromEnv } from "@workspace/notify"

const DEFAULT_THRESHOLD_HOURS = 24

/**
 * A non-finite / non-positive override would either disable the alert
 * (never stale) or make everything "stale" instantly, so fall back to the
 * documented default rather than propagate a bad env value.
 */
function resolveThresholdHours(): number {
  const raw = Number(
    process.env["ACCOUNTING_STALE_HELD_THRESHOLD_HOURS"] ??
      String(DEFAULT_THRESHOLD_HOURS),
  )
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_THRESHOLD_HOURS
}

export interface StaleHeldWritesAlertInfo {
  staleCount: number
  /** Age of the oldest held row in hours (fractional). */
  oldestAgeHours: number
}

export interface CheckStaleHeldWritesDeps {
  /** Fetches queue stats for the given cutoff. Prod wires this to `getStaleHeldWriteQueueStats` under `withAdminBypass`; tests inject a fake store. */
  getStats: (cutoff: Date) => Promise<StaleHeldWriteQueueStats>
  /** Injectable clock for deterministic tests. */
  now: () => Date
  /** Age threshold, in hours, past which a held write counts as stale. */
  thresholdHours: number
  /** Called ONLY when stale rows exist. Prod wires this to `@workspace/notify`; tests inject a fake. */
  notifyStale: (info: StaleHeldWritesAlertInfo) => void
}

/**
 * The pure check: compute the cutoff, fetch stats, and fire `notifyStale`
 * when the queue has entries older than `thresholdHours`. No I/O of its own
 * — `getStats` and `notifyStale` are fully injected, so this is unit-testable
 * with a mocked store + a mocked notify and no live DB/scheduler.
 *
 * `notifyStale` is called inside a try/catch: a throwing (or synchronously
 * misbehaving) notifier must never fail the check itself — the caller's
 * production wiring already fire-and-forgets + `.catch()`s the real
 * `@workspace/notify` call, but this is a second, independent backstop so
 * `checkStaleHeldWrites` stays safe regardless of how `notifyStale` is wired.
 */
export async function checkStaleHeldWrites(
  deps: CheckStaleHeldWritesDeps,
): Promise<StaleHeldWriteQueueStats> {
  const now = deps.now()
  const cutoffMs = deps.thresholdHours * 60 * 60 * 1000
  const cutoff = new Date(now.getTime() - cutoffMs)
  const stats = await deps.getStats(cutoff)

  if (stats.staleCount > 0 && stats.oldestCreatedAt) {
    const oldestAgeHours =
      (now.getTime() - stats.oldestCreatedAt.getTime()) / (60 * 60 * 1000)
    try {
      deps.notifyStale({ staleCount: stats.staleCount, oldestAgeHours })
    } catch {
      // Alerting must never break the stale-queue check itself.
    }
  }

  return stats
}

/**
 * Production wiring: real clock, env-configurable threshold, cross-org DB
 * read via `withAdminBypass`, and a WARNING through `@workspace/notify`
 * (never `alert()` — that call site hardcodes `level: "error"`, reserved for
 * the gate-integrity CRITICAL). Fire-and-forget: a notify failure is
 * swallowed and never propagates to the caller.
 */
export async function runStaleHeldWritesAlertCheck(): Promise<StaleHeldWriteQueueStats> {
  const notifier = notifierFromEnv()
  return checkStaleHeldWrites({
    now: () => new Date(),
    thresholdHours: resolveThresholdHours(),
    getStats: (cutoff) =>
      withAdminBypass((db) => getStaleHeldWriteQueueStats(db, cutoff)),
    notifyStale: ({ staleCount, oldestAgeHours }) => {
      void notifier
        ?.notify(
          `${staleCount} accounting write(s) held for review, oldest ${oldestAgeHours.toFixed(1)}h old`,
          { level: "warn", source: "brain-gate" },
        )
        .catch(() => {})
    },
  })
}
