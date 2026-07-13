import { resolve } from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "server-only": resolve(
        "../../node_modules/.pnpm/server-only@0.0.1/node_modules/server-only/empty.js",
      ),
      "@/": resolve("./") + "/",
    },
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "lib/**/*.test.ts"],
    env: {
      BETTER_AUTH_SECRET:
        "test-better-auth-secret-32-bytes-minimum-padding-padding",
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      ADMIN_WORKSPACE_ALLOWLIST: "00000000-0000-0000-0000-000000000000",
    },
  },
})
