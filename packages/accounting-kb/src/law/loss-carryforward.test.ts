import { describe, expect, it } from "vitest"

import {
  carryforwardPeriods,
  carryforwardWindowProvision,
  DEDUCTION_3_TO_5_FIRST_FISCAL_YEAR,
  isWithinCarryback,
  isWithinCarryforward,
  LEGAL_BASIS,
  TAX_LOSS_CARRYBACK_CAP_CZK_MINOR,
  TAX_LOSS_CARRYBACK_PERIODS,
  TAX_LOSS_CARRYFORWARD_PERIODS,
} from "./loss-carryforward"

// Cases certified by CZ-LAW-SIGNOFF.md + the WP-0.4a advisor gate (gates/0.4a.md):
// §34 odst. 1 loss vs the §34 deduction window, which 360/2025 relocated odst. 5 → odst. 4.

describe("§34 odst. 1 — daňová ztráta carryforward window", () => {
  it("is always 5 periods, independent of origin year (never touched by 360/2025)", () => {
    for (const origin of [2018, 2020, 2024, 2025, 2026, 2030, 2099]) {
      expect(carryforwardPeriods("tax_loss", origin)).toBe(5)
    }
    expect(TAX_LOSS_CARRYFORWARD_PERIODS).toBe(5)
  })

  it("a FY2025 loss is claimable forward in FY2026..FY2030, not FY2031, not the origin year", () => {
    expect(isWithinCarryforward("tax_loss", 2025, 2025)).toBe(false) // origin = assessment year
    expect(isWithinCarryforward("tax_loss", 2025, 2026)).toBe(true)
    expect(isWithinCarryforward("tax_loss", 2025, 2030)).toBe(true)
    expect(isWithinCarryforward("tax_loss", 2025, 2031)).toBe(false)
  })
})

describe("§34 odst. 1 + zák. 299/2020 — daňová ztráta carryback", () => {
  it("allows the 2 immediately-preceding periods only", () => {
    expect(TAX_LOSS_CARRYBACK_PERIODS).toBe(2)
    expect(isWithinCarryback(2025, 2024)).toBe(true)
    expect(isWithinCarryback(2025, 2023)).toBe(true)
    expect(isWithinCarryback(2025, 2022)).toBe(false)
    expect(isWithinCarryback(2025, 2025)).toBe(false) // origin year is not a carryback target
    expect(isWithinCarryback(2025, 2026)).toBe(false) // forward is not carryback
  })

  it("combined carryback cap is 30 000 000 Kč in haléř minor units (bigint)", () => {
    expect(TAX_LOSS_CARRYBACK_CAP_CZK_MINOR).toBe(30_000_000n * 100n)
    expect(typeof TAX_LOSS_CARRYBACK_CAP_CZK_MINOR).toBe("bigint")
  })
})

describe("§34 odst. 5 + zák. 360/2025 — deduction carryforward (3→5, per-origin)", () => {
  it("R&D deduction: FY2025-origin keeps 3, FY2026-origin gets 5", () => {
    expect(carryforwardPeriods("rd_deduction", 2024)).toBe(3)
    expect(carryforwardPeriods("rd_deduction", 2025)).toBe(3)
    expect(carryforwardPeriods("rd_deduction", 2026)).toBe(5)
    expect(carryforwardPeriods("rd_deduction", 2027)).toBe(5)
    expect(DEDUCTION_3_TO_5_FIRST_FISCAL_YEAR).toBe(2026)
  })

  it("vocational-education deduction follows the SAME 3→5 rule (signoff FIX 2 — not R&D-exclusive)", () => {
    expect(carryforwardPeriods("vocational_education_deduction", 2025)).toBe(3)
    expect(carryforwardPeriods("vocational_education_deduction", 2026)).toBe(5)
  })

  it("a FY2025-origin R&D deduction carried into FY2026 still uses the 3-period window (per-origin)", () => {
    // window is fixed by ORIGIN, not by the year it is claimed in.
    expect(isWithinCarryforward("rd_deduction", 2025, 2028)).toBe(true) // 2026,2027,2028
    expect(isWithinCarryforward("rd_deduction", 2025, 2029)).toBe(false) // 4th following — out
  })

  it("a FY2026-origin R&D deduction gets the full 5-period window", () => {
    expect(isWithinCarryforward("rd_deduction", 2026, 2031)).toBe(true) // 2027..2031
    expect(isWithinCarryforward("rd_deduction", 2026, 2032)).toBe(false)
  })
})

