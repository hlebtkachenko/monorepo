/**
 * AFF-122 / E14b — API-level auth round-trip E2E test.
 *
 * Calls the Better Auth HTTP API directly (no browser UI) using Playwright's
 * `request` fixture. Verifies:
 *
 *   1. POST /api/auth/sign-in/email with the seeded credentials → 200, session
 *      cookie, bearer token.
 *   2. GET /api/auth/get-session with the returned bearer token → active session
 *      containing the seeded user id.
 *   3. A protected page (navigated via `page` with the session cookie installed)
 *      loads without redirecting to /auth/login.
 *   4. POST /api/auth/sign-in/email with a wrong password → non-2xx, no session
 *      cookie.
 *
 * Credentials come from e2e/.auth/seed.json — the same file db-setup.ts writes
 * during Playwright config evaluation. No extra seeding, no hardcoded values.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test, expect } from "@playwright/test"

interface Seed {
  email: string
  password: string
  userId: string
  workspaceId: string
}

const seed: Seed = JSON.parse(
  readFileSync(resolve(import.meta.dirname, ".auth", "seed.json"), "utf8"),
)

test.describe("Better Auth — API-level sign-in round-trip", () => {
  test("signs in with seeded credentials and receives a session token + cookie", async ({
    request,
  }) => {
    const response = await request.post("/api/auth/sign-in/email", {
      data: { email: seed.email, password: seed.password },
      headers: { "Content-Type": "application/json" },
    })

    // Successful sign-in returns 200.
    expect(response.status(), "sign-in should return HTTP 200").toBe(200)

    const body = await response.json()

    // Better Auth returns `token` on the response body.
    expect(
      body.token,
      "response body must contain a session token",
    ).toBeTruthy()
    expect(typeof body.token).toBe("string")

    // The user block must carry the seeded user id.
    expect(body.user?.id, "response user.id must match the seeded userId").toBe(
      seed.userId,
    )

    // A Set-Cookie header carrying the session cookie must be present.
    const allHeaders = response.headers()
    const setCookie = allHeaders["set-cookie"] ?? ""
    expect(
      setCookie.toLowerCase(),
      "Set-Cookie header must carry a better-auth session cookie",
    ).toMatch(/better-auth\.session_token|session/i)
  })

  test("session token from sign-in resolves to an active session via GET /api/auth/get-session", async ({
    request,
  }) => {
    // Step 1 — sign in to obtain a bearer token.
    const signInResponse = await request.post("/api/auth/sign-in/email", {
      data: { email: seed.email, password: seed.password },
      headers: { "Content-Type": "application/json" },
    })
    expect(signInResponse.status()).toBe(200)
    const { token } = await signInResponse.json()
    expect(token).toBeTruthy()

    // Step 2 — use the bearer token to fetch the session.
    const sessionResponse = await request.get("/api/auth/get-session", {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(
      sessionResponse.status(),
      "get-session with a valid bearer token must return 200",
    ).toBe(200)

    const session = await sessionResponse.json()

    // The session must be for the seeded user.
    expect(
      session.user?.id,
      "session user.id must match the seeded userId",
    ).toBe(seed.userId)
    expect(
      session.user?.email,
      "session user.email must match the seeded email",
    ).toBe(seed.email)

    // The session itself must be present.
    expect(session.session, "session object must be present").toBeTruthy()
  })

  test("authenticated session cookie grants access to a protected page without redirect", async ({
    page,
  }) => {
    // Step 1 — sign in via the page's own request context so the session
    // cookie lands in the browser context that `page` uses. The standalone
    // `request` fixture is a separate APIRequestContext with its own cookie
    // store; it does NOT share cookies with `page`. `page.request` IS bound
    // to the page's browser context and therefore shares the cookie jar.
    const signInResponse = await page.request.post("/api/auth/sign-in/email", {
      data: { email: seed.email, password: seed.password },
      headers: { "Content-Type": "application/json" },
    })
    expect(signInResponse.status()).toBe(200)

    // Step 2 — navigate to a session-protected page. /workspace requires a
    // valid Better Auth session (redirects to /auth/login when absent). It
    // does NOT require any additional onboarding-state cookies or tokens, so
    // it is a clean proxy for "is the session usable?". The seeded owner has
    // a workspace and org, so the page renders (no redirect).
    await page.goto("/workspace")

    // Assert we are NOT on the login page.
    expect(
      page.url(),
      "authenticated navigation must not redirect to login",
    ).not.toContain("/auth/login")
  })

  test("wrong password returns an auth failure without a session", async ({
    request,
  }) => {
    const response = await request.post("/api/auth/sign-in/email", {
      data: { email: seed.email, password: "DefinitelyWrongPassw0rd!" },
      headers: { "Content-Type": "application/json" },
    })

    // Better Auth returns a non-2xx status (typically 401 or 422) for invalid
    // credentials. Assert the status is in the 4xx range.
    expect(
      response.status(),
      "wrong password must return a 4xx status",
    ).toBeGreaterThanOrEqual(400)
    expect(
      response.status(),
      "wrong password must return a 4xx status",
    ).toBeLessThan(500)

    // `ok()` is false for any non-2xx status — belt-and-suspenders check.
    expect(response.ok(), "wrong password response must not be ok()").toBe(
      false,
    )

    // No session cookie must be present.
    const allHeaders = response.headers()
    const setCookie = allHeaders["set-cookie"] ?? ""
    expect(
      setCookie.toLowerCase(),
      "failed sign-in must not issue a session cookie",
    ).not.toMatch(/better-auth\.session_token|session/i)
  })
})
