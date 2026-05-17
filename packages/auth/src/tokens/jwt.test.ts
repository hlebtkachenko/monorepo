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
    // TTL more than the 30s clock-tolerance window so jose treats it as
    // expired despite the configured skew.
    const token = await signSignupToken(
      { email: "expired@example.com", workspace: "W" },
      -120,
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

  it("rejects a non-HS256 token (alg confusion defence)", async () => {
    vi.resetModules()
    const { SignJWT } = await import("jose")
    const { verifyToken, TokenError } = await import("./jwt")
    // Forge a token with alg HS512 (not in our allowlist) but still signed
    // with the same secret so the signature would otherwise verify.
    const secret = new TextEncoder().encode(TEST_SECRET)
    const token = await new SignJWT({ kind: "signup", email: "x@y.z" })
      .setProtectedHeader({ alg: "HS512" })
      .setIssuer("app")
      .setAudience("signup")
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(secret)
    await expect(verifyToken(token, "signup")).rejects.toBeInstanceOf(
      TokenError,
    )
  })

  it("rejects a too-short secret on first use", async () => {
    vi.resetModules()
    const prior = process.env.APP_TOKEN_SECRET
    process.env.APP_TOKEN_SECRET = "too-short"
    try {
      const { signSignupToken } = await import("./signup")
      await expect(
        signSignupToken({ email: "x@y.z", workspace: "W" }),
      ).rejects.toThrow(/at least 32 bytes/)
    } finally {
      process.env.APP_TOKEN_SECRET = prior
    }
  })

  it("accepts a slightly-stale token within clock tolerance", async () => {
    vi.resetModules()
    const { signSignupToken, verifySignupToken } = await import("./signup")
    // 10s in the past — inside the 30s tolerance window.
    const token = await signSignupToken(
      { email: "fresh@example.com", workspace: "W" },
      -10,
    )
    const claims = await verifySignupToken(token)
    expect(claims.email).toBe("fresh@example.com")
  })
})
