/**
 * AFF-115 / E14a — proves the loginable-user seed produced by the Playwright
 * globalSetup (apps/web/e2e/global-setup.ts) authenticates through the real
 * browser login flow against the booted testcontainer DB.
 *
 * The seeded owner's credentials are read from e2e/.auth/seed.json, which
 * globalSetup writes after running `seedWorkspaceWithOwner`.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test, expect } from "@playwright/test"

interface Seed {
  email: string
  password: string
  userId: string
  workspaceId: string
}

const seed: Seed = JSON.parse(
  readFileSync(resolve(import.meta.dirname, ".auth", "seed.json"), "utf8"),
)

test.describe("Seeded owner — real credential login", () => {
  test("signs in with the seeded email + password and gets a session", async ({
    page,
  }) => {
    // Email step.
    await page.goto("/auth/login")
    await page.getByRole("textbox", { name: "Work email" }).fill(seed.email)
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await page.waitForURL("**/auth/login/password**")

    // Password step — submit the seeded credential.
    await page.locator("input#password").fill(seed.password)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()

    // A successful Better Auth sign-in leaves the /auth/login/password step:
    // the credential verified and a session cookie was set. The exact landing
    // route depends on onboarding state, so only assert we left the password
    // step and no credential error surfaced.
    await page.waitForURL(
      (url) => !url.pathname.includes("/auth/login/password"),
      {
        timeout: 15_000,
      },
    )

    const sessionCookie = (await page.context().cookies()).find((c) =>
      c.name.includes("session"),
    )
    expect(sessionCookie, "a Better Auth session cookie was set").toBeDefined()
  })

  test("rejects the seeded email with a wrong password", async ({ page }) => {
    await page.goto("/auth/login")
    await page.getByRole("textbox", { name: "Work email" }).fill(seed.email)
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await page.waitForURL("**/auth/login/password**")

    await page.locator("input#password").fill("DefinitelyWrongPassw0rd!")
    await page.getByRole("button", { name: "Sign in", exact: true }).click()

    // Stays on the password step with a credential error banner.
    await expect(
      page.getByRole("alert").filter({ hasText: /\S/ }),
    ).toBeVisible()
    expect(page.url()).toContain("/auth/login/password")
  })
})
