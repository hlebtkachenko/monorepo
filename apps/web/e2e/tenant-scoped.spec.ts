/**
 * AFF-123 / E14c — tenant-scoped page smoke tests.
 *
 * Verifies three access-control properties of the org-scoped layout
 * (`app/[orgSlug]/layout.tsx`):
 *
 *   (a) A signed-in owner whose session was established through the real login
 *       flow can access the seeded org's dashboard — no redirect back to auth.
 *
 *   (b) An unauthenticated browser navigating to an org-scoped path is
 *       redirected to /auth/login with a `next` query param.
 *
 *   (c) A signed-in owner hitting an org slug they are NOT a member of is
 *       redirected to /workspace?error=no-access (access denied, not a 500).
 *
 * Credentials and org slug come exclusively from the E14a seed infrastructure
 * (`e2e/db-setup.ts` + `packages/db/tests/fixtures.ts`). The org slug is
 * hardcoded as `e2e-org` in `seedWorkspaceWithOwner`; we surface it from a
 * const here so a future fixture change has one place to update.
 *
 * No `playwright test` is run by the author — the orchestrator runs the full
 * E2E suite at the milestone gate.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test, expect } from "@playwright/test"

// ---------------------------------------------------------------------------
// Seed file
// ---------------------------------------------------------------------------

/**
 * Shape written by `db-setup.ts` → `seedWorkspaceWithOwner` to
 * `e2e/.auth/seed.json`.
 */
interface Seed {
  email: string
  password: string
  userId: string
  workspaceId: string
  workspaceMembershipId: string
  organizationId: string
  organizationMembershipId: string
}

const seed: Seed = JSON.parse(
  readFileSync(resolve(import.meta.dirname, ".auth", "seed.json"), "utf8"),
)

/**
 * Org slug seeded by `seedWorkspaceWithOwner` (hardcoded in the fixture).
 * The seeded org is the one the owner user belongs to.
 */
const SEEDED_ORG_SLUG = "e2e-org"

/**
 * A slug that is syntactically valid but guaranteed to not exist in the
 * testcontainer DB (no fixture creates it). Used to exercise the
 * no-membership gate.
 */
const NONEXISTENT_ORG_SLUG = "no-such-org-in-this-db"

// ---------------------------------------------------------------------------
// Helper — shared login sequence
// ---------------------------------------------------------------------------

/**
 * Perform the two-step email → password login with the seeded credentials
 * and wait until the browser has navigated away from the password step.
 * Returns after a Better Auth session cookie has been set.
 */
async function loginAsSeededOwner(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.goto("/auth/login")
  await page.getByRole("textbox", { name: "Work email" }).fill(seed.email)
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await page.waitForURL("**/auth/login/password**")

  await page.locator("input#password").fill(seed.password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()

  // Wait for the post-login redirect chain to fully settle.
  //
  // Form's `onNavigate("/workspace")` is a client-side `router.push`.
  // `/workspace` then server-redirects to the user's first org
  // (`/<seed-org-slug>`). A naive `waitForURL(url !== /auth/login/password)`
  // returned as soon as the first push committed, before the bounce
  // resolved — any subsequent `page.goto(...)` in the test body then
  // raced the queued bounce and Playwright aborted with "interrupted by
  // another navigation to /workspace".
  //
  // Post-E1 the workspace chooser at /workspace stays put (no further
  // redirect to /<orgSlug>), so the helper waits for the URL to leave
  // /auth/login + networkidle so any explicit page.goto in the test
  // body navigates from a fully-settled state.
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
    timeout: 15_000,
  })
  await page.waitForLoadState("networkidle")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Tenant-scoped page access", () => {
  // (a) Authenticated owner can reach the seeded org dashboard ---------------

  test("(a) authenticated owner reaches the seeded org dashboard", async ({
    page,
  }) => {
    await loginAsSeededOwner(page)

    // Navigate directly to the seeded org's root route.
    await page.goto(`/${SEEDED_ORG_SLUG}`)

    // The layout resolves the membership and renders the org shell — URL must
    // stay at /<orgSlug> (no redirect to auth or workspace).
    await expect(page).toHaveURL(new RegExp(`/${SEEDED_ORG_SLUG}$`), {
      timeout: 10_000,
    })

    // The org sidebar nav must be present, confirming the layout rendered.
    // `nav` is the semantic element used for the sidebar link list.
    await expect(page.locator("nav")).toBeVisible()

    // The layout injects the org's legalName ("E2E Organization") into the
    // aside header; verify without brittle text matching — just that the aside
    // renders. Using role="complementary" (aside) as the stable selector.
    await expect(page.locator("aside")).toBeVisible()
  })

  // (b) Unauthenticated browser is gated and redirected to login --------------

  test("(b) unauthenticated browser is redirected to login for org-scoped route", async ({
    page,
  }) => {
    // No login step — fresh browser context with no session cookie.
    await page.goto(`/${SEEDED_ORG_SLUG}`)

    // The layout must redirect to /auth/login and include `next` so the app
    // can bounce the user back after they sign in.
    await page.waitForURL(
      (url) =>
        url.pathname === "/auth/login" &&
        url.searchParams.get("next") === `/${SEEDED_ORG_SLUG}`,
      { timeout: 10_000 },
    )
  })

  // (c) Member hitting a non-member org is denied ----------------------------

  test("(c) authenticated owner denied access to a non-member org slug", async ({
    page,
  }) => {
    await loginAsSeededOwner(page)

    // Navigate to a slug the seeded owner has no membership for.
    await page.goto(`/${NONEXISTENT_ORG_SLUG}`)

    // The org layout's resolveMembership returns null for a slug the user is
    // not a member of (or that does not exist). It then redirects to
    // /workspace?error=no-access.
    await page.waitForURL(
      (url) =>
        url.pathname === "/workspace" &&
        url.searchParams.get("error") === "no-access",
      { timeout: 10_000 },
    )
  })
})
