/**
 * T15 — owner onboarding wizard happy path.
 *
 * Drives the full 7-step owner flow end-to-end through the real web app:
 * mint a `sig` signup token (admin SQL, the same row the admin minting
 * surface writes) -> email-link landing -> prefetch-defense consume ->
 * welcome card -> profile -> experience -> password (Better Auth account
 * created) -> workspace (workspace + default organization created) ->
 * plan -> team (skip) -> done -> /workspace chooser -> open the new org's
 * dashboard.
 *
 * Token minting mirrors `packages/auth/src/tokens/format.ts` (ADR-0022):
 * `afkey-<43 base62>-<8 hex>` where the checksum is the UNKEYED
 * sha256("afkey" + body + kind + env) prefix. Recomputing it here (instead
 * of importing `@workspace/auth/tokens`) keeps the spec free of the
 * `@workspace/db` client singleton, which expects a Next.js server context.
 * If the format ever changes, the consume route rejects the token and this
 * spec fails loudly at the first step.
 *
 * Green in both CI mode (`CI=1` -> `pnpm start`, NODE_ENV=production — what
 * .github/workflows/e2e.yml runs) and local dev mode (`pnpm e2e`). The
 * dev-mode 500 this spec originally caught (onboarding _lib passed
 * `insecureLocalDev` for `__Host-` cookie kinds, which `setAuthCookie`
 * refuses) is fixed: the flag is no longer passed — localhost is a
 * trustworthy origin, so Secure cookies work over plain http://localhost.
 */

import { createHash, randomBytes } from "node:crypto"
import { test, expect } from "@playwright/test"
import postgres from "postgres"

/** Unique per run so repeated local runs never collide on the BA email. */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const WIZARD_EMAIL = `wizard-${RUN_ID}@test.invalid`
const WORKSPACE_NAME = `Wizard Works ${RUN_ID}`
const PASSWORD = "E2eWizardPassw0rd!"

function adminSql(): postgres.Sql {
  // DATABASE_DIRECT_URL is stamped on the Playwright runner during config
  // evaluation (db-setup.ts); E2E_DB_DIRECT_URL is the cross-process copy.
  const url =
    process.env["DATABASE_DIRECT_URL"] ?? process.env["E2E_DB_DIRECT_URL"]
  if (!url)
    throw new Error("DATABASE_DIRECT_URL not set — did db-setup.ts run?")
  return postgres(url, { prepare: false, max: 1, onnotice: () => {} })
}

/** Mint a raw `sig` token + its DB hash (format per ADR-0022 / format.ts). */
function mintRawSigToken(env: string): { rawToken: string; tokenHash: string } {
  const alphabet =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
  let body = ""
  while (body.length < 43) {
    const buf = randomBytes(86)
    for (let i = 0; i < buf.length && body.length < 43; i++) {
      const b = buf[i] ?? 255
      // Rejection sampling below 248 avoids the modulo-62 alphabet bias.
      if (b < 248) body += alphabet[b % 62]
    }
  }
  const checksum = createHash("sha256")
    .update("afkey")
    .update(body)
    .update("sig")
    .update(env)
    .digest("hex")
    .slice(0, 8)
  const rawToken = `afkey-${body}-${checksum}`
  const tokenHash = createHash("sha256").update(rawToken).digest("hex")
  return { rawToken, tokenHash }
}

