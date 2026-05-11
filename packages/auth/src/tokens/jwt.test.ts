import { describe, expect, it, beforeAll, vi } from "vitest"

const TEST_SECRET = "test-secret-test-secret-test-secret-test-secret"

beforeAll(() => {
  process.env.APP_TOKEN_SECRET = TEST_SECRET
})

describe("jwt token helpers", () => {
  it("signs and verifies a signup token round-trip", async () => {
    vi.resetModules()
    const { signSignupToken, verifySignupToken } = await import("./signup")
    const token = await signSignupToken({
      email: "owner@example.com",
      workspace: "Acme",
    })
    const claims = await verifySignupToken(token)
    expect(claims.kind).toBe("signup")
    expect(claims.email).toBe("owner@example.com")
    expect(claims.workspace).toBe("Acme")
  })

  it("signs and verifies an invite token round-trip", async () => {
    vi.resetModules()
    const { signInviteToken, verifyInviteToken } = await import("./invite")
    const token = await signInviteToken({
      email: "member@example.com",
      organizationId: "00000000-0000-0000-0000-000000000001",
      role: "member",
    })
    const claims = await verifyInviteToken(token)
    expect(claims.kind).toBe("invite")
    expect(claims.email).toBe("member@example.com")
    expect(claims.organizationId).toBe("00000000-0000-0000-0000-000000000001")
    expect(claims.role).toBe("member")
  })

  it("rejects a signup token verified as an invite (wrong kind)", async () => {
    vi.resetModules()
    const { signSignupToken } = await import("./signup")
    const { verifyInviteToken } = await import("./invite")
    const { TokenError } = await import("./jwt")
    const token = await signSignupToken({
      email: "x@example.com",
      workspace: "Y",
    })
    await expect(verifyInviteToken(token)).rejects.toBeInstanceOf(TokenError)
  })

  it("rejects an expired token", async () => {
    vi.resetModules()
    const { signSignupToken, verifySignupToken } = await import("./signup")
    const { TokenError } = await import("./jwt")
    const token = await signSignupToken(
      { email: "expired@example.com", workspace: "W" },
      -1,
    )
    await expect(verifySignupToken(token)).rejects.toMatchObject({
      name: "TokenError",
      code: "EXPIRED",
    })
    await expect(verifySignupToken(token)).rejects.toBeInstanceOf(TokenError)
  })

  it("rejects a tampered signature", async () => {
    vi.resetModules()
    const { signSignupToken, verifySignupToken } = await import("./signup")
    const { TokenError } = await import("./jwt")
    const token = await signSignupToken({
      email: "tamper@example.com",
      workspace: "W",
    })
    const parts = token.split(".")
    const tampered = `${parts[0]}.${parts[1]}.${"A".repeat((parts[2] ?? "").length)}`
    await expect(verifySignupToken(tampered)).rejects.toBeInstanceOf(TokenError)
  })

  it("rejects a malformed token", async () => {
    vi.resetModules()
    const { verifySignupToken } = await import("./signup")
    const { TokenError } = await import("./jwt")
    await expect(verifySignupToken("not.a.token")).rejects.toBeInstanceOf(
      TokenError,
    )
  })
})
