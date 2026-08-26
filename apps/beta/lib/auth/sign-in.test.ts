/**
 * The Better Auth instance itself: what it emits, what it refuses, and what it
 * refuses to recognise.
 *
 * The cookie assertions are the load-bearing ones. `beta.afframe.com` sits
 * under the apex the main product signs its session cookie for, so a prod
 * cookie physically arrives here on every request — the emitted name and the
 * `__Host-` attributes are what keep the two auth systems from ever meeting.
 */
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"

import { sharedDatabaseUrl, unique } from "../../tests/scratch-db"

process.env["BETTER_AUTH_SECRET"] ??= `beta-test-secret-${"x".repeat(40)}`
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3200"

const { betaAuth } = await import("./server")
const { BETA_SESSION_COOKIE_NAME } = await import("./policy")
const { consumeSetupToken, generateSetupToken, hashSetupToken } =
  await import("./setup-token")

const sql = postgres(sharedDatabaseUrl(), { max: 4, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

const PASSWORD = "Beta-Heslo-2026!"

/** A real account, created the only way beta allows: through a setup link. */
async function account(): Promise<{ email: string; userId: string }> {
  const email = `${unique("member")}@example.com`
  const [staff] = await sql<{ id: string }[]>`
    INSERT INTO app_user (email, is_staff)
    VALUES (${`${unique("staff")}@example.com`}, true)
    RETURNING id
  `
  const raw = generateSetupToken()
  await sql`
    INSERT INTO user_setup_token
      (purpose, token_hash, email, issued_by_user_id, expires_at)
    VALUES ('account_setup', ${hashSetupToken(raw)}, ${email}, ${staff!.id},
            now() + interval '71 hours')
  `
  const result = await consumeSetupToken({
    rawToken: raw,
    allowedPurposes: ["account_setup"],
    password: PASSWORD,
    ip: null,
    userAgent: null,
  })
  if (!result.ok) throw new Error("fixture: setup link was refused")
  return { email, userId: result.userId }
}

function parseAttributes(setCookie: string): Map<string, string> {
  const parts = setCookie.split(";").slice(1)
  return new Map(
    parts.map((part) => {
      const [key, value = ""] = part.trim().split("=")
      return [key!.toLowerCase(), value]
    }),
  )
}

describe("sign-in", () => {
  it("accepts the right password", async () => {
    const { email, userId } = await account()
    const result = await betaAuth().api.signInEmail({
      body: { email, password: PASSWORD },
    })
    expect(result.user.id).toBe(userId)
  })

  it("refuses the wrong password", async () => {
    const { email } = await account()
    await expect(
      betaAuth().api.signInEmail({
        body: { email, password: "Wrong-Pass-1!" },
      }),
    ).rejects.toThrow()
  })

  it("refuses a deactivated account", async () => {
    const { email, userId } = await account()
    await sql`UPDATE app_user SET disabled_at = now() WHERE id = ${userId}`

    await expect(
      betaAuth().api.signInEmail({ body: { email, password: PASSWORD } }),
    ).rejects.toThrow()

    const [row] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM auth_session WHERE user_id = ${userId}
    `
    expect(row!.count).toBe(0)
  })
})

describe("session cookie", () => {
  it("is emitted as a __Host- cookie with no Domain", async () => {
    const { email } = await account()
    const response = await betaAuth().api.signInEmail({
      body: { email, password: PASSWORD },
      asResponse: true,
    })

    const cookies = response.headers.getSetCookie()
    const session = cookies.find((c) => c.startsWith(BETA_SESSION_COOKIE_NAME))
    expect(session, cookies.join(" | ")).toBeDefined()

    // The name itself: beta's own prefix, and `__Host-` rather than
    // `__Secure-` (which a sibling host could overwrite).
    expect(session!.startsWith("__Host-beta-auth.session_token=")).toBe(true)
    expect(session).not.toContain("__Secure-")

    const attributes = parseAttributes(session!)
    // Every requirement a browser enforces before it will store a `__Host-`
    // cookie. A missing one means the cookie is silently dropped.
    expect(attributes.has("secure")).toBe(true)
    expect(attributes.get("path")).toBe("/")
    expect(attributes.has("domain")).toBe(false)
    expect(attributes.has("httponly")).toBe(true)
    expect(attributes.get("samesite")?.toLowerCase()).toBe("lax")

    // cookieCache is off, so no session payload is mirrored into a cookie.
    expect(cookies.some((c) => c.includes("session_data="))).toBe(false)
  })

  it("does not accept the main product's cookie as a session", async () => {
    // Advisor blocker B4-2. `app.afframe.com` signs its session cookie for
    // `.afframe.com`, so it reaches this host — under Better Auth's DEFAULT
    // name. Beta must not read it, even when the value is a genuine beta token.
    const { email } = await account()
    const response = await betaAuth().api.signInEmail({
      body: { email, password: PASSWORD },
      asResponse: true,
    })
    const realCookie = response.headers
      .getSetCookie()
      .find((c) => c.startsWith(BETA_SESSION_COOKIE_NAME))!
    const value = realCookie.split(";")[0]!.split("=").slice(1).join("=")

    for (const name of [
      "__Secure-better-auth.session_token",
      "better-auth.session_token",
    ]) {
      const session = await betaAuth().api.getSession({
        headers: new Headers({ cookie: `${name}=${value}` }),
      })
      expect(session, `${name} must not authenticate`).toBeNull()
    }

    // The same value under beta's own name is a session.
    const accepted = await betaAuth().api.getSession({
      headers: new Headers({
        cookie: `${BETA_SESSION_COOKIE_NAME}=${value}`,
      }),
    })
    expect(accepted?.user.email).toBe(email)
  })
})

describe("rate limiting", () => {
  it("cuts off repeated sign-in attempts from one IP", async () => {
    const { email } = await account()
    const ip = "203.0.113.42"
    const attempt = () =>
      betaAuth().handler(
        new Request("http://localhost:3200/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-connecting-ip": ip,
          },
          body: JSON.stringify({ email, password: "Wrong-Pass-1!" }),
        }),
      )

    const statuses: number[] = []
    for (let i = 0; i < 7; i++) statuses.push((await attempt()).status)

    expect(statuses).toContain(429)
    // The limit is 5 per minute, so the first five get a real answer.
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true)
  })

  it("keys the limit per IP, not globally", async () => {
    const { email } = await account()
    const attempt = (ip: string) =>
      betaAuth().handler(
        new Request("http://localhost:3200/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-connecting-ip": ip,
          },
          body: JSON.stringify({ email, password: "Wrong-Pass-1!" }),
        }),
      )

    for (let i = 0; i < 6; i++) await attempt("203.0.113.51")
    const other = await attempt("203.0.113.52")
    expect(other.status).not.toBe(429)
  })
})

describe("sign-up", () => {
  it("is closed, including from the server", async () => {
    // `disableSignUp` is what makes the setup link the only door. It blocks the
    // HTTP route and `auth.api.signUpEmail` alike (Advisor blocker B4-1) — which
    // is why the consume path goes through the internal adapter.
    const response = await betaAuth().handler(
      new Request("http://localhost:3200/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.61",
        },
        body: JSON.stringify({
          email: `${unique("intruder")}@example.com`,
          password: PASSWORD,
          name: "Intruder",
        }),
      }),
    )
    expect(response.status).toBeGreaterThanOrEqual(400)

    await expect(
      betaAuth().api.signUpEmail({
        body: {
          email: `${unique("intruder")}@example.com`,
          password: PASSWORD,
          name: "Intruder",
        },
      }),
    ).rejects.toThrow()
  })
})
