import { test, expect } from "@playwright/test"

test.describe("Auth guards and redirects", () => {
  test("onboarding redirects to login without session", async ({ page }) => {
    await page.goto("/onboarding/profile")
    await page.waitForURL("**/auth/login?error=onboarding-session-expired")
  })

  test("signup page redirects to login without token", async ({ page }) => {
    await page.goto("/auth/signup")
    await page.waitForURL("**/auth/login?error=missing-signup-token")
  })

  test("MFA page is accessible", async ({ page }) => {
    await page.goto("/auth/login/mfa")
    // MFA step requires login-email cookie; should redirect back to login
    await page.waitForURL("**/auth/login?error=loginSessionExpired")
  })
})
