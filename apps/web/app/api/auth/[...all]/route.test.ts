/**
 * The web Better Auth catchall must reject public email/password registration
 * (`POST /api/auth/sign-up/email`). Afframe has no self-service signup —
 * accounts are created only through the token-gated onboarding server actions,
 * which call `auth.api.signUpEmail` in-process and never traverse this HTTP
 * route. See `route.ts` for the rationale (the web container cannot use
 * `disableSignUp` without also blocking that in-process call).
 *
 * Imports are dynamic so `DATABASE_URL` is bound by globalSetup before the
 * db/auth singletons initialize (apps/web test convention).
 */
import { describe, it, expect } from "vitest"

describe("auth catchall — public signup is closed", () => {
  it("rejects POST /api/auth/sign-up/email with EMAIL_PASSWORD_SIGN_UP_DISABLED", async () => {
    const { POST } = await import("./route")
    const res = await POST(
      new Request("https://app.afframe.com/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "should-be-blocked@example.com",
          password: "longenoughpassword",
          name: "blocked",
        }),
      }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED")
  })

  it("does not intercept other auth POST paths (sign-in reaches Better Auth)", async () => {
    const { POST } = await import("./route")
    const res = await POST(
      new Request("https://app.afframe.com/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com", password: "x" }),
      }),
    )
    // Unknown user / bad creds — Better Auth answers; it is NOT our hard signup
    // block, proving only the sign-up path is intercepted.
    const body = await res.json().catch(() => ({}))
    expect(body.code).not.toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED")
  })
})
