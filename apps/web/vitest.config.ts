/**
 * Vitest config for apps/web integration tests.
 *
 * - environment: node (no DOM; these are server-side DB integration tests)
 * - globalSetup boots a Postgres 18 testcontainer and wires DATABASE_URL
 *   before any test file is imported, mirroring the packages/db pattern.
 * - Tests live under apps/web/app/** co-located with source files,
 *   following the repo's co-location convention (*.test.ts suffix).
 * - testTimeout: 60s — containers take 10-20s cold; first test runs after
 *   globalSetup so the overhead is paid once.
 * - fileParallelism: false — tests share the same container; parallel
 *   file execution would race on DB state.
 * - pool: forks — required for globalSetup env var propagation.
 *
 * Aliases:
 *   server-only: mapped to its empty.js stub so modules that begin with
 *     `import "server-only"` load cleanly in Node/Vitest. The package's
 *     own "react-server" export condition does the same in RSC builds;
 *     we replicate that bypass for the test runner.
 *   next/headers, next/navigation: mapped to stubs so server components
 *     that import them don't crash when exercised outside the Next.js
 *     runtime. These modules are NOT needed by the functions under test
 *     (materialize-invite, resolveMembership) — the stubs are pure
 *     no-ops included only to satisfy the module graph at import time.
 */
import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      // server-only: use the package's own empty stub (exported as
      // "react-server" condition; we point directly to the file).
      "server-only": resolve("./node_modules/server-only/empty.js"),
      // @/ — mirrors the tsconfig paths alias (. maps to apps/web/).
      "@/": resolve("./") + "/",
    },
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "lib/**/*.test.ts", "tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    sequence: { concurrent: false },
    fileParallelism: false,
    pool: "forks",
  },
})
