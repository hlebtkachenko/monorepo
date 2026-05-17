/**
 * Vitest globalSetup for apps/web integration tests.
 *
 * Boots a disposable Postgres 18 testcontainer (same pattern as
 * packages/db/tests/global-setup.ts), applies all migrations, and
 * exposes DATABASE_URL + DATABASE_DIRECT_URL so the db/auth singletons
 * bind correctly when test files dynamically import them.
 *
 * Called once before all test files. Teardown stops the container after
 * all tests complete.
 *
 * CI: when SKIP_TESTCONTAINER=true, the CI workflow is expected to
 * provide a live Postgres 18 service and pre-set both env vars.
 */

import { bootPostgres18 } from "@workspace/testcontainers"
import type { StartedPostgreSqlContainer } from "@workspace/testcontainers"

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

  process.env["DATABASE_URL"] = result.userUrl
  process.env["DATABASE_DIRECT_URL"] = result.adminUrl

  // Better Auth validates BETTER_AUTH_SECRET at instance construction.
  // Provide a deterministic test secret if the environment doesn't have one.
  process.env["BETTER_AUTH_SECRET"] =
    process.env["BETTER_AUTH_SECRET"] ??
    "web-integration-test-secret-0123456789ab"
}

export async function teardown(): Promise<void> {
  if (container) {
    await container.stop()
    container = null
  }
}
