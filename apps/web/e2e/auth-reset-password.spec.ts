import { test, expect } from "@playwright/test"

test.describe("Reset password page", () => {
  test("shows invalid link state without token", async ({ page }) => {
    await page.goto("/auth/reset-password")
    const requestNewLink = page.locator('a[href="/auth/forgot-password"]')
    await expect(requestNewLink).toBeVisible()
  })

  test("renders form with token param", async ({ page }) => {
    await page.goto("/auth/reset-password?token=test-token-123")
    await expect(page.locator("input#password")).toBeVisible()
    await expect(page.locator("input#confirm")).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeEnabled()
  })

  test("has back to login link", async ({ page }) => {
    await page.goto("/auth/reset-password")
    const backLink = page.locator('a[href="/auth/login"]')
    await expect(backLink.first()).toBeVisible()
  })
})
