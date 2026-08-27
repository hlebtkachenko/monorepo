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
  // The React 17+ JSX transform, so a `.tsx` test can render a component
  // without importing React.
  //
  // It has to be stated here because `tsconfig.json` says `jsx: "preserve"` —
  // correct for Next, which does its own transform, and fatal for Vite, which
  // would hand raw JSX to the import analyser. Set on `oxc` rather than
  // `esbuild`: Vite 8 transforms with oxc and IGNORES the esbuild block
  // entirely (it says so, in a warning, while failing).
  //
  // The alternative — `@vitejs/plugin-react` — would be a new devDependency,
  // and therefore a lockfile change that cold-rebuilds every package in the
  // monorepo, bought for nothing: these tests render to a string and have no
  // use for Fast Refresh.
  oxc: { jsx: { runtime: "automatic" } },
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
          // database underneath them. `lib/obligation-labels.test.ts` (PR 18)
          // is the same kind of thing — an enum-to-catalog map checked against
          // the pgEnum's declared values and the JSON, neither of which needs a
          // running database.
          //
          // `lib/notifications/**` (PR 15) is the same shape again: dispatch
          // takes an already-resolved recipient list and mocks
          // `@workspace/email`'s `sendEmail`, so it is pure orchestration with
          // no query of its own. `lib/data/notification-prefs.ts` — the part
          // that DOES query Postgres (the toggle, the recipient resolution) —
          // stays in the `db` project below with every other `lib/data/**`
          // module.
          include: [
            "app/**/*.test.ts",
            // Component render tests (PR 12): they render a Client Component
            // to a string with `react-dom/server`, so they need no jsdom and
            // no Postgres — the two things that would otherwise make a UI
            // assertion expensive enough to skip.
            "app/**/*.test.tsx",
            "i18n/**/*.test.ts",
            "lib/**/*.boundary.test.ts",
            "lib/storage/**/*.test.ts",
            "lib/http/**/*.test.ts",
            "lib/format/**/*.test.ts",
            // `lib/import/**` (PR 26): the manual-fallback CSV reader is a pure
            // function over a string — a tokenizer, a header matcher and a
            // decimal normalizer. It is also the piece most worth testing
            // adversarially (BOM, quoted `;`, Czech decimal comma, ragged
            // rows), and a suite that needed Docker to assert "a row with two
            // commas in one amount is refused" is a suite that gets skipped.
            "lib/import/**/*.test.ts",
            "lib/obligation-labels.test.ts",
            // `lib/account-labels.test.ts` (PR 27) is the same shape as
            // `lib/obligation-labels.test.ts` one line up: two enum-to-catalog
            // maps checked against the pgEnums' declared values and the JSON,
            // neither of which needs a running database.
            "lib/account-labels.test.ts",
            // Same rule again for PR 28's `lib/partner-labels.ts`: an
            // enum-to-catalog map checked against the pgEnum's declared values
            // and the JSON, neither of which needs a running database.
            "lib/partner-labels.test.ts",
            // Same rule again for W6's `lib/indicator-labels.ts`: an
            // enum-to-catalog map checked against the pgEnum's declared values
            // and the JSON, neither of which needs a running database.
            "lib/indicator-labels.test.ts",
            // Same rule as `lib/obligation-labels.test.ts` above, for PR 20's
            // two pure helpers: `lib/freshness.ts` is calendar-index
            // arithmetic over a period and a date string, `lib/turnover.ts`
            // is a threshold comparison in exact minor units. Neither has a
            // database underneath it, and both are exactly the kind of thing
            // whose boundary cases (a month end, a figure landing ON a
            // threshold) must be cheap enough to assert exhaustively.
            "lib/freshness.test.ts",
            "lib/turnover.test.ts",
            "lib/notifications/**/*.test.ts",
            // The agent credential's shape and its input schemas (PR 24) are
            // crypto and zod over strings — the pieces most worth testing
            // adversarially, and a suite that needs Docker to assert "a body
            // naming an organization is refused" is a suite that gets skipped.
            "lib/agent/**/*.test.ts",
            // PR 36, same rule: the Asistent config gate, the SSE frame
            // reader, the provider boundary (behind an injected `fetchImpl`,
            // so no key and no network) and the system-prompt snapshot are all
            // pure functions over strings and bytes. They are also the pieces
            // most worth testing adversarially — a suite that needed Docker to
            // assert "no key means no request is made" is a suite that gets
            // skipped. `lib/data/assistant.ts` — the chats, the transcript and
            // the budget ledger — stays in the `db` project with every other
            // `lib/data/**` module.
            "lib/assistant/**/*.test.ts",
            // PR 21, same rule: the ARES reconciliation rules are a pure diff
            // over two plain objects and a fetch behind an injected `fetchImpl`,
            // the ÚFO číselník is a Map, and the forced-TOTP predicate is three
            // booleans. None of them has a database underneath, and the ARES
            // rules in particular are the ones most worth testing adversarially
            // — a suite that needs Docker to assert "a null DIČ never touches
            // vat_regime" is a suite that gets skipped.
            "lib/ares/**/*.test.ts",
            "lib/tax-office.test.ts",
            "lib/auth/totp-enforcement.test.ts",
          ],
          // The document API's tests need real rows and a real transaction, so
          // they belong to the `db` project below — as does Daně a podání's
          // `dane-scope` gate, which resolves a real membership and a real
          // `vat_regime` (PR 17), and Majetek's page-render smokes (PR 34),
          // which do the same. `**/dane/**` / `**/majetek/**` rather than the
          // literal `app/(portal)/[orgSlug]/dane/**`: `(portal)` and
          // `[orgSlug]` are glob-special (an extglob group and a bracket
          // expression), not literal directory names to a glob matcher, so a
          // literal path silently failed to exclude anything — `**` swallows
          // the route-group and dynamic-segment folders regardless of their
          // punctuation.
          //
          // `**/*.db.test.ts` (PR 18) is the same rule stated by SUFFIX rather
          // than by path: a Server Action's authz matrix and a page loader's
          // owner gate need real rows wherever in `app/` they live, and naming
          // the file is more durable than remembering to add each new folder
          // here. Everything else under `app/` stays a pure unit.
          exclude: [
            "app/api/orgs/**",
            // The agent ingestion API's suite (PR 24) needs real keys, real
            // memberships and real transactions — a route test asserting that a
            // revoked key answers 401 means nothing against a mock.
            "app/api/agent/**",
            "app/**/dane/**",
            "app/**/majetek/**",
            "**/*.db.test.ts",
            "**/node_modules/**",
          ],
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
            "app/api/agent/**/*.test.ts",
            "app/**/dane/**/*.test.ts",
            "app/**/majetek/**/*.test.ts",
            // Server Actions and page loaders that need real rows — see the
            // `pure` project's exclude for why the suffix rather than a path.
            "app/**/*.db.test.ts",
          ],
          exclude: [
            "lib/**/*.boundary.test.ts",
            "lib/agent/**/*.test.ts",
            "lib/assistant/**/*.test.ts",
            "lib/storage/**/*.test.ts",
            "lib/http/**/*.test.ts",
            "lib/format/**/*.test.ts",
            "lib/import/**/*.test.ts",
            "lib/obligation-labels.test.ts",
            "lib/account-labels.test.ts",
            "lib/partner-labels.test.ts",
            "lib/indicator-labels.test.ts",
            "lib/freshness.test.ts",
            "lib/turnover.test.ts",
            "lib/notifications/**/*.test.ts",
            "lib/ares/**/*.test.ts",
            "lib/tax-office.test.ts",
            "lib/auth/totp-enforcement.test.ts",
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
