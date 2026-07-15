import { describe, it, expect } from "vitest"

import { checkDppo } from "./checks"
import type { Dppo } from "../../../model/dppo"

const base: Dppo = {
  verze: "05.01.01",
  header: {
    typ_dapdpp: "A",
    typ_zo: "A",
    typ_popldpp: "1",
    dapdpp_forma: "B",
    c_ufo_cil: "451",
    zdobd_od: "1.1.2025",
    zdobd_do: "31.12.2025",
  },
  payer: { dic: "25596641" },
  vetaO: { kc_ii10_10: "1000000", kc_ii270_280: "21" },
  extraVety: [],
}

const codeSet = (m: Dppo) => new Set(checkDppo(m).map((c) => c.code))

describe("checkDppo", () => {
  it("is clean for a well-formed return", () => {
    expect(checkDppo(base)).toEqual([])
  })

  it("only ever emits warnings, never blocks", () => {
    const checks = checkDppo({ ...base, header: {} })
    expect(checks.length).toBeGreaterThan(0)
    expect(checks.every((c) => c.severity === "warning")).toBe(true)
  })

  it("flags a bad DIČ checksum with a suggestion to check ARES", () => {
    const checks = checkDppo({ ...base, payer: { dic: "25596640" } })
    const dic = checks.find((c) => c.code === "dic.checksum")
    expect(dic).toBeDefined()
    expect(dic?.suggestion).toContain("ARES")
  })

  it("flags an out-of-range / too-long period", () => {
    expect(codeSet({ ...base, header: { ...base.header, zdobd_od: "1.1.2019", zdobd_do: "31.12.2019" } })).toContain("period.range") // prettier-ignore
    expect(codeSet({ ...base, header: { ...base.header, zdobd_do: "31.12.2026" } })).toContain("period.length") // prettier-ignore
  })

  it("requires datum zjištění for a dodatečné přiznání", () => {
    expect(codeSet({ ...base, header: { ...base.header, dapdpp_forma: "D" } })).toContain("d_zjist.required") // prettier-ignore
  })

  it("warns + suggests when a součtový řádek does not foot", () => {
    const checks = checkDppo({
      ...base,
      vetaO: {
        kc_ii10_10: "1000000",
        kc_ii270_280: "21",
        kc_ii200_200: "999999",
      },
    })
    const foot = checks.find((c) => c.code === "footing.mismatch")
    expect(foot?.suggestion).toBe("1000000") // ř.200 = ř.10 with no other lines
  })

  it("warns (off COMPUTED ř.220) that ř.230–330 must be blank under a daňová ztráta", () => {
    // Computed ř.200 = ř.10 = −500 000 → ř.220 < 0; ř.330 wrongly filled.
    const checks = checkDppo({
      ...base,
      vetaO: {
        kc_ii10_10: "-500000",
        kc_ii320_330: "12345",
        kc_ii270_280: "21",
      },
    })
    const loss = checks.find((c) => c.code === "loss.blank")
    expect(loss?.field).toBe("vetaO.kc_ii320_330") // ř.330 now in scope
  })

  it("does not warn a loss when ř.220 is non-negative (ř.210 lifts it)", () => {
    const checks = checkDppo({
      ...base,
      // ř.200 = −100 000, but ř.210 (vynětí) −200 000 → ř.220 = +100 000.
      vetaO: { kc_ii10_10: "-100000", kc_ii250_210: "-200000", kc_ii320_330: "5000", kc_ii270_280: "21" }, // prettier-ignore
    })
    expect(checks.some((c) => c.code === "loss.blank")).toBe(false)
  })

  it("allows an exact calendar-year period, warns only when longer", () => {
    expect(codeSet({ ...base, header: { ...base.header, zdobd_od: "1.1.2024", zdobd_do: "1.1.2025" } })).not.toContain("period.length") // prettier-ignore
    expect(codeSet({ ...base, header: { ...base.header, zdobd_od: "1.1.2025", zdobd_do: "2.1.2026" } })).toContain("period.length") // prettier-ignore
  })
})
