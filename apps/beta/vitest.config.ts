import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@/": resolve("./") + "/",
    },
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "i18n/**/*.test.ts"],
  },
})
