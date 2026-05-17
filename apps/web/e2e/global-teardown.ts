/**
 * Playwright globalTeardown — stops the Postgres 18 testcontainer booted by
 * `global-setup.ts`. Runs in the same process as globalSetup, so it reads the
 * container handle stashed on `globalThis`.
 */

import type { StartedPostgreSqlContainer } from "@workspace/testcontainers"

declare global {
  var __E2E_PG_CONTAINER__: StartedPostgreSqlContainer | undefined
}

export default async function globalTeardown(): Promise<void> {
  const container = globalThis.__E2E_PG_CONTAINER__
  if (container) {
    await container.stop()
    globalThis.__E2E_PG_CONTAINER__ = undefined
  }
}
