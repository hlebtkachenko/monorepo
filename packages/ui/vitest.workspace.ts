import { defineConfig } from "vitest/config"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"

export default [
  "vitest.config.ts",
  defineConfig({
    plugins: [await storybookTest({ configDir: "./.storybook" })],
    test: {
      name: "storybook",
      browser: {
        enabled: true,
        headless: true,
        provider: "playwright" as any,
        instances: [{ browser: "chromium" }, { browser: "webkit" }],
      },
      setupFiles: ["./vitest.setup.ts"],
    },
  }),
]
