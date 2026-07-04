/**
 * createVitestGlobalSetup — shared vitest globalSetup factory (#512).
 *
 * packages/db/tests/global-setup.ts and apps/web/tests/global-setup.ts were
 * hand-mirrored copies of the same boot/teardown dance. This factory is the
 * single source: it boots a disposable Postgres 18 testcontainer (via
 * bootPostgres18), exports DATABASE_URL + DATABASE_DIRECT_URL, and returns the
 * { setup, teardown } pair a vitest config consumes.
 *
 * CI mode: when SKIP_TESTCONTAINER=true the container is skipped entirely and
 * the workflow's Postgres service must pre-set DATABASE_URL + DATABASE_DIRECT_URL.
 *
 * `extraEnv` sets additional env vars (each only if not already present) — e.g.
 * apps/web needs BETTER_AUTH_SECRET at Better Auth instance construction.
 */
import { bootPostgres18 } from "./postgres"
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql"

export interface VitestGlobalSetupOptions {
  /**
   * Extra env vars applied at the start of setup(), each only when unset
   * (`process.env[k] ??= v`). Use for secrets a package's singletons need at
   * import time, independent of the testcontainer (e.g. BETTER_AUTH_SECRET).
   */
  extraEnv?: Record<string, string>
}

export interface VitestGlobalSetup {
  setup: () => Promise<void>
  teardown: () => Promise<void>
}

/**
 * Build a vitest globalSetup { setup, teardown } pair backed by a disposable
 * Postgres 18 testcontainer. Call once per vitest config:
 *
 *   export const { setup, teardown } = createVitestGlobalSetup()
 *   // or, with an extra env var:
 *   export const { setup, teardown } = createVitestGlobalSetup({
 *     extraEnv: { BETTER_AUTH_SECRET: "..." },
 *   })
 */
export function createVitestGlobalSetup(
  options: VitestGlobalSetupOptions = {},
): VitestGlobalSetup {
  let container: StartedPostgreSqlContainer | null = null

  async function setup(): Promise<void> {
    applyExtraEnv(options.extraEnv)

    if (process.env["SKIP_TESTCONTAINER"] === "true") {
      const url = process.env["DATABASE_URL"]
      const directUrl = process.env["DATABASE_DIRECT_URL"]
      if (!url || !directUrl) {
        throw new Error(
          "SKIP_TESTCONTAINER=true but DATABASE_URL or DATABASE_DIRECT_URL is not set. " +
            "The CI service container must export both env vars before running tests.",
        )
      }
      return
    }

    const result = await bootPostgres18()
    container = result.container
    process.env["DATABASE_URL"] = result.userUrl
    process.env["DATABASE_DIRECT_URL"] = result.adminUrl
  }

  async function teardown(): Promise<void> {
    if (container) {
      await container.stop()
      container = null
    }
  }

  return { setup, teardown }
}

function applyExtraEnv(extraEnv: Record<string, string> | undefined): void {
  if (!extraEnv) return
  for (const [key, value] of Object.entries(extraEnv)) {
    process.env[key] ??= value
  }
}
