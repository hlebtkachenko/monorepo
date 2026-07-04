export { bootPostgres18 } from "./postgres"
export type { BootResult } from "./postgres"

// Shared vitest globalSetup factory — one implementation for packages/db and
// apps/web (previously hand-mirrored). See vitest-global-setup.ts.
export { createVitestGlobalSetup } from "./vitest-global-setup"
export type {
  VitestGlobalSetup,
  VitestGlobalSetupOptions,
} from "./vitest-global-setup"

// Re-export the started-container type so consumers (vitest globalSetup,
// Playwright globalSetup) can type the `container` handle without taking a
// direct dependency on `@testcontainers/postgresql`.
export type { StartedPostgreSqlContainer } from "@testcontainers/postgresql"
