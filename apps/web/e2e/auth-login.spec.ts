import { test, expect } from "@playwright/test"

test.describe("Login flow", () => {
  test("renders email step", async ({ page }) => {
    await page.goto("/auth/login")
    await expect(page.locator("input#email")).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeEnabled()
  })

  test("validates empty email", async ({ page }) => {
    await page.goto("/auth/login")
    await page.locator('button[type="submit"]').click()
    await expect(page.locator("[data-invalid]")).toBeVisible()
  })

  test("validates malformed email", async ({ page }) => {
    await page.goto("/auth/login")
    await page.locator("input#email").fill("not-an-email")
    await page.locator('button[type="submit"]').click()
    await expect(page.locator("[data-invalid]")).toBeVisible()
  })

  test("advances to password step on valid email", async ({ page }) => {
    await page.goto("/auth/login")
    await page.locator("input#email").fill("test@example.com")
    await page.locator('button[type="submit"]').click()
    await page.waitForURL("**/auth/login/password**")
    await expect(page.locator("input#password")).toBeVisible()
    await expect(page.locator("input#email-locked")).toHaveValue(
      "test@example.com",
    )
  })

  test("password step redirects to email step without cookie", async ({
    page,
  }) => {
    await page.goto("/auth/login/password")
    await page.waitForURL("**/auth/login?error=loginSessionExpired")
  })

  test("shows error banner for known error codes", async ({ page }) => {
    await page.goto("/auth/login?error=loginSessionExpired")
    await expect(page.locator('[role="alert"]')).toBeVisible()
  })

  test("password step has forgot password link", async ({ page }) => {
    await page.goto("/auth/login")
    await page.locator("input#email").fill("test@example.com")
    await page.locator('button[type="submit"]').click()
    await page.waitForURL("**/auth/login/password**")
    const forgotLink = page.locator('a[href="/auth/forgot-password"]')
    await expect(forgotLink).toBeVisible()
  })

  test("password step has back navigation", async ({ page }) => {
    await page.goto("/auth/login")
    await page.locator("input#email").fill("test@example.com")
    await page.locator('button[type="submit"]').click()
    await page.waitForURL("**/auth/login/password**")
    const backLink = page.locator('a[href="/auth/login"]')
    await expect(backLink.first()).toBeVisible()
  })
})
