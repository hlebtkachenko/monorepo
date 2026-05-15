import { test, expect } from "@playwright/test"

test.describe("Page navigation", () => {
  test("login page loads with correct structure", async ({ page }) => {
    await page.goto("/auth/login")
    await expect(page.locator("h2")).toBeVisible()
    await expect(page.locator("form")).toBeVisible()
    await expect(page.locator("footer")).toBeVisible()
  })

  test("forgot-password navigable from login flow", async ({ page }) => {
    await page.goto("/auth/login")
    await page.locator("input#email").fill("test@example.com")
    await page.locator('button[type="submit"]').click()
    await page.waitForURL("**/auth/login/password**")
    await page.locator('a[href="/auth/forgot-password"]').click()
    await page.waitForURL("**/auth/forgot-password")
    await expect(page.locator("input#email")).toBeVisible()
  })

  test("back to login from forgot-password", async ({ page }) => {
    await page.goto("/auth/forgot-password")
    await page.locator('a[href="/auth/login"]').first().click()
    await page.waitForURL("**/auth/login")
    await expect(page.locator("input#email")).toBeVisible()
  })
})
