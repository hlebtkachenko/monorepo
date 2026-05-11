import { defineConfig } from "vitest/config"

/**
 * Vitest config for `@workspace/db`.
 *
 * - `globalSetup` spins up a Postgres 18 testcontainer, applies all
 *   hand-authored migrations in order, and wires DATABASE_URL for every
 *   test file.
 * - `testTimeout` bumped to 60s because the first testcontainer boot
 *   includes image pull on cold CI.
 * - Integration tests under `tests/` expect a live DB; unit tests can live
 *   under `src/` (none yet).
 * - pgBouncer canary is skipped when PGBOUNCER_URL is unset (docker compose
 *   path; not required for the pure vitest + testcontainers run).
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
