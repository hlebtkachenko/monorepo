/**
 * Recurring caller for the stale held-write queue alert (T3 thermo
 * follow-up on M0.8 / 11.11).
 *
 * `stale-held-writes-alert.ts` defines `runStaleHeldWritesAlertCheck()` —
 * a complete, unit-tested production wiring that reads the cross-org held
 * queue and warns via `@workspace/notify` when a row is stale. Nothing
 * called it on a recurring basis: apps/api has no scheduler dependency
 * (`@nestjs/schedule` is not installed). This provider closes that gap with
 * a plain `setInterval`, no new dependency.
 *
 * Gated OFF by default. At v1 cold start EVERY accounting write is held
 * (`evidence-gate.ts`'s `extraction_failed` floor), so an always-on stale
 * alarm would fire constantly and be pure noise. `onModuleInit` only arms
 * the interval when `ACCOUNTING_STALE_HELD_ALERT_ENABLED === "true"` — Hleb
 * flips that once the held queue is an exceptional state worth paging on,
 * not the default state of every write.
 */
import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common"
import type { OnModuleInit } from "@nestjs/common"
import { runStaleHeldWritesAlertCheck } from "./stale-held-writes-alert"

const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * A non-finite / non-positive override would either never fire or fire in
 * a tight loop, so fall back to the documented default rather than
 * propagate a bad env value — mirrors `resolveThresholdHours` in
 * `stale-held-writes-alert.ts`.
 */
function resolveCheckIntervalMs(): number {
  const raw = Number(
    process.env["ACCOUNTING_STALE_HELD_CHECK_INTERVAL_MS"] ??
      String(DEFAULT_CHECK_INTERVAL_MS),
  )
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CHECK_INTERVAL_MS
}

function alertEnabled(): boolean {
  return (
    process.env["ACCOUNTING_STALE_HELD_ALERT_ENABLED"] === "true" &&
    process.env["NODE_ENV"] !== "test"
  )
}

@Injectable()
export class StaleHeldWritesScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StaleHeldWritesScheduler.name)
  private timer: NodeJS.Timeout | undefined

  onModuleInit(): void {
    if (!alertEnabled()) {
      this.logger.debug(
        '[stale-held-writes-scheduler] dormant (ACCOUNTING_STALE_HELD_ALERT_ENABLED is not "true")',
      )
      return
    }

    const intervalMs = resolveCheckIntervalMs()
    void runStaleHeldWritesAlertCheck().catch(() => {})
    this.timer = setInterval(() => {
      void runStaleHeldWritesAlertCheck().catch(() => {})
    }, intervalMs)
    this.timer.unref?.()
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }
}
