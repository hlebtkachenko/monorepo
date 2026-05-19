/**
 * C2 — E2E audit event coverage for the Better Auth hooks.after adapter.
 *
 * Verifies that failing login attempts produce `auth.login.failed_password`
 * rows in `audit_event`. The testcontainer DB is booted by playwright.config.ts
 * (db-setup.ts) and the seed credentials are written to e2e/.auth/seed.json.
 *
 * This spec uses the admin (superuser) DB URL to read audit rows without
 * fighting RLS — the same pattern as the DB integration tests.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test, expect } from "@playwright/test"
import postgres from "postgres"

interface Seed {
  email: string
  password: string
  userId: string
  workspaceId: string
}

const seed: Seed = JSON.parse(
  readFileSync(resolve(import.meta.dirname, ".auth", "seed.json"), "utf8"),
)

function adminSql(): postgres.Sql {
  const url = process.env["DATABASE_DIRECT_URL"]
  if (!url)
    throw new Error("DATABASE_DIRECT_URL not set — did globalSetup run?")
  return postgres(url, { prepare: false, max: 1, onnotice: () => {} })
}

test.describe("Auth audit events — failed login", () => {
  test("two failed login attempts produce two auth.login.failed_password rows", async ({
    page,
  }) => {
    const sql = adminSql()
    try {
      // Baseline: count existing failed-login rows before the test.
      const [before] = await sql<Array<{ count: string }>>`
        SELECT count(*)::text AS count
        FROM audit_event
        WHERE action = 'auth.login.failed_password'
      `
      const countBefore = Number(before?.count ?? 0)

      // Attempt 1 — wrong password via the browser UI.
      await page.goto("/auth/login")
      await page.getByRole("textbox", { name: "Work email" }).fill(seed.email)
      await page.getByRole("button", { name: "Continue", exact: true }).click()
      await page.waitForURL("**/auth/login/password**")
      await page.locator("input#password").fill("WrongPassw0rd!1")
      await page.getByRole("button", { name: "Sign in", exact: true }).click()
      // Wait for the error banner to confirm the attempt was processed.
      await expect(
        page.getByRole("alert").filter({ hasText: /\S/ }),
      ).toBeVisible()

      // Attempt 2 — another wrong password.
      await page.locator("input#password").fill("WrongPassw0rd!2")
      await page.getByRole("button", { name: "Sign in", exact: true }).click()
      await expect(
        page.getByRole("alert").filter({ hasText: /\S/ }),
      ).toBeVisible()

      // Allow a brief moment for the async audit write to complete.
      await page.waitForTimeout(500)

      const [after] = await sql<Array<{ count: string }>>`
        SELECT count(*)::text AS count
        FROM audit_event
        WHERE action = 'auth.login.failed_password'
      `
      const countAfter = Number(after?.count ?? 0)

      expect(countAfter - countBefore).toBeGreaterThanOrEqual(2)
    } finally {
      await sql.end({ timeout: 5 })
    }
  })
})
