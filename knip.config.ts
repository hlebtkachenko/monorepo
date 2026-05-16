import type { KnipConfig } from "knip"

/**
 * Monorepo-wide knip config.
 *
 * knip auto-detects the pnpm workspaces declared in `pnpm-workspace.yaml`
 * and enables the Next.js plugin per workspace. This config only adds
 * repo-specific ignores; it does not try to silence findings.
 */
const config: KnipConfig = {
  ignore: ["**/*.stories.tsx"],
  ignoreDependencies: [
    // tooling consumed only via config files / CLI, not imported
    "prettier-plugin-tailwindcss",
  ],
  ignoreBinaries: ["turbo"],
  workspaces: {
    ".": {
      entry: ["scripts/*.mjs"],
    },
  },
}

export default config
