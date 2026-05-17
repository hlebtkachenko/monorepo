// Vitest config for running Storybook stories via @storybook/addon-vitest.
// Requires browser mode and @vitest/browser-playwright to be set up first.
// Run with: vitest --config vitest.storybook.config.ts
//
// Pre-requisites (not yet installed — run pnpm install after adding to package.json):
//   @vitest/browser-playwright (devDependency)
//
// Enable browser mode by uncommenting the `browser` block below and adding the import.
import { defineConfig, mergeConfig } from "vitest/config"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import path from "path"
import baseConfig from "./vitest.config"

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      storybookTest({
        configDir: path.resolve(__dirname, ".storybook"),
        storybookScript: "pnpm storybook:full --ci",
      }),
    ],
    test: {
      name: "storybook",
      include: ["src/**/*.stories.tsx"],
      setupFiles: ["./.storybook/vitest.setup.ts"],
      globals: true,
      // Uncomment when @vitest/browser-playwright is installed:
      // browser: {
      //   enabled: true,
      //   provider: playwright({}),  // import { playwright } from "@vitest/browser-playwright"
      //   headless: true,
      //   instances: [{ browser: "chromium" }],
      // },
    },
  }),
)
