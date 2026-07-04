/**
 * Vitest globalSetup for apps/web integration tests.
 *
 * Boots a disposable Postgres 18 testcontainer via the shared
 * @workspace/testcontainers factory (createVitestGlobalSetup) — the same
 * implementation packages/db uses, so the two global-setups no longer mirror
 * each other by hand. The `extraEnv` option supplies BETTER_AUTH_SECRET, which
 * Better Auth validates at instance construction when a web test file
 * dynamically imports the auth singleton.
 *
 * CI: when SKIP_TESTCONTAINER=true, the workflow provides a live Postgres 18
 * service and pre-sets DATABASE_URL + DATABASE_DIRECT_URL.
 */
import { createVitestGlobalSetup } from "@workspace/testcontainers"

export const { setup, teardown } = createVitestGlobalSetup({
  extraEnv: {
    BETTER_AUTH_SECRET: "web-integration-test-secret-0123456789ab",
  },
})
