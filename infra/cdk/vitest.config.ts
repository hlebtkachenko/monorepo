import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    pool: "threads",
    // CDK Template.fromStack synthesizes a full stack per call (~2-3s on a
    // fast machine); the 5s default flakes on slower CI runners.
    testTimeout: 30_000,
  },
})
