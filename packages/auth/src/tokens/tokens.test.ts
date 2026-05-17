/**
 * Kind/audience discriminator tests.
 *
 * Verifies that a token signed as kind X is rejected when verified as kind Y.
 * jwt.test.ts already covers expiry, tamper, alg-confusion, and secret
 * validation — those cases are not repeated here.
 */
import { describe, expect, it, beforeAll } from "vitest"
import { TokenError } from "./jwt"
import { signSignupToken, verifySignupToken } from "./signup"
import { signLoginEmailToken, verifyLoginEmailToken } from "./login-email"
import {
  signOnboardingStateToken,
  verifyOnboardingStateToken,
} from "./onboarding-state"
import {
  signActiveWorkspaceToken,
  verifyActiveWorkspaceToken,
} from "./active-workspace"

const TEST_SECRET = "test-secret-test-secret-test-secret-test-secret"

beforeAll(() => {
  process.env.APP_TOKEN_SECRET = TEST_SECRET
})

// ---------------------------------------------------------------------------
// signup — kind "signup"
// ---------------------------------------------------------------------------
describe("signup token kind discriminator", () => {
  it("round-trip: sign then verify returns the correct payload", async () => {
    const token = await signSignupToken({
      email: "owner@example.com",
      workspace: "Acme",
    })
    const claims = await verifySignupToken(token)
    expect(claims.kind).toBe("signup")
    expect(claims.email).toBe("owner@example.com")
    expect(claims.workspace).toBe("Acme")
  })

  it("wrong-kind: signup token is rejected by login-email verifier", async () => {
    const token = await signSignupToken({
      email: "owner@example.com",
      workspace: "Acme",
    })
    await expect(verifyLoginEmailToken(token)).rejects.toBeInstanceOf(
      TokenError,
    )
  })

  it("wrong-kind: signup token is rejected by onboarding-state verifier", async () => {
    const token = await signSignupToken({
      email: "owner@example.com",
      workspace: "Acme",
    })
    await expect(verifyOnboardingStateToken(token)).rejects.toBeInstanceOf(
      TokenError,
    )
  })

  it("wrong-kind: signup token is rejected by active-workspace verifier", async () => {
    const token = await signSignupToken({
      email: "owner@example.com",
      workspace: "Acme",
    })
    await expect(verifyActiveWorkspaceToken(token)).rejects.toBeInstanceOf(
      TokenError,
    )
  })
})

// ---------------------------------------------------------------------------
// login-email — kind "login-email"
// ---------------------------------------------------------------------------
describe("login-email token kind discriminator", () => {
  it("round-trip: sign then verify returns the correct payload", async () => {
    const token = await signLoginEmailToken("user@example.com")
    const claims = await verifyLoginEmailToken(token)
    expect(claims.kind).toBe("login-email")
    expect(claims.email).toBe("user@example.com")
  })

  it("wrong-kind: login-email token is rejected by signup verifier", async () => {
    const token = await signLoginEmailToken("user@example.com")
    await expect(verifySignupToken(token)).rejects.toBeInstanceOf(TokenError)
  })

  it("wrong-kind: login-email token is rejected by onboarding-state verifier", async () => {
    const token = await signLoginEmailToken("user@example.com")
    await expect(verifyOnboardingStateToken(token)).rejects.toBeInstanceOf(
      TokenError,
    )
  })

  it("wrong-kind: login-email token is rejected by active-workspace verifier", async () => {
    const token = await signLoginEmailToken("user@example.com")
    await expect(verifyActiveWorkspaceToken(token)).rejects.toBeInstanceOf(
      TokenError,
    )
  })
})

// ---------------------------------------------------------------------------
// onboarding-state — kind "onboarding-state"
// ---------------------------------------------------------------------------
describe("onboarding-state token kind discriminator", () => {
  it("round-trip: sign then verify returns the correct payload", async () => {
    const token = await signOnboardingStateToken({
      profile: {
        firstName: "Jan",
        lastName: "Novák",
        locale: "cs",
        timezone: "Europe/Prague",
      },
      experience: "accountant",
    })
    const claims = await verifyOnboardingStateToken(token)
    expect(claims.kind).toBe("onboarding-state")
    expect(claims.profile?.firstName).toBe("Jan")
    expect(claims.experience).toBe("accountant")
  })

  it("wrong-kind: onboarding-state token is rejected by signup verifier", async () => {
    const token = await signOnboardingStateToken({ experience: "new" })
    await expect(verifySignupToken(token)).rejects.toBeInstanceOf(TokenError)
  })

  it("wrong-kind: onboarding-state token is rejected by login-email verifier", async () => {
    const token = await signOnboardingStateToken({ experience: "new" })
    await expect(verifyLoginEmailToken(token)).rejects.toBeInstanceOf(
      TokenError,
    )
  })

  it("wrong-kind: onboarding-state token is rejected by active-workspace verifier", async () => {
    const token = await signOnboardingStateToken({ experience: "new" })
    await expect(verifyActiveWorkspaceToken(token)).rejects.toBeInstanceOf(
      TokenError,
    )
  })
})

// ---------------------------------------------------------------------------
// active-workspace — kind "active-workspace"
// ---------------------------------------------------------------------------
describe("active-workspace token kind discriminator", () => {
  it("round-trip: sign then verify returns the correct payload", async () => {
    const token = await signActiveWorkspaceToken("ws-123")
    const claims = await verifyActiveWorkspaceToken(token)
    expect(claims.kind).toBe("active-workspace")
    expect(claims.workspaceId).toBe("ws-123")
  })

  it("wrong-kind: active-workspace token is rejected by signup verifier", async () => {
    const token = await signActiveWorkspaceToken("ws-123")
    await expect(verifySignupToken(token)).rejects.toBeInstanceOf(TokenError)
  })

  it("wrong-kind: active-workspace token is rejected by login-email verifier", async () => {
    const token = await signActiveWorkspaceToken("ws-123")
    await expect(verifyLoginEmailToken(token)).rejects.toBeInstanceOf(
      TokenError,
    )
  })

  it("wrong-kind: active-workspace token is rejected by onboarding-state verifier", async () => {
    const token = await signActiveWorkspaceToken("ws-123")
    await expect(verifyOnboardingStateToken(token)).rejects.toBeInstanceOf(
      TokenError,
    )
  })
})
