import { test, expect } from "@playwright/test"

test.describe("Forgot password flow", () => {
  test("renders form", async ({ page }) => {
    await page.goto("/auth/forgot-password")
    await expect(page.locator("input#email")).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeEnabled()
  })

  test("validates empty email", async ({ page }) => {
    await page.goto("/auth/forgot-password")
    await page.locator('button[type="submit"]').click()
    await expect(page.locator("[data-invalid]")).toBeVisible()
  })

  test("has back to login link", async ({ page }) => {
    await page.goto("/auth/forgot-password")
    const backLink = page.locator('a[href="/auth/login"]')
    await expect(backLink.first()).toBeVisible()
  })
})
