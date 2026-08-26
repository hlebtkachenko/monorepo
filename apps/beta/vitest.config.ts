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
          //
          // `lib/storage/**` and `lib/http/**` join them: the magic-byte
          // sniffer, the streaming size cap, the RFC 5987 header and the
          // cross-site guard are pure functions over bytes and strings, and
          // they are the pieces most worth testing adversarially — a suite that
          // needs Docker to assert "a ZIP renamed to .pdf is refused" is a
          // suite that gets skipped.
          //
          // `lib/format/**` joins for the same reason (PR 17): cs-CZ date,
          // money and period-label formatting are pure `Intl` wrappers with no
          // database underneath them.
          include: [
            "app/**/*.test.ts",
            "i18n/**/*.test.ts",
            "lib/**/*.boundary.test.ts",
            "lib/storage/**/*.test.ts",
            "lib/http/**/*.test.ts",
            "lib/format/**/*.test.ts",
          ],
          // The document API's tests need real rows and a real transaction, so
          // they belong to the `db` project below — as does Daně a podání's
          // `dane-scope` gate, which resolves a real membership and a real
          // `vat_regime` (PR 17). `**/dane/**` rather than the literal
          // `app/(portal)/[orgSlug]/dane/**`: `[orgSlug]` is a glob BRACKET
          // EXPRESSION (matches one char of "orgSlug"), not the literal
          // directory name, so a literal path silently failed to exclude
          // anything — `**` swallows the route-group and dynamic-segment
          // folders regardless of their punctuation.
          exclude: ["app/api/orgs/**", "app/**/dane/**", "**/node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          // `lib/auth`, `lib/data` and the document API join this project
          // rather than `pure`: the consume flow, the trigger guards, the
          // tenancy seam, the quota transaction and Better Auth's own storage
          // only mean anything against a real Postgres.
          include: [
            "db/**/*.test.ts",
            "lib/**/*.test.ts",
            "app/api/orgs/**/*.test.ts",
            "app/**/dane/**/*.test.ts",
          ],
          exclude: [
            "lib/**/*.boundary.test.ts",
            "lib/storage/**/*.test.ts",
            "lib/http/**/*.test.ts",
            "lib/format/**/*.test.ts",
            "**/node_modules/**",
          ],
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
