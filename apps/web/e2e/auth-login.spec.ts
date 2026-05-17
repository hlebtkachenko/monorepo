import { test, expect } from "@playwright/test"

test.describe("Login flow", () => {
  test("renders email step", async ({ page }) => {
    await page.goto("/auth/login")
    await expect(
      page.getByRole("textbox", { name: "Work email" }),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Continue", exact: true }),
    ).toBeEnabled()
  })

  test("validates empty email", async ({ page }) => {
    await page.goto("/auth/login")
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await expect(page.locator("[data-invalid]")).toBeVisible()
  })

  test("validates malformed email", async ({ page }) => {
    await page.goto("/auth/login")
    await page.getByRole("textbox", { name: "Work email" }).fill("not-an-email")
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await expect(page.locator("[data-invalid]")).toBeVisible()
  })

  test("advances to password step on valid email", async ({ page }) => {
    await page.goto("/auth/login")
    await page
      .getByRole("textbox", { name: "Work email" })
      .fill("test@example.com")
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await page.waitForURL("**/auth/login/password**")
    // PasswordInput's visibility-toggle button shares the "password" label
    // token, so getByLabel is ambiguous here — the id selector is the stable
    // choice for password fields.
    await expect(page.locator("input#password")).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue(
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
    // `getByRole("alert")` also matches Next.js's empty route-announcer div,
    // so filter to the banner that actually carries text.
    await expect(
      page.getByRole("alert").filter({ hasText: /\S/ }),
    ).toBeVisible()
  })

  test("password step has forgot password link", async ({ page }) => {
    await page.goto("/auth/login")
    await page
      .getByRole("textbox", { name: "Work email" })
      .fill("test@example.com")
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await page.waitForURL("**/auth/login/password**")
    const forgotLink = page.locator('a[href="/auth/forgot-password"]')
    await expect(forgotLink).toBeVisible()
  })

  test("password step has back navigation", async ({ page }) => {
    await page.goto("/auth/login")
    await page
      .getByRole("textbox", { name: "Work email" })
      .fill("test@example.com")
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await page.waitForURL("**/auth/login/password**")
    const backLink = page.locator('a[href="/auth/login"]')
    await expect(backLink.first()).toBeVisible()
  })
})
