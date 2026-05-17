import { defineConfig, devices } from "@playwright/test"
import { bootAndSeedDatabase } from "./e2e/db-setup"

const PORT = Number(process.env.PORT ?? 3010)
const BASE_URL = `http://localhost:${PORT}`
const IS_CI = !!process.env.CI

// AFF-115 / E14a — boot the disposable Postgres 18 testcontainer (shared
// `bootPostgres18` helper, no forked compose file) and seed a loginable
// workspace owner BEFORE `defineConfig`, so the ephemeral connection URLs can
// be passed into `webServer.env`. `webServer.env` is the only Playwright
// contract that reliably delivers env into the spawned Next.js server —
// process.env mutations in `globalSetup` do not survive the `pnpm dev|start`
// + Turbopack re-spawn. `global-teardown.ts` stops the container afterwards.
const e2eDb = await bootAndSeedDatabase()

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  workers: IS_CI ? 1 : undefined,
  reporter: IS_CI
    ? [["github"], ["html", { outputFolder: "playwright-report" }]]
    : "html",
  timeout: 30_000,

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: IS_CI ? `pnpm start --port ${PORT}` : `pnpm dev --port ${PORT}`,
    port: PORT,
    reuseExistingServer: !IS_CI,
    timeout: 60_000,
    // The booted testcontainer is the database for the run. Pass its URLs
    // explicitly so the Next.js server (db client + Better Auth) connects to
    // it. `...process.env` keeps the rest of the parent environment.
    env: {
      ...process.env,
      DATABASE_URL: e2eDb.databaseUrl,
      DATABASE_DIRECT_URL: e2eDb.databaseDirectUrl,
    },
  },
})
