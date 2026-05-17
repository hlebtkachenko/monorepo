export { bootPostgres18 } from "./postgres"
export type { BootResult } from "./postgres"

// Re-export the started-container type so consumers (vitest globalSetup,
// Playwright globalSetup) can type the `container` handle without taking a
// direct dependency on `@testcontainers/postgresql`.
export type { StartedPostgreSqlContainer } from "@testcontainers/postgresql"
