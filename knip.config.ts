import type { KnipConfig } from "knip"

/**
 * Monorepo-wide knip config.
 *
 * knip auto-detects the pnpm workspaces declared in `pnpm-workspace.yaml`
 * and enables the Next.js plugin per workspace.
 *
 * This config silences ONLY knip's *false positives*: files it cannot see are
 * reachable (string-path child processes, CDK lambda assets, vendored trees kept
 * verbatim for clean upstream syncs, playwright e2e specs) and deps it cannot see
 * are used (config-only string refs). Every genuine dead-code finding was resolved
 * in the #527 cleanup pass, so `.github/workflows/knip.yml` now runs knip as a
 * BLOCKING gate — a new unused file/dep/export fails CI. See
 * docs/conventions/CI-POLICY.md (knip footnote). Keep this list tight: silence a
 * real finding here and the gate stops meaning anything.
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
      // ADR-0020 build spine: nest-cli.json wires webpack.config.js via
      // `"webpack": true` + `"webpackConfigPath"`, a string ref knip cannot follow.
      ignore: ["webpack.config.js"],
      // ts-loader is referenced as a string in webpack.config.js; @nestjs/schematics
      // is the nest-cli.json `collection`. Both are string-config refs, not imports.
      ignoreDependencies: ["ts-loader", "@nestjs/schematics"],
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
      // Disable knip's playwright plugin: it imports playwright.config.ts, which
      // top-level-awaits bootAndSeedDatabase() (boots a Postgres testcontainer at
      // module load). Under knip that boot crashes (no container / no
      // BETTER_AUTH_SECRET) and, worse, on a machine with Docker it would boot +
      // seed a DB per lint run with no teardown. Declaring the e2e entries by hand
      // is exact and side-effect-free: playwright's testDir "./e2e" runs every spec,
      // and db-setup.ts / global-teardown.ts are wired via webServer.env +
      // globalTeardown. Entry files' exports (e.g. SEED_FILE) are treated as used.
      playwright: false,
      entry: [
        "playwright.config.ts",
        "e2e/**/*.spec.ts",
        "e2e/global-teardown.ts",
        "e2e/db-setup.ts",
      ],
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
      ignore: ["src/components/filter-bar/**", "src/components/data-grid/**"],
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
    "infra/cloudflare": {
      // src/ is vendored verbatim from turborepo-remote-cache-cloudflare v4.0.0
      // (see infra/cloudflare/SOURCE.md — "No, verbatim copy"). Its internal export
      // surface is not all reached from the worker entrypoint; leave it un-pruned so
      // an upstream re-extract stays a no-op for knip. Never hand-edit this tree.
      ignore: ["src/**"],
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