test.describe("Onboarding wizard — owner happy path", () => {
  test("signup token → 7-step wizard → workspace + org → dashboard", async ({
    page,
  }) => {
    // Seven server actions + a BA signup in one pass; dev-server first
    // compiles are the long pole locally.
    test.setTimeout(180_000)

    // --- Mint the signup token (what the admin surface would issue) --------
    // The env code must match the web server's AUTH_TOKEN_ENV (the e2e
    // webServer sets the same `?? "dev"` fallback in playwright.config.ts).
    const tokenEnv = process.env["AUTH_TOKEN_ENV"] ?? "dev"
    const { rawToken, tokenHash } = mintRawSigToken(tokenEnv)
    const sql = adminSql()
    try {
      await sql`
        INSERT INTO auth_token (token_hash, kind, env, payload, expires_at)
        VALUES (
          ${tokenHash}, 'sig', ${tokenEnv},
          ${sql.json({ email: WIZARD_EMAIL, workspace: WORKSPACE_NAME })},
          now() + interval '1 hour'
        )
      `
    } finally {
      await sql.end({ timeout: 5 })
    }

    // --- Email-link landing: prefetch-defense continue form ----------------
    await page.goto(`/auth/signup?token=${rawToken}`)
    await page
      .getByRole("button", { name: "Continue to signup", exact: true })
      .click()

    // Consume route redirects to /auth/signup (welcome card) on success,
    // /auth/signup?invalid=1 on any failure — wait for the path, then make
    // the failure mode explicit.
    await page.waitForURL(
      (url) =>
        url.pathname === "/auth/signup" && !url.searchParams.has("token"),
      { timeout: 15_000 },
    )
    expect(
      new URL(page.url()).searchParams.get("invalid"),
      "signup token consume must succeed (invalid=1 means the token was rejected)",
    ).toBeNull()

    // Welcome card shows the token's email and links into the wizard.
    await expect(page.locator("#signup-email")).toHaveValue(WIZARD_EMAIL)
    await page.getByRole("link", { name: "Begin setup" }).click()

    // --- Step 1: profile ----------------------------------------------------
    await page.waitForURL("**/onboarding/profile")
    await page.locator("#firstName").fill("Wizard")
    await page.locator("#lastName").fill("Owner")
    await page.getByRole("button", { name: "Continue", exact: true }).click()

    // --- Step 2: experience (default option preselected) --------------------
    await page.waitForURL("**/onboarding/experience")
    await page.getByRole("button", { name: "Continue", exact: true }).click()

    // --- Step 3: password — creates the Better Auth account ----------------
    await page.waitForURL("**/onboarding/password")
    await page.locator("#password").fill(PASSWORD)
    await page.locator("#confirm").fill(PASSWORD)
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click()

    // --- Step 4: workspace — creates workspace + default organization ------
    await page.waitForURL("**/onboarding/workspace")
    await page.locator("#displayName").fill(WORKSPACE_NAME)
    await page.getByRole("button", { name: "Continue", exact: true }).click()

    // --- Step 5: plan (recommended plan preselected) ------------------------
    await page.waitForURL("**/onboarding/plan")
    await page.getByRole("button", { name: "Continue", exact: true }).click()

    // --- Step 6: team — skip invites ----------------------------------------
    await page.waitForURL("**/onboarding/team")
    await page
      .getByRole("button", { name: "Skip for now", exact: true })
      .click()

    // --- Step 7: done — celebratory loader, then "Open <brand>" -------------
    await page.waitForURL("**/onboarding/done")
    // The intro MultiStepLoader overlays the card briefly; Playwright's
    // actionability wait handles it, the wide timeout covers the roll.
    // Scoped to our Button primitive (data-slot) — under `pnpm dev` the
    // "Open Next.js Dev Tools" indicator button also matches /^Open /.
    await page
      .locator('button[data-slot="button"]')
      .filter({ hasText: /^Open / })
      .click({ timeout: 20_000 })

    // --- Lands on the workspace chooser with the new workspace + org -------
    await page.waitForURL((url) => url.pathname === "/workspace", {
      timeout: 15_000,
    })
    await expect(
      page.getByRole("heading", { level: 1, name: "Your workspaces" }),
    ).toBeVisible()
    // Workspace card title + the default org row (legal name mirrors the
    // workspace display name).
    await expect(page.getByText(WORKSPACE_NAME).first()).toBeVisible()

    // --- Open the default org → org dashboard shell -------------------------
    await page.getByRole("link", { name: "Open", exact: true }).first().click()
    await page.waitForURL((url) => /^\/wizard-works-/.test(url.pathname), {
      timeout: 15_000,
    })
    await expect(page.locator('[data-slot="app-shell"]')).toBeVisible()
  })
})
