import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // NestJS decorators (@Catch, @Injectable, …) call Reflect.defineMetadata
    // at class-eval time; reflect-metadata must patch the global Reflect first.
    setupFiles: ["reflect-metadata"],
  },
})
