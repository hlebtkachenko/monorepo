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
    },
  },
})
