/**
 * Rebuilt org tree (`/o`) smoke.
 *
 * The org UI is being rebuilt in a parallel clean-room tree at
 * `app/o/[orgSlug]/` behind a temporary `/o` prefix, alongside the frozen old
 * tree at `app/[orgSlug]/`. This asserts, as the seeded owner:
 *   - `/o/<slug>` returns 200 and mounts the new AppShell (static `o` beats the
 *     dynamic `[orgSlug]` sibling — no route collision);
 *   - the active period is URL-authoritative (`?period=` reaches the page);
 *   - the old tree at `/<slug>` still renders unchanged during coexistence.
 * Smoke, not depth — one login, one pass.
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

/** Same two-step login as product-routes.spec.ts. */
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

test.describe("Rebuilt org tree (/o) smoke", () => {
  test("the /o parallel tree renders and is URL-period-driven", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const pageErrors = collectPageErrors(page)
    await loginAsSeededOwner(page)

    await test.step(`/o/${SEEDED_ORG_SLUG} mounts the new shell`, async () => {
      const res = await page.goto(`/o/${SEEDED_ORG_SLUG}`)
      expect(res?.status()).toBe(200)
      // AppShell chrome mounted — error.tsx renders none of it.
      await expect(page.locator('[data-slot="app-shell"]')).toBeVisible()
      await expect(page.getByText("rebuilt tree · /o")).toBeVisible()
    })

    await test.step("?period= reaches the page (URL-authoritative)", async () => {
      const res = await page.goto(`/o/${SEEDED_ORG_SLUG}?period=smoke-token`)
      expect(res?.status()).toBe(200)
      // The temp home echoes the raw ?period param, proving it flows through.
      await expect(page.getByText("smoke-token")).toBeVisible()
    })

    await test.step(`/${SEEDED_ORG_SLUG} (old tree) still renders`, async () => {
      const res = await page.goto(`/${SEEDED_ORG_SLUG}`)
      expect(res?.status()).toBe(200)
      await expect(page.locator('[data-slot="app-shell"]')).toBeVisible()
    })

    expect(pageErrors).toEqual([])
  })
})
