import type { KnipConfig } from "knip"

/**
 * Monorepo-wide knip config.
 *
 * knip auto-detects the pnpm workspaces declared in `pnpm-workspace.yaml`
 * and enables the Next.js plugin per workspace. This config only adds
 * repo-specific ignores; it does not try to silence findings.
 */
const config: KnipConfig = {
  // `next` is referenced as a TS plugin in packages/typescript-config/nextjs.json,
  // a shared preset whose `next` dependency is resolved by the consuming apps.
  ignoreUnresolved: ["next"],
  workspaces: {
    ".": {
      entry: ["scripts/*.mjs"],
    },
    "apps/web": {
      // zod runs at runtime via @hookform/resolvers/zod (its dist does
      // `import "zod/v4/core"` without declaring zod as a dep or peer).
      // Declared directly as a documented reliance (DEV-78), so knip sees
      // no first-party import.
      ignoreDependencies: ["zod"],
    },
  },
}

export default config
