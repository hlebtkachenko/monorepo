import { defineConfig } from "vitest/config"

/**
 * globalSetup boots a Postgres 18 testcontainer and applies every migration
 * (incl. 0041_org_scaffolding + 0042_org_config), wiring DATABASE_URL / DATABASE_DIRECT_URL so the
 * scaffold integration test's withAdminBypass / withOrganization resolve. Pure
 * unit tests (src/*.test.ts) ignore the DB. Mirrors packages/accounting.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    sequence: { concurrent: false },
    fileParallelism: false,
    pool: "forks",
  },
})
