import { describe, expect, it } from "vitest"
import {
  deriveRegime,
  assertRegimeVatCompatible,
  type LegalFormFacts,
} from "./regime"
import { ScaffoldValidationError } from "./errors"

const SRO: LegalFormFacts = {
  allowedRegimes: ["DOUBLE_ENTRY"],
  mandatoryDoubleEntry: true,
  inPublicRegister: true,
}
const OSVC: LegalFormFacts = {
  allowedRegimes: ["TAX_RECORDS", "DOUBLE_ENTRY"],
  mandatoryDoubleEntry: false,
  inPublicRegister: false,
}

describe("deriveRegime", () => {
  it("forces double-entry for a mandatory legal form", () => {
    expect(deriveRegime(SRO)).toEqual({
      resolved: "DOUBLE_ENTRY",
      forced: true,
    })
  })

  it("is ambiguous for an OSVČ with multiple allowed regimes", () => {
    const d = deriveRegime(OSVC)
    expect(d).toEqual({
      ambiguous: true,
      allowed: ["TAX_RECORDS", "DOUBLE_ENTRY"],
    })
  })

  it("honours an explicit allowed choice", () => {
    expect(deriveRegime(OSVC, "TAX_RECORDS")).toEqual({
      resolved: "TAX_RECORDS",
      forced: false,
    })
  })

  it("forces double-entry for a natural person zapsaná v OR", () => {
    expect(deriveRegime({ ...OSVC, inPublicRegister: true })).toEqual({
      resolved: "DOUBLE_ENTRY",
      forced: true,
    })
  })

  it("rejects an explicit regime outside the allowed set", () => {
    expect(() => deriveRegime(OSVC, "SINGLE_ENTRY")).toThrow(
      ScaffoldValidationError,
    )
  })

  it("rejects an explicit non-double-entry when double-entry is forced", () => {
    try {
      deriveRegime(SRO, "SINGLE_ENTRY")
      throw new Error("expected throw")
    } catch (e) {
      expect(e).toBeInstanceOf(ScaffoldValidationError)
      expect((e as ScaffoldValidationError).code).toBe("REGIME_CONFLICT")
    }
  })

  it("resolves a single allowed regime without an explicit choice", () => {
    expect(
      deriveRegime({
        allowedRegimes: ["DOUBLE_ENTRY"],
        mandatoryDoubleEntry: false,
        inPublicRegister: false,
      }),
    ).toEqual({ resolved: "DOUBLE_ENTRY", forced: true })
  })
})

describe("assertRegimeVatCompatible", () => {
  it("bars a single-entry VAT payer (§1f ZoÚ)", () => {
    expect(() => assertRegimeVatCompatible("SINGLE_ENTRY", "PAYER")).toThrow(
      ScaffoldValidationError,
    )
  })
  it("allows single-entry for a non-payer", () => {
    expect(() =>
      assertRegimeVatCompatible("SINGLE_ENTRY", "NON_PAYER"),
    ).not.toThrow()
  })
  it("allows double-entry for a payer", () => {
    expect(() =>
      assertRegimeVatCompatible("DOUBLE_ENTRY", "PAYER"),
    ).not.toThrow()
  })
})