describe("the cardinal deconflation invariant — loss vs deduction never bleed", () => {
  it("the 360/2025 deduction reform pivot does not change the loss window at the pivot year", () => {
    expect(carryforwardPeriods("tax_loss", 2025)).toBe(5)
    expect(carryforwardPeriods("tax_loss", 2026)).toBe(5)
    // but the deduction window DOES pivot at the same year — proving they are independent rules.
    expect(carryforwardPeriods("rd_deduction", 2025)).toBe(3)
    expect(carryforwardPeriods("rd_deduction", 2026)).toBe(5)
  })

  it("carryback applies to the loss only — there is no deduction carryback path", () => {
    // isWithinCarryback is loss-specific by construction; deductions never call it.
    // Guard: the deduction's forward-only nature means a 'preceding' claim is always out.
    expect(isWithinCarryforward("rd_deduction", 2026, 2025)).toBe(false)
  })

  it("legal-basis tags keep the two rules on distinct provisions + amendment histories", () => {
    expect(LEGAL_BASIS.tax_loss.provision).toContain("§34 odst. 1")
    // deductions carry BOTH the amended (odst. 4) and legacy (odst. 5) window provisions.
    expect(LEGAL_BASIS.rd_deduction.provision).toContain("§34 odst. 4")
    expect(LEGAL_BASIS.rd_deduction.provision).toContain("§34 odst. 5")
    expect(LEGAL_BASIS.vocational_education_deduction.provision).toContain(
      "§34 odst. 4",
    )
    expect(LEGAL_BASIS.tax_loss.amendments.join()).toContain("299/2020")
    expect(LEGAL_BASIS.rd_deduction.amendments.join()).toContain("360/2025")
  })
})

describe("carryforwardWindowProvision — regime-aware odstavec (360/2025 odst. 5 → odst. 4)", () => {
  it("tax_loss cites §34 odst. 1 regardless of year", () => {
    expect(carryforwardWindowProvision("tax_loss", 2025)).toContain(
      "§34 odst. 1",
    )
    expect(carryforwardWindowProvision("tax_loss", 2026)).toContain(
      "§34 odst. 1",
    )
  })

  it("FY2026+ deduction cites the AMENDED §34 odst. 4 (zák. 360/2025), never the repealed odst. 5", () => {
    const p = carryforwardWindowProvision("rd_deduction", 2026)
    expect(p).toContain("§34 odst. 4")
    expect(p).toContain("360/2025")
    expect(p).not.toContain("odst. 5") // citing the repealed provision for a 2026 deduction is the bug
  })

  it("pre-2026 deduction cites the LEGACY §34 odst. 5 (transitional, ve znění účinném přede dnem)", () => {
    const p = carryforwardWindowProvision("rd_deduction", 2025)
    expect(p).toContain("§34 odst. 5")
    expect(p).toContain("přede dnem nabytí účinnosti")
    expect(p).not.toContain("odst. 4")
  })

  it("vocational-education deduction follows the same regime-aware citation", () => {
    expect(
      carryforwardWindowProvision("vocational_education_deduction", 2026),
    ).toContain("§34 odst. 4")
    expect(
      carryforwardWindowProvision("vocational_education_deduction", 2025),
    ).toContain("§34 odst. 5")
  })
})
