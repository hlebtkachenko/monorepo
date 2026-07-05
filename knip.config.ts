import type { KnipConfig } from "knip"

/**
 * Monorepo-wide knip config.
 *
 * knip auto-detects the pnpm workspaces declared in `pnpm-workspace.yaml`
 * and enables the Next.js plugin per workspace.
 *
 * This config silences ONLY knip's *false positives*: files it cannot see are
 * reachable (string-path child processes, CDK lambda assets, playwright e2e
 * entries whose config it cannot load), deps it cannot see are used (config-only
 * string refs), and intentional deferred scaffolds (ADR-0018 Cerbos/OpenFGA
 * authz). Every genuine dead-code finding was resolved in the #527 cleanup pass,
 * so `.github/workflows/knip.yml` now runs knip as a BLOCKING gate — a new unused
 * file/dep/export fails CI. See docs/conventions/CI-POLICY.md (knip footnote).
 * Keep this list tight: silence a real finding here and the gate stops meaning
 * anything.
 */
const config: KnipConfig = {
  // `next` is referenced as a TS plugin in packages/typescript-config/nextjs.json,
  // a shared preset whose `next` dependency is resolved by the consuming apps.
  ignoreUnresolved: ["next"],
  workspaces: {
    ".": {
      // Governance scripts are spawned as child processes by string path
      // (e.g. scripts/governance/apply-linear-context.mjs execs linear-fetch.mjs),
      // invisible to knip's import graph.
      entry: ["scripts/*.mjs", "scripts/**/*.mjs"],
      // `pnpm e2e` runs with working-directory apps/web (.github/workflows/e2e.yml);
      // the script lives in apps/web/package.json, not resolvable as a root binary.
      ignoreBinaries: ["e2e"],
      // Versioned skill/workflow scripts (#546) executed by the Claude tooling by
      // path (Skill / Workflow), never imported into the TS graph.
      ignore: [".claude/workflows/*.js"],
    },
    "apps/api": {
      ignore: [
        // ADR-0020 build spine: nest-cli.json wires webpack.config.js via
        // `"webpack": true` + `"webpackConfigPath"`, a string ref knip cannot follow.
        "webpack.config.js",
        // ADR-0018 three-layer authz planned scaffolds (Cerbos + OpenFGA modules),
        // not yet wired into AuthzModule ("Commit 10"). Intentional deferral, kept as
        // reference until the wire-or-drop decision is made — remove both together
        // with the four deps below when that lands.
        "src/authz/cerbos.module.ts",
        "src/authz/openfga.module.ts",
      ],
      ignoreDependencies: [
        // ts-loader is referenced as a string in webpack.config.js; @nestjs/schematics
        // is the nest-cli.json `collection`. Both are string-config refs, not imports.
        "ts-loader",
        "@nestjs/schematics",
        // Deps of the ADR-0018 authz scaffolds ignored above.
        "@cerbos/core",
        "@cerbos/grpc",
        "@openfga/sdk",
        "@openfga/syntax-transformer",
      ],
    },
    "apps/bot": {
      // Operational CLIs invoked via `pnpm exec tsx` (HITL + manual ping),
      // documented in the root CLAUDE.md, never imported.
      ignore: ["scripts/*.ts"],
    },
    "apps/admin": {
      // Storybook binary resolves by cd-ing into packages/ui (a real devDep there).
      ignoreBinaries: ["storybook"],
      // @tailwindcss/postcss is loaded via the re-exported @workspace/ui/postcss.config
      // (a runtime PostCSS config ref), not a static import knip can follow.
      ignoreDependencies: ["@tailwindcss/postcss"],
    },
    "apps/web": {
      // Same @workspace/ui/postcss.config re-export indirection as apps/admin.
      ignoreDependencies: ["@tailwindcss/postcss"],
      // knip's playwright plugin can't load apps/web/playwright.config.ts under the
      // knip job (no BETTER_AUTH_SECRET / container runtime), so it can't auto-discover
      // the e2e entry points and reports every spec as an unused file. Declare them
      // explicitly: every spec under e2e/ is run by playwright (testDir "./e2e"), and
      // db-setup.ts / global-teardown.ts are wired via the config's webServer.env +
      // globalTeardown. Entry files' exports (e.g. SEED_FILE) are treated as used.
      entry: ["e2e/**/*.spec.ts", "e2e/global-teardown.ts", "e2e/db-setup.ts"],
    },
    "packages/auth": {
      // Dev/admin CLIs run via `pnpm tsx packages/auth/scripts/...`, never imported.
      ignore: ["scripts/*.ts"],
    },
    "packages/db": {
      // Codegen source for the accounting reference seed migration, run manually.
      ignore: ["scripts/*.ts"],
    },
    "packages/sdk": {
      // openapi-typescript output ("Do not make direct changes.") — never hand-edited.
      ignore: ["src/generated/**"],
    },
    "packages/ui": {
      // Vendored component libraries (bazza filter-bar, diceui data-grid) imported
      // wholesale; their internal export surface is not all reached from our curated
      // index barrels. Left un-pruned to keep future upstream syncs clean.
      // vitest.storybook.config.ts is an unwired storybook-test prerequisite (its
      // deps are "not yet installed", backlog #104) — kept until that batch lands.
      ignore: [
        "src/components/filter-bar/**",
        "src/components/data-grid/**",
        "vitest.storybook.config.ts",
      ],
      // Registered in .storybook/main.ts inside an SB_FULL-conditional addon array
      // that defeats knip's static resolution.
      ignoreDependencies: ["@storybook/addon-a11y", "@chromatic-com/storybook"],
    },
    "infra/cdk": {
      // Lambda handlers are CDK assets loaded by string path (e.g.
      // security-stack.ts references lib/lambda/rds-restart-watcher), invisible
      // to knip's import graph.
      ignore: ["lib/lambda/*/index.mjs"],
      // CDK entrypoint runs via `npx tsx bin/app.ts` (cdk.json `"app"`).
      ignoreDependencies: ["tsx"],
    },
    "infra/openfga": {
      // Single-file init container ("files": ["bootstrap.mjs"]); runs inside the
      // App-<env> task. This IS the workspace entry — declaring it lets knip count
      // its @aws-sdk/@openfga deps as used.
      entry: ["bootstrap.mjs"],
    },
  },
}

export default config
