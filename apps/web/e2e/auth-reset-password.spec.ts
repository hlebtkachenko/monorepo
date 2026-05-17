import { test, expect } from "@playwright/test"

test.describe("Reset password page", () => {
  test("shows invalid link state without token", async ({ page }) => {
    await page.goto("/auth/reset-password")
    const requestNewLink = page.locator('a[href="/auth/forgot-password"]')
    await expect(requestNewLink).toBeVisible()
  })

  test("renders form with token param", async ({ page }) => {
    await page.goto("/auth/reset-password?token=test-token-123")
    await expect(page.getByLabel("New password")).toBeVisible()
    await expect(page.getByLabel("Confirm password")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Reset password" }),
    ).toBeEnabled()
  })

  test("has back to login link", async ({ page }) => {
    await page.goto("/auth/reset-password")
    const backLink = page.locator('a[href="/auth/login"]')
    await expect(backLink.first()).toBeVisible()
  })

  test("shows an error when the reset token is rejected", async ({ page }) => {
    await page.goto("/auth/reset-password?token=expired-invalid-token")
    await page.getByLabel("New password").fill("Str0ng-Passw0rd!")
    await page.getByLabel("Confirm password").fill("Str0ng-Passw0rd!")
    await page.getByRole("button", { name: "Reset password" }).click()
    // An expired or invalid token is rejected server-side: the form surfaces
    // an error banner and never reaches the success state.
    await expect(
      page.getByRole("alert").filter({ hasText: /\S/ }),
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Password updated" }),
    ).toHaveCount(0)
  })
})
