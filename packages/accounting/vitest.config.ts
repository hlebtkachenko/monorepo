import { defineConfig } from "vitest/config"

/**
 * Vitest config for `@workspace/accounting` (v2).
 *
 * globalSetup boots a Postgres 18 testcontainer (via @workspace/testcontainers),
 * applies every hand-authored migration in packages/db/migrations (including the
 * v2 accounting 0024-0036), and wires DATABASE_URL / DATABASE_DIRECT_URL so the
 * domain layer's withOrganization helper resolves. Mirrors packages/db.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    sequence: { concurrent: false },
    fileParallelism: false,
    pool: "forks",
  },
})
