import { defineConfig, devices } from "@playwright/test"

const PORT = Number(process.env.PORT ?? 3010)
const BASE_URL = `http://localhost:${PORT}`
const IS_CI = !!process.env.CI

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
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
  },
})
