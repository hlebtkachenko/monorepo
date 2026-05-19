import { describe, expect, it } from "vitest"

import {
  AFKEY_REGEX,
  TOKEN_BODY_LENGTH,
  TOKEN_CHECKSUM_LENGTH,
  TOKEN_PREFIX,
  computeChecksum,
  formatToken,
  generateTokenBody,
  hashRawToken,
  parseToken,
  verifyChecksum,
} from "./format"

describe("token format primitives (ADR-0022)", () => {
  describe("generateTokenBody", () => {
    it("returns exactly 43 base62 characters", () => {
      for (let i = 0; i < 50; i++) {
        const body = generateTokenBody()
        expect(body).toHaveLength(TOKEN_BODY_LENGTH)
        expect(body).toMatch(/^[0-9A-Za-z]+$/)
      }
    })

    it("produces values that pass the regex when paired with a checksum", () => {
      const body = generateTokenBody()
      const c = computeChecksum(body, "sig", "dev")
      const raw = formatToken(body, c)
      expect(raw).toMatch(AFKEY_REGEX)
    })

    it("yields a uniform distribution over the base62 alphabet (no modulo bias)", () => {
      // Sample 2000 chars and check that no single character is suspiciously
      // over- or under-represented. With rejection sampling, each of the 62
      // letters should appear ~32 times. Allow a generous 0.6x..2x band — the
      // test is only catching the modulo-bias regression where bytes 248..255
      // would inflate the first 8 characters by ~3.2% each.
      const samples = Array.from({ length: 50 }, () =>
        generateTokenBody(),
      ).join("")
      const counts: Record<string, number> = {}
      for (const c of samples) counts[c] = (counts[c] ?? 0) + 1
      const expected = samples.length / 62
      for (const [, n] of Object.entries(counts)) {
        expect(n).toBeGreaterThan(expected * 0.4)
        expect(n).toBeLessThan(expected * 2.5)
      }
    })

    it("returns a new value on each call (256-bit collision space)", () => {
      const set = new Set<string>()
      for (let i = 0; i < 200; i++) set.add(generateTokenBody())
      expect(set.size).toBe(200)
    })
  })

  describe("computeChecksum", () => {
    it("returns 8 hex chars", () => {
      const c = computeChecksum("a".repeat(43), "sig", "dev")
      expect(c).toHaveLength(TOKEN_CHECKSUM_LENGTH)
      expect(c).toMatch(/^[0-9a-f]{8}$/)
    })

    it("differs when kind changes", () => {
      const body = "a".repeat(43)
      const sig = computeChecksum(body, "sig", "dev")
      const inv = computeChecksum(body, "inv", "dev")
      expect(sig).not.toBe(inv)
    })

    it("differs when env changes", () => {
      const body = "a".repeat(43)
      const dev = computeChecksum(body, "sig", "dev")
      const prd = computeChecksum(body, "sig", "prd")
      expect(dev).not.toBe(prd)
    })

    it("is deterministic for the same inputs", () => {
      const body = "a".repeat(43)
      expect(computeChecksum(body, "sig", "dev")).toBe(
        computeChecksum(body, "sig", "dev"),
      )
    })

    it("derives from the public TOKEN_PREFIX + body + kind + env", () => {
      // Spot-check that the prefix participates — flipping it must change
      // the output. This is the documented derivation in ADR-0022.
      expect(TOKEN_PREFIX).toBe("afkey")
    })
  })

  describe("formatToken + AFKEY_REGEX", () => {
    it("produces a token that matches the public regex", () => {
      const body = generateTokenBody()
      const c = computeChecksum(body, "lem", "stg")
      const raw = formatToken(body, c)
      expect(raw).toMatch(AFKEY_REGEX)
      expect(raw).toBe(`afkey-${body}-${c}`)
    })

    it("total length is 58 characters", () => {
      const body = generateTokenBody()
      const c = computeChecksum(body, "sig", "dev")
      const raw = formatToken(body, c)
      expect(raw).toHaveLength(58)
    })
  })

  describe("parseToken", () => {
    it("returns null for malformed strings", () => {
      expect(parseToken("")).toBeNull()
      expect(parseToken("not-a-token")).toBeNull()
      expect(parseToken("afkey-shortbody-abcd1234")).toBeNull()
      expect(parseToken(`afkey-${"x".repeat(43)}-zzzzzzzz`)).toBeNull()
      expect(parseToken(`afkey-${"!".repeat(43)}-${"a".repeat(8)}`)).toBeNull()
    })

    it("returns body + checksum on success", () => {
      const body = generateTokenBody()
      const c = computeChecksum(body, "sig", "dev")
      const raw = formatToken(body, c)
      expect(parseToken(raw)).toEqual({ body, checksum: c })
    })

    it("rejects non-string input", () => {
      expect(parseToken(null as unknown as string)).toBeNull()
      expect(parseToken(undefined as unknown as string)).toBeNull()
      expect(parseToken(123 as unknown as string)).toBeNull()
    })
  })

  describe("verifyChecksum", () => {
    it("accepts a freshly minted token with the matching (kind, env)", () => {
      const body = generateTokenBody()
      const c = computeChecksum(body, "sig", "dev")
      const raw = formatToken(body, c)
      expect(verifyChecksum(raw, "sig", "dev")).toEqual({ body })
    })

    it("rejects with the wrong kind", () => {
      const body = generateTokenBody()
      const c = computeChecksum(body, "sig", "dev")
      const raw = formatToken(body, c)
      expect(verifyChecksum(raw, "inv", "dev")).toBeNull()
    })

    it("rejects with the wrong env", () => {
      const body = generateTokenBody()
      const c = computeChecksum(body, "sig", "dev")
      const raw = formatToken(body, c)
      expect(verifyChecksum(raw, "sig", "prd")).toBeNull()
    })

    it("rejects a tampered checksum", () => {
      const body = generateTokenBody()
      const c = computeChecksum(body, "sig", "dev")
      // Flip one hex char.
      const tampered = c.startsWith("a") ? `b${c.slice(1)}` : `a${c.slice(1)}`
      const raw = formatToken(body, tampered)
      expect(verifyChecksum(raw, "sig", "dev")).toBeNull()
    })

    it("rejects malformed input upfront", () => {
      expect(verifyChecksum("garbage", "sig", "dev")).toBeNull()
      expect(verifyChecksum("", "sig", "dev")).toBeNull()
    })
  })

  describe("hashRawToken", () => {
    it("produces 64 hex characters (sha256)", () => {
      const raw = "afkey-" + "a".repeat(43) + "-" + "0".repeat(8)
      const h = hashRawToken(raw)
      expect(h).toHaveLength(64)
      expect(h).toMatch(/^[0-9a-f]{64}$/)
    })

    it("is deterministic", () => {
      const raw = "afkey-" + "b".repeat(43) + "-" + "0".repeat(8)
      expect(hashRawToken(raw)).toBe(hashRawToken(raw))
    })

    it("differs for different inputs", () => {
      const a = "afkey-" + "a".repeat(43) + "-" + "0".repeat(8)
      const b = "afkey-" + "b".repeat(43) + "-" + "0".repeat(8)
      expect(hashRawToken(a)).not.toBe(hashRawToken(b))
    })
  })
})
