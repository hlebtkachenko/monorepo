/**
 * Vitest globalSetup — boots a disposable Postgres 18 testcontainer and exports
 * DATABASE_URL + DATABASE_DIRECT_URL so the db package client.ts picks them up.
 *
 * The boot/teardown logic lives in the shared @workspace/testcontainers factory
 * (createVitestGlobalSetup), so this file and apps/web's global-setup no longer
 * mirror each other by hand. CI mode (SKIP_TESTCONTAINER=true), the ~10-20s cold
 * / ~4-6s warm boot, and the container lifecycle are all handled there.
 */
import { createVitestGlobalSetup } from "@workspace/testcontainers"

export const { setup, teardown } = createVitestGlobalSetup()
