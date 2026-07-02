/**
 * T15 — product-route smoke.
 *
 * The e2e suite was auth-only; chrome/layout churn repeatedly broke product
 * pages with no test noticing (AppShell revert #350/#351, /personnel -> /hr).
 * This spec walks every top-level product surface as the seeded owner and
 * asserts: HTTP 200, the page's key landmark, and zero uncaught page errors.
 * Smoke, not depth — one login per test, one pass per route.
 *
 * Routes:
 *   - org dashboard (`/<orgSlug>`, AppShell chrome)
 *   - the 9 org module sections (module pages — the persistent shell + the
 *     sidebar's h2 module title)
 *   - the workspace shell + its workspace/* pages (persistent shell + the
 *     sidebar's h2 module title, same shape as the org sections)
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test, expect, type Page } from "@playwright/test"

interface Seed {
  email: string
  password: string
}

const seed: Seed = JSON.parse(
  readFileSync(resolve(import.meta.dirname, ".auth", "seed.json"), "utf8"),
)

/** Org slug seeded by `seedWorkspaceWithOwner` (hardcoded in the fixture). */
const SEEDED_ORG_SLUG = "e2e-org"

/** The 9 org module sections under `app/[orgSlug]/` — one route directory each. */
const ORG_SECTIONS = [
  "accounting",
  "documents",
  "reports",
  "hr",
  "finance",
  "closing",
  "assets",
  "directory",
  "settings",
] as const

/**
 * The workspace tier under `app/workspace/` — the Home index + one route
 * directory per office module. All render under the persistent workspace shell
 * (same chrome as the org sections), so they assert the shell + the sidebar h2,
 * not an h1 (the tier has no body headings by design).
 */
const WORKSPACE_PAGES = [
  "/workspace",
  "/workspace/clients",
  "/workspace/deadlines",
  "/workspace/agents",
  "/workspace/team",
  "/workspace/inbox",
  "/workspace/billing",
  "/workspace/settings",
  "/workspace/profile",
] as const

/** Same two-step login as tenant-scoped.spec.ts. */
async function loginAsSeededOwner(page: Page): Promise<void> {
  await page.goto("/auth/login")
  await page.getByRole("textbox", { name: "Work email" }).fill(seed.email)
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await page.waitForURL("**/auth/login/password**")
  await page.locator("input#password").fill(seed.password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
    timeout: 15_000,
  })
}

/** Collect uncaught exceptions thrown in the page (hydration crashes etc.). */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("pageerror", (err) => errors.push(String(err)))
  return errors
}

test.describe("Product route smoke", () => {
  test("org dashboard + all 9 sections render for the seeded owner", async ({
    page,
  }) => {
    // 10 sequential navigations in one logged-in pass; dev-server first
    // compiles can be slow, so widen the per-test budget.
    test.setTimeout(120_000)
    const pageErrors = collectPageErrors(page)
    await loginAsSeededOwner(page)

    await test.step(`/${SEEDED_ORG_SLUG} (dashboard)`, async () => {
      const res = await page.goto(`/${SEEDED_ORG_SLUG}`)
      expect(res?.status()).toBe(200)
      // AppShell chrome mounted (rail data-slot asserted in tenant-scoped).
      await expect(page.locator('[data-slot="app-shell"]')).toBeVisible()
    })

    for (const section of ORG_SECTIONS) {
      await test.step(`/${SEEDED_ORG_SLUG}/${section}`, async () => {
        const res = await page.goto(`/${SEEDED_ORG_SLUG}/${section}`)
        expect(res?.status()).toBe(200)
        // The persistent app shell wraps every section; error.tsx renders none
        // of it, so the shell + an h2 (the sidebar's module title) means the
        // right page rendered, not an error boundary.
        await expect(page.locator('[data-slot="app-shell"]')).toBeVisible()
        await expect(
          page.getByRole("heading", { level: 2 }).first(),
        ).toBeVisible()
      })
    }

    expect(pageErrors).toEqual([])
  })

  test("workspace shell + workspace pages render for the seeded owner", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const pageErrors = collectPageErrors(page)
    await loginAsSeededOwner(page)

    for (const path of WORKSPACE_PAGES) {
      await test.step(path, async () => {
        const res = await page.goto(path)
        expect(res?.status()).toBe(200)
        // Every workspace page renders under the persistent shell; error.tsx
        // renders none of it, so the shell + an h2 (the sidebar module title)
        // means the right page rendered, not an error boundary.
        await expect(page.locator('[data-slot="app-shell"]')).toBeVisible()
        await expect(
          page.getByRole("heading", { level: 2 }).first(),
        ).toBeVisible()
      })
    }

    expect(pageErrors).toEqual([])
  })
})
