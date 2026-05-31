/**
 * Tests for the freshAge gate integrated into sensitive server actions.
 *
 * These tests exercise the isFreshSession helper in isolation (pure unit)
 * and verify the redirect/pass-through contract of the gate logic at the
 * boundary level, using vi.mock to stub out Next.js + auth dependencies.
 *
 * Server actions that call headers() + auth.api.getSession() + redirect()
 * are tested via mock injection rather than the full Next.js RSC runtime.
 * The gate logic (isFreshSession) is already unit-tested in
 * packages/auth/src/fresh-age.test.ts; here we test the integration seam.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { isFreshSession, FRESH_AGE_MS } from "@workspace/auth/fresh-age"

const NOW = 1_700_000_000_000 // fixed epoch for determinism

// ---------------------------------------------------------------------------
// Unit: isFreshSession helper — boundary conditions
// ---------------------------------------------------------------------------

describe("isFreshSession boundary conditions (gate seam)", () => {
  it("fresh session (1 hour old) → returns true, no redirect expected", () => {
    const updatedAt = new Date(NOW - 60 * 60 * 1000)
    expect(isFreshSession(updatedAt, NOW)).toBe(true)
  })

  it("stale session (25 hours old) → returns false, redirect expected", () => {
    const updatedAt = new Date(NOW - 25 * 60 * 60 * 1000)
    expect(isFreshSession(updatedAt, NOW)).toBe(false)
  })

  it("session at exact boundary (24 h) → returns true (inclusive)", () => {
    const updatedAt = new Date(NOW - FRESH_AGE_MS)
    expect(isFreshSession(updatedAt, NOW)).toBe(true)
  })

  it("session 1 ms past boundary → returns false", () => {
    const updatedAt = new Date(NOW - FRESH_AGE_MS - 1)
    expect(isFreshSession(updatedAt, NOW)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Integration seam: gate contract via vi.mock stubs
//
// The actual server actions import from "@workspace/auth/server" and
// "next/headers" / "next/navigation". We stub those at the module level
// to verify the redirect-on-stale / pass-through-on-fresh contract without
// booting the Next.js runtime or a real database.
// ---------------------------------------------------------------------------

const mockGetSession = vi.fn()
const mockRedirect = vi.fn()

vi.mock("@workspace/auth/server", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      changePassword: vi.fn().mockResolvedValue(undefined),
      changeEmail: vi.fn().mockResolvedValue(undefined),
      disableTwoFactor: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}))

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url)
    // Simulate the Next.js redirect() throwing a special error so the
    // function exits immediately (matching real Next.js behaviour).
    const err = new Error("NEXT_REDIRECT") as Error & { digest: string }
    err.digest = "NEXT_REDIRECT"
    throw err
  },
}))

function makeSession(ageMs: number) {
  const updatedAt = new Date(Date.now() - ageMs)
  return {
    session: { updatedAt, id: "sess-1", userId: "user-1" },
    user: { id: "user-1", email: "test@example.com", name: "Test" },
  }
}

beforeEach(() => {
  mockGetSession.mockReset()
  mockRedirect.mockReset()
})

describe("changePasswordAction — freshAge gate", () => {
  it("redirects to /auth/revalidate when session is stale (25 h)", async () => {
    mockGetSession.mockResolvedValue(makeSession(25 * 60 * 60 * 1000))
    const { changePasswordAction } = await import("./password-change-action")
    await expect(
      changePasswordAction("old", "newpassword1234!"),
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("/auth/revalidate"),
    )
  })

  it("does not redirect when session is fresh (1 h)", async () => {
    mockGetSession.mockResolvedValue(makeSession(60 * 60 * 1000))
    const { changePasswordAction } = await import("./password-change-action")
    const result = await changePasswordAction("old", "newpassword1234!")
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it("redirects when session is absent", async () => {
    mockGetSession.mockResolvedValue(null)
    const { changePasswordAction } = await import("./password-change-action")
    await expect(
      changePasswordAction("old", "newpassword1234!"),
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("/auth/revalidate"),
    )
  })
})

describe("changeEmailAction — freshAge gate", () => {
  it("redirects to /auth/revalidate when session is stale (25 h)", async () => {
    mockGetSession.mockResolvedValue(makeSession(25 * 60 * 60 * 1000))
    const { changeEmailAction } = await import("./email-change-action")
    await expect(changeEmailAction("new@example.com")).rejects.toThrow(
      "NEXT_REDIRECT",
    )
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("/auth/revalidate"),
    )
  })

  it("does not redirect when session is fresh (1 h)", async () => {
    mockGetSession.mockResolvedValue(makeSession(60 * 60 * 1000))
    const { changeEmailAction } = await import("./email-change-action")
    const result = await changeEmailAction("new@example.com")
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })
})

describe("assertMfaSetupFreshnessAction — freshAge gate", () => {
  it("redirects to /auth/revalidate when session is stale (25 h)", async () => {
    mockGetSession.mockResolvedValue(makeSession(25 * 60 * 60 * 1000))
    const { assertMfaSetupFreshnessAction } = await import("./mfa-setup-action")
    await expect(assertMfaSetupFreshnessAction()).rejects.toThrow(
      "NEXT_REDIRECT",
    )
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("/auth/revalidate"),
    )
  })

  it("returns email when session is fresh (1 h)", async () => {
    mockGetSession.mockResolvedValue(makeSession(60 * 60 * 1000))
    const { assertMfaSetupFreshnessAction } = await import("./mfa-setup-action")
    const result = await assertMfaSetupFreshnessAction()
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(result.email).toBe("test@example.com")
  })
})

describe("disableMfaAction — freshAge gate", () => {
  it("redirects to /auth/revalidate when session is stale (25 h)", async () => {
    mockGetSession.mockResolvedValue(makeSession(25 * 60 * 60 * 1000))
    const { disableMfaAction } = await import("./mfa-disable-action")
    await expect(disableMfaAction("password1234!")).rejects.toThrow(
      "NEXT_REDIRECT",
    )
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("/auth/revalidate"),
    )
  })

  it("does not redirect when session is fresh (1 h)", async () => {
    mockGetSession.mockResolvedValue(makeSession(60 * 60 * 1000))
    const { disableMfaAction } = await import("./mfa-disable-action")
    const result = await disableMfaAction("password1234!")
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })
})
