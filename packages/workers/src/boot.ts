/**
 * Boot pg-boss with all registered lanes.
 *
 * Side effect: `import "./lanes/permissions-drain"` registers the
 * default lane via module-load `registerLane(...)`. Add new lanes by
 * importing them inside boot() (or have callers import them first).
 */

import { PgBoss } from "pg-boss"
import { notifierFromEnv, sanitizeError } from "@workspace/notify"
import {
  laneNames,
  getLane,
  type Lane,
  type LaneHandler,
} from "./lanes/registry"
import "./lanes/permissions-drain"

/**
 * Shared failure-notify hook (OBS-15): every lane handler is bound through
 * this wrapper, so a throwing handler reports to the bot (deduped Linear
 * issue + Telegram) BEFORE pg-boss marks the job failed — previously only
 * permissions-drain's per-row dead-letter path reported; a handler that
 * threw before reaching it (e.g. missing OPENFGA_* env) retried to
 * exhaustion in silence. The error is re-thrown so pg-boss retry/failed
 * semantics are unchanged. Fingerprint is stable per lane+message, so a
 * retry storm dedups into one issue.
 */
function withFailureNotify(lane: Lane): LaneHandler {
  return async (jobs) => {
    try {
      await lane.handler(jobs)
    } catch (err) {
      const safe = sanitizeError(err, lane.name)
      void notifierFromEnv()
        ?.reportIssue({
          source: "error",
          area: "infra",
          risk: "high",
          title: `Worker lane failed: ${lane.name}`,
          body: `Lane \`${lane.name}\` handler threw (${jobs.length} job(s) in batch).\n\n${safe.message}`,
          fingerprintParts: ["worker-deadletter", lane.name, safe.message],
        })
        .catch(() => {})
      throw err
    }
  }
}

export interface WorkersBoot {
  readonly boss: PgBoss
  /**
   * Stop the boss and all workers gracefully. Safe to call multiple times.
   */
  stop(): Promise<void>
}

/**
 * Start pg-boss and bind every registered lane.
 *
 * The connection string MUST be a direct Postgres URL (port 5432).
 * pg-boss uses advisory locks + LISTEN/NOTIFY; pgBouncer transaction
 * mode breaks both. The migration runner (packages/db) enforces this
 * via PGBOUNCER_PORT rejection; we don't re-check here.
 */
export async function boot(connectionString: string): Promise<WorkersBoot> {
  const boss = new PgBoss({ connectionString })
  await boss.start()

  for (const name of laneNames()) {
    const lane = getLane(name)
    await boss.work(lane.name, lane.options ?? {}, withFailureNotify(lane))
  }

  let stopped = false
  return {
    boss,
    async stop() {
      if (stopped) return
      stopped = true
      await boss.stop({ graceful: true })
    },
  }
}
