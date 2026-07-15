import { describe, it, expect } from "vitest"

import { isValidIco, validateDicLegalEntity } from "./business-validity"

describe("isValidIco", () => {
  it("accepts real IČOs with a valid mod-11 checksum", () => {
    // 25596641 — worked example (weighted sum 176, 176 % 11 = 0, check 1).
    expect(isValidIco("25596641")).toBe(true)
    // 00006947 — Ministerstvo financí.
    expect(isValidIco("00006947")).toBe(true)
  })
  it("rejects a wrong check digit and malformed input", () => {
    expect(isValidIco("25596640")).toBe(false)
    expect(isValidIco("12345678")).toBe(false)
    expect(isValidIco("1234567")).toBe(false) // 7 digits
    expect(isValidIco("2559664X")).toBe(false)
  })
})

describe("validateDicLegalEntity", () => {
  it("accepts CZ + valid IČO, stripping the prefix", () => {
    expect(validateDicLegalEntity("CZ25596641")).toEqual({
      ok: true,
      bare: "25596641",
    })
    expect(validateDicLegalEntity("25596641")).toEqual({
      ok: true,
      bare: "25596641",
    })
  })
  it("flags bad checksum / length / non-digits", () => {
    expect(validateDicLegalEntity("CZ25596640").ok).toBe(false)
    expect(validateDicLegalEntity("CZ12345").ok).toBe(false)
    expect(validateDicLegalEntity("CZ12345").error).toContain("8 číslic")
    expect(validateDicLegalEntity("").ok).toBe(false)
  })
})
