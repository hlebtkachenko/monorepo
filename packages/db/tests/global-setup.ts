/**
 * Vitest globalSetup — boots a disposable Postgres 18 testcontainer and
 * exports DATABASE_URL + DATABASE_DIRECT_URL to process.env so the db package
 * client.ts picks them up.
 *
 * Called once before all test files (vitest global lifecycle, not per-test).
 * The teardown function stops the container after all tests complete.
 *
 * Execution time: ~10–20s cold (image pull + postgres init + migrations).
 * Warm runs (image cached): ~4–6s.
 */

import { bootPostgres18 } from "@workspace/testcontainers"
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql"

let container: StartedPostgreSqlContainer | null = null

export async function setup(): Promise<void> {
  const result = await bootPostgres18()
  container = result.container

  // Export both URLs so client.ts + migration scripts resolve them.
  process.env["DATABASE_URL"] = result.userUrl
  process.env["DATABASE_DIRECT_URL"] = result.adminUrl
}

export async function teardown(): Promise<void> {
  if (container) {
    await container.stop()
    container = null
  }
}
