import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

/**
 * Two projects, split the way apps/web splits its suite: the `pure` project
 * (nav, i18n, route handlers) must not pay for a Postgres boot, and the `db`
 * project needs one container shared by every file.
 *
 * `server-only` is aliased to the package's own empty stub so `db/client.ts`
 * — which begins with `import "server-only"` — loads in the Node runner. The
 * package exports that stub under the "react-server" condition; we point at the
 * file directly, exactly as apps/web does.
 */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": resolve("./node_modules/server-only/empty.js"),
      "@/": resolve("./") + "/",
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "pure",
          environment: "node",
          // `*.boundary.test.ts` are the source-tree fences (import fence,
          // app_user write allowlist): they parse files with the TypeScript AST
          // and must not pay for a Postgres boot.
          include: [
            "app/**/*.test.ts",
            "i18n/**/*.test.ts",
            "lib/**/*.boundary.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          // `lib/auth` and `lib/data` join this project rather than `pure`: the
          // consume flow, the trigger guards, the tenancy seam and Better
          // Auth's own storage only mean anything against a real Postgres.
          include: ["db/**/*.test.ts", "lib/**/*.test.ts"],
          exclude: ["lib/**/*.boundary.test.ts", "**/node_modules/**"],
          globalSetup: ["./tests/global-setup.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          sequence: { concurrent: false },
          // Every file shares one container; parallel files would race on
          // database state.
          fileParallelism: false,
          // Required for globalSetup env-var propagation into test workers.
          pool: "forks",
        },
      },
    ],
  },
})
