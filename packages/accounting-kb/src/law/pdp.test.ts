import { describe, expect, it } from "vitest"

import {
  isValidPdpSelfAssessmentSplit,
  PDP_LEGAL_BASIS,
  PDP_SELF_ASSESSMENT_PATTERNS,
  PDP_VAT_RATE_PERCENT,
  recipientDapRow,
  RECIPIENT_KH_SECTION,
  SUPPLIER_DAP_ROW,
  SUPPLIER_KH_SECTION,
} from "./pdp"

// Cases certified by CZ-LAW-SIGNOFF.md QUESTION 2 + the WP-0.4b advisor gate (gates/0.4b.md).

describe("PDP recipient DAP line mapping (signoff Q2.C)", () => {
  it("output leg → ř. 10 (21 %) / ř. 11 (12 %)", () => {
    expect(recipientDapRow("output", "standard")).toBe("ř. 10")
    expect(recipientDapRow("output", "reduced")).toBe("ř. 11")
  })

  it("input leg → ř. 43 (21 %) / ř. 44 (12 %)", () => {
    expect(recipientDapRow("input", "standard")).toBe("ř. 43")
    expect(recipientDapRow("input", "reduced")).toBe("ř. 44")
  })

  it("supplier reports base only on ř. 25", () => {
    expect(SUPPLIER_DAP_ROW).toBe("ř. 25")
  })

  it("VAT bands are 21 % standard / 12 % reduced", () => {
    expect(PDP_VAT_RATE_PERCENT.standard).toBe(21)
    expect(PDP_VAT_RATE_PERCENT.reduced).toBe(12)
  })
})

describe("PDP kontrolní hlášení sections — recipient B.1, NOT A.1 (signoff Q2.C)", () => {
  it("recipient self-assessment is oddíl B.1", () => {
    expect(RECIPIENT_KH_SECTION).toBe("B.1")
  })

  it("supplier is oddíl A.1", () => {
    expect(SUPPLIER_KH_SECTION).toBe("A.1")
  })

  it("the two sides are distinct (B.1 ≠ A.1)", () => {
    expect(RECIPIENT_KH_SECTION).not.toBe(SUPPLIER_KH_SECTION)
  })
})

describe("the 343 output/input split requirement (signoff Q2.B)", () => {
  it("two distinct 343 analytics are valid", () => {
    expect(isValidPdpSelfAssessmentSplit("343.výstup", "343.vstup")).toBe(true)
  })

  it("a circular same-account 343/343 is INVALID", () => {
    expect(isValidPdpSelfAssessmentSplit("343", "343")).toBe(false)
    expect(isValidPdpSelfAssessmentSplit("343.001", "343.001")).toBe(false)
  })

  it("every documented self-assessment pattern is itself a valid split", () => {
    expect(PDP_SELF_ASSESSMENT_PATTERNS.length).toBeGreaterThan(0)
    for (const p of PDP_SELF_ASSESSMENT_PATTERNS) {
      expect(
        isValidPdpSelfAssessmentSplit(p.outputAccount, p.inputAccount),
      ).toBe(true)
    }
  })
})

describe("PDP legal basis by category — operative provision, never §92a-general (signoff Q2.D)", () => {
  it("construction → §92e (CZ-CPA 41–43), no Příloha, no threshold", () => {
    expect(PDP_LEGAL_BASIS.construction.provision).toContain("§92e")
    expect(PDP_LEGAL_BASIS.construction.appendix).toBeNull()
    expect(PDP_LEGAL_BASIS.construction.perInvoiceThresholdCzkMinor).toBeNull()
  })

  it("scrap → §92c + Příloha č. 5, KH kód předmětu plnění = 5, no threshold", () => {
    expect(PDP_LEGAL_BASIS.scrap.provision).toContain("§92c")
    expect(PDP_LEGAL_BASIS.scrap.provision).toContain("Příloha č. 5")
    expect(PDP_LEGAL_BASIS.scrap.khItemCode).toBe("5")
    expect(PDP_LEGAL_BASIS.scrap.perInvoiceThresholdCzkMinor).toBeNull()
  })

  it("selected goods → §92f + NV 361/2014, Příloha č. 6, 100 000 Kč threshold", () => {
    expect(PDP_LEGAL_BASIS.selected_goods.provision).toContain("§92f")
    expect(PDP_LEGAL_BASIS.selected_goods.provision).toContain("NV 361/2014")
    expect(PDP_LEGAL_BASIS.selected_goods.appendix).toContain("Příloha č. 6")
    expect(PDP_LEGAL_BASIS.selected_goods.perInvoiceThresholdCzkMinor).toBe(
      100_000n * 100n,
    )
  })

  it("NO category is tagged §92a (the brief's error the signoff corrects)", () => {
    for (const basis of Object.values(PDP_LEGAL_BASIS)) {
      expect(basis.provision).not.toContain("§92a")
    }
  })
})
