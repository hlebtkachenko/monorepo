/**
 * Boot pg-boss with all registered lanes.
 *
 * Side effect: `import "./lanes/permissions-drain"` registers the
 * default lane via module-load `registerLane(...)`. Add new lanes by
 * importing them inside boot() (or have callers import them first).
 */

import { PgBoss } from "pg-boss"
import { laneNames, getLane } from "./lanes/registry"
import "./lanes/permissions-drain"

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
    await boss.work(lane.name, lane.options ?? {}, lane.handler)
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
