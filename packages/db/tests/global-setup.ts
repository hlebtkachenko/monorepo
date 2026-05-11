/**
 * Vitest globalSetup — boots a disposable Postgres 18 testcontainer and
 * exports DATABASE_URL + DATABASE_DIRECT_URL to process.env so the db package
 * client.ts picks them up.
 *
 * Called once before all test files (vitest global lifecycle, not per-test).
 * The teardown function stops the container after all tests complete.
 *
 * Execution time: ~10-20s cold (image pull + postgres init + migrations).
 * Warm runs (image cached): ~4-6s.
 *
 * CI mode: when SKIP_TESTCONTAINER=true the testcontainer is skipped entirely.
 * The workflow is expected to provide a Postgres 18 service container and to
 * set DATABASE_URL and DATABASE_DIRECT_URL in the environment.
 */

import { bootPostgres18 } from "@workspace/testcontainers"
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql"

let container: StartedPostgreSqlContainer | null = null

export async function setup(): Promise<void> {
  if (process.env["SKIP_TESTCONTAINER"] === "true") {
    const url = process.env["DATABASE_URL"]
    const directUrl = process.env["DATABASE_DIRECT_URL"]
    if (!url || !directUrl) {
      throw new Error(
        "SKIP_TESTCONTAINER=true but DATABASE_URL or DATABASE_DIRECT_URL is not set. " +
          "The CI service container must export both env vars before running tests.",
      )
    }
    return
  }

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
