import { test, expect } from "@playwright/test"

test.describe("Forgot password flow", () => {
  test("renders form", async ({ page }) => {
    await page.goto("/auth/forgot-password")
    await expect(
      page.getByRole("textbox", { name: "Work email" }),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Send reset link" }),
    ).toBeEnabled()
  })

  test("validates empty email", async ({ page }) => {
    await page.goto("/auth/forgot-password")
    await page.getByRole("button", { name: "Send reset link" }).click()
    await expect(page.locator("[data-invalid]")).toBeVisible()
  })

  test("has back to login link", async ({ page }) => {
    await page.goto("/auth/forgot-password")
    const backLink = page.locator('a[href="/auth/login"]')
    await expect(backLink.first()).toBeVisible()
  })
})
