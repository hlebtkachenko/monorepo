import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@workspace/ui": path.resolve(__dirname, "./src"),
      "@workspace/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/components/**/*.tsx"],
      exclude: ["**/*.stories.tsx", "**/*.test.tsx"],
      thresholds: {
        // Floor locked to measured coverage (2026-05-17) — prevents silent regression to zero.
        // Raise these intentionally as test coverage improves.
        statements: 54,
        branches: 42,
        functions: 57,
        lines: 56,
      },
    },
  },
})
