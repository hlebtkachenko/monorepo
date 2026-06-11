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
  // Auth events are global-tier: migration 0021 (AFF-208) made
  // `audit_event.workspace_id` nullable and writeAuditEventGlobal now
  // persists NULL-workspace rows (DB-level proof in
  // packages/db/tests/write-audit-event.test.ts). This spec covers the
  // remaining end-to-end gap: BA hooks.after -> audit row through the real
  // web app.
  //
  // Tripwire for the failure-classification path: `isSuccess()` in
  // packages/auth/src/server.ts once treated only a numeric `status` as
  // failure, but better-call's APIError carries a STRING status
  // ("UNAUTHORIZED"; the number lives in `statusCode`) — every failed login
  // was audited as `auth.login.success` (actor_user_id NULL). Fixed
  // 2026-06-11 (instanceof APIError + statusCode probe, unit cases in
  // packages/auth/src/server-hooks.test.ts); this spec caught it and guards
  // the regression.
  test("two failed login attempts produce two auth.login.failed_password rows", async ({
    page,
  }) => {
    const sql = adminSql()
    try {
      // Time-window anchor (DB clock, not the runner's): under local
      // fullyParallel other specs' failed logins could otherwise supply
      // the row delta.
      const [anchor] = await sql<Array<{ now: string }>>`
        SELECT now()::text AS now
      `
      const testStart = anchor!.now

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

      // Rows written during this test, with the shape the hook promises:
      // global-tier (workspace_id NULL) and pre-auth (actor_user_id NULL).
      const rows = await sql<
        Array<{ workspace_id: string | null; actor_user_id: string | null }>
      >`
        SELECT workspace_id::text, actor_user_id::text
        FROM audit_event
        WHERE action = 'auth.login.failed_password'
          AND created_at > ${testStart}::timestamptz
      `

      expect(rows.length).toBeGreaterThanOrEqual(2)
      for (const row of rows) {
        expect(row.workspace_id).toBeNull()
        expect(row.actor_user_id).toBeNull()
      }
    } finally {
      await sql.end({ timeout: 5 })
    }
  })
})
