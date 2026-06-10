import { describe, expect, it } from "vitest"
import { PasswordSchema } from "./password"

// A password that satisfies every rule except the one under test.
// Length: 12 chars, has digit, has symbol, has mixed case.
const VALID = "Abcdef1!ghij"

describe("PasswordSchema — boundary and rule coverage", () => {
  it("accepts a password that meets all rules", () => {
    const result = PasswordSchema.safeParse(VALID)
    expect(result.success).toBe(true)
  })

  describe("length rule — boundary at 12 characters", () => {
    it("rejects 11-character password (one below threshold)", () => {
      // 11 chars, otherwise valid: mixed case, digit, symbol
      const pw = "Abcdef1!ghi"
      expect(pw.length).toBe(11)
      const result = PasswordSchema.safeParse(pw)
      expect(result.success).toBe(false)
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message)
        expect(messages).toContain("password.length")
      }
    })

    it("accepts exactly 12-character password (at threshold)", () => {
      // 12 chars, mixed case, digit, symbol
      const pw = "Abcdef1!ghij"
      expect(pw.length).toBe(12)
      const result = PasswordSchema.safeParse(pw)
      expect(result.success).toBe(true)
    })
  })

  describe("max-length rule — boundary at 128 characters (matches Better Auth maxPasswordLength)", () => {
    it("accepts exactly 128-character password (at threshold)", () => {
      const pw = "Aa1!" + "x".repeat(124)
      expect(pw.length).toBe(128)
      const result = PasswordSchema.safeParse(pw)
      expect(result.success).toBe(true)
    })

    it("rejects 129-character password (one above threshold)", () => {
      const pw = "Aa1!" + "x".repeat(125)
      expect(pw.length).toBe(129)
      const result = PasswordSchema.safeParse(pw)
      expect(result.success).toBe(false)
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message)
        expect(messages).toContain("Use at most 128 characters.")
      }
    })
  })

  describe("number rule", () => {
    it("rejects a password with no digit", () => {
      // 12 chars, mixed case, symbol, no digit
      const pw = "Abcdef!!ghij"
      const result = PasswordSchema.safeParse(pw)
      expect(result.success).toBe(false)
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message)
        expect(messages).toContain("password.number")
      }
    })

    it("accepts a password with exactly one digit", () => {
      // VALID already has exactly one digit
      const result = PasswordSchema.safeParse(VALID)
      expect(result.success).toBe(true)
    })
  })

  describe("symbol rule", () => {
    it("rejects a password with no symbol character", () => {
      // 12 chars, mixed case, digit, no symbol (all alphanumeric)
      const pw = "Abcdef1Ghijk"
      const result = PasswordSchema.safeParse(pw)
      expect(result.success).toBe(false)
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message)
        expect(messages).toContain("password.symbol")
      }
    })
  })

  describe("mixedCase rule", () => {
    it("rejects an all-lowercase password", () => {
      const pw = "abcdef1!ghij"
      const result = PasswordSchema.safeParse(pw)
      expect(result.success).toBe(false)
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message)
        expect(messages).toContain("password.mixedCase")
      }
    })

    it("rejects an all-uppercase password", () => {
      const pw = "ABCDEF1!GHIJ"
      const result = PasswordSchema.safeParse(pw)
      expect(result.success).toBe(false)
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message)
        expect(messages).toContain("password.mixedCase")
      }
    })
  })

  describe("multiple simultaneous failures", () => {
    it("reports length error on a too-short password that also lacks digit and symbol", () => {
      // 8 chars, no digit, no symbol, no upper — all rules fail
      const pw = "abcdefgh"
      const result = PasswordSchema.safeParse(pw)
      expect(result.success).toBe(false)
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message)
        // The min() check fires first; refines only run when min passes.
        expect(messages).toContain("password.length")
      }
    })

    it("reports all three refine errors when length passes but the rest fail", () => {
      // 12 chars, all lowercase letters only: fails number, symbol, mixedCase
      const pw = "abcdefghijkl"
      const result = PasswordSchema.safeParse(pw)
      expect(result.success).toBe(false)
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message)
        expect(messages).toContain("password.number")
        expect(messages).toContain("password.symbol")
        expect(messages).toContain("password.mixedCase")
        // length rule must NOT appear — the string IS 12+ chars
        expect(messages).not.toContain("password.length")
      }
    })
  })
})
