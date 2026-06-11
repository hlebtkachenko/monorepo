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
 *   - the 12 org sections (SectionStub pages — h2 + canonical path marker)
 *   - the workspace chooser + 4 workspace/* pages (h1 landmarks)
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

/** The 12 org sections under `app/[orgSlug]/` — one route directory each. */
const ORG_SECTIONS = [
  "accounting",
  "transactions",
  "documents",
  "reports",
  "hr",
  "finance",
  "taxes",
  "closing",
  "assets",
  "inbox",
  "directory",
  "settings",
] as const

/** Workspace chooser + the 4 workspace pages, with their h1 landmarks. */
const WORKSPACE_PAGES = [
  { path: "/workspace", heading: "Your workspaces" },
  { path: "/workspace/inbox", heading: "Inbox" },
  { path: "/workspace/profile", heading: "Your profile" },
  { path: "/workspace/settings", heading: "Workspace settings" },
  { path: "/workspace/billing", heading: "Billing" },
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
  test("org dashboard + all 12 sections render for the seeded owner", async ({
    page,
  }) => {
    // 13 sequential navigations in one logged-in pass; dev-server first
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
        // SectionStub's canonical path marker doubles as a "right page,
        // no error boundary" landmark (error.tsx renders none of this).
        await expect(
          page.getByText(`/${SEEDED_ORG_SLUG}/${section}`, { exact: true }),
        ).toBeVisible()
        await expect(
          page.getByRole("heading", { level: 2 }).first(),
        ).toBeVisible()
      })
    }

    expect(pageErrors).toEqual([])
  })

  test("workspace chooser + workspace pages render for the seeded owner", async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const pageErrors = collectPageErrors(page)
    await loginAsSeededOwner(page)

    for (const { path, heading } of WORKSPACE_PAGES) {
      await test.step(path, async () => {
        const res = await page.goto(path)
        expect(res?.status()).toBe(200)
        await expect(
          page.getByRole("heading", { level: 1, name: heading }),
        ).toBeVisible()
      })
    }

    expect(pageErrors).toEqual([])
  })
})
