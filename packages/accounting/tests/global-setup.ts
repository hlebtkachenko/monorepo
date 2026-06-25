/**
 * Vitest globalSetup — boots a disposable Postgres 18 testcontainer, applies
 * all hand-authored migrations (incl. accounting 0024-0028), and exports
 * DATABASE_URL + DATABASE_DIRECT_URL so @workspace/db's client picks them up.
 *
 * Mirrors packages/db/tests/global-setup.ts. When SKIP_TESTCONTAINER=true the
 * container is skipped and the CI service container's env vars are used.
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
        "SKIP_TESTCONTAINER=true but DATABASE_URL or DATABASE_DIRECT_URL is not set.",
      )
    }
    return
  }

  const result = await bootPostgres18()
  container = result.container
  process.env["DATABASE_URL"] = result.userUrl
  process.env["DATABASE_DIRECT_URL"] = result.adminUrl
}

export async function teardown(): Promise<void> {
  if (container) {
    await container.stop()
    container = null
  }
}
