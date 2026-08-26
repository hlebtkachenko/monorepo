import { describe, expect, it } from "vitest"

import { FINANCNI_URADY, financniUradName } from "./tax-office"

describe("financniUradName — spec §2.10 taxOfficeCode → FÚ name", () => {
  it("resolves the krajské úřady and the specialized one", () => {
    expect(financniUradName("451")).toBe("Finanční úřad pro hlavní město Prahu")
    expect(financniUradName("464")).toBe("Finanční úřad pro Zlínský kraj")
    expect(financniUradName("13")).toBe("Specializovaný finanční úřad")
  })

  it("tolerates the whitespace a stored varchar can carry", () => {
    expect(financniUradName(" 451 ")).toBe(
      "Finanční úřad pro hlavní město Prahu",
    )
  })

  it("returns null for a code the číselník does not know", () => {
    // ARES's `financniUrad` is stored verbatim and the column is varchar(4); an
    // územní-pracoviště code or a future reorganisation must not be resolved to
    // a plausible-looking but WRONG office on an identity card the client reads
    // as authoritative. The page prints the raw code instead.
    expect(financniUradName("3204")).toBeNull()
    expect(financniUradName("")).toBeNull()
    expect(financniUradName(null)).toBeNull()
  })

  it("carries the full 2013 číselník, with unique codes", () => {
    expect(FINANCNI_URADY).toHaveLength(15)
    const codes = FINANCNI_URADY.map((u) => u.kod)
    expect(new Set(codes).size).toBe(codes.length)
  })
})
