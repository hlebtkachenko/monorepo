import type { KnipConfig } from "knip"

/**
 * Monorepo-wide knip config.
 *
 * knip auto-detects the pnpm workspaces declared in `pnpm-workspace.yaml`
 * and enables the Next.js plugin per workspace.
 *
 * This config separates knip's *false positives* (files knip cannot see are
 * reachable, and deps it cannot see are used) from the *real* dead-code
 * findings that still need a dedicated cleanup pass. Only the false positives
 * are silenced here; every genuine finding is left visible so the eventual
 * flip of `.github/workflows/knip.yml` `continue-on-error: true` into a real
 * gate stays meaningful. See docs/conventions/CI-POLICY.md (knip footnote).
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
    "infra/openfga": {
      // Single-file init container ("files": ["bootstrap.mjs"]); runs inside the
      // App-<env> task. This IS the workspace entry — declaring it lets knip count
      // its @aws-sdk/@openfga deps as used.
      entry: ["bootstrap.mjs"],
    },
  },
}

export default config
