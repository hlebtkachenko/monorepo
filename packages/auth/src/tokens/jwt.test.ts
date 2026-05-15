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

  it("generates and hashes an invite token deterministically", async () => {
    vi.resetModules()
    const { generateRawInviteToken, hashInviteToken, INVITE_TOKEN_BYTES } =
      await import("./invite")
    const raw = generateRawInviteToken()
    // base64url of 32 bytes = 43 chars, no padding
    expect(raw.length).toBeGreaterThanOrEqual(42)
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(INVITE_TOKEN_BYTES).toBe(32)
    // Same input always produces the same hash; different inputs produce
    // different hashes (constant-time sha256 is suitable here because
    // tokens are 256-bit random — equality is the only check).
    const hash1 = hashInviteToken(raw)
    const hash2 = hashInviteToken(raw)
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64)
    expect(hashInviteToken("different")).not.toBe(hash1)
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
