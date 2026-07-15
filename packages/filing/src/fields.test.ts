import { describe, it, expect } from "vitest"

import {
  parseKoruna,
  parseSazba,
  parseDic,
  parseEpoDate,
  parseField,
  fieldTypeFor,
} from "./fields"

describe("parseKoruna", () => {
  it("strips Czech thousand separators to a whole-koruna string", () => {
    expect(parseKoruna("1 000 000").value).toBe("1000000")
    expect(parseKoruna("1 000").value).toBe("1000")
    expect(parseKoruna("2500000").value).toBe("2500000")
  })
  it("rounds a decimal to celé Kč with a note (never throws)", () => {
    const r = parseKoruna("1000,50")
    expect(r.value).toBe("1001")
    expect(r.note).toContain("Zaokrouhleno")
  })
  it("keeps a negative (daňová ztráta) and empties on blank", () => {
    expect(parseKoruna("-500000").value).toBe("-500000")
    expect(parseKoruna("").value).toBeNull()
  })
  it("reports an error on non-numeric input, does not throw", () => {
    const r = parseKoruna("bullshit")
    expect(r.ok).toBe(false)
    expect(r.value).toBeNull()
  })
})

describe("parseSazba", () => {
  it("accepts a whole percent", () => {
    expect(parseSazba("21").value).toBe("21")
    expect(parseSazba("21 %").value).toBe("21")
  })
  it("rejects a decimal rate and suggests the percent", () => {
    const r = parseSazba("0.21")
    expect(r.ok).toBe(false)
    expect(r.error).toContain("21")
  })
  it("rejects out of range", () => {
    expect(parseSazba("100").ok).toBe(false)
  })
})

describe("parseDic / parseEpoDate", () => {
  it("normalizes DIČ to digits and shows CZ", () => {
    expect(parseDic(" cz 255 966 41 ").value).toBe("25596641")
    expect(parseDic("CZ25596641").display).toBe("CZ25596641")
  })
  it("normalizes dates to D.M.YYYY and rejects impossible calendar dates", () => {
    expect(parseEpoDate("2025-01-01").value).toBe("1.1.2025")
    expect(parseEpoDate("31.12.2025").value).toBe("31.12.2025")
    expect(parseEpoDate("bad").ok).toBe(false)
    expect(parseEpoDate("31.2.2025").ok).toBe(false) // Feb has no 31st
    expect(parseEpoDate("29.2.2024").ok).toBe(true) // leap day is real
    expect(parseEpoDate("29.2.2025").ok).toBe(false) // 2025 is not a leap year
  })
})

describe("fieldTypeFor + parseField", () => {
  it("classifies VetaO amounts, the sazba line, and the date/text specials", () => {
    expect(fieldTypeFor("vetaO", "kc_ii10_10")).toBe("koruna")
    expect(fieldTypeFor("vetaO", "kc_ii270_280")).toBe("sazba")
    expect(fieldTypeFor("vetaO", "d_hospvysl")).toBe("date")
    expect(fieldTypeFor("vetaO", "text_ii220_240")).toBe("text")
    expect(fieldTypeFor("header", "zdobd_od")).toBe("date")
    expect(fieldTypeFor("header", "typ_popldpp")).toBe("code1")
    expect(fieldTypeFor("payer", "dic")).toBe("dic")
  })
  it("routes through parseField by type", () => {
    expect(parseField(fieldTypeFor("vetaO", "kc_ii10_10"), "1 000").value).toBe(
      "1000",
    )
  })
})
